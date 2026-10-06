"""Tests for the Claude Code PreToolUse hook in contrib/claude-code/.

The gate is run as a subprocess with synthetic hook JSON, the way Claude Code
runs it. It talks to the karst CLI from this checkout (via PYTHONPATH), so the
tests need the chunker fix that keeps decorated methods in the graph.

Each case that reaches karst starts two karst processes, so the file takes a
few tens of seconds.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
GATE_DIR = REPO_ROOT / "contrib" / "claude-code"
GATE = GATE_DIR / "karst_impact_gate.py"
SHIM = GATE_DIR / "karst-impact-gate.sh"
FIXTURE = Path(__file__).parent / "fixtures" / "httpx_like" / "_client.py"

if not GATE.exists():
    pytest.skip(f"gate not found at {GATE}", allow_module_level=True)

# Qualified names in the graph are "<repo-relative path>::<chunk qualified name>".
CLIENT = "httpx/_client.py"
MERGE_URL = f"{CLIENT}::BaseClient._merge_url"
TRANSPORT = f"{CLIENT}::Client._transport_for_url"


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _cmdline(*parts: str) -> str:
    """Build a KARST_BIN string the gate can split on this platform."""
    return subprocess.list2cmdline(list(parts)) if os.name == "nt" else shlex.join(parts)


def build_graph(repo: Path, out: Path) -> Path:
    """`karst graph-index` with this checkout (not the globally installed karst)."""
    env = dict(os.environ, PYTHONPATH=str(REPO_ROOT), PYTHONIOENCODING="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "karst", "graph-index", str(repo), "--storage", str(out)],
        cwd=str(repo), env=env, capture_output=True, text=True, encoding="utf-8",
    )
    assert proc.returncode == 0, proc.stderr
    assert out.is_file()
    return out


@pytest.fixture(scope="module")
def graph_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Graph of the pristine fixture repo, built once with this checkout."""
    base = tmp_path_factory.mktemp("graph")
    repo = base / "repo"
    (repo / "httpx").mkdir(parents=True)
    shutil.copy(FIXTURE, repo / CLIENT)
    return build_graph(repo, base / "graph.pkl")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A fresh git-looking copy of the fixture: <tmp>/repo/httpx/_client.py."""
    root = tmp_path / "repo"
    (root / "httpx").mkdir(parents=True)
    (root / ".git").mkdir()
    shutil.copy(FIXTURE, root / CLIENT)
    return root


class Gate:
    def __init__(self, repo: Path, graph: Path, tmp: Path) -> None:
        self.repo = repo
        self.graph = graph
        self.tmp = tmp
        self.log = tmp / "gate-log.jsonl"

    def env(self, **extra: str | None) -> dict[str, str]:
        env = {k: v for k, v in os.environ.items() if not k.startswith(("KARST_BIN", "KARST_GATE", "KARST_GRAPH"))}
        env["PYTHONPATH"] = str(REPO_ROOT)
        env["PYTHONIOENCODING"] = "utf-8"
        env["KARST_GATE_LOG"] = str(self.log)
        env["KARST_GRAPH_PATH"] = str(self.graph)
        for key, value in extra.items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = value
        return env

    def run(self, payload: dict | bytes | str, **extra: str | None) -> subprocess.CompletedProcess:
        if isinstance(payload, (dict, list)):
            data = json.dumps(payload).encode("utf-8")
        elif isinstance(payload, str):
            data = payload.encode("utf-8")
        else:
            data = payload
        return subprocess.run(
            [sys.executable, str(GATE)],
            input=data, capture_output=True, env=self.env(**extra), cwd=str(self.repo),
            timeout=120,
        )

    def edit(self, old: str, new: str, *, path: str = CLIENT, **kw) -> dict:
        return self.payload("Edit", {"file_path": path, "old_string": old, "new_string": new, **kw})

    def payload(self, tool: str, tool_input: dict) -> dict:
        return {
            "session_id": "test",
            "cwd": str(self.repo),
            "hook_event_name": "PreToolUse",
            "tool_name": tool,
            "tool_input": tool_input,
        }

    def log_lines(self) -> list[dict]:
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text(encoding="utf-8").splitlines() if line.strip()]


@pytest.fixture
def gate(repo: Path, graph_path: Path, tmp_path: Path) -> Gate:
    return Gate(repo, graph_path, tmp_path)


def decision(proc: subprocess.CompletedProcess) -> dict | None:
    """The hook's JSON answer, or None when the gate allowed (empty stdout)."""
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    out = proc.stdout.decode("utf-8")
    if not out.strip():
        return None
    obj = json.loads(out)  # exactly one JSON object
    assert list(obj) == ["hookSpecificOutput"]
    spec = obj["hookSpecificOutput"]
    assert spec["hookEventName"] == "PreToolUse"
    assert spec["permissionDecision"] == "ask"
    assert isinstance(spec["permissionDecisionReason"], str) and spec["permissionDecisionReason"]
    return spec


def assert_allow(proc: subprocess.CompletedProcess) -> None:
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    assert proc.stdout.decode("utf-8") == ""


def reason_of(proc: subprocess.CompletedProcess) -> str:
    spec = decision(proc)
    assert spec is not None, "expected an ask decision, got allow"
    return spec["permissionDecisionReason"]


# --------------------------------------------------------------------------
# Decisions that reach karst
# --------------------------------------------------------------------------

def test_ask_when_blast_radius_reaches_threshold(gate: Gate) -> None:
    proc = gate.run(
        gate.edit("        return self._base_url + url", "        return self._base_url + '/' + url"),
        KARST_GATE_ASK_AT="MEDIUM",
    )
    reason = reason_of(proc)
    assert MERGE_URL in reason
    assert "build_request" in reason
    assert "MEDIUM" in reason and "affected" in reason
    assert "Top callers" in reason

    (entry,) = gate.log_lines()
    assert entry["decision"] == "ask"
    assert entry["tool"] == "Edit"
    assert entry["targets"] == [MERGE_URL]
    assert entry["risk"] == "MEDIUM"
    assert isinstance(entry["affected"], int) and entry["affected"] >= 2
    assert isinstance(entry["elapsed_ms"], int)
    assert {"ts", "file", "reason"} <= set(entry)


def test_allow_leaf_function_below_default_threshold(gate: Gate) -> None:
    old = "    def _transport_for_url(self, url: str) -> str:\n        return url"
    proc = gate.run(gate.edit(old, old + ".strip()"))
    assert_allow(proc)
    (entry,) = gate.log_lines()
    assert entry["decision"] == "allow"
    assert entry["targets"] == [TRANSPORT]
    assert entry["risk"] in {"LOW", "MEDIUM"}


def test_module_level_edit_targets_the_whole_file(gate: Gate) -> None:
    proc = gate.run(gate.edit("from contextlib import contextmanager", "from contextlib import contextmanager, closing"))
    assert_allow(proc)  # nothing imports the fixture file, so the file's blast radius is none
    (entry,) = gate.log_lines()
    assert entry["targets"] == [CLIENT]
    assert entry["decision"] == "allow"


def test_write_over_existing_file_maps_changed_lines(gate: Gate, repo: Path) -> None:
    path = repo / CLIENT
    new = path.read_text(encoding="utf-8").replace("self._base_url + url", "self._base_url + '/' + url")
    proc = gate.run(gate.payload("Write", {"file_path": str(path), "content": new}), KARST_GATE_ASK_AT="MEDIUM")
    assert MERGE_URL in reason_of(proc)
    assert gate.log_lines()[0]["targets"] == [MERGE_URL]


def test_multiedit_covers_every_edited_symbol(gate: Gate) -> None:
    payload = gate.payload(
        "MultiEdit",
        {
            "file_path": CLIENT,
            "edits": [
                {"old_string": "return self._base_url + url", "new_string": "return self._base_url + '/' + url"},
                {"old_string": "    def _transport_for_url(self, url: str) -> str:\n        return url",
                 "new_string": "    def _transport_for_url(self, url: str) -> str:\n        return url.strip()"},
            ],
        },
    )
    proc = gate.run(payload, KARST_GATE_ASK_AT="MEDIUM")
    reason = reason_of(proc)
    assert MERGE_URL in reason and TRANSPORT in reason
    assert sorted(gate.log_lines()[0]["targets"]) == sorted([MERGE_URL, TRANSPORT])


def test_crlf_file_still_matches_lf_old_string(gate: Gate, repo: Path) -> None:
    path = repo / CLIENT
    path.write_bytes(path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    old = "    def build_request(self, method: str, url: str) -> tuple[str, str]:\n        return (method, self._merge_url(url))"
    proc = gate.run(gate.edit(old, old + "  # noqa"), KARST_GATE_ASK_AT="MEDIUM")
    assert f"{CLIENT}::BaseClient.build_request" in reason_of(proc)


def _with_tests(repo: Path, out: Path, n_tests: int, target_call: str) -> Path:
    """Add tests/test_client.py with n_tests tests that call `target_call`, and
    return a graph of the repo that includes them."""
    tests = repo / "tests"
    tests.mkdir()
    body = "from httpx._client import Client\n\n\n" + "\n\n".join(
        f"def test_case_{i}():\n    client = Client()\n    client.{target_call}\n" for i in range(n_tests)
    )
    (tests / "test_client.py").write_text(body, encoding="utf-8")
    return build_graph(repo, out)


def _top_callers(reason: str) -> tuple[list[str], int]:
    """Entry names and the (+N tests) count from an ask reason."""
    m = re.search(r"Top (?:callers|dependents): (.*?)(?: \(\+(\d+) tests?\))?\. Approve", reason)
    assert m, reason
    names = [part.split(" (")[0] for part in m.group(1).split(", ")]
    return names, int(m.group(2) or 0)


def test_top_callers_rank_non_test_code_before_tests(gate: Gate, repo: Path, tmp_path: Path) -> None:
    # Six tests call _merge_url directly (depth 1). Five non-test callers sit at depth 1-3.
    graph = _with_tests(repo, tmp_path / "x.pkl", 6, '_merge_url("/")')
    proc = gate.run(
        gate.edit("        return self._base_url + url", "        return self._base_url + '/' + url"),
        KARST_GATE_ASK_AT="MEDIUM", KARST_GRAPH_PATH=str(graph),
    )
    names, tests_left = _top_callers(reason_of(proc))
    # Nearest non-test first, then by depth. Containing class and file are not listed.
    assert names == [
        "BaseClient.build_request",
        "Client.request",
        "Client.stream",
        "Client.get",
        "Client.post",
    ]
    assert tests_left == 6
    assert not any(n.startswith("test_") for n in names)


def test_top_callers_fill_with_tests_when_few_non_test_callers(gate: Gate, repo: Path, tmp_path: Path) -> None:
    # Client.request has two non-test callers (get, post). Four tests also call it.
    graph = _with_tests(repo, tmp_path / "y.pkl", 4, 'request("GET", "/")')
    proc = gate.run(
        gate.edit("        request = self.build_request(method, url)\n        return self.send(request)",
                  "        request = self.build_request(method, url)\n        return self.send(request)  # edited"),
        KARST_GATE_ASK_AT="LOW", KARST_GRAPH_PATH=str(graph),
    )
    names, tests_left = _top_callers(reason_of(proc))
    assert names[:2] == ["Client.get", "Client.post"]
    assert all(n.startswith("test_case_") for n in names[2:])
    assert len(names) == 5
    assert tests_left == 1


# --------------------------------------------------------------------------
# Fail closed
# --------------------------------------------------------------------------

def test_coverage_gap_for_symbol_added_after_the_graph(gate: Gate, repo: Path) -> None:
    path = repo / CLIENT
    path.write_text(
        path.read_text(encoding="utf-8")
        + "\n\ndef brand_new_helper(x: int) -> int:\n    return x + 1\n",
        encoding="utf-8",
    )
    proc = gate.run(gate.edit("    return x + 1", "    return x + 2"))
    reason = reason_of(proc)
    assert "coverage gap" in reason
    assert "brand_new_helper" in reason
    assert "graph-index" in reason
    assert gate.log_lines()[0]["decision"] == "ask"


def test_ask_when_karst_command_does_not_exist(gate: Gate) -> None:
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_BIN="no-such-karst-command-xyz --flag",
    )
    reason = reason_of(proc)
    assert "no-such-karst-command-xyz" in reason
    assert "not available" in reason


def test_ask_when_karst_hangs_past_the_timeout(gate: Gate, tmp_path: Path) -> None:
    sleeper = tmp_path / "sleeper.py"
    sleeper.write_text("import time\ntime.sleep(60)\n", encoding="utf-8")
    started = time.monotonic()
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_BIN=_cmdline(sys.executable, str(sleeper)),
        KARST_GATE_TIMEOUT="1",
    )
    reason = reason_of(proc)
    assert "timed out" in reason and "KARST_GATE_TIMEOUT" in reason
    assert time.monotonic() - started < 30


def test_ask_when_karst_exits_non_zero(gate: Gate, tmp_path: Path) -> None:
    broken = tmp_path / "broken.py"
    broken.write_text("import sys\nsys.stderr.write('boom happened\\n')\nsys.exit(3)\n", encoding="utf-8")
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_BIN=_cmdline(sys.executable, str(broken)),
    )
    reason = reason_of(proc)
    assert "exit 3" in reason and "boom happened" in reason


def test_ask_when_karst_output_is_unparseable(gate: Gate, tmp_path: Path) -> None:
    junk = tmp_path / "junk.py"
    junk.write_text("print('this is not json')\n", encoding="utf-8")
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_BIN=_cmdline(sys.executable, str(junk)),
    )
    assert "could not parse" in reason_of(proc)


def test_ask_when_graph_file_is_missing(gate: Gate, tmp_path: Path) -> None:
    missing = tmp_path / "nope" / "graph.pkl"
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_GRAPH_PATH=str(missing),
    )
    reason = reason_of(proc)
    assert "graph-index" in reason and str(missing) in reason


def test_ask_when_default_graph_location_is_empty(gate: Gate, tmp_path: Path) -> None:
    home = tmp_path / "home"
    home.mkdir()
    proc = gate.run(
        gate.edit("return self._base_url + url", "return self._base_url + '/' + url"),
        KARST_GRAPH_PATH=None, HOME=str(home), USERPROFILE=str(home),
    )
    reason = reason_of(proc)
    expected = home / ".karst" / "indexes" / gate.repo.name / "graph.pkl"
    assert str(expected) in reason


def test_ask_on_unparseable_stdin(gate: Gate) -> None:
    proc = gate.run(b"this is { not json")
    assert "fail-closed" in reason_of(proc)
    assert gate.log_lines()[0]["decision"] == "ask"


@pytest.mark.parametrize(
    "payload",
    [
        {"tool_input": {"file_path": CLIENT}},                                  # no tool_name
        {"tool_name": "Edit", "tool_input": {"old_string": "a", "new_string": "b"}},  # no file_path
        {"tool_name": "Write", "tool_input": {"file_path": CLIENT}},            # no content
        ["not", "an", "object"],
    ],
)
def test_ask_on_missing_fields(gate: Gate, payload) -> None:
    if isinstance(payload, dict):
        payload = {"cwd": str(gate.repo), **payload}
    assert "fail-closed" in reason_of(gate.run(payload))


def test_ask_on_invalid_threshold(gate: Gate) -> None:
    proc = gate.run(gate.edit("return url\n", "return url\n"), KARST_GATE_ASK_AT="SEVERE")
    assert "KARST_GATE_ASK_AT" in reason_of(proc)


# --------------------------------------------------------------------------
# Allowed without calling karst (KARST_BIN is broken to prove it is not used)
# --------------------------------------------------------------------------

BROKEN_KARST = {"KARST_BIN": "no-such-karst-command-xyz"}


def test_allow_markdown_edit(gate: Gate, repo: Path) -> None:
    (repo / "README.md").write_text("# hi\nold text\n", encoding="utf-8")
    assert_allow(gate.run(gate.edit("old text", "new text", path="README.md"), **BROKEN_KARST))
    assert gate.log_lines()[0]["decision"] == "allow"


def test_allow_write_of_new_file(gate: Gate, repo: Path) -> None:
    target = repo / "httpx" / "_brand_new.py"
    payload = gate.payload("Write", {"file_path": str(target), "content": "def f():\n    return 1\n"})
    assert_allow(gate.run(payload, **BROKEN_KARST))
    assert not target.exists()  # the gate must never create files


def test_allow_when_old_string_is_not_in_the_file(gate: Gate) -> None:
    assert_allow(gate.run(gate.edit("text that is not in the file", "x"), **BROKEN_KARST))


def test_allow_tool_that_is_not_gated(gate: Gate) -> None:
    assert_allow(gate.run({"tool_name": "Bash", "tool_input": {"command": "ls"}}, **BROKEN_KARST))


def test_allow_file_in_vendored_directory(gate: Gate, repo: Path) -> None:
    vendored = repo / "vendor" / "lib.py"
    vendored.parent.mkdir()
    vendored.write_text("def f():\n    return 1\n", encoding="utf-8")
    assert_allow(gate.run(gate.edit("return 1", "return 2", path="vendor/lib.py"), **BROKEN_KARST))


def test_allow_write_that_changes_nothing(gate: Gate, repo: Path) -> None:
    path = repo / CLIENT
    payload = gate.payload("Write", {"file_path": str(path), "content": path.read_text(encoding="utf-8")})
    assert_allow(gate.run(payload, **BROKEN_KARST))


def test_logging_failure_does_not_change_the_decision(gate: Gate, repo: Path, tmp_path: Path) -> None:
    blocker = tmp_path / "a-file"
    blocker.write_text("x", encoding="utf-8")
    bad_log = str(blocker / "sub" / "log.jsonl")  # parent is a file, so the write must fail
    (repo / "notes.md").write_text("a\n", encoding="utf-8")
    assert_allow(gate.run(gate.edit("a", "b", path="notes.md"), KARST_GATE_LOG=bad_log))
    assert "fail-closed" in reason_of(gate.run(b"{", KARST_GATE_LOG=bad_log))


@pytest.mark.skipif(sys.platform == "win32" or not shutil.which("bash"), reason="needs a POSIX bash")
def test_shell_shim_passes_stdin_to_the_gate(gate: Gate, repo: Path) -> None:
    (repo / "notes.md").write_text("a\n", encoding="utf-8")
    ok = subprocess.run(["bash", str(SHIM)], input=json.dumps(gate.edit("a", "b", path="notes.md")).encode(),
                        capture_output=True, env=gate.env(), cwd=str(repo), timeout=60)
    assert_allow(ok)
    bad = subprocess.run(["bash", str(SHIM)], input=b"{", capture_output=True, env=gate.env(), cwd=str(repo), timeout=60)
    assert "fail-closed" in reason_of(bad)


# --------------------------------------------------------------------------
# In-process unit tests for the pure helpers
# --------------------------------------------------------------------------

@pytest.fixture(scope="module")
def mod():
    spec = importlib.util.spec_from_file_location("karst_impact_gate", GATE)
    module = importlib.util.module_from_spec(spec)
    sys.modules["karst_impact_gate"] = module
    spec.loader.exec_module(module)
    return module


def test_ranges_for_edits_first_vs_all_occurrences(mod) -> None:
    text = "a = 1\nb = 2\na = 1\n"
    first = mod.ranges_for_edits(text, [{"old_string": "a = 1", "new_string": "a = 9"}])
    every = mod.ranges_for_edits(text, [{"old_string": "a = 1", "new_string": "a = 9", "replace_all": True}])
    assert first == [("lines", 1, 1)]
    assert every == [("lines", 1, 1), ("lines", 3, 3)]


def test_ranges_for_edits_multiline_and_trailing_newline(mod) -> None:
    text = "x\ndef f():\n    return 1\n\ny = 2\n"
    got = mod.ranges_for_edits(text, [{"old_string": "def f():\n    return 1\n", "new_string": ""}])
    assert got == [("lines", 2, 3)]


def test_ranges_for_edits_missing_old_string_is_none(mod) -> None:
    assert mod.ranges_for_edits("a\n", [{"old_string": "zzz", "new_string": "y"}]) is None
    assert mod.ranges_for_edits("a\n", [{"old_string": "", "new_string": "y"}]) is None


def test_multiedit_second_edit_may_depend_on_the_first(mod) -> None:
    text = "def f():\n    return 1\n"
    edits = [
        {"old_string": "return 1", "new_string": "return 2"},
        {"old_string": "return 2", "new_string": "return 3"},
    ]
    assert mod.ranges_for_edits(text, edits) == [("lines", 2, 2)]


def test_ranges_for_write_replace_delete_and_insert(mod) -> None:
    old = "a\nb\nc\nd\n"
    assert mod.ranges_for_write(old, "a\nB\nc\nd\n") == [("lines", 2, 2)]
    assert mod.ranges_for_write(old, "a\nd\n") == [("lines", 2, 3)]
    assert mod.ranges_for_write(old, "a\nb\nNEW\nc\nd\n") == [("gap", 2)]
    assert mod.ranges_for_write(old, old) == []


def test_pick_symbols_chooses_the_innermost_chunk(mod) -> None:
    chunks = [
        {"qname": "A", "kind": "class", "start": 1, "end": 20},
        {"qname": "A.f", "kind": "method", "start": 3, "end": 8},
        {"qname": "A.g", "kind": "method", "start": 10, "end": 18},
    ]
    assert mod.pick_symbols(chunks, [("lines", 4, 5)]) == (["A.f"], False)
    assert mod.pick_symbols(chunks, [("lines", 7, 11)]) == (["A.f", "A.g"], False)
    assert mod.pick_symbols(chunks, [("lines", 1, 1)]) == (["A"], False)      # class header only
    assert mod.pick_symbols(chunks, [("gap", 9)]) == (["A"], False)           # between two methods
    assert mod.pick_symbols(chunks, [("lines", 30, 31)]) == ([], True)        # module level
    assert mod.pick_symbols(chunks, [("lines", 4, 4), ("gap", 0)]) == (["A.f"], True)


def test_default_graph_path_mirrors_graph_index(mod, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(mod.Path, "home", classmethod(lambda cls: tmp_path))
    got = Path(mod.default_graph_path(str(tmp_path / "work" / "myrepo")))
    assert got == tmp_path / ".karst" / "indexes" / "myrepo" / "graph.pkl"


def test_karst_command_parsing(mod) -> None:
    assert mod._karst_command(None) == [sys.executable, "-m", "karst"]
    assert mod._karst_command("  ") == [sys.executable, "-m", "karst"]
    assert mod._karst_command("karst --verbose") == ["karst", "--verbose"]
    if os.name == "nt":
        assert mod._karst_command(r'"C:\Program Files\py\python.exe" -m karst') == [
            r"C:\Program Files\py\python.exe", "-m", "karst",
        ]
    with pytest.raises(mod.Ask):
        mod._karst_command('karst "unterminated')


def test_threshold_ordering_matches_karst_labels(mod) -> None:
    order = sorted(mod.RISK_ORDER, key=mod.RISK_ORDER.get)
    assert order == ["none", "low", "medium", "high", "critical"]


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("tests/client/test_client.py", True),
        ("test/helpers.py", True),
        ("pkg/__tests__/a.ts", True),
        ("pkg/test_utils.py", True),
        ("pkg/utils_test.py", True),
        ("pkg/utils_test.go", True),
        ("pkg/app.test.ts", True),
        ("pkg/app.spec.js", True),
        ("pkg/tests.py", True),
        ("httpx/_client.py", False),
        ("httpx/testing.py", False),
        ("src/contest/runner.py", False),
        ("src/latest_news.py", False),
    ],
)
def test_is_test_path(mod, path: str, expected: bool) -> None:
    assert mod.is_test_path(path) is expected


def _entry(qname: str, depth: int, score: float, via=("calls",), kind="method") -> dict:
    path = qname.split("::")[0]
    return {"node_id": qname, "kind": kind, "qualified_name": qname, "citation": f"{path}:10-20",
            "depth": depth, "score": score, "via": list(via)}


def test_top_callers_order_and_test_overflow(mod) -> None:
    entries = [
        _entry("tests/test_a.py::test_one", 1, 1.15, kind="function"),
        _entry("tests/test_a.py::test_two", 1, 1.15, kind="function"),
        _entry("pkg/b.py::far", 3, 0.33),
        _entry("pkg/b.py::near", 1, 1.0),
        _entry("pkg/b.py::mid_low", 2, 0.5),
        _entry("pkg/b.py::mid_high", 2, 0.575),
        _entry("pkg/b.py::Cls", 1, 0.6, via=("contains",), kind="class"),
        _entry("pkg/b.py", 2, 0.4, via=("contains",), kind="file"),
        _entry("pkg/c.py::last", 3, 0.3),
    ]
    impact = mod.Impact(mod.Target("qname", "pkg/a.py::f"), True, "critical", 40, entries)
    label, shown, tests_left = mod.top_callers([impact])
    assert label == "Top callers"
    assert [s.split(" (")[0] for s in shown] == ["near", "mid_high", "mid_low", "far", "last"]
    assert tests_left == 2


def test_top_callers_fill_with_tests_and_keep_importing_files(mod) -> None:
    entries = [
        _entry("pkg/b.py::only", 1, 1.0),
        _entry("tests/test_a.py::test_one", 1, 1.15, kind="function"),
        _entry("tests/test_a.py::test_two", 2, 0.5, kind="function"),
        _entry("pkg/b.py", 2, 0.4, via=("contains",), kind="file"),
    ]
    impact = mod.Impact(mod.Target("qname", "pkg/a.py::f"), True, "high", 4, entries)
    _label, shown, tests_left = mod.top_callers([impact])
    assert [s.split(" (")[0] for s in shown] == ["only", "test_one", "test_two"]
    assert tests_left == 0

    # A file target has importers and no callers: they are listed as dependents.
    importers = [
        _entry("pkg/user.py", 1, 0.575, via=("imports",), kind="file"),
        _entry("tests/test_user.py", 1, 0.575, via=("imports",), kind="file"),
    ]
    imp2 = mod.Impact(mod.Target("file", "pkg/a.py"), True, "medium", 2, importers)
    label, shown, tests_left = mod.top_callers([imp2])
    assert label == "Top dependents"
    assert [s.split(" (")[0] for s in shown] == ["pkg/user.py", "tests/test_user.py"]
