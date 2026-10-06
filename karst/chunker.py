"""AST-aware chunker.

Given a ParsedFile, walks the tree-sitter tree and emits Chunk objects, one
per function / class / method / interface / etc. Each chunk preserves its
exact byte range and line range so it doubles as a citation.

Design notes:
- The chunker is intentionally one-pass and stateless beyond the parent stack.
- We DO emit both a container (e.g. class) and its members (methods) — the
  container chunk gives architectural shape; the member chunks give the
  retrieval-friendly units the spec calls for ("each chunk is a complete
  function, class, or top-level statement"; spec §7).
- "decorated_definition" in Python wraps the real function/class. We treat
  the decorated form as the chunk (taking its kind from the wrapped
  definition) and never emit the inner definition on its own; a wrapped
  class's body is still walked so its methods hang off the class.
- Never key walk state on `id()` of a node: `_tsapi` hands out a fresh
  adapter per `child(i)` call, so ids are recycled as soon as an adapter is
  freed and an id-keyed set silently matches unrelated nodes.

API note:
- tree-sitter node access differs across wheels: upstream py-tree-sitter (CI /
  Linux / macOS) uses PROPERTIES (`node.type`, `node.child_count`,
  `node.start_point`), while some tree-sitter-language-pack wheels on Windows use
  METHODS with a couple of different names (`node.kind()`, `node.start_position()`).
  `wrap_root` (see `_tsapi`) adapts either into the single method-style API this
  module uses (`.kind()`, `.child(i)`, `.start_byte()`, …), so the walk below is
  binding-agnostic.
"""

from __future__ import annotations

from collections.abc import Iterator

from ._tsapi import wrap_root
from .languages import LanguageSpec, get_language
from .models import Chunk, ChunkKind
from .parser import ParsedFile


_SIGNATURE_MAX_BYTES = 240

# Cap the stored code per chunk. A few files (generated code, doc/spec builders)
# contain one enormous function; left whole it becomes a single 10k+ token chunk
# that dominates retrieval cost and crowds out real code. The chunk's line range
# still spans the full definition, so the citation points at the complete source.
_MAX_CHUNK_CHARS = 8000


def chunk_file(parsed: ParsedFile) -> list[Chunk]:
    """Extract AST-aware chunks from a parsed file."""
    lang = get_language(parsed.language)
    if lang is None or not lang.chunk_nodes:
        return []

    chunks: list[Chunk] = []
    root = wrap_root(parsed.tree)
    _walk(root, lang, parsed, parent_qname=None, out=chunks)
    return chunks


def _iter_children(node) -> Iterator:
    count = node.child_count()
    for i in range(count):
        yield node.child(i)


def _walk(
    node,
    lang: LanguageSpec,
    parsed: ParsedFile,
    *,
    parent_qname: str | None,
    out: list[Chunk],
) -> None:
    """Recursively walk the tree, emitting chunks for chunkable nodes."""
    for child in _iter_children(node):
        child_kind = child.kind()

        chunk_kind = lang.chunk_nodes.get(child_kind)
        if chunk_kind is not None:
            # Python decorated_definition wraps function_definition /
            # class_definition. The decorated span is the chunk, but its kind
            # and its body come from the wrapped definition, which is never
            # emitted on its own.
            definition = child
            if child_kind == "decorated_definition":
                definition = _decorated_inner(child) or child
                chunk_kind = lang.chunk_nodes.get(definition.kind(), chunk_kind)

            chunk = _emit_chunk(child, chunk_kind, lang, parsed, parent_qname=parent_qname)
            next_parent = chunk.qualified_name if chunk is not None else parent_qname
            if chunk is not None:
                out.append(chunk)

            if definition.kind() in lang.container_nodes:
                _walk(definition, lang, parsed, parent_qname=next_parent, out=out)
        else:
            # Not a chunk node; keep descending — methods may be wrapped in a
            # class_body / declaration_list node we don't emit ourselves.
            _walk(child, lang, parsed, parent_qname=parent_qname, out=out)


def _decorated_inner(node):
    """The function_definition / class_definition a decorated_definition wraps."""
    for child in _iter_children(node):
        if child.kind() in {"function_definition", "class_definition"}:
            return child
    return None


def _emit_chunk(
    node,
    kind: ChunkKind,
    lang: LanguageSpec,
    parsed: ParsedFile,
    *,
    parent_qname: str | None,
) -> Chunk | None:
    name = _extract_name(node, lang, parsed.source)
    if name is None:
        return None

    if kind == ChunkKind.FUNCTION and parent_qname is not None:
        kind = ChunkKind.METHOD

    qualified = f"{parent_qname}.{name}" if parent_qname else name

    start_byte = node.start_byte()
    end_byte = node.end_byte()
    start_point = node.start_position()
    end_point = node.end_position()

    code = parsed.source[start_byte:end_byte].decode("utf-8", errors="replace")
    if len(code) > _MAX_CHUNK_CHARS:
        omitted = code[_MAX_CHUNK_CHARS:].count("\n")
        code = (
            code[:_MAX_CHUNK_CHARS]
            + f"\n… (truncated — {omitted} more lines; full source at "
            f"{parsed.relpath}:{start_point.row + 1})"
        )

    return Chunk(
        file_relpath=parsed.relpath,
        language=parsed.language,
        kind=kind,
        name=name,
        qualified_name=qualified,
        start_line=start_point.row + 1,
        end_line=end_point.row + 1,
        start_byte=start_byte,
        end_byte=end_byte,
        code=code,
        file_sha=parsed.sha,
        parent=parent_qname,
        signature=_extract_signature(code),
    )


def _extract_name(node, lang: LanguageSpec, source: bytes) -> str | None:
    kind = node.kind()

    # Python decorated_definition: name lives on the wrapped function/class.
    if kind == "decorated_definition":
        inner = _decorated_inner(node)
        return _extract_name(inner, lang, source) if inner is not None else None

    # Rust impl_item: prefer the "type" being implemented (or the trait).
    if kind == "impl_item":
        for fname in ("type", "trait"):
            named = node.child_by_field_name(fname)
            if named is not None:
                return _node_text(named, source)
        return None

    # Go type_declaration wraps one or more type_specs; take the first.
    if kind == "type_declaration":
        for child in _iter_children(node):
            if child.kind() == "type_spec":
                named = child.child_by_field_name("name")
                if named is not None:
                    return _node_text(named, source)
        return None

    named = node.child_by_field_name(lang.name_field)
    if named is not None:
        return _node_text(named, source)

    for child in _iter_children(node):
        if child.kind() in {"identifier", "property_identifier", "type_identifier"}:
            return _node_text(child, source)
    return None


def _node_text(node, source: bytes) -> str:
    return source[node.start_byte():node.end_byte()].decode("utf-8", errors="replace")


def _extract_signature(code: str) -> str:
    for line in code.splitlines():
        stripped = line.strip()
        if stripped:
            if len(stripped) > _SIGNATURE_MAX_BYTES:
                return stripped[:_SIGNATURE_MAX_BYTES] + "…"
            return stripped
    return ""


def chunk_files(parsed_files: Iterator[ParsedFile]) -> Iterator[Chunk]:
    for parsed in parsed_files:
        yield from chunk_file(parsed)
