"""Where karst keeps per-repo state on disk.

Every command that needs a repo's default index directory (index, ask,
quickstart, graph-index, impact, the MCP tools) goes through
`default_index_dir`, so they always agree on the location.

Layout:
    ~/.karst/                      private (0700 on POSIX)
    ~/.karst/indexes/<key>/        one directory per repo (0700 on POSIX)
        graph.json                 dependency graph (data-only JSON)
        manifest.json, state.json, packs.sqlite, embedding_cache.sqlite,
        collection/...             Qdrant local storage

<key> is "<folder name>-<12 hex chars>", where the hex is the start of
sha256(os.fsencode(os.path.normcase(os.path.realpath(repo)))). Two repos
with the same folder name in different places get different keys, and the
same repo reached through a symlink or a different letter case (Windows)
gets the same key.

contrib/claude-code/karst_impact_gate.py repeats this formula without
importing karst. Change both together; tests/test_impact_gate.py checks that
they agree.
"""

from __future__ import annotations

import hashlib
import os
import stat
import sys
from pathlib import Path

GRAPH_FILENAME = "graph.json"
LEGACY_GRAPH_FILENAME = "graph.pkl"
REPO_KEY_HEX_CHARS = 12

_PRIVATE_MODE = 0o700


def karst_home() -> Path:
    return Path.home() / ".karst"


def indexes_root() -> Path:
    return karst_home() / "indexes"


def _real(repo: str | os.PathLike[str]) -> str:
    return os.path.realpath(os.path.expanduser(os.fspath(repo)))


def repo_index_key(repo: str | os.PathLike[str]) -> str:
    """`<folder name>-<sha256(normcase(realpath))[:12]>` for a repo path."""
    real = _real(repo)
    name = Path(real).name or "root"
    digest = hashlib.sha256(os.fsencode(os.path.normcase(real))).hexdigest()
    return f"{name}-{digest[:REPO_KEY_HEX_CHARS]}"


def default_index_dir(repo: str | os.PathLike[str]) -> Path:
    """The per-repo index directory: ~/.karst/indexes/<name>-<hash>."""
    return indexes_root() / repo_index_key(repo)


def default_graph_path(repo: str | os.PathLike[str]) -> Path:
    return default_index_dir(repo) / GRAPH_FILENAME


def legacy_index_dir(repo: str | os.PathLike[str]) -> Path:
    """Where karst <= 0.2.10 kept the index: keyed by folder name only."""
    return indexes_root() / (Path(_real(repo)).name or "root")


def legacy_index_hint(repo: str | os.PathLike[str]) -> str | None:
    """A one-line note when an old name-only index exists and the new one
    does not yet. None otherwise."""
    old = legacy_index_dir(repo)
    new = default_index_dir(repo)
    if old == new or not old.is_dir() or new.exists():
        return None
    return (
        f"note: {old} is an index from an older karst (keyed by folder name "
        f"only). Indexes now live at {new}; index this repo again, then "
        "delete the old folder."
    )


# --------------------------------------------------------------- permissions

def make_private_dirs(path: str | os.PathLike[str]) -> Path:
    """Create `path` and any missing parents. Directories this call creates
    get mode 0700 on POSIX. Existing directories are left alone."""
    target = Path(path)
    missing: list[Path] = []
    p = target
    while not p.exists():
        missing.append(p)
        if p.parent == p:
            break
        p = p.parent
    for d in reversed(missing):
        try:
            os.mkdir(d, _PRIVATE_MODE)
        except FileExistsError:
            pass
    if not target.is_dir():
        raise NotADirectoryError(f"not a directory: {target}")
    return target


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


_warned: set[str] = set()


def _tighten(path: Path) -> None:
    """chmod 0700 a directory we own when group/other have any access."""
    if os.name == "nt":
        return
    try:
        st = os.stat(path)
    except OSError:
        return
    if not stat.S_ISDIR(st.st_mode):
        return
    if st.st_uid != os.getuid():
        key = str(path)
        if key not in _warned:
            _warned.add(key)
            print(
                f"warning: {path} is owned by another user; karst cannot make "
                "it private.",
                file=sys.stderr,
            )
        return
    if stat.S_IMODE(st.st_mode) & 0o077:
        try:
            os.chmod(path, _PRIVATE_MODE)
        except OSError:
            pass


class UnsafeStorageError(PermissionError):
    """An index directory could have been written by another user."""


def check_vector_store_ownership(storage: str | os.PathLike[str]) -> None:
    """Refuse a Qdrant local store that another user could have written.

    qdrant-client's local mode keeps points as pickles in
    <storage>/collection/<name>/storage.sqlite and unpickles them when the
    store opens, so whoever can write those files can run code as the user.
    karst cannot change that format, so on POSIX it refuses to open the store
    when the directory or its Qdrant files are owned by someone other than
    the current user (or root) or are world-writable. Group-writable is
    allowed (user-private groups make that the default on many systems).
    No-op on Windows and when the directory does not exist yet.
    """
    if os.name == "nt":
        return
    root = Path(storage)
    if not root.exists():
        return
    uid = os.getuid()
    candidates = [root]
    coll = root / "collection"
    if coll.is_dir():
        candidates.append(coll)
        for sub in coll.iterdir():
            candidates.append(sub)
            if sub.is_dir():
                candidates.extend(sub.iterdir())
    for p in candidates:
        try:
            st = os.stat(p)
        except FileNotFoundError:
            continue
        if st.st_uid not in (uid, 0) or st.st_mode & stat.S_IWOTH:
            raise UnsafeStorageError(
                f"refusing to open the index at {root}: {p} is "
                + ("owned by another user" if st.st_uid not in (uid, 0) else "world-writable")
                + ". The vector store loads pickled data, so only you may be able to "
                "write it. Fix the ownership/permissions or re-index into a "
                "private directory."
            )


def ensure_private_dir(path: str | os.PathLike[str]) -> Path:
    """Create an index directory and keep karst's own tree private.

    New directories get 0700 (POSIX). ~/.karst, ~/.karst/indexes and `path`
    itself are chmod-ed to 0700 when they sit under ~/.karst and are owned by
    the current user. Directories outside ~/.karst that already exist (an
    explicit --storage the user chose) are not touched. No-op chmod on
    Windows.
    """
    target = make_private_dirs(path)
    home = karst_home()
    for d in (home, indexes_root(), target):
        if d.is_dir() and _is_within(d, home):
            _tighten(d)
    return target
