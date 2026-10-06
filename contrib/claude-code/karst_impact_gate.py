#!/usr/bin/env python3
"""karst impact gate: a Claude Code PreToolUse hook.

Before an Edit, Write or MultiEdit, work out which symbols the edit touches,
ask karst for their blast radius, and return a human yes/no ("ask") when the
risk is at or above a threshold (default CRITICAL).

The gate is deterministic. It runs no language model. It uses the standard
library only and talks to karst only through its command line.

It FAILS CLOSED. If karst is missing, slow, errors out, has no graph, or has no
node for the edited symbol, the gate asks. It never allows silently because
something went wrong. The one thing that is not a failure: files karst is built
not to index (unsupported languages, hidden or vendored directories, files
outside a repository) are allowed, and the decision is logged.

Output contract (Claude Code PreToolUse hook):
  allow -> exit 0, nothing on stdout
  ask   -> exit 0, one JSON object on stdout with permissionDecision "ask"
The gate never exits 2 and never returns "deny".

Config (environment variables). There is no switch that turns the gate off.
  KARST_GATE_ASK_AT   LOW | MEDIUM | HIGH | CRITICAL      (default CRITICAL)
  KARST_GATE_TIMEOUT  seconds per karst call              (default 8)
  KARST_BIN           karst command, split with shlex     (default: this
                      Python with "-m karst")
  KARST_GRAPH_PATH    graph file                          (default
                      ~/.karst/indexes/<repo dir name>-<hash>/graph.json,
                      the same place `karst graph-index` writes; <hash> is
                      the first 12 hex chars of sha256 of the normalized
                      real path of the repo root)
  KARST_GATE_LOG      decision log, JSON lines            (default
                      ~/.claude/global-observation/karst-gate-log.jsonl)
"""

from __future__ import annotations

import bisect
import difflib
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

PREFIX = "karst-impact-gate: "

GATED_TOOLS = ("Edit", "Write", "MultiEdit")

# Copied from karst/languages.py (LanguageSpec.extensions for PYTHON,
# JAVASCRIPT, TYPESCRIPT, GO, RUST, JAVA). Re-check this list when karst adds a
# language. We do not import karst, so the list is duplicated on purpose.
SUPPORTED_EXTENSIONS = frozenset(
    {
        ".py", ".pyi",
        ".js", ".jsx", ".mjs", ".cjs",
        ".ts", ".tsx",
        ".go",
        ".rs",
        ".java",
    }
)

# Copied from karst/walker.py (DEFAULT_SKIP_DIRS). karst also skips every
# directory whose name starts with a dot. Files under these directories are
# never in the graph by design, so asking the user would not be actionable.
SKIPPED_DIRS = frozenset(
    {
        ".git", ".hg", ".svn", "node_modules", ".venv", "venv", "env",
        "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox",
        "dist", "build", "target", ".next", ".nuxt", ".turbo", ".cache",
        "vendor",
    }
)

# karst's chunk kinds that become graph nodes (karst/models.py ChunkKind).
SYMBOL_KINDS = frozenset({"function", "method", "class", "interface", "struct", "enum"})

# `karst impact` risk labels, lowest to highest (karst/graph/impact.py
# _risk_label). "none" means nothing depends on the target.
RISK_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
THRESHOLD_LEVELS = ("low", "medium", "high", "critical")

DEFAULT_TIMEOUT = 8.0
DEFAULT_LOG = os.path.join("~", ".claude", "global-observation", "karst-gate-log.jsonl")

# An edit that touches more symbols than this is judged at file level instead.
MAX_SYMBOL_TARGETS = 6
MAX_WORKERS = 4
TOP_CALLERS = 5

_RISK_LINE = re.compile(r"Affected:\s*(\d+)\s+Risk:\s*([A-Za-z]+)")


# --------------------------------------------------------------------------
# Result types
# --------------------------------------------------------------------------

class Ask(Exception):
    """Raised anywhere to end the run with an "ask" decision."""


@dataclass
class Result:
    decision: str                      # "allow" or "ask"
    reason: str
    risk: str | None = None            # highest risk label seen, upper case
    affected: int | None = None        # affected count of the highest-risk target
    targets: list[str] = field(default_factory=list)


def ask(message: str) -> Ask:
    return Ask(PREFIX + message)


@dataclass
class Config:
    threshold: str
    timeout: float
    karst_cmd: list[str]
    graph_override: str | None

    @classmethod
    def from_env(cls, env: dict[str, str]) -> "Config":
        raw_level = (env.get("KARST_GATE_ASK_AT") or "CRITICAL").strip().lower()
        if raw_level not in THRESHOLD_LEVELS:
            raise ask(
                f"invalid KARST_GATE_ASK_AT={env.get('KARST_GATE_ASK_AT')!r}; "
                "use LOW, MEDIUM, HIGH or CRITICAL. Asking because the gate "
                "cannot tell what threshold you want."
            )
        raw_timeout = (env.get("KARST_GATE_TIMEOUT") or "").strip()
        try:
            timeout = float(raw_timeout) if raw_timeout else DEFAULT_TIMEOUT
            if not timeout > 0:
                raise ValueError(raw_timeout)
        except ValueError:
            raise ask(
                f"invalid KARST_GATE_TIMEOUT={raw_timeout!r}; use a number of "
                "seconds above zero."
            ) from None
        return cls(
            threshold=raw_level,
            timeout=timeout,
            karst_cmd=_karst_command(env.get("KARST_BIN")),
            graph_override=(env.get("KARST_GRAPH_PATH") or "").strip() or None,
        )


def _karst_command(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return [sys.executable, "-m", "karst"]
    try:
        if os.name == "nt":
            # posix=True would eat the backslashes in Windows paths. Keep them
            # and strip one pair of surrounding quotes from each token.
            parts = [
                p[1:-1] if len(p) >= 2 and p[0] == p[-1] and p[0] in "\"'" else p
                for p in shlex.split(raw, posix=False)
            ]
        else:
            parts = shlex.split(raw)
    except ValueError as exc:
        raise ask(f"could not parse KARST_BIN={raw!r} ({exc}).") from None
    if not parts:
        raise ask(f"KARST_BIN={raw!r} is empty after parsing.")
    return parts


# --------------------------------------------------------------------------
# Hook input
# --------------------------------------------------------------------------

def parse_payload(raw: bytes) -> dict:
    # Read bytes and decode as UTF-8. The Windows console code page would
    # corrupt non-ASCII text in old_string and make matching fail.
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ask(f"fail-closed: could not parse the hook input as JSON ({exc}).") from None
    if not isinstance(payload, dict):
        raise ask("fail-closed: could not parse the hook input (not a JSON object).")
    if not isinstance(payload.get("tool_name"), str) or not payload["tool_name"]:
        raise ask("fail-closed: could not parse the hook input (tool_name is missing).")
    return payload


def resolve_file(file_path: str, cwd: str) -> str:
    if os.name == "nt":
        # Git Bash style path such as /c/Users/me/x.py
        m = re.match(r"^/([A-Za-z])/(.*)$", file_path)
        if m:
            file_path = f"{m.group(1)}:/{m.group(2)}"
    if not os.path.isabs(file_path):
        file_path = os.path.join(cwd, file_path)
    return os.path.realpath(file_path)


def find_repo_root(file_abs: str, cwd: str) -> str:
    d = os.path.dirname(file_abs)
    while True:
        if os.path.exists(os.path.join(d, ".git")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return os.path.realpath(cwd)


def default_graph_path(repo_root: str) -> str:
    """Mirror karst.paths.default_graph_path (karst/paths.py), which
    `karst graph-index` uses. Copied, not imported: the gate does not import
    karst. tests/test_impact_gate.py checks that the two agree."""
    real = os.path.realpath(os.path.expanduser(repo_root))
    name = Path(real).name or "root"
    digest = hashlib.sha256(os.fsencode(os.path.normcase(real))).hexdigest()[:12]
    return str(Path.home() / ".karst" / "indexes" / f"{name}-{digest}" / "graph.json")


def legacy_graph_path(repo_root: str) -> str:
    """Where karst <= 0.2.10 wrote the graph (a pickle, no longer read)."""
    name = Path(os.path.realpath(repo_root)).name or "root"
    return str(Path.home() / ".karst" / "indexes" / name / "graph.pkl")


# --------------------------------------------------------------------------
# Edited line ranges (in the CURRENT file)
# A range is ("lines", first, last) with 1-based inclusive lines, or
# ("gap", g) for a pure insertion after line g (0 means before line 1).
# --------------------------------------------------------------------------

Range = tuple


def _norm(text: str) -> str:
    return text.replace("\r\n", "\n")


def _occurrences(content: str, needle: str, replace_all: bool) -> list[int]:
    out: list[int] = []
    if not needle:
        return out
    start = 0
    while True:
        i = content.find(needle, start)
        if i < 0:
            break
        out.append(i)
        if not replace_all:
            break
        start = i + len(needle)
    return out


def _line_ranges(content: str, positions: list[int], length: int) -> list[Range]:
    newlines = [i for i, ch in enumerate(content) if ch == "\n"]
    out: list[Range] = []
    for pos in positions:
        first = bisect.bisect_left(newlines, pos) + 1
        last = bisect.bisect_left(newlines, pos + length - 1) + 1
        out.append(("lines", first, last))
    return out


def ranges_for_edits(content: str, edits: list[dict]) -> list[Range] | None:
    """Ranges for Edit / MultiEdit. None means an old_string was not found,
    so the tool will reject the call and there is nothing to judge."""
    ranges: list[Range] = []
    simulated = content
    for edit in edits:
        old = _norm(edit["old_string"])
        new = _norm(edit["new_string"])
        replace_all = bool(edit.get("replace_all"))
        positions = _occurrences(content, old, replace_all)
        if positions:
            ranges.extend(_line_ranges(content, positions, len(old)))
        elif not old or old not in simulated:
            return None
        # else: the text only exists after an earlier edit of this MultiEdit.
        # That earlier edit's range already covers it, so add nothing.
        simulated = simulated.replace(old, new) if replace_all else simulated.replace(old, new, 1)
    return ranges


def ranges_for_write(old_text: str, new_text: str) -> list[Range]:
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()
    matcher = difflib.SequenceMatcher(None, old_lines, new_lines, autojunk=False)
    out: list[Range] = []
    for tag, i1, i2, _j1, _j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "insert":
            out.append(("gap", i1))
        else:
            out.append(("lines", i1 + 1, i2))
    return out


# --------------------------------------------------------------------------
# karst calls
# --------------------------------------------------------------------------

def _child_env() -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    return env


def run_karst(cmd: list[str], cwd: str, timeout: float, what: str) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            env=_child_env(),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired:
        raise ask(
            f"karst timeout: `{what}` timed out after {timeout:g}s, so the blast "
            "radius is unknown. Raise KARST_GATE_TIMEOUT or check karst. "
            "Approve to continue without the check."
        ) from None
    except FileNotFoundError:
        raise ask(
            f"karst is not available: could not run `{cmd[0]}`. Install karst "
            "(pip install karst) or set KARST_BIN to the karst command. "
            "Approve to continue without the check."
        ) from None
    except OSError as exc:
        raise ask(f"could not run karst (`{cmd[0]}`): {exc}. Approve to continue without the check.") from None
    out = proc.stdout.decode("utf-8", errors="replace")
    err = proc.stderr.decode("utf-8", errors="replace")
    return proc.returncode, out, err


def _tail(text: str, limit: int = 240) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else "..." + text[-limit:]


def _karst_failed(what: str, code: int, err: str) -> Ask:
    if "No module named karst" in err:
        return ask(
            "karst is not installed for this Python. Install it (pip install "
            "karst) or set KARST_BIN to the karst command. Approve to continue "
            "without the check."
        )
    return ask(
        f"karst failed (exit {code}) running `{what}`: {_tail(err) or 'no error output'}. "
        "Approve to continue without the check."
    )


def analyze_chunks(file_abs: str, cfg: Config, cwd: str) -> list[dict]:
    """Chunks of the CURRENT file, from `karst analyze`.

    `karst analyze` only accepts a directory (a file path raises
    NotADirectoryError), and it reports file_relpath relative to that
    directory. The cheapest call is therefore: copy this one file into an empty
    temp directory and analyze that. Chunk qualified names do not depend on the
    path, so the caller prefixes the repo-relative path itself.
    """
    with open(file_abs, "rb") as fh:
        data = fh.read()
    with tempfile.TemporaryDirectory(prefix="karst-gate-") as tmp:
        with open(os.path.join(tmp, os.path.basename(file_abs)), "wb") as fh:
            fh.write(data)
        code, out, err = run_karst(
            [*cfg.karst_cmd, "analyze", tmp, "--jsonl"], cwd, cfg.timeout, "karst analyze"
        )
    if code != 0:
        raise _karst_failed("karst analyze", code, err)
    chunks: list[dict] = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            chunks.append(
                {
                    "qname": str(obj["qualified_name"]),
                    "kind": str(obj["kind"]),
                    "start": int(obj["start_line"]),
                    "end": int(obj["end_line"]),
                }
            )
        except (ValueError, KeyError, TypeError):
            raise ask(
                "could not parse the output of `karst analyze` (unexpected "
                "format; is karst a different version?). Approve to continue "
                "without the check."
            ) from None
    return [c for c in chunks if c["kind"] in SYMBOL_KINDS]


def _overlaps(chunk: dict, rng: Range) -> bool:
    if rng[0] == "gap":
        return chunk["start"] <= rng[1] < chunk["end"]
    return chunk["start"] <= rng[2] and rng[1] <= chunk["end"]


def pick_symbols(chunks: list[dict], ranges: list[Range]) -> tuple[list[str], bool]:
    """Innermost chunk(s) per range. Second value is True when some range
    overlaps no chunk, which means module-level code."""
    names: list[str] = []
    module_level = False
    for rng in ranges:
        over = [c for c in chunks if _overlaps(c, rng)]
        if not over:
            module_level = True
            continue
        for c in over:
            contains_other = any(
                o is not c
                and o["start"] >= c["start"]
                and o["end"] <= c["end"]
                and (o["start"] > c["start"] or o["end"] < c["end"])
                for o in over
            )
            if not contains_other and c["qname"] not in names:
                names.append(c["qname"])
    return names, module_level


@dataclass
class Target:
    kind: str     # "qname" or "file"
    name: str     # full graph qualified name, or repo-relative file path


@dataclass
class Impact:
    target: Target
    found: bool
    risk: str = "none"
    affected: int = 0
    entries: list[dict] = field(default_factory=list)


def run_impact(target: Target, graph: str, cfg: Config, repo_root: str) -> Impact:
    flag = "--qname" if target.kind == "qname" else "--file"
    what = f"karst impact {flag} {target.name}"
    cmd = [*cfg.karst_cmd, "impact", flag, target.name, "--graph-path", graph,
           "--limit", "5000", "--jsonl"]
    code, out, err = run_karst(cmd, repo_root, cfg.timeout, what)
    if code == 1 and "No targets matched" in err:
        return Impact(target, found=False)
    if code != 0:
        if "graph format changed" in err:
            raise ask(
                f"the karst graph at {graph} is in the old pickle format, which "
                f"karst no longer reads. Run `karst graph-index {repo_root}` "
                "(graphs are now graph.json) and point KARST_GRAPH_PATH at the "
                "new file if you set it. Approve to continue without the check."
            )
        if "graph not found" in err:
            raise ask(
                f"no karst graph at {graph}. Run `karst graph-index {repo_root}` "
                "(or set KARST_GRAPH_PATH). Approve to continue without the check."
            )
        raise _karst_failed(what, code, err)
    m = _RISK_LINE.search(err) or _RISK_LINE.search(out)
    if not m or m.group(2).lower() not in RISK_ORDER:
        raise ask(
            f"could not read the risk line from `{what}` (expected "
            "'Affected: N  Risk: LEVEL'; is karst a different version?). "
            "Approve to continue without the check."
        )
    entries: list[dict] = []
    for line in out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            raise ask(f"could not parse a JSON line from `{what}`. Approve to continue without the check.") from None
        if isinstance(obj, dict):
            entries.append(obj)
    return Impact(target, True, m.group(2).lower(), int(m.group(1)), entries)


# --------------------------------------------------------------------------
# Reasons
# --------------------------------------------------------------------------

def _entry_label(e: dict) -> str:
    qn = str(e.get("qualified_name") or e.get("node_id") or "?")
    name = qn.split("::", 1)[1] if "::" in qn else qn
    cite = str(e.get("citation") or "")
    m = re.match(r"^(.*?):(\d+)(?:-\d+)?$", cite)
    loc = f"{m.group(1)}:{m.group(2)}" if m else cite
    return name if not loc or loc == name else f"{name} ({loc})"


def _entry_path(e: dict) -> str:
    qn = str(e.get("qualified_name") or "")
    path = qn.split("::", 1)[0]
    if path:
        return path
    return str(e.get("citation") or "").split(":", 1)[0]


def is_test_path(path: str) -> bool:
    """True for test code: a `tests`/`test`/`__tests__` directory, or a file
    named test_*, *_test.*, test.*, tests.*, *.test.* or *.spec.*."""
    parts = path.replace("\\", "/").split("/")
    if any(d in ("tests", "test", "__tests__") for d in parts[:-1]):
        return True
    name = parts[-1]
    stem = name.split(".", 1)[0]
    return (
        stem in ("test", "tests")
        or stem.startswith("test_")
        or stem.endswith("_test")
        or ".test." in name
        or ".spec." in name
    )


def _is_container(e: dict) -> bool:
    """The class or file that merely contains the edited symbol. Not a caller."""
    via = [str(v).lower() for v in (e.get("via") or [])]
    return (
        str(e.get("kind")).lower() in ("class", "file")
        and bool(via)
        and all(v in ("contains", "defines") for v in via)
    )


def top_callers(impacts: list[Impact]) -> tuple[str, list[str], int]:
    """Up to TOP_CALLERS entries to show, and how many test entries were left out.

    Order: non-test code before tests, then nearest first (depth), then karst's
    score. Containing classes and files are skipped. When there are fewer than
    TOP_CALLERS non-test entries, tests fill the rest.
    """
    seen: set[str] = set()
    callers: list[dict] = []
    others: list[dict] = []
    for imp in impacts:
        for e in imp.entries:
            key = str(e.get("node_id") or e.get("qualified_name"))
            if key in seen or _is_container(e):
                continue
            seen.add(key)
            via = [str(v).lower() for v in (e.get("via") or [])]
            (callers if "calls" in via else others).append(e)

    def order(e: dict) -> tuple:
        return (
            is_test_path(_entry_path(e)),
            int(e.get("depth") or 99),
            -float(e.get("score") or 0),
            str(e.get("qualified_name")),
        )

    if callers:
        label, pool = "Top callers", callers
    else:
        label, pool = "Top dependents", others
    pool.sort(key=order)
    shown, rest = pool[:TOP_CALLERS], pool[TOP_CALLERS:]
    tests_left = sum(1 for e in rest if is_test_path(_entry_path(e)))
    return label, [_entry_label(e) for e in shown], tests_left


def _short(names: list[str], limit: int = 3) -> str:
    shown = ", ".join(names[:limit])
    return shown if len(names) <= limit else f"{shown} and {len(names) - limit} more"


def decide(impacts: list[Impact], cfg: Config, graph: str, repo_root: str) -> Result:
    names = [i.target.name for i in impacts]
    gaps = [i for i in impacts if not i.found]
    found = [i for i in impacts if i.found]
    worst = max(found, key=lambda i: (RISK_ORDER[i.risk], i.affected), default=None)
    limit = RISK_ORDER[cfg.threshold]
    over = [i for i in found if RISK_ORDER[i.risk] >= limit]

    if gaps or over:
        parts: list[str] = []
        if gaps:
            parts.append(
                f"coverage gap: karst has no node for {_short([g.target.name for g in gaps])} "
                f"in {graph}. The graph may be stale or incomplete. Re-run "
                f"`karst graph-index {repo_root}` and retry."
            )
        if over:
            if len(over) == 1:
                i = over[0]
                parts.append(
                    f"editing {i.target.name} — blast radius {i.risk.upper()} "
                    f"({i.affected} affected)."
                )
            else:
                parts.append(
                    "editing "
                    + "; ".join(
                        f"{i.target.name} — blast radius {i.risk.upper()} ({i.affected} affected)"
                        for i in over
                    )
                    + "."
                )
            label, callers, tests_left = top_callers(over)
            listed = ", ".join(callers) if callers else "none listed"
            if tests_left:
                listed += f" (+{tests_left} test{'s' if tests_left != 1 else ''})"
            parts.append(f"{label}: {listed}.")
        parts.append("Approve to continue.")
        return Result(
            "ask", PREFIX + " ".join(parts),
            risk=worst.risk.upper() if worst else None,
            affected=worst.affected if worst else None,
            targets=names,
        )

    assert worst is not None
    return Result(
        "allow",
        f"highest blast radius {worst.risk.upper()} ({worst.affected} affected) "
        f"is below the {cfg.threshold.upper()} threshold",
        risk=worst.risk.upper(), affected=worst.affected, targets=names,
    )


# --------------------------------------------------------------------------
# Main flow
# --------------------------------------------------------------------------

def evaluate(raw: bytes, env: dict[str, str], ctx: dict) -> Result:
    payload = parse_payload(raw)
    tool = payload["tool_name"]
    ctx["tool"] = tool
    if tool not in GATED_TOOLS:
        return Result("allow", f"tool {tool} is not gated")

    cfg = Config.from_env(env)

    tool_input = payload.get("tool_input")
    file_path = tool_input.get("file_path") if isinstance(tool_input, dict) else None
    if not isinstance(file_path, str) or not file_path:
        raise ask(f"fail-closed: could not parse the hook input ({tool} has no file_path).")
    ctx["file"] = file_path

    cwd = payload.get("cwd") if isinstance(payload.get("cwd"), str) and payload.get("cwd") else os.getcwd()
    file_abs = resolve_file(file_path, cwd)
    ctx["file"] = file_abs

    if os.path.splitext(file_abs)[1].lower() not in SUPPORTED_EXTENSIONS:
        return Result("allow", "not a language karst parses")
    if not os.path.isfile(file_abs):
        return Result("allow", "file does not exist yet (new file)")

    repo_root = find_repo_root(file_abs, cwd)
    rel = os.path.relpath(file_abs, repo_root).replace(os.sep, "/")
    if rel.startswith("../") or rel == ".." or os.path.isabs(rel):
        return Result("allow", f"file is outside the repository root {repo_root}; karst has no graph for it")
    rel_dirs = rel.split("/")[:-1]
    if any(d in SKIPPED_DIRS or d.startswith(".") for d in rel_dirs):
        return Result("allow", "karst does not index hidden, vendored or build directories")

    # Edited line ranges in the current content.
    try:
        with open(file_abs, "rb") as fh:
            content = _norm(fh.read().decode("utf-8", errors="replace"))
    except OSError as exc:
        raise ask(f"fail-closed: could not read {file_abs} ({exc}).") from None

    if tool == "Write":
        new_content = tool_input.get("content")
        if not isinstance(new_content, str):
            raise ask("fail-closed: could not parse the hook input (Write has no content).")
        ranges = ranges_for_write(content, _norm(new_content))
        if not ranges:
            return Result("allow", "Write does not change the file")
    else:
        if tool == "Edit":
            edits = [tool_input]
        else:
            edits = tool_input.get("edits")
            if not isinstance(edits, list) or not edits:
                raise ask("fail-closed: could not parse the hook input (MultiEdit has no edits).")
        for e in edits:
            if not isinstance(e, dict) or not isinstance(e.get("old_string"), str) \
                    or not isinstance(e.get("new_string"), str):
                raise ask(f"fail-closed: could not parse the hook input ({tool} edit needs old_string and new_string).")
        found = ranges_for_edits(content, edits)
        if found is None:
            return Result("allow", "old_string not found in the file; the edit tool will reject this call itself")
        ranges = found
        if not ranges:
            return Result("allow", "no edited lines located")

    graph = cfg.graph_override or default_graph_path(repo_root)
    if not os.path.isfile(graph):
        legacy = "" if cfg.graph_override else legacy_graph_path(repo_root)
        old_note = (
            f" Found an old-format graph at {legacy}; the graph format changed "
            "for safety, so it is not used."
            if legacy and os.path.isfile(legacy) else ""
        )
        raise ask(
            f"no karst graph at {graph}, so the blast radius of this edit is "
            f"unknown.{old_note} Run `karst graph-index {repo_root}` (or set "
            "KARST_GRAPH_PATH). Approve to continue without the check."
        )

    chunks = analyze_chunks(file_abs, cfg, repo_root)
    symbols, module_level = pick_symbols(chunks, ranges)
    targets = [Target("qname", f"{rel}::{s}") for s in symbols]
    if len(targets) > MAX_SYMBOL_TARGETS:
        targets = []
        module_level = True
    if module_level:
        targets.append(Target("file", rel))
    ctx["targets"] = [t.name for t in targets]

    with ThreadPoolExecutor(max_workers=min(MAX_WORKERS, len(targets))) as pool:
        futures = [pool.submit(run_impact, t, graph, cfg, repo_root) for t in targets]
        impacts = [f.result() for f in futures]   # re-raises Ask
    return decide(impacts, cfg, graph, repo_root)


def write_log(path: str, record: dict) -> None:
    try:
        path = os.path.expanduser(path)
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass  # logging must never change the decision


def main() -> int:
    started = time.monotonic()
    ctx: dict = {"tool": None, "file": None, "targets": []}
    try:
        result = evaluate(sys.stdin.buffer.read(), dict(os.environ), ctx)
    except Ask as exc:
        result = Result("ask", str(exc), targets=ctx["targets"])
    except Exception as exc:  # fail closed on any bug in the gate itself
        result = Result(
            "ask",
            PREFIX + f"fail-closed: internal error ({type(exc).__name__}: {exc}). "
            "Approve to continue without the check.",
            targets=ctx["targets"],
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    write_log(
        os.environ.get("KARST_GATE_LOG") or DEFAULT_LOG,
        {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "tool": ctx["tool"],
            "file": ctx["file"],
            "targets": result.targets or ctx["targets"],
            "decision": result.decision,
            "risk": result.risk,
            "affected": result.affected,
            "reason": result.reason,
            "elapsed_ms": elapsed_ms,
        },
    )

    if result.decision == "ask":
        sys.stdout.write(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "ask",
                        "permissionDecisionReason": result.reason,
                    }
                }
            )
            + "\n"
        )
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
