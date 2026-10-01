"""Index-location tests: one index per checkout, shared by the CLI and MCP.

karst 0.2.10 keyed ~/.karst/indexes/ by the repo folder name alone, so
/work/clientA/api and /work/clientB/api shared one index and a search over one
could return the other's code. These tests pin the fix and the migration path
for indexes those versions wrote. A fake embedder keeps them fast and offline.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

import pytest

from karst import cli, embedder, indexer, mcp_server, storage
from karst.manifest import FileEntry, Manifest, file_sha, load_manifest, save_manifest


class _FakeEmbedder:
    """Deterministic 8-dim vectors; enough for retrieval to return every chunk."""

    dim = 8

    def __init__(self, model_name: str = "fake", *, cache_dir: str | None = None) -> None:
        self.model_name = model_name

    def embed_texts(self, texts: list[str], *, batch_size: int = 32) -> list[list[float]]:
        out = []
        for text in texts:
            digest = hashlib.sha1(text.encode("utf-8")).digest()
            out.append([b / 255.0 + 0.01 for b in digest[: self.dim]])
        return out


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    indexes = tmp_path / "home" / ".karst" / "indexes"
    monkeypatch.setattr(storage, "index_home", lambda: indexes)
    return indexes


@pytest.fixture
def fake_embedder(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(indexer, "Embedder", _FakeEmbedder)
    monkeypatch.setattr(embedder, "Embedder", _FakeEmbedder)
    monkeypatch.setattr(mcp_server, "_embedder", None)
    yield
    # Release Qdrant's file locks so tmp_path can be cleaned up (Windows).
    mcp_server._close_all()
    mcp_server._graphs.clear()
    mcp_server._packs.clear()


def _repo(base: Path, files: dict[str, str]) -> Path:
    for rel, text in files.items():
        path = base / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return base.resolve()


def _client_repos(tmp_path: Path) -> tuple[Path, Path]:
    """Two checkouts that share the folder name `api` but not their code."""
    a = _repo(tmp_path / "clientA" / "api", {
        "billing/charge.py": "def charge_client_a(amount):\n    return amount * 2\n",
        "common.py": "def shared_helper():\n    return 'a'\n",
    })
    b = _repo(tmp_path / "clientB" / "api", {
        "payments/refund.py": "def refund_client_b(amount):\n    return -amount\n",
        "common.py": "def shared_helper():\n    return 'b'\n",
    })
    return a, b


# --------------------------------------------------------------------------- #
# Path resolution
# --------------------------------------------------------------------------- #

def test_same_folder_name_in_different_parents_gets_separate_dirs(home: Path, tmp_path: Path) -> None:
    a, b = _client_repos(tmp_path)

    sa, sb = storage.storage_for(a), storage.storage_for(b)

    assert sa != sb
    assert sa.parent == sb.parent == home
    # Still readable: the folder name leads, the path id follows.
    assert sa.name == f"api-{storage.repo_id(a)}"
    assert sb.name == f"api-{storage.repo_id(b)}"


def test_storage_is_stable_across_spellings_of_one_path(
    home: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    a, _ = _client_repos(tmp_path)
    expected = storage.storage_for(a)

    assert storage.storage_for(str(a) + os.sep) == expected
    assert storage.storage_for(a / "billing" / "..") == expected
    monkeypatch.chdir(a)
    assert storage.storage_for(".") == expected
    if os.name == "nt":
        assert storage.storage_for(str(a).upper()) == expected


def test_filesystem_root_gets_a_readable_name(home: Path) -> None:
    root = Path(Path.cwd().anchor)
    assert storage.storage_for(root).name.startswith("root-")


def test_cli_where_and_mcp_report_the_same_dir(
    home: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    a, _ = _client_repos(tmp_path)

    assert cli.main(["where", str(a)]) == 0
    cli_dir = capsys.readouterr().out.strip()

    status = mcp_server.index_status(str(a))
    assert f"Expected index at {cli_dir}" in status
    assert cli_dir == str(storage.storage_for(a))


# --------------------------------------------------------------------------- #
# Legacy <name> dirs from karst 0.2.10 and earlier
# --------------------------------------------------------------------------- #

def _legacy_index(home: Path, name: str, files: dict[str, str], *, root: str | None) -> Path:
    """A manifest-only stand-in for an index an older karst left behind."""
    legacy = home / name
    m = Manifest(embedding_model="fake", root=root)
    for rel, sha in files.items():
        m.files[rel] = FileEntry(sha=sha, chunk_count=1)
    save_manifest(legacy, m)
    return legacy


def test_legacy_dir_is_used_when_its_manifest_records_this_checkout(home: Path, tmp_path: Path) -> None:
    a, b = _client_repos(tmp_path)
    legacy = _legacy_index(home, "api", {}, root=str(a))

    assert storage.storage_for(a) == legacy
    assert storage.storage_for(a, for_write=True) == legacy
    # The other checkout with the same folder name never sees it.
    assert storage.storage_for(b) == home / f"api-{storage.repo_id(b)}"
    assert storage.storage_for(b, for_write=True) == home / f"api-{storage.repo_id(b)}"


def test_rootless_legacy_dir_is_never_read_but_index_adopts_it(home: Path, tmp_path: Path) -> None:
    a, b = _client_repos(tmp_path)
    files = {rel: file_sha(a / rel) for rel in ("billing/charge.py", "common.py")}
    legacy = _legacy_index(home, "api", files, root=None)
    hashed_a = home / f"api-{storage.repo_id(a)}"

    # Reads: it might be B's code, so it isn't used.
    assert storage.storage_for(a) == hashed_a
    assert storage.unclaimed_legacy_storage(a) == legacy
    # Writes: A's files match the manifest, so `index` adopts it.
    assert storage.storage_for(a, for_write=True) == legacy
    # B's files don't, so B gets its own dir.
    assert storage.storage_for(b, for_write=True) == home / f"api-{storage.repo_id(b)}"


def test_rootless_legacy_dir_needs_half_its_files_unchanged(home: Path, tmp_path: Path) -> None:
    a = _repo(tmp_path / "api", {f"m{i}.py": f"def f{i}():\n    return {i}\n" for i in range(4)})
    files = {f"m{i}.py": file_sha(a / f"m{i}.py") for i in range(4)}
    _legacy_index(home, "api", files, root=None)
    hashed = home / f"api-{storage.repo_id(a)}"

    (a / "m0.py").write_text("def f0():\n    return 'edited'\n", encoding="utf-8")
    (a / "m1.py").unlink()
    assert storage.storage_for(a, for_write=True) == home / "api"   # 2 of 4 unchanged

    (a / "m2.py").write_text("def f2():\n    return 'edited'\n", encoding="utf-8")
    assert storage.storage_for(a, for_write=True) == hashed          # 1 of 4 unchanged


def test_hashed_dir_wins_once_it_exists(home: Path, tmp_path: Path) -> None:
    a, _ = _client_repos(tmp_path)
    _legacy_index(home, "api", {}, root=str(a))
    hashed = home / f"api-{storage.repo_id(a)}"
    hashed.mkdir(parents=True)

    assert storage.storage_for(a) == hashed
    assert storage.unclaimed_legacy_storage(a) is None


def test_manifest_root_roundtrips_and_is_optional(tmp_path: Path) -> None:
    save_manifest(tmp_path / "new", Manifest(embedding_model="m", root="/work/api"))
    assert load_manifest(tmp_path / "new").root == "/work/api"

    old = tmp_path / "old"
    old.mkdir()
    (old / "manifest.json").write_text(
        '{"version": 1, "embedding_model": "m", "files": {}}', encoding="utf-8"
    )
    assert load_manifest(old).root is None


# --------------------------------------------------------------------------- #
# End to end through the MCP tools (the path the bug report hit)
# --------------------------------------------------------------------------- #

def _cited_files(search_output: str) -> set[str]:
    return {line.split(":", 1)[0].split("] ", 1)[1] for line in search_output.splitlines()
            if line.startswith("[") and "] " in line}


def test_same_named_repos_do_not_share_an_index(home: Path, tmp_path: Path, fake_embedder) -> None:
    a, b = _client_repos(tmp_path)

    out_a = mcp_server.index_repository(str(a))
    out_b = mcp_server.index_repository(str(b))
    assert str(storage.storage_for(a)) in out_a
    assert str(storage.storage_for(b)) in out_b

    hits_a = _cited_files(mcp_server.search_code("client amount", str(a), limit=20))
    hits_b = _cited_files(mcp_server.search_code("client amount", str(b), limit=20))

    assert hits_a == {"billing/charge.py", "common.py"}
    assert hits_b == {"payments/refund.py", "common.py"}
    assert load_manifest(storage.storage_for(a)).root == str(a)
    assert load_manifest(storage.storage_for(b)).root == str(b)


def test_index_repository_adopts_a_matching_legacy_index(home: Path, tmp_path: Path, fake_embedder) -> None:
    a, b = _client_repos(tmp_path)
    legacy = home / "api"
    indexer.index_repo(a, storage_path=legacy)
    # Make it look like 0.2.10 wrote it: no recorded root.
    m = load_manifest(legacy)
    m.root = None
    save_manifest(legacy, m)

    # Not searched until claimed, and the hint says why.
    hint = mcp_server.search_code("charge", str(a))
    assert "isn't indexed yet" in hint and str(legacy) in hint

    out = mcp_server.index_repository(str(a))
    assert f"storage:     {legacy}" in out
    assert "2 reused" in out                   # incremental: nothing re-embedded
    assert load_manifest(legacy).root == str(a)
    assert _cited_files(mcp_server.search_code("charge", str(a), limit=20)) == {
        "billing/charge.py", "common.py",
    }

    # B shares the folder name but not the code: it gets its own dir.
    out_b = mcp_server.index_repository(str(b))
    assert f"storage:     {home / f'api-{storage.repo_id(b)}'}" in out_b
    assert _cited_files(mcp_server.search_code("refund", str(b), limit=20)) == {
        "payments/refund.py", "common.py",
    }
