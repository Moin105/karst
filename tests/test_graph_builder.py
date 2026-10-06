"""Test that the graph builder produces the expected nodes and edges.

Uses a 3-file synthetic Python repo:
  users.py    — UserStore class, get_user/create_user functions
  auth.py     — imports users; login() calls get_user
  billing.py  — imports users; charge() calls get_user

So get_user has TWO incoming CALLS edges; users.py has TWO incoming IMPORTS
edges. Impact analysis on get_user should surface both callers.
"""

from __future__ import annotations

from pathlib import Path

from karst.graph.builder import build_graph
from karst.graph.impact import analyze_impact, resolve_targets
from karst.graph.store import EdgeKind, NodeKind, file_node_id

FIXTURE = Path(__file__).parent / "fixtures" / "graph_repo"
HTTPX_LIKE = Path(__file__).parent / "fixtures" / "httpx_like"


def test_graph_has_files_and_functions() -> None:
    store, result = build_graph(FIXTURE)

    assert result.files == 3
    # function/method/class chunks should land as nodes
    files = {n.qualified_name for n in store.iter_nodes(kind=NodeKind.FILE)}
    assert {"users.py", "auth.py", "billing.py"}.issubset(files)

    # Specific function nodes present.
    fn_names = {n.name for n in store.iter_nodes(kind=NodeKind.FUNCTION)}
    assert {"get_user", "create_user", "login", "charge"}.issubset(fn_names)


def test_imports_resolve_to_file_nodes() -> None:
    store, _ = build_graph(FIXTURE)

    auth_id = file_node_id("auth.py")
    users_id = file_node_id("users.py")
    billing_id = file_node_id("billing.py")

    auth_imports = {
        dst for dst, k, _ in store.out_edges(auth_id, kinds=[EdgeKind.IMPORTS])
    }
    assert users_id in auth_imports, "auth.py should IMPORT users.py"

    billing_imports = {
        dst for dst, k, _ in store.out_edges(billing_id, kinds=[EdgeKind.IMPORTS])
    }
    assert users_id in billing_imports, "billing.py should IMPORT users.py"


def test_calls_connect_callers_to_get_user() -> None:
    store, _ = build_graph(FIXTURE)

    matches = store.find_by_name("get_user")
    # The free function get_user should match; UserStore.get is named "get"
    # so it won't be on this list.
    assert matches, "expected at least one get_user node"

    # Filter to the function node (not methods, not classes).
    get_user_id = None
    for nid in matches:
        node = store.get_node(nid)
        if node and node.kind == NodeKind.FUNCTION and node.name == "get_user":
            get_user_id = nid
            break
    assert get_user_id is not None

    # Both login() and charge() must appear as incoming CALLS.
    callers = {
        store.get_node(src).name
        for src, k, _ in store.in_edges(get_user_id, kinds=[EdgeKind.CALLS])
        if store.get_node(src) is not None
    }
    assert {"login", "charge"}.issubset(callers), (
        f"expected login + charge to call get_user, got {callers}"
    )


def test_impact_on_get_user_surfaces_login_and_charge() -> None:
    store, _ = build_graph(FIXTURE)

    targets = resolve_targets(store, names=["get_user"])
    assert targets

    report = analyze_impact(store, targets=targets, max_depth=3)
    affected_names = {a.name for a in report.affected}
    assert "login" in affected_names
    assert "charge" in affected_names
    # The files that contain the callers should also show up.
    affected_files = {
        a.qualified_name for a in report.affected if a.kind == NodeKind.FILE
    }
    assert {"auth.py", "billing.py"}.issubset(affected_files)
    assert report.risk in ("medium", "low")


def test_impact_on_merge_url_reaches_public_client_methods() -> None:
    """Regression (httpx): impact on BaseClient._merge_url must walk
    build_request -> Client.request -> Client.get. Client.request used to be
    missing from the graph when a decorated neighbour's recycled `id()` made
    the chunker skip it."""
    store, _ = build_graph(HTTPX_LIKE)

    targets = resolve_targets(store, qnames=["_client.py::BaseClient._merge_url"])
    assert len(targets) == 1

    report = analyze_impact(store, targets=targets, max_depth=3)
    depth = {a.qualified_name: a.depth for a in report.affected}
    assert depth.get("_client.py::BaseClient.build_request") == 1
    assert depth.get("_client.py::Client.request") == 2
    assert depth.get("_client.py::Client.stream") == 2
    assert depth.get("_client.py::Client.get") == 3
    assert depth.get("_client.py::Client.post") == 3

    # The decorated class's method is CONTAINed by the class node itself.
    timeout_id = store.find_by_qname("_client.py::Timeout")
    as_dict_id = store.find_by_qname("_client.py::Timeout.as_dict")
    assert store.get_node(timeout_id).kind == NodeKind.CLASS
    assert (timeout_id, EdgeKind.CONTAINS) in {
        (src, k) for src, k, _ in store.in_edges(as_dict_id)
    }


def test_save_and_load_roundtrip(tmp_path: Path) -> None:
    store, _ = build_graph(FIXTURE)
    p = tmp_path / "graph.pkl"
    store.save(p)

    from karst.graph.store import GraphStore
    loaded = GraphStore.load(p)
    assert loaded.node_count == store.node_count
    assert loaded.edge_count == store.edge_count
    assert loaded.find_by_name("get_user")
