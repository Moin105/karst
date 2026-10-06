"""Per-repo index directories: keyed by name + realpath hash, private on POSIX."""

from __future__ import annotations

import os
import stat
import sys
from pathlib import Path

import pytest

from karst import paths


@pytest.fixture
def home(tmp_path: Path, monkeypatch) -> Path:
    h = tmp_path / "home"
    h.mkdir()
    monkeypatch.setattr(paths.Path, "home", classmethod(lambda cls: h))
    return h


def test_same_name_in_different_parents_gets_different_dirs(tmp_path: Path, home: Path) -> None:
    a = tmp_path / "clientA" / "app"
    b = tmp_path / "clientB" / "app"
    a.mkdir(parents=True)
    b.mkdir(parents=True)
    da, db = paths.default_index_dir(a), paths.default_index_dir(b)
    assert da != db
    assert da.parent == db.parent == home / ".karst" / "indexes"
    assert da.name.startswith("app-") and db.name.startswith("app-")
    assert len(da.name) == len("app-") + paths.REPO_KEY_HEX_CHARS


def test_same_repo_spelled_differently_gets_one_dir(tmp_path: Path, home: Path, monkeypatch) -> None:
    repo = tmp_path / "work" / "Repo"
    (repo / "sub").mkdir(parents=True)
    expected = paths.default_index_dir(repo)
    spellings = [str(repo) + os.sep, str(repo / "sub" / ".."), str(repo / ".")]
    if os.name == "nt":
        spellings += [str(repo).upper(), str(repo).lower(), str(repo).replace("\\", "/")]
    for s in spellings:
        assert paths.default_index_dir(s) == expected, s
    monkeypatch.chdir(repo)
    assert paths.default_index_dir(".") == expected
    assert paths.default_graph_path(repo) == expected / "graph.json"


def test_symlink_to_repo_gets_the_same_dir(tmp_path: Path, home: Path) -> None:
    repo = tmp_path / "real" / "repo"
    repo.mkdir(parents=True)
    link = tmp_path / "link"
    try:
        os.symlink(repo, link, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are not available here")
    assert paths.default_index_dir(link) == paths.default_index_dir(repo)


def test_legacy_hint_only_when_old_dir_exists_and_new_does_not(tmp_path: Path, home: Path) -> None:
    repo = tmp_path / "work" / "proj"
    repo.mkdir(parents=True)
    assert paths.legacy_index_hint(repo) is None
    (home / ".karst" / "indexes" / "proj").mkdir(parents=True)
    hint = paths.legacy_index_hint(repo)
    assert hint and "\n" not in hint
    assert str(paths.default_index_dir(repo)) in hint
    paths.default_index_dir(repo).mkdir(parents=True)
    assert paths.legacy_index_hint(repo) is None


def test_ensure_private_dir_creates_the_tree(tmp_path: Path, home: Path) -> None:
    d = paths.ensure_private_dir(paths.default_index_dir(tmp_path))
    assert d.is_dir() and d.parent == home / ".karst" / "indexes"


posix_only = pytest.mark.skipif(os.name == "nt", reason="POSIX permissions")


def _mode(p: Path) -> int:
    return stat.S_IMODE(os.stat(p).st_mode)


@posix_only
def test_index_dirs_are_0700_on_posix(tmp_path: Path, home: Path) -> None:
    old = os.umask(0o022)
    try:
        d = paths.ensure_private_dir(paths.default_index_dir(tmp_path))
    finally:
        os.umask(old)
    for p in (home / ".karst", home / ".karst" / "indexes", d):
        assert _mode(p) == 0o700, (p, oct(_mode(p)))


@posix_only
def test_existing_karst_dirs_are_tightened(tmp_path: Path, home: Path) -> None:
    idx = home / ".karst" / "indexes"
    idx.mkdir(parents=True)
    os.chmod(home / ".karst", 0o755)
    os.chmod(idx, 0o777)
    d = paths.default_index_dir(tmp_path)
    d.mkdir()
    os.chmod(d, 0o775)
    paths.ensure_private_dir(d)
    assert _mode(home / ".karst") == 0o700
    assert _mode(idx) == 0o700
    assert _mode(d) == 0o700


@posix_only
def test_explicit_storage_outside_karst_home_is_not_chmodded(tmp_path: Path, home: Path) -> None:
    mine = tmp_path / "shared"
    mine.mkdir()
    os.chmod(mine, 0o755)
    new = paths.ensure_private_dir(mine / "index")
    assert _mode(mine) == 0o755  # a directory the user chose is left alone
    assert _mode(new) == 0o700   # what karst creates is private


@posix_only
def test_graph_file_is_private(tmp_path: Path, home: Path) -> None:
    from karst.graph.store import GraphStore

    p = paths.default_index_dir(tmp_path) / "graph.json"
    GraphStore().save(p)
    assert _mode(p) & 0o077 == 0
    assert _mode(p.parent) == 0o700


def _fake_qdrant_store(root: Path) -> Path:
    data = root / "collection" / "code_chunks" / "storage.sqlite"
    data.parent.mkdir(parents=True)
    data.write_bytes(b"")
    return data


@posix_only
def test_world_writable_vector_store_is_refused(tmp_path: Path) -> None:
    from karst.store import ChunkStore

    storage = tmp_path / "index"
    data = _fake_qdrant_store(storage)
    paths.check_vector_store_ownership(storage)  # private: fine
    os.chmod(data, 0o666)
    with pytest.raises(paths.UnsafeStorageError, match="world-writable"):
        ChunkStore(location=storage)  # refused before qdrant opens (and unpickles) it


@posix_only
@pytest.mark.skipif(os.name != "nt" and os.getuid() == 0, reason="root-owned files are trusted")
def test_vector_store_owned_by_another_user_is_refused(tmp_path: Path, monkeypatch) -> None:
    storage = tmp_path / "index"
    _fake_qdrant_store(storage)
    monkeypatch.setattr(paths.os, "getuid", lambda: os.stat(storage).st_uid + 4242)
    with pytest.raises(paths.UnsafeStorageError, match="another user"):
        paths.check_vector_store_ownership(storage)


@pytest.mark.skipif(os.name != "nt", reason="Windows only")
def test_windows_skips_chmod(tmp_path: Path, home: Path, monkeypatch) -> None:
    def fail(*_a, **_k):
        raise AssertionError("chmod must not be called on Windows")

    monkeypatch.setattr(paths.os, "chmod", fail)
    assert paths.ensure_private_dir(paths.default_index_dir(tmp_path)).is_dir()


def test_cli_and_mcp_use_the_helper(tmp_path: Path, home: Path) -> None:
    """Every command derives the same per-repo directory."""
    from karst import cli, mcp_server

    repo = tmp_path / "r"
    repo.mkdir()
    expected = paths.default_index_dir(repo)
    assert cli._default_storage(repo) == expected
    assert mcp_server._storage_for(mcp_server._resolve_repo(str(repo))) == expected
    assert mcp_server._graph_path(expected) == expected / "graph.json"


def test_no_unsafe_deserialization_in_the_package() -> None:
    """Guard: karst itself never unpickles or evaluates file contents."""
    import re

    pkg = Path(paths.__file__).parent
    bad = re.compile(
        r"^\s*(import|from)\s+(pickle|cPickle|marshal|shelve|dill|joblib)\b"
        r"|\bpickle\.(load|loads|Unpickler)\b|\bmarshal\.loads?\b|\byaml\.(load|unsafe_load)\b"
        r"|\b(eval|exec)\(",
        re.M,
    )
    hits = [
        f"{f.relative_to(pkg)}: {m.group(0).strip()}"
        for f in pkg.rglob("*.py")
        for m in bad.finditer(f.read_text(encoding="utf-8"))
    ]
    assert hits == []
