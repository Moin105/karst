"""HTTP-mode hardening of the MCP server: loopback by default, a bearer token
is mandatory, and tools only read repos under KARST_MCP_ROOTS."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from karst import mcp_server

REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _reset_roots():
    mcp_server.set_allowed_roots(None)
    yield
    mcp_server.set_allowed_roots(None)


@pytest.fixture
def no_server(monkeypatch):
    """Make sure nothing below actually starts a server or loads models."""
    import uvicorn

    def fail(*_a, **_k):
        raise AssertionError("the server must not start")

    monkeypatch.setattr(uvicorn, "run", fail)
    monkeypatch.setattr(mcp_server, "_preload_native_deps", lambda: None)
    monkeypatch.setattr(mcp_server.mcp, "run", fail)


# ------------------------------------------------------------------ defaults

def test_default_host_is_loopback(monkeypatch) -> None:
    monkeypatch.delenv("KARST_MCP_HOST", raising=False)
    assert mcp_server.build_arg_parser().parse_args([]).host == "127.0.0.1"
    assert mcp_server.build_arg_parser().parse_args(["--http"]).host == "127.0.0.1"


def test_host_env_and_flag_still_override(monkeypatch) -> None:
    monkeypatch.setenv("KARST_MCP_HOST", "0.0.0.0")
    assert mcp_server.build_arg_parser().parse_args([]).host == "0.0.0.0"
    assert mcp_server.build_arg_parser().parse_args(["--host", "10.0.0.5"]).host == "10.0.0.5"


# ------------------------------------------------------------------ token

@pytest.mark.parametrize("token", [None, "", "   "])
def test_http_refuses_to_start_without_token(monkeypatch, no_server, capsys, token) -> None:
    if token is None:
        monkeypatch.delenv("KARST_MCP_TOKEN", raising=False)
    else:
        monkeypatch.setenv("KARST_MCP_TOKEN", token)
    with pytest.raises(SystemExit) as exc:
        mcp_server.main(["--http"])
    assert exc.value.code == 2
    assert "KARST_MCP_TOKEN" in capsys.readouterr().err


def test_http_env_switch_also_requires_token(monkeypatch, no_server) -> None:
    monkeypatch.delenv("KARST_MCP_TOKEN", raising=False)
    monkeypatch.setenv("KARST_MCP_HTTP", "1")
    with pytest.raises(SystemExit) as exc:
        mcp_server.main([])
    assert exc.value.code == 2


def test_http_refusal_from_the_real_entry_point(tmp_path: Path) -> None:
    env = {k: v for k, v in os.environ.items() if not k.startswith("KARST_MCP")}
    env["PYTHONPATH"] = str(REPO_ROOT)
    proc = subprocess.run(
        [sys.executable, "-m", "karst.mcp_server", "--http", "--port", "0"],
        cwd=str(tmp_path), env=env, capture_output=True, text=True, timeout=120,
    )
    assert proc.returncode == 2
    assert "KARST_MCP_TOKEN" in proc.stderr
    assert "Streamable HTTP on" not in proc.stderr


def test_http_app_cannot_be_built_without_token() -> None:
    with pytest.raises(ValueError):
        mcp_server._build_http_app("")


def test_http_app_requires_the_bearer_token() -> None:
    from starlette.testclient import TestClient

    app = mcp_server._build_http_app("s3cret-token")
    client = TestClient(app)
    assert client.get("/healthz").status_code == 200
    assert client.post("/mcp", json={}).status_code == 401
    assert client.post("/mcp", json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_http_starts_with_token_and_default_roots(monkeypatch, tmp_path, capsys) -> None:
    started = {}
    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda app, host, port, **kw: started.update(host=host, port=port))
    monkeypatch.setattr(mcp_server, "_preload_native_deps", lambda: None)
    monkeypatch.setenv("KARST_MCP_TOKEN", "s3cret-token")
    monkeypatch.delenv("KARST_MCP_ROOTS", raising=False)
    monkeypatch.delenv("KARST_MCP_HOST", raising=False)
    monkeypatch.chdir(tmp_path)
    mcp_server.main(["--http", "--port", "9999"])
    assert started == {"host": "127.0.0.1", "port": 9999}
    err = capsys.readouterr().err
    assert "KARST_MCP_ROOTS is not set" in err and str(tmp_path.resolve()) in err
    # The working directory is now the only root.
    mcp_server._resolve_repo(str(tmp_path))
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server._resolve_repo(str(tmp_path.parent))


def test_bad_roots_entry_stops_the_server(monkeypatch, tmp_path, no_server) -> None:
    monkeypatch.setenv("KARST_MCP_TOKEN", "s3cret-token")
    monkeypatch.setenv("KARST_MCP_ROOTS", str(tmp_path / "does-not-exist"))
    with pytest.raises(SystemExit) as exc:
        mcp_server.main(["--http"])
    assert exc.value.code == 2


# ------------------------------------------------------------------ roots

@pytest.fixture
def layout(tmp_path: Path):
    allowed = tmp_path / "allowed"
    inside = allowed / "repo"
    outside = tmp_path / "secret"
    inside.mkdir(parents=True)
    outside.mkdir()
    (outside / "x.py").write_text("SECRET = 1\n", encoding="utf-8")
    return allowed, inside, outside


def _restrict(*roots: Path) -> None:
    raw = os.pathsep.join(str(r) for r in roots)
    found, defaulted = mcp_server.parse_allowed_roots(raw, cwd=str(roots[0]))
    assert not defaulted
    mcp_server.set_allowed_roots(found)


TOOLS = [
    ("search_code", lambda p: mcp_server.search_code("q", p)),
    ("find_impact", lambda p: mcp_server.find_impact("x", p)),
    ("list_packs", lambda p: mcp_server.list_packs(p)),
    ("index_status", lambda p: mcp_server.index_status(p)),
    ("index_repository", lambda p: mcp_server.index_repository(p)),
]


@pytest.mark.parametrize("name,call", TOOLS, ids=[t[0] for t in TOOLS])
def test_every_tool_rejects_repo_outside_roots(layout, name, call, monkeypatch) -> None:
    allowed, inside, outside = layout
    _restrict(allowed)
    import karst.indexer

    monkeypatch.setattr(karst.indexer, "index_repo", lambda *a, **k: pytest.fail("indexed outside roots"))
    for bad in (str(outside), str(inside / ".." / ".." / "secret"), str(allowed.parent)):
        with pytest.raises(mcp_server.RepoPathNotAllowed):
            call(bad)


def test_repo_inside_roots_is_accepted(layout, tmp_path, monkeypatch) -> None:
    allowed, inside, _ = layout
    monkeypatch.setattr(mcp_server.Path, "home", classmethod(lambda cls: tmp_path / "home"))
    _restrict(allowed)
    assert "Not indexed" in mcp_server.index_status(str(inside))
    assert "Not indexed" in mcp_server.index_status(str(allowed))  # the root itself


def test_several_roots(layout, tmp_path) -> None:
    allowed, inside, outside = layout
    _restrict(allowed, outside)
    assert mcp_server._resolve_repo(str(outside)) == Path(os.path.realpath(outside))
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server._resolve_repo(str(tmp_path))


def test_sibling_with_common_prefix_is_not_inside(tmp_path) -> None:
    root = tmp_path / "proj"
    evil = tmp_path / "proj-evil"
    root.mkdir()
    evil.mkdir()
    _restrict(root)
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server._resolve_repo(str(evil))


def test_symlink_escape_is_rejected(layout) -> None:
    allowed, inside, outside = layout
    link = allowed / "escape"
    try:
        os.symlink(outside, link, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are not available here")
    _restrict(allowed)
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server.index_status(str(link))
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server.search_code("q", str(link / "."))


def test_symlinked_root_still_allows_its_contents(tmp_path) -> None:
    real = tmp_path / "real"
    (real / "repo").mkdir(parents=True)
    link = tmp_path / "rootlink"
    try:
        os.symlink(real, link, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are not available here")
    _restrict(link)
    assert mcp_server._resolve_repo(str(real / "repo")) == Path(os.path.realpath(real / "repo"))
    assert mcp_server._resolve_repo(str(link / "repo")) == Path(os.path.realpath(real / "repo"))


@pytest.mark.skipif(os.name != "nt", reason="Windows path semantics")
def test_windows_case_and_drive_handling(layout) -> None:
    allowed, inside, _ = layout
    _restrict(allowed)
    mcp_server._resolve_repo(str(inside).upper())  # same dir, different case
    other_drive = "Z:\\" if not str(allowed).upper().startswith("Z:") else "Y:\\"
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server._resolve_repo(other_drive + "repo")


def test_stdio_mode_is_unrestricted(layout, tmp_path, monkeypatch) -> None:
    _, _, outside = layout
    monkeypatch.setattr(mcp_server.Path, "home", classmethod(lambda cls: tmp_path / "home"))
    mcp_server.set_allowed_roots(None)
    assert "Not indexed" in mcp_server.index_status(str(outside))


def test_empty_repo_path_is_rejected() -> None:
    with pytest.raises(mcp_server.RepoPathNotAllowed):
        mcp_server._resolve_repo("  ")
