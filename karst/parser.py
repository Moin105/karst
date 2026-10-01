"""Tree-sitter parser wrapper.

Lazily loads one tree-sitter Parser per language via tree-sitter-language-pack.
Parsers are cached on the registry so subsequent files of the same language
reuse the same Parser instance — tree-sitter parsers are thread-safe for
sequential use within a single thread, which is what we do here.

Grammars must never come from the network at parse time. karst pins
tree-sitter-language-pack 0.13.x, which ships every grammar inside the wheel;
1.x downloads each grammar on first use instead. If an environment ends up with
1.x anyway, `KARST_OFFLINE=1` refuses the download rather than reaching out.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from .embedder import offline_requested
from .languages import LanguageSpec, detect_language

if TYPE_CHECKING:
    from tree_sitter import Parser, Tree


class GrammarUnavailable(RuntimeError):
    """A grammar would have to be downloaded, but KARST_OFFLINE forbids it."""


@dataclass
class ParsedFile:
    relpath: str
    language: str
    source: bytes
    tree: "Tree"
    sha: str


class ParserRegistry:
    """Lazy cache of tree-sitter parsers, keyed by language name."""

    def __init__(self) -> None:
        self._parsers: dict[str, "Parser"] = {}

    def get(self, lang: LanguageSpec) -> "Parser":
        parser = self._parsers.get(lang.name)
        if parser is None:
            # Imported lazily so import errors surface at first parse, not at
            # package import time.
            import tree_sitter_language_pack as tslp

            _refuse_download_when_offline(tslp, lang.name)
            parser = tslp.get_parser(lang.name)
            self._parsers[lang.name] = parser
        return parser


def _refuse_download_when_offline(tslp, name: str) -> None:
    # Only 1.x has a download cache; 0.13.x bundles every grammar.
    downloaded = getattr(tslp, "downloaded_languages", None)
    if downloaded is None or not offline_requested():
        return
    if name in downloaded():
        return
    version = getattr(tslp, "__version__", "?")
    raise GrammarUnavailable(
        f"KARST_OFFLINE is set, but tree-sitter-language-pack {version} would "
        f"download the '{name}' grammar from the network. karst expects "
        "tree-sitter-language-pack 0.13.x, which bundles every grammar in the "
        "wheel: pip install 'tree-sitter-language-pack>=0.13,<1'"
    )


def parse_file(
    path: Path,
    *,
    repo_root: Path,
    registry: ParserRegistry,
) -> ParsedFile | None:
    """Parse a single file. Returns None if the language is unsupported or the
    file can't be read.
    """
    lang = detect_language(path)
    if lang is None:
        return None
    try:
        source = path.read_bytes()
    except OSError:
        return None
    if not source:
        return None

    parser = registry.get(lang)
    # tree-sitter's Parser.parse wants BYTES (the standard 0.23 API on
    # Linux/macOS); node offsets are byte offsets and we slice `source` (bytes)
    # downstream, so parsing the raw bytes is both correct and portable. Some
    # older Windows wheels only accepted str — fall back to decoded text if this
    # binding rejects bytes.
    try:
        tree = parser.parse(source)
    except TypeError:
        try:
            text = source.decode("utf-8")
        except UnicodeDecodeError:
            text = source.decode("utf-8", errors="replace")
        tree = parser.parse(text)
    sha = hashlib.sha1(source).hexdigest()
    relpath = path.resolve().relative_to(repo_root.resolve()).as_posix()
    return ParsedFile(
        relpath=relpath,
        language=lang.name,
        source=source,
        tree=tree,
        sha=sha,
    )
