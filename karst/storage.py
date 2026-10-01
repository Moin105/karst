"""Where each repo's index lives on disk.

The CLI (`index`, `quickstart`, `graph-index`, `ask`, `where`) and every MCP tool
resolve a repo to its index directory through `storage_for`, so `karst index
<path>` and the MCP server always agree on one location.

Layout: ``~/.karst/indexes/<name>-<id>``. ``<name>`` is the repo's folder name,
kept so the directory is recognisable; ``<id>`` is a short SHA-1 of the resolved
absolute path. karst 0.2.10 and earlier keyed on the folder name alone, so
``/work/clientA/api`` and ``/work/clientB/api`` shared one index: indexing B
replaced A's chunks, and a search over A could return B's code.

Indexes written by those versions live at ``~/.karst/indexes/<name>`` and keep
working:

* A legacy dir whose manifest records this checkout as its root is used as-is.
* A legacy dir with no recorded root (anything indexed by 0.2.10 or earlier)
  may hold another checkout's code, so searches never read it. The next
  ``karst index`` / ``index_repository`` adopts it if at least half the files
  it lists are unchanged in this checkout. That run is incremental, brings the
  index in line with this checkout, and records the root. Otherwise the
  checkout gets a fresh ``<name>-<id>`` dir.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from .manifest import FileEntry, file_sha, load_manifest, manifest_path

# 12 hex chars = 48 bits, far beyond any chance of two of one user's repos colliding.
_ID_LEN = 12


def index_home() -> Path:
    return Path.home() / ".karst" / "indexes"


def repo_id(repo: str | Path) -> str:
    """Short, stable id for a checkout: SHA-1 of its resolved absolute path."""
    key = os.fsencode(_path_key(_canonical(repo)))
    return hashlib.sha1(key).hexdigest()[:_ID_LEN]


def storage_for(repo: str | Path, *, for_write: bool = False) -> Path:
    """The index directory for the checkout at `repo`.

    Pass for_write=True from commands that build or refresh the index. Only they
    may adopt a legacy dir that records no root (see the module docstring); the
    indexer then records this checkout as its root.
    """
    root = _canonical(repo)
    hashed = _hashed_dir(root)
    if hashed.exists():
        return hashed
    legacy = _legacy_dir(root)
    if not manifest_path(legacy).is_file():
        return hashed
    manifest = load_manifest(legacy)
    if manifest.root is not None:
        return legacy if _path_key(Path(manifest.root)) == _path_key(root) else hashed
    if for_write and _matches_checkout(manifest.files, root):
        return legacy
    return hashed


def unclaimed_legacy_storage(repo: str | Path) -> Path | None:
    """The 0.2.10-era ``<name>`` index dir for `repo`, if it exists and records
    no root. Read paths use this only to explain why it isn't being used."""
    root = _canonical(repo)
    if _hashed_dir(root).exists():
        return None
    legacy = _legacy_dir(root)
    if manifest_path(legacy).is_file() and load_manifest(legacy).root is None:
        return legacy
    return None


def _canonical(repo: str | Path) -> Path:
    return Path(repo).expanduser().resolve()


def _path_key(path: Path) -> str:
    # Windows paths are case-insensitive: C:\Work\api and c:\work\api are one repo.
    return os.path.normcase(str(path))


def _name(root: Path) -> str:
    return root.name or "root"


def _hashed_dir(root: Path) -> Path:
    return index_home() / f"{_name(root)}-{repo_id(root)}"


def _legacy_dir(root: Path) -> Path:
    return index_home() / _name(root)


def _matches_checkout(files: dict[str, FileEntry], root: Path) -> bool:
    """True when at least half the files a manifest lists are unchanged under
    `root`, i.e. the index was most likely built from this checkout."""
    if not files:
        return False
    need = (len(files) + 1) // 2
    same = 0
    for rel, entry in files.items():
        path = root / rel
        try:
            if path.is_file() and file_sha(path) == entry.sha:
                same += 1
                if same >= need:
                    return True
        except OSError:
            continue
    return False
