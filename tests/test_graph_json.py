"""The graph is stored as data-only JSON and never unpickled.

Covers: an exact round trip (nodes, attrs, edges, adjacency order, name
indexes), refusal of legacy pickles without touching pickle, rejection of
malformed JSON, and the CLI's clean errors for both.
"""

from __future__ import annotations

import builtins
import copy
import json
import pickle
import re
import subprocess
import sys
from pathlib import Path

import pytest

from karst.graph.builder import build_graph
from karst.graph.impact import analyze_impact, resolve_targets
from karst.graph.store import (
    GRAPH_VERSION,
    LEGACY_GRAPH_MESSAGE,
    GraphFormatError,
    GraphStore,
    LegacyGraphError,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
HTTPX_LIKE = Path(__file__).parent / "fixtures" / "httpx_like"


@pytest.fixture(scope="module")
def built() -> GraphStore:
    store, _ = build_graph(HTTPX_LIKE)
    return store


@pytest.fixture
def no_unpickling(monkeypatch):
    """Fail the test if anything in this process tries to unpickle."""

    def boom(*_a, **_k):
        raise AssertionError("pickle must never be used to load a graph")

    monkeypatch.setattr(pickle, "load", boom)
    monkeypatch.setattr(pickle, "loads", boom)
    monkeypatch.setattr(pickle, "Unpickler", boom)


# ------------------------------------------------------------------ round trip

def test_json_round_trip_is_exact(built: GraphStore, tmp_path: Path, no_unpickling) -> None:
    path = tmp_path / "graph.json"
    built.save(path)
    loaded = GraphStore.load(path)

    # Nodes: same ids, same order, same data (kind/name/qname + attrs).
    assert list(loaded._g.nodes(data=True)) == list(built._g.nodes(data=True))
    # Edges: same (src, dst, key, data) set ...
    def edges(s: GraphStore):
        return sorted((u, v, k, tuple(sorted(d.items()))) for u, v, k, d in s._g.edges(keys=True, data=True))
    assert edges(loaded) == edges(built)
    # ... and the same per-node order both ways, so traversals are identical.
    for nid in built._g.nodes:
        assert loaded.out_edges(nid) == built.out_edges(nid)
        assert loaded.in_edges(nid) == built.in_edges(nid)
    # Name indexes are rebuilt, not stored.
    assert loaded._by_name == built._by_name
    assert loaded._by_qname == built._by_qname
    assert loaded.counts_by_kind() == built.counts_by_kind()
    assert loaded.edge_counts_by_kind() == built.edge_counts_by_kind()
    for nid in built._g.nodes:
        assert loaded.get_node(nid) == built.get_node(nid)

    # Impact on the reloaded graph matches impact on the in-memory one.
    t = resolve_targets(built, qnames=["_client.py::BaseClient._merge_url"])
    before = analyze_impact(built, targets=t)
    after = analyze_impact(loaded, targets=t)
    assert [(a.node_id, a.depth, a.score, a.via_edges) for a in after.affected] == [
        (a.node_id, a.depth, a.score, a.via_edges) for a in before.affected
    ]


def test_saved_file_is_versioned_json(built: GraphStore, tmp_path: Path) -> None:
    path = tmp_path / "graph.json"
    built.save(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload["format"] == "karst-graph"
    assert payload["version"] == GRAPH_VERSION == 2
    assert {"id", "kind", "name", "qualified_name", "attrs"} <= set(payload["nodes"][0])
    assert {"src", "dst", "kind", "weight"} <= set(payload["edges"][0])
    assert not list(tmp_path.glob("*.tmp")), "the temp file must be renamed away"


def test_save_replaces_atomically_and_keeps_old_file_on_failure(built: GraphStore, tmp_path: Path, monkeypatch) -> None:
    path = tmp_path / "graph.json"
    built.save(path)
    good = path.read_bytes()

    import karst.graph.store as store_mod

    def broken_replace(src, dst):
        raise OSError("disk full")

    monkeypatch.setattr(store_mod.os, "replace", broken_replace)
    with pytest.raises(OSError):
        built.save(path)
    assert path.read_bytes() == good
    assert not list(tmp_path.glob(".graph.json.*")), "temp file left behind"


def test_attribute_named_like_a_networkx_parameter_round_trips(tmp_path: Path) -> None:
    from karst.graph.store import EdgeKind, NodeKind

    s = GraphStore()
    s.add_node("a", kind=NodeKind.FUNCTION, name="a")
    s.add_node("b", kind=NodeKind.FUNCTION, name="b")
    s.add_edge("a", "b", EdgeKind.CALLS)
    payload = s.to_dict()
    payload["nodes"][0]["attrs"]["node_for_adding"] = 1
    payload["edges"][0]["attrs"] = {"u_for_edge": "x", "key": "y", "tags": ["p", 1, None]}
    loaded = GraphStore.from_dict(payload)
    assert loaded.get_node("a").attrs["node_for_adding"] == 1
    (_, _, data), = loaded.out_edges("a")
    assert data["u_for_edge"] == "x" and data["key"] == "y" and data["tags"] == ["p", 1, None]


# --------------------------------------------------------------- legacy pickle

class _Evil:
    """Unpickling this object creates a marker file."""

    def __init__(self, marker: Path) -> None:
        self.marker = str(marker)

    def __reduce__(self):
        return (builtins.open, (self.marker, "w"))


def _evil_pickle(path: Path, marker: Path) -> None:
    payload = {"version": 1, "graph": _Evil(marker), "by_name": {}, "by_qname": {}}
    path.write_bytes(pickle.dumps(payload, protocol=pickle.HIGHEST_PROTOCOL))


def test_marker_pickle_really_would_run_code(tmp_path: Path) -> None:
    """Sanity check for the tests below: unpickling the file does create the
    marker, so 'marker absent' proves the loader never unpickled it."""
    path, marker = tmp_path / "x.pkl", tmp_path / "pwned"
    _evil_pickle(path, marker)
    pickle.loads(path.read_bytes())["graph"].close()
    assert marker.exists()


@pytest.mark.parametrize("name", ["graph.pkl", "graph.json", "graph"])
def test_legacy_pickle_is_refused_without_unpickling(tmp_path: Path, name: str, no_unpickling) -> None:
    path, marker = tmp_path / name, tmp_path / "pwned"
    _evil_pickle(path, marker)
    with pytest.raises(LegacyGraphError, match="graph format changed for safety"):
        GraphStore.load(path)
    assert not marker.exists()


def test_save_refuses_a_pkl_path(built: GraphStore, tmp_path: Path) -> None:
    with pytest.raises(LegacyGraphError):
        built.save(tmp_path / "graph.pkl")
    assert not (tmp_path / "graph.pkl").exists()


# ----------------------------------------------------------------- malformed

def _valid_payload(built: GraphStore) -> dict:
    return copy.deepcopy(built.to_dict())


def _mutations():
    def setv(path, value):
        def apply(p):
            target = p
            for key in path[:-1]:
                target = target[key]
            target[path[-1]] = value
            return p
        return apply

    def dup_node(p):
        p["nodes"].append(dict(p["nodes"][0]))
        return p

    def dup_edge(p):
        p["edges"].append(dict(p["edges"][0]))
        return p

    def self_loop(p):
        p["edges"][0]["dst"] = p["edges"][0]["src"]
        return p

    return {
        "top level list": lambda p: [p],
        "missing format": lambda p: {k: v for k, v in p.items() if k != "format"},
        "wrong format": setv(["format"], "networkx"),
        "missing version": lambda p: {k: v for k, v in p.items() if k != "version"},
        "string version": setv(["version"], "2"),
        "bool version": setv(["version"], True),
        "old version": setv(["version"], 1),
        "future version": setv(["version"], 99),
        "nodes not list": setv(["nodes"], {}),
        "edges missing": lambda p: {k: v for k, v in p.items() if k != "edges"},
        "node not object": setv(["nodes", 0], "file:x"),
        "node id int": setv(["nodes", 0, "id"], 7),
        "node id empty": setv(["nodes", 0, "id"], ""),
        "unknown node kind": setv(["nodes", 0, "kind"], "exploit"),
        "name not str": setv(["nodes", 0, "name"], ["a"]),
        "attrs not object": setv(["nodes", 0, "attrs"], [1, 2]),
        "nested attr": setv(["nodes", 0, "attrs", "x"], {"y": 1}),
        "reserved attr": setv(["nodes", 0, "attrs", "kind"], "class"),
        "duplicate node": dup_node,
        "edge to missing node": setv(["edges", 0, "dst"], "nope"),
        "unknown edge kind": setv(["edges", 0, "kind"], "teleports"),
        "weight string": setv(["edges", 0, "weight"], "1.0"),
        "weight bool": setv(["edges", 0, "weight"], True),
        "edge attr reserved": setv(["edges", 0, "attrs"], {"weight": 2}),
        "duplicate edge": dup_edge,
        "self loop": self_loop,
    }


@pytest.mark.parametrize("case", sorted(_mutations()))
def test_malformed_graph_is_rejected(built: GraphStore, tmp_path: Path, case: str) -> None:
    payload = _mutations()[case](_valid_payload(built))
    path = tmp_path / "graph.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(GraphFormatError, match="graph-index"):
        GraphStore.load(path)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "not json",
        "{",
        '{"format": "karst-graph", "version": 2, "nodes": [], "edges": [], "x": NaN}',
        "[" * 100_000,
        "\x00\x01\x02",
    ],
    ids=["empty", "text", "truncated", "nan", "deep-nesting", "binary"],
)
def test_invalid_json_is_rejected(tmp_path: Path, text: str) -> None:
    path = tmp_path / "graph.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(GraphFormatError):
        GraphStore.load(path)


def test_non_finite_weight_is_rejected(built: GraphStore, tmp_path: Path) -> None:
    path = tmp_path / "graph.json"
    text = json.dumps(_valid_payload(built)).replace('"weight": 1.0', '"weight": Infinity', 1)
    path.write_text(text, encoding="utf-8")
    with pytest.raises(GraphFormatError):
        GraphStore.load(path)


def test_empty_graph_is_valid(tmp_path: Path) -> None:
    path = tmp_path / "graph.json"
    GraphStore().save(path)
    assert GraphStore.load(path).node_count == 0


# ---------------------------------------------------------------- the CLI

def _karst(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    import os

    env = dict(os.environ, PYTHONPATH=str(REPO_ROOT), PYTHONIOENCODING="utf-8")
    return subprocess.run(
        [sys.executable, "-m", "karst", *args],
        cwd=str(cwd), env=env, capture_output=True, text=True, encoding="utf-8", timeout=120,
    )


def test_cli_refuses_legacy_and_malformed_graphs(tmp_path: Path) -> None:
    marker = tmp_path / "pwned"
    pkl = tmp_path / "graph.pkl"
    _evil_pickle(pkl, marker)
    disguised = tmp_path / "disguised.json"
    disguised.write_bytes(pkl.read_bytes())
    broken = tmp_path / "broken.json"
    broken.write_text('{"format": "karst-graph", "version": 2, "nodes": 5, "edges": []}', encoding="utf-8")

    for graph in (pkl, disguised):
        proc = _karst("impact", "--target", "x", "--graph-path", str(graph), cwd=tmp_path)
        assert proc.returncode == 2, proc.stderr
        assert LEGACY_GRAPH_MESSAGE in proc.stderr
        assert "Traceback" not in proc.stderr
    proc = _karst("impact", "--target", "x", "--graph-path", str(broken), cwd=tmp_path)
    assert proc.returncode == 2 and "not a valid karst graph" in proc.stderr
    assert "Traceback" not in proc.stderr
    assert not marker.exists()

    # graph-index will not write a .pkl either.
    proc = _karst("graph-index", str(HTTPX_LIKE), "--storage", str(tmp_path / "new.pkl"), cwd=tmp_path)
    assert proc.returncode == 2 and LEGACY_GRAPH_MESSAGE in proc.stderr
    assert not (tmp_path / "new.pkl").exists()


def test_cli_default_paths_and_legacy_hint(tmp_path: Path, monkeypatch, capsys, no_unpickling) -> None:
    """graph-index and impact agree on the default graph; an old name-only
    index next to it produces a one-line hint, and its pickle is ignored.

    In-process: on Windows, overriding USERPROFILE for a subprocess breaks
    tree-sitter-language-pack's cache lookup, so Path.home is patched here."""
    from karst.cli import main
    from karst.paths import repo_index_key

    home = tmp_path / "home"
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: home))
    repo = tmp_path / "work" / "httpx_like"
    repo.mkdir(parents=True)
    (repo / "_client.py").write_bytes((HTTPX_LIKE / "_client.py").read_bytes())
    monkeypatch.chdir(repo)
    marker = tmp_path / "pwned"
    legacy_dir = home / ".karst" / "indexes" / "httpx_like"
    legacy_dir.mkdir(parents=True)
    _evil_pickle(legacy_dir / "graph.pkl", marker)

    assert main(["impact", "--target", "_merge_url"]) == 2
    err = capsys.readouterr().err
    assert "older karst" in err and "graph not found" in err

    assert main(["graph-index", "."]) == 0
    assert "older karst" in capsys.readouterr().err
    graph = home / ".karst" / "indexes" / repo_index_key(repo) / "graph.json"
    assert graph.is_file()
    assert re.fullmatch(r"httpx_like-[0-9a-f]{12}", graph.parent.name)

    assert main(["impact", "--target", "_merge_url"]) == 0
    assert "Risk:" in capsys.readouterr().err
    assert not marker.exists()
