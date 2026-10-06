"""karst MCP server.

Exposes karst's retrieval + analysis engine to any MCP host — Claude Desktop,
Cursor, Continue, Cline, or a custom agent — over stdio.

Design principle (important): the MCP server returns **structured, cited
context**. It does NOT call an LLM itself. The host already has the model;
karst's job is to feed it the *right* slice of the repo, scoped and cited, so
the host model reasons over 60% fewer tokens. That also means users never give
karst an API key.

Handle lifetime: the embedder, vector store, graph and pack store for a repo
are opened ONCE and reused for the life of the server process. We never
open/close the Qdrant store per tool call — on Windows the local-mode file
lock does not always release cleanly between an open/close pair inside one
long-lived process, which would hang the second call. Caching the handles
sidesteps that entirely. Access is serialized with a lock (a local server is
single-user; correctness beats concurrency here).

Tools exposed:
  - search_code        retrieve the most relevant code chunks for a question,
                       each anchored to file:line (optionally pack-scoped)
  - find_impact        blast radius of changing a symbol — what depends on it
  - list_packs         the named context packs available for a repo
  - index_status       whether a repo is indexed and how big the index is
  - index_repository   build / refresh the index + graph for a repo

Run it:  karst-mcp                 (stdio — local hosts: Claude Desktop, Cursor)
   or:    python -m karst.mcp_server
Remote:  karst-mcp --http          (Streamable HTTP — for hosted/remote hosts)
         Requires KARST_MCP_TOKEN (clients send `Authorization: Bearer <token>`);
         the server refuses to start without it. Binds 127.0.0.1 unless
         --host / KARST_MCP_HOST says otherwise. Tools only accept repo paths
         under KARST_MCP_ROOTS (os.pathsep-separated; default: the server's
         working directory).
"""

from __future__ import annotations

import atexit
import os
import sys
import threading
from pathlib import Path
from typing import TYPE_CHECKING

from mcp.server.fastmcp import FastMCP

from .paths import GRAPH_FILENAME, LEGACY_GRAPH_FILENAME, default_index_dir, karst_home, legacy_index_hint

if TYPE_CHECKING:  # pragma: no cover
    from .embedder import Embedder
    from .graph.store import GraphStore
    from .packs.store import PackStore
    from .store import ChunkStore

mcp = FastMCP("karst")

DEFAULT_HTTP_HOST = "127.0.0.1"


# --------------------------------------------------------------------------- #
# Repo paths. In HTTP mode every tool's repo_path must resolve (symlinks and
# ".." included) to a directory under one of the allowed roots. In stdio mode
# (local user, own machine) any path is accepted, as before.
# --------------------------------------------------------------------------- #

class RepoPathNotAllowed(ValueError):
    """repo_path is outside the roots this HTTP server may serve."""


# None = unrestricted (stdio). A tuple of normcase(realpath) roots in HTTP mode.
_allowed_roots: tuple[str, ...] | None = None


def _norm_real(path: str) -> str:
    return os.path.normcase(os.path.realpath(os.path.expanduser(path)))


def _is_within(path_norm: str, root_norm: str) -> bool:
    try:
        return os.path.commonpath([path_norm, root_norm]) == root_norm
    except ValueError:  # different drives on Windows, or mixed abs/rel
        return False


def parse_allowed_roots(raw: str | None, cwd: str) -> tuple[list[str], bool]:
    """Roots from KARST_MCP_ROOTS (os.pathsep-separated), resolved.

    Returns (roots, defaulted). Unset or blank means the server's working
    directory. Raises ValueError for a root that is not an existing directory.
    """
    entries = [e.strip() for e in (raw or "").split(os.pathsep) if e.strip()]
    defaulted = not entries
    if defaulted:
        entries = [cwd]
    roots: list[str] = []
    for entry in entries:
        real = os.path.realpath(os.path.expanduser(entry))
        if not os.path.isdir(real):
            raise ValueError(f"KARST_MCP_ROOTS entry is not a directory: {entry}")
        if real not in roots:
            roots.append(real)
    return roots, defaulted


def set_allowed_roots(roots: list[str] | None) -> None:
    """Restrict tools to these roots (None lifts the restriction)."""
    global _allowed_roots
    _allowed_roots = None if roots is None else tuple(_norm_real(r) for r in roots)


def _resolve_repo(repo_path: str) -> Path:
    """The repo's real path, checked against the allowed roots in HTTP mode."""
    if not isinstance(repo_path, str) or not repo_path.strip():
        raise RepoPathNotAllowed("repo_path is empty")
    real = os.path.realpath(os.path.expanduser(repo_path))
    if _allowed_roots is not None:
        norm = os.path.normcase(real)
        if not any(_is_within(norm, root) for root in _allowed_roots):
            raise RepoPathNotAllowed(
                f"repo_path {repo_path!r} is outside the directories this server "
                "may read (KARST_MCP_ROOTS)."
            )
    return Path(real)


def _storage_for(repo: Path) -> Path:
    return default_index_dir(repo)


def _cache_dir() -> Path:
    return karst_home() / "models"


def _graph_path(storage: Path) -> Path:
    return storage / GRAPH_FILENAME


def _is_indexed(storage: Path) -> bool:
    return storage.exists() and (storage / "manifest.json").exists()


_NOT_INDEXED_HINT = (
    "This repo isn't indexed yet. Run `index_repository` once (or `karst index "
    "<path>` on the command line), then try again."
)


def _not_indexed(repo: Path) -> str:
    hint = legacy_index_hint(repo)
    return _NOT_INDEXED_HINT + (f"\n{hint}" if hint else "")


def _est_tokens(text: str) -> int:
    return max(1, len(text) // 4)


# --------------------------------------------------------------------------- #
# Cached handles — opened once per repo, reused for the process lifetime.
# --------------------------------------------------------------------------- #

_lock = threading.RLock()
_embedder: "Embedder | None" = None
_stores: dict[str, "ChunkStore"] = {}       # keyed by str(storage)
_graphs: dict[str, "GraphStore"] = {}       # keyed by str(graph.json)
_packs: dict[str, "PackStore"] = {}         # keyed by str(packs.sqlite)


def _get_embedder() -> "Embedder":
    global _embedder
    if _embedder is None:
        from .embedder import DEFAULT_MODEL, Embedder

        _embedder = Embedder(DEFAULT_MODEL, cache_dir=str(_cache_dir()))
    return _embedder


def _get_store(storage: Path) -> "ChunkStore":
    key = str(storage)
    store = _stores.get(key)
    if store is None:
        from .store import DEFAULT_COLLECTION, ChunkStore

        store = ChunkStore(location=storage, collection=DEFAULT_COLLECTION)
        _stores[key] = store
    return store


def _get_graph(storage: Path) -> "GraphStore | None":
    gp = _graph_path(storage)
    if not gp.exists():
        return None
    key = str(gp)
    graph = _graphs.get(key)
    if graph is None:
        from .graph.store import GraphStore

        graph = GraphStore.load(gp)
        _graphs[key] = graph
    return graph


def _get_packstore(storage: Path) -> "PackStore":
    key = str(storage / "packs.sqlite")
    ps = _packs.get(key)
    if ps is None:
        from .packs.store import PackStore

        ps = PackStore(storage / "packs.sqlite")
        _packs[key] = ps
    return ps


def _evict_repo(storage: Path) -> None:
    """Close and drop every cached handle for a repo.

    Used before re-indexing so the indexer can take the Qdrant write lock that
    our cached read handle would otherwise be holding.
    """
    key = str(storage)
    store = _stores.pop(key, None)
    if store is not None:
        try:
            store.close()
        except Exception:
            pass
    _graphs.pop(str(_graph_path(storage)), None)
    _packs.pop(str(storage / "packs.sqlite"), None)


@atexit.register
def _close_all() -> None:
    for store in list(_stores.values()):
        try:
            store.close()
        except Exception:
            pass
    _stores.clear()


# --------------------------------------------------------------------------- #
# Tools
# --------------------------------------------------------------------------- #

@mcp.tool()
def search_code(
    query: str,
    repo_path: str,
    packs: list[str] | None = None,
    limit: int = 8,
) -> str:
    """Find the most relevant code in a repository for a question or task.

    Returns ranked code chunks, each anchored to an exact file:line citation,
    so you can reason over only the relevant slice instead of the whole repo.
    Prefer this over reading many files when you need to understand how
    something works or where a behavior lives.

    Args:
        query: A natural-language question or description, e.g.
            "how does checkout charge the user" or "JWT refresh logic".
        repo_path: Absolute path to the repository (must be indexed first).
        packs: Optional list of pack ids to scope the search to (see
            list_packs). Scoping cuts tokens further. Omit to search all.
        limit: Max number of chunks to return (default 8).
    """
    repo = _resolve_repo(repo_path)
    storage = _storage_for(repo)
    if not _is_indexed(storage):
        return _not_indexed(repo)

    with _lock:
        embedder = _get_embedder()
        store = _get_store(storage)
        (vec,) = embedder.embed_texts([query])
        hits = store.search(vec, limit=limit, pack_ids=packs or None, query_text=query)

    if not hits:
        scope = f" in packs {packs}" if packs else ""
        return f"No code matched '{query}'{scope}. Try a broader query or omit packs."

    parts: list[str] = []
    for i, hit in enumerate(hits, start=1):
        c = hit.chunk
        parts.append(
            f"[{i}] {c.citation}  ({c.kind.value} {c.qualified_name}, score {hit.score:.3f})"
        )
        parts.append(f"```{c.language}")
        parts.append(c.code.rstrip())
        parts.append("```")
        parts.append("")

    header = (
        f"Top {len(hits)} results for: {query}\n"
        f"(~{_est_tokens(''.join(h.chunk.code for h in hits)):,} tokens of scoped context"
        + (f", packs: {', '.join(packs)}" if packs else "")
        + ")\n"
    )
    return header + "\n" + "\n".join(parts).rstrip()


@mcp.tool()
def find_impact(symbol: str, repo_path: str, max_depth: int = 3) -> str:
    """Predict the blast radius of changing a function, method, class, or file.

    Walks the call/import graph to find everything that depends on the target,
    ranked by how directly. Use this before editing a symbol to know what else
    might break.

    Args:
        symbol: A bare name ("getUser"), a qualified name
            ("src/auth/users.ts::UserService.get"), or a file path.
        repo_path: Absolute path to the repository (must be indexed first).
        max_depth: How many dependency hops to walk (default 3).
    """
    from .graph.store import LEGACY_GRAPH_MESSAGE, GraphFormatError

    repo = _resolve_repo(repo_path)
    storage = _storage_for(repo)

    with _lock:
        try:
            graph = _get_graph(storage)
        except GraphFormatError as exc:
            return f"The graph for this repo could not be loaded: {exc}"
        if graph is None:
            if (storage / LEGACY_GRAPH_FILENAME).exists():
                return (
                    f"The graph for this repo is in the old format ({LEGACY_GRAPH_MESSAGE}). "
                    "Run `index_repository` to rebuild it."
                )
            return (
                "No dependency graph for this repo yet. Run `index_repository` "
                "(it builds the graph too), then try again."
            )

        from .graph.impact import analyze_impact, resolve_targets

        targets = resolve_targets(
            graph, names=[symbol], qnames=[symbol], files=[symbol]
        )
        if not targets:
            return f"'{symbol}' was not found in the graph. Check the spelling or try a file path."

        report = analyze_impact(graph, targets=targets, max_depth=max_depth)
        target_names = [
            n.qualified_name
            for t in report.targets[:6]
            if (n := graph.get_node(t)) is not None
        ]

    lines = [
        f"Impact of changing '{symbol}'",
        f"Resolved targets: {', '.join(target_names) or symbol}",
        f"Affected: {len(report.affected)}   Risk: {report.risk.upper()}",
        "",
    ]
    if not report.affected:
        lines.append("Nothing depends on this — safe to change in isolation.")
        return "\n".join(lines)

    for a in report.affected[:25]:
        via = ",".join(e.value for e in a.via_edges) or "—"
        cite = a.citation or "(no source)"
        lines.append(
            f"  [{a.kind.value:9}] depth {a.depth} score {a.score:.3f} via {via:14} "
            f"{a.qualified_name}  ({cite})"
        )
    if len(report.affected) > 25:
        lines.append(f"  … and {len(report.affected) - 25} more.")
    return "\n".join(lines)


@mcp.tool()
def list_packs(repo_path: str) -> str:
    """List the named context packs available for a repository.

    A pack is a curated slice of the codebase (e.g. "auth", "billing"). Pass
    pack ids to search_code's `packs` argument to scope a search and cut
    tokens further.

    Args:
        repo_path: Absolute path to the repository (must be indexed first).
    """
    repo = _resolve_repo(repo_path)
    storage = _storage_for(repo)
    if not storage.exists():
        return _not_indexed(repo)

    with _lock:
        packs = _get_packstore(storage).list()

    if not packs:
        return (
            "No packs defined yet. Run "
            "`karst packs --storage <storage> suggest <repo> --apply --retag` "
            "to auto-generate them."
        )

    lines = [f"{len(packs)} packs:"]
    for p in packs:
        lines.append(
            f"  {p.id:32} {p.label:28} chunks={p.chunk_count:<5} ~{p.token_estimate:,} tok"
        )
    return "\n".join(lines)


@mcp.tool()
def index_status(repo_path: str) -> str:
    """Report whether a repository is indexed and how large the index is.

    Use this first if you're unsure whether search_code / find_impact will
    work for a repo.

    Args:
        repo_path: Absolute path to the repository.
    """
    repo = _resolve_repo(repo_path)
    storage = _storage_for(repo)
    if not _is_indexed(storage):
        return (
            f"Not indexed: {repo_path}\n"
            f"Expected index at {storage}\n"
            f"{_not_indexed(repo)}"
        )

    with _lock:
        chunk_count = _get_store(storage).count()
        try:
            n_packs = len(_get_packstore(storage).list())
        except Exception:
            n_packs = 0

    graph = "yes" if _graph_path(storage).exists() else "no"
    return (
        f"Indexed: {repo_path}\n"
        f"  storage:  {storage}\n"
        f"  chunks:   {chunk_count}\n"
        f"  graph:    {graph}\n"
        f"  packs:    {n_packs}"
    )


@mcp.tool()
def index_repository(repo_path: str, reset: bool = False) -> str:
    """Index a repository so search_code and find_impact can work on it.

    Builds the vector index (for search) AND the dependency graph (for impact).
    The first run on a large repo can take a few minutes; subsequent runs are
    near-instant because unchanged files are skipped. For very large repos,
    prefer running `karst index <path>` on the command line.

    Args:
        repo_path: Absolute path to the repository to index.
        reset: If true, rebuild the index from scratch.
    """
    root = _resolve_repo(repo_path)
    if not root.is_dir():
        return f"Not a directory: {repo_path}"

    storage = _storage_for(root)
    hint = legacy_index_hint(root)

    from .graph.builder import build_and_save
    from .indexer import index_repo
    from .paths import ensure_private_dir

    with _lock:
        ensure_private_dir(storage)
        # Release our cached read handle so the indexer can take the write lock.
        _evict_repo(storage)
        result = index_repo(
            root,
            storage_path=storage,
            embedder_cache_dir=_cache_dir(),
            reset=reset,
        )
        graph = build_and_save(root, graph_path=_graph_path(storage))
        # Drop the (now stale) graph cache so the next find_impact reloads it.
        _graphs.pop(str(_graph_path(storage)), None)

    return (
        f"Indexed {repo_path}\n"
        f"  files:       {result.files} ({result.files_indexed} new, {result.files_reused} reused)\n"
        f"  chunks:      {result.chunks}\n"
        f"  embeddings:  {result.embeddings_computed} computed, {result.embeddings_cached} cached\n"
        f"  graph:       {graph.nodes} nodes, {graph.edges} edges\n"
        f"  storage:     {storage}\n"
        f"Ready — call search_code or find_impact against this repo."
        + (f"\n{hint}" if hint else "")
    )


# --------------------------------------------------------------------------- #
# Transports
# --------------------------------------------------------------------------- #

def _build_http_app(token: str):
    """The Streamable-HTTP ASGI app, gated by a bearer token.

    GET /healthz stays open (liveness probes for Fly/Render/etc.); everything
    else requires `Authorization: Bearer <token>`. There is no unauthenticated
    variant.
    """
    if not token:
        raise ValueError("the HTTP app needs a bearer token (KARST_MCP_TOKEN)")
    app = mcp.streamable_http_app()

    import hmac

    from starlette.responses import JSONResponse, PlainTextResponse

    expected = f"Bearer {token}"

    class _BearerAuth:
        def __init__(self, inner):
            self._inner = inner

        async def __call__(self, scope, receive, send):
            if scope.get("type") == "http":
                path = scope.get("path", "")
                if scope.get("method") == "GET" and path in ("/healthz", "/health"):
                    await PlainTextResponse("ok")(scope, receive, send)
                    return
                headers = dict(scope.get("headers") or [])
                provided = headers.get(b"authorization", b"").decode("latin-1")
                if not hmac.compare_digest(provided, expected):
                    await JSONResponse({"error": "unauthorized"}, status_code=401)(
                        scope, receive, send
                    )
                    return
            await self._inner(scope, receive, send)

    return _BearerAuth(app)


class HttpConfigError(Exception):
    """HTTP mode is misconfigured; the server must not start."""


def _http_preflight(env: dict[str, str] | None = None, cwd: str | None = None) -> str:
    """Check HTTP-mode config before anything starts. Returns the token.

    Requires KARST_MCP_TOKEN (no bypass) and installs the KARST_MCP_ROOTS
    restriction, defaulting to the working directory.
    """
    env = dict(os.environ) if env is None else env
    token = (env.get("KARST_MCP_TOKEN") or "").strip()
    if not token:
        raise HttpConfigError(
            "KARST_MCP_TOKEN is not set. The HTTP server will not start without "
            "a bearer token. Set it to a long random secret, e.g. "
            "KARST_MCP_TOKEN=\"$(openssl rand -hex 32)\", and send it as "
            "`Authorization: Bearer <token>` from the client."
        )
    try:
        roots, defaulted = parse_allowed_roots(env.get("KARST_MCP_ROOTS"), cwd or os.getcwd())
    except ValueError as exc:
        raise HttpConfigError(str(exc)) from None
    set_allowed_roots(roots)
    for root in roots:
        if os.path.dirname(root) == root:
            print(
                f"[karst-mcp] WARNING: allowed root {root} is a filesystem root, so "
                "tools can read any directory. Set KARST_MCP_ROOTS to the repos "
                "you mean to serve.",
                file=sys.stderr,
            )
    if defaulted:
        print(
            f"[karst-mcp] KARST_MCP_ROOTS is not set; tools may only read repos "
            f"under the working directory {roots[0]}",
            file=sys.stderr,
        )
    else:
        print(f"[karst-mcp] tools may only read repos under: {os.pathsep.join(roots)}", file=sys.stderr)
    return token


def _run_http(host: str, port: int, token: str) -> None:
    import uvicorn

    mcp.settings.host = host
    mcp.settings.port = port
    app = _build_http_app(token)
    print(
        f"[karst-mcp] Streamable HTTP on http://{host}:{port}"
        f"{mcp.settings.streamable_http_path}  (auth: bearer token)",
        file=sys.stderr,
    )
    uvicorn.run(app, host=host, port=port, log_level=str(mcp.settings.log_level).lower())


def _preload_native_deps() -> None:
    """Import the native-extension libraries the tools otherwise load lazily.

    On Windows, the first import of numpy (pulled in by fastembed and
    qdrant-client) can hang if it happens inside a tool call while the stdio
    transport's reader thread is blocked on stdin — so the first `search_code`
    never returns. Importing them before the transport starts avoids that, and
    moves the cost to startup instead of the first query.
    """
    import fastembed  # noqa: F401
    import qdrant_client  # noqa: F401
    import tree_sitter_language_pack  # noqa: F401


def build_arg_parser():
    import argparse

    parser = argparse.ArgumentParser(prog="karst-mcp", description="karst MCP server.")
    parser.add_argument(
        "--http",
        action="store_true",
        help="Serve over Streamable HTTP instead of stdio (for remote hosts). "
        "Requires KARST_MCP_TOKEN; tools are limited to KARST_MCP_ROOTS.",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("KARST_MCP_HOST", DEFAULT_HTTP_HOST),
        help=f"HTTP bind address (default {DEFAULT_HTTP_HOST}, or KARST_MCP_HOST). "
        "Use 0.0.0.0 only behind a firewall or proxy you control.",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("KARST_MCP_PORT", os.environ.get("PORT", "8080"))),
    )
    return parser


def main(argv: list[str] | None = None) -> None:
    """Console entry point.

    Default: stdio (local hosts — Claude Desktop, Cursor, …).
    With --http (or KARST_MCP_HTTP=1): Streamable HTTP for remote/hosted hosts.
    HTTP mode refuses to start without KARST_MCP_TOKEN, binds 127.0.0.1 by
    default and limits tools to repos under KARST_MCP_ROOTS.
    """
    args = build_arg_parser().parse_args(argv)

    http = args.http or os.environ.get("KARST_MCP_HTTP", "").lower() in ("1", "true", "yes")
    if http:
        # Validate before the slow native imports, so a misconfigured server
        # fails fast and never opens a socket.
        try:
            token = _http_preflight()
        except HttpConfigError as exc:
            print(f"[karst-mcp] error: {exc}", file=sys.stderr)
            raise SystemExit(2) from None
        _preload_native_deps()
        _run_http(args.host, args.port, token)
    else:
        _preload_native_deps()
        mcp.run()  # stdio


if __name__ == "__main__":
    main()
