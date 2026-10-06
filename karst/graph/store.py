"""Knowledge graph store (spec §17).

Backed by NetworkX so the agent runs without external infrastructure. The
public surface — NodeKind/EdgeKind enums plus add/find/traverse methods — is
intentionally narrow so a Neo4j backend can be swapped in later by
implementing the same interface.

The spec's Cypher example
    MATCH (f:Function {name:'getUser'})-[:CALLS*1..3]->(d) WHERE d:DBTable
    RETURN DISTINCT d.name
maps to: find_by_name("getUser") + bfs_outgoing(kinds={CALLS}, max_depth=3)
filtered by NodeKind.DB_TABLE on the receiving side.

On disk the graph is plain JSON (never pickle, so a replaced graph file cannot
run code). Format version 2:

    {
      "format": "karst-graph",
      "version": 2,
      "nodes": [{"id": str, "kind": NodeKind value, "name": str,
                 "qualified_name": str, "attrs": {str: scalar | [scalar]}}],
      "edges": [{"src": node id, "dst": node id, "kind": EdgeKind value,
                 "weight": number, "attrs": {...}  # optional
                }]
    }

where scalar is str, int, float, bool or null. Nodes are listed in insertion
order and edges in an order that reproduces every node's in- and out-edge
order, so a loaded graph walks exactly like the one that was saved. The
name/qualified-name indexes are rebuilt on load.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
from collections import deque
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import networkx as nx


class NodeKind(str, Enum):
    FILE = "file"
    MODULE = "module"
    CLASS = "class"
    FUNCTION = "function"
    METHOD = "method"
    INTERFACE = "interface"
    STRUCT = "struct"
    ENUM = "enum"
    DB_TABLE = "db_table"          # reserved — populated in later phases
    ENDPOINT = "endpoint"          # reserved — populated in later phases


class EdgeKind(str, Enum):
    CONTAINS = "contains"          # File → Class/Function, Class → Method
    IMPORTS = "imports"            # File → File/Module
    CALLS = "calls"                # Function → Function (best-effort name match)
    DEFINES = "defines"            # alias of CONTAINS for Class → Method
    IMPLEMENTS = "implements"      # Class → Interface/BaseClass (extends/implements)
    READS = "reads"                # reserved
    EXPOSED_BY = "exposed_by"      # reserved
    BACKS = "backs"                # reserved


@dataclass(frozen=True)
class GraphNode:
    id: str
    kind: NodeKind
    name: str
    qualified_name: str
    attrs: dict[str, Any]


# 1 = pickle (karst <= 0.2.10, no longer readable). 2 = JSON.
GRAPH_VERSION = 2
GRAPH_FORMAT = "karst-graph"

LEGACY_GRAPH_MESSAGE = (
    "graph format changed for safety; re-run `karst graph-index <repo>`"
)

_NODE_KINDS = frozenset(k.value for k in NodeKind)
_EDGE_KINDS = frozenset(k.value for k in EdgeKind)
_RESERVED_NODE_ATTRS = frozenset({"kind", "name", "qualified_name"})
_RESERVED_EDGE_ATTRS = frozenset({"kind", "weight"})


class GraphFormatError(ValueError):
    """The graph file is not a valid karst JSON graph (or is a legacy pickle)."""


class LegacyGraphError(GraphFormatError):
    """The graph file is a pre-JSON pickle. karst refuses to load it."""


def _legacy_error(path: Path) -> LegacyGraphError:
    return LegacyGraphError(f"{path}: {LEGACY_GRAPH_MESSAGE}")


def is_legacy_graph_path(path: str | Path) -> bool:
    return Path(path).suffix.lower() == ".pkl"


class GraphStore:
    """Thin wrapper over a NetworkX MultiDiGraph.

    Multi-graph because the same pair of nodes can be connected by edges of
    different kinds (e.g. a file IMPORTS another file AND the function inside
    one CALLS a function inside the other).
    """

    def __init__(self) -> None:
        self._g: nx.MultiDiGraph = nx.MultiDiGraph()
        # name → list of node ids, for fast call resolution and entity match.
        self._by_name: dict[str, list[str]] = {}
        self._by_qname: dict[str, str] = {}

    # ---------------------------------------------------------------- nodes

    def add_node(
        self,
        node_id: str,
        *,
        kind: NodeKind,
        name: str,
        qualified_name: str | None = None,
        **attrs: Any,
    ) -> None:
        qname = qualified_name or name
        if node_id in self._g:
            # Merge attrs on re-add; keep existing kind/name (first writer wins).
            self._g.nodes[node_id].update(attrs)
            return
        self._g.add_node(
            node_id, kind=kind.value, name=name, qualified_name=qname, **attrs
        )
        self._by_name.setdefault(name, []).append(node_id)
        # qname is a stronger key; we keep just one node per qname (last wins).
        self._by_qname[qname] = node_id

    def has_node(self, node_id: str) -> bool:
        return node_id in self._g

    def get_node(self, node_id: str) -> GraphNode | None:
        if node_id not in self._g:
            return None
        data = self._g.nodes[node_id]
        return GraphNode(
            id=node_id,
            kind=NodeKind(data["kind"]),
            name=data.get("name", node_id),
            qualified_name=data.get("qualified_name", data.get("name", node_id)),
            attrs={k: v for k, v in data.items() if k not in {"kind", "name", "qualified_name"}},
        )

    def find_by_name(self, name: str) -> list[str]:
        return list(self._by_name.get(name, ()))

    def find_by_qname(self, qname: str) -> str | None:
        return self._by_qname.get(qname)

    def iter_nodes(self, *, kind: NodeKind | None = None) -> Iterator[GraphNode]:
        for nid, data in self._g.nodes(data=True):
            if kind is not None and data.get("kind") != kind.value:
                continue
            yield GraphNode(
                id=nid,
                kind=NodeKind(data["kind"]),
                name=data.get("name", nid),
                qualified_name=data.get("qualified_name", data.get("name", nid)),
                attrs={k: v for k, v in data.items() if k not in {"kind", "name", "qualified_name"}},
            )

    # ---------------------------------------------------------------- edges

    def add_edge(
        self,
        src: str,
        dst: str,
        kind: EdgeKind,
        *,
        weight: float = 1.0,
        **attrs: Any,
    ) -> None:
        if src == dst:
            return
        if src not in self._g or dst not in self._g:
            return
        # Multi-graph keys edges by (src, dst, key). Use kind.value as the key
        # so we never duplicate same-kind edges between the same pair.
        self._g.add_edge(src, dst, key=kind.value, kind=kind.value, weight=weight, **attrs)

    def out_edges(self, node_id: str, *, kinds: Iterable[EdgeKind] | None = None) -> list[tuple[str, EdgeKind, dict[str, Any]]]:
        return list(self._iter_edges(node_id, direction="out", kinds=kinds))

    def in_edges(self, node_id: str, *, kinds: Iterable[EdgeKind] | None = None) -> list[tuple[str, EdgeKind, dict[str, Any]]]:
        return list(self._iter_edges(node_id, direction="in", kinds=kinds))

    def _iter_edges(
        self,
        node_id: str,
        *,
        direction: str,
        kinds: Iterable[EdgeKind] | None,
    ) -> Iterator[tuple[str, EdgeKind, dict[str, Any]]]:
        if node_id not in self._g:
            return
        allow = {k.value for k in kinds} if kinds else None
        if direction == "out":
            it = self._g.out_edges(node_id, keys=True, data=True)
            for _, dst, key, data in it:
                if allow and key not in allow:
                    continue
                yield dst, EdgeKind(key), dict(data)
        else:
            it = self._g.in_edges(node_id, keys=True, data=True)
            for src, _, key, data in it:
                if allow and key not in allow:
                    continue
                yield src, EdgeKind(key), dict(data)

    # ------------------------------------------------------------ traversal

    def bfs(
        self,
        start: Iterable[str],
        *,
        direction: str = "in",  # "in" = walk callers/dependers, "out" = walk callees
        kinds: Iterable[EdgeKind] | None = None,
        max_depth: int = 3,
    ) -> dict[str, int]:
        """BFS from `start` along edges of the given kinds.

        Returns {node_id: depth}. Depth 0 = the starting node itself.
        """
        depths: dict[str, int] = {}
        q: deque[tuple[str, int]] = deque()
        for s in start:
            if s in self._g and s not in depths:
                depths[s] = 0
                q.append((s, 0))
        while q:
            node, d = q.popleft()
            if d >= max_depth:
                continue
            edges = (
                self._iter_edges(node, direction=direction, kinds=kinds)
            )
            for neighbor, _, _ in edges:
                if neighbor in depths:
                    continue
                depths[neighbor] = d + 1
                q.append((neighbor, d + 1))
        return depths

    # ---------------------------------------------------------------- stats

    @property
    def node_count(self) -> int:
        return self._g.number_of_nodes()

    @property
    def edge_count(self) -> int:
        return self._g.number_of_edges()

    def counts_by_kind(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for _, data in self._g.nodes(data=True):
            k = data.get("kind", "?")
            out[k] = out.get(k, 0) + 1
        return out

    def edge_counts_by_kind(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for _, _, key in self._g.edges(keys=True):
            out[key] = out.get(key, 0) + 1
        return out

    # -------------------------------------------------------------- persist

    def to_dict(self) -> dict[str, Any]:
        """The JSON-ready form of the graph (see the module docstring)."""
        nodes: list[dict[str, Any]] = []
        for nid, data in self._g.nodes(data=True):
            nodes.append(
                {
                    "id": nid,
                    "kind": data["kind"],
                    "name": data.get("name", nid),
                    "qualified_name": data.get("qualified_name", data.get("name", nid)),
                    "attrs": {k: v for k, v in data.items() if k not in _RESERVED_NODE_ATTRS},
                }
            )
        edges: list[dict[str, Any]] = []
        for src, dst, key, data in self._ordered_edges():
            edge: dict[str, Any] = {
                "src": src,
                "dst": dst,
                "kind": key,
                "weight": data.get("weight", 1.0),
            }
            extra = {k: v for k, v in data.items() if k not in _RESERVED_EDGE_ATTRS}
            if extra:
                edge["attrs"] = extra
            edges.append(edge)
        return {
            "format": GRAPH_FORMAT,
            "version": GRAPH_VERSION,
            "nodes": nodes,
            "edges": edges,
        }

    def _ordered_edges(self) -> list[tuple[str, str, str, dict[str, Any]]]:
        """Every edge, ordered so that re-adding them in this order rebuilds
        each node's successor AND predecessor order exactly.

        NetworkX keeps per-node adjacency in insertion order; impact walks
        in-edges and GraphRAG walks out-edges, so both orders matter for
        stable output. The pairs (src, dst) are topologically sorted under
        "comes after the previous pair in src's successor list" and "comes
        after the previous pair in dst's predecessor list". The original
        insertion sequence satisfies both, so the constraints have no cycle.
        """
        g = self._g
        pairs: list[tuple[str, str]] = []
        after: dict[tuple[str, str], list[tuple[str, str]]] = {}
        indegree: dict[tuple[str, str], int] = {}
        for u, nbrs in g.succ.items():
            prev = None
            for v in nbrs:
                pair = (u, v)
                pairs.append(pair)
                indegree.setdefault(pair, 0)
                if prev is not None:
                    after.setdefault(prev, []).append(pair)
                    indegree[pair] += 1
                prev = pair
        for v, preds in g.pred.items():
            prev = None
            for u in preds:
                pair = (u, v)
                if prev is not None:
                    after.setdefault(prev, []).append(pair)
                    indegree[pair] += 1
                prev = pair
        ready = deque(p for p in pairs if indegree[p] == 0)
        ordered: list[tuple[str, str]] = []
        while ready:
            pair = ready.popleft()
            ordered.append(pair)
            for nxt in after.get(pair, ()):
                indegree[nxt] -= 1
                if indegree[nxt] == 0:
                    ready.append(nxt)
        if len(ordered) != len(pairs):  # pragma: no cover - impossible by construction
            ordered = pairs
        out: list[tuple[str, str, str, dict[str, Any]]] = []
        for u, v in ordered:
            for key, data in g.succ[u][v].items():
                out.append((u, v, key, data))
        return out

    def save(self, path: str | Path) -> None:
        """Write the graph as JSON, atomically (temp file + os.replace)."""
        from ..paths import make_private_dirs

        path = Path(path)
        if is_legacy_graph_path(path):
            raise _legacy_error(path)
        make_private_dirs(path.parent)
        data = json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    @classmethod
    def load(cls, path: str | Path) -> "GraphStore":
        """Load a JSON graph. Never unpickles anything.

        Raises LegacyGraphError for a `.pkl` path or a file that holds a
        pickle, GraphFormatError for anything that is not a valid version-2
        karst graph, and OSError when the file cannot be read.
        """
        path = Path(path)
        if is_legacy_graph_path(path):
            raise _legacy_error(path)
        raw = path.read_bytes()
        if raw[:1] == b"\x80":
            # Pickle protocol 2+ (what karst <= 0.2.10 wrote) starts with
            # 0x80. Detect it only to give the migration message; the bytes
            # are never handed to pickle.
            raise _legacy_error(path)
        try:
            payload = json.loads(raw.decode("utf-8-sig"), parse_constant=_reject_constant)
        except (UnicodeDecodeError, ValueError, RecursionError) as exc:
            raise GraphFormatError(
                f"{path}: not a karst graph (invalid JSON: {exc}). Re-run "
                "`karst graph-index <repo>`."
            ) from None
        return cls.from_dict(payload, source=str(path))

    @classmethod
    def from_dict(cls, payload: Any, *, source: str = "graph") -> "GraphStore":
        """Build a store from the JSON form, validating every field."""

        def bad(msg: str) -> GraphFormatError:
            return GraphFormatError(
                f"{source}: not a valid karst graph ({msg}). Re-run "
                "`karst graph-index <repo>`."
            )

        if not isinstance(payload, dict):
            raise bad("top level is not a JSON object")
        if payload.get("format") != GRAPH_FORMAT:
            raise bad(f"'format' must be {GRAPH_FORMAT!r}")
        version = payload.get("version")
        if type(version) is not int:
            raise bad("'version' is missing or not an integer")
        if version != GRAPH_VERSION:
            raise GraphFormatError(
                f"{source}: graph format version {version} is not supported "
                f"(this karst reads version {GRAPH_VERSION}). Re-run "
                "`karst graph-index <repo>`."
            )
        nodes = payload.get("nodes")
        edges = payload.get("edges")
        if not isinstance(nodes, list):
            raise bad("'nodes' must be a list")
        if not isinstance(edges, list):
            raise bad("'edges' must be a list")

        # Validate everything first, then build the graph in two bulk calls.
        # Node and edge data are passed as dicts (never **kwargs), so an
        # attribute named like a NetworkX parameter cannot collide with it.
        node_rows: list[tuple[str, dict[str, Any]]] = []
        by_name: dict[str, list[str]] = {}
        by_qname: dict[str, str] = {}
        seen_nodes: set[str] = set()
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                raise bad(f"nodes[{i}] is not an object")
            nid = node.get("id")
            kind = node.get("kind")
            name = node.get("name")
            qname = node.get("qualified_name")
            attrs = node.get("attrs", {})
            if not isinstance(nid, str) or not nid:
                raise bad(f"nodes[{i}].id must be a non-empty string")
            if kind not in _NODE_KINDS:
                raise bad(f"nodes[{i}].kind {kind!r} is not a known node kind")
            if not isinstance(name, str) or not isinstance(qname, str):
                raise bad(f"nodes[{i}] name and qualified_name must be strings")
            problem = _attrs_problem(attrs, _RESERVED_NODE_ATTRS)
            if problem:
                raise bad(f"nodes[{i}].attrs {problem}")
            if nid in seen_nodes:
                raise bad(f"duplicate node id {nid!r}")
            seen_nodes.add(nid)
            node_rows.append((nid, {"kind": kind, "name": name, "qualified_name": qname, **attrs}))
            by_name.setdefault(name, []).append(nid)
            by_qname[qname] = nid

        edge_rows: list[tuple[str, str, str, dict[str, Any]]] = []
        seen_edges: set[tuple[str, str, str]] = set()
        for i, edge in enumerate(edges):
            if not isinstance(edge, dict):
                raise bad(f"edges[{i}] is not an object")
            src = edge.get("src")
            dst = edge.get("dst")
            kind = edge.get("kind")
            weight = edge.get("weight", 1.0)
            attrs = edge.get("attrs", {})
            if not isinstance(src, str) or not isinstance(dst, str):
                raise bad(f"edges[{i}] src and dst must be strings")
            if src not in seen_nodes or dst not in seen_nodes:
                raise bad(f"edges[{i}] refers to a node that does not exist")
            if src == dst:
                raise bad(f"edges[{i}] is a self-loop")
            if kind not in _EDGE_KINDS:
                raise bad(f"edges[{i}].kind {kind!r} is not a known edge kind")
            if type(weight) not in (int, float) or not math.isfinite(weight):
                raise bad(f"edges[{i}].weight must be a finite number")
            if attrs:
                problem = _attrs_problem(attrs, _RESERVED_EDGE_ATTRS)
                if problem:
                    raise bad(f"edges[{i}].attrs {problem}")
                data = {"kind": kind, "weight": weight, **attrs}
            else:
                data = {"kind": kind, "weight": weight}
            ekey = (src, dst, kind)
            if ekey in seen_edges:
                raise bad(f"edges[{i}] duplicates an earlier {kind} edge")
            seen_edges.add(ekey)
            edge_rows.append((src, dst, kind, data))

        store = cls()
        store._g.add_nodes_from(node_rows)
        store._g.add_edges_from(edge_rows)
        store._by_name = by_name
        store._by_qname = by_qname
        return store


def _reject_constant(name: str) -> Any:
    raise ValueError(f"non-standard JSON constant {name}")


def _is_scalar(value: Any) -> bool:
    if value is None or type(value) in (str, int, bool):
        return True
    return type(value) is float and math.isfinite(value)


def _attrs_problem(attrs: Any, reserved: frozenset[str]) -> str | None:
    """Why an attrs object is invalid, or None when it is fine."""
    if not isinstance(attrs, dict):
        return "must be an object"
    for key, value in attrs.items():
        if key in reserved:
            return f"uses the reserved key {key!r}"
        if _is_scalar(value):
            continue
        if isinstance(value, list) and all(_is_scalar(v) for v in value):
            continue
        return f"{key!r} must be a string, number, boolean, null or a list of those"
    return None


# ---------------------------------------------------------------- node IDs

def file_node_id(relpath: str) -> str:
    return f"file:{relpath}"


def module_node_id(name: str) -> str:
    return f"module:{name}"


def chunk_node_id(chunk_id: str) -> str:
    # The chunk_id is already deterministic (sha-derived in models.py); reuse
    # it so the graph nodes align 1:1 with Qdrant points.
    return chunk_id
