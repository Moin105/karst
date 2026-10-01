"""Install smoke test for the air-gap claim: nothing is fetched at runtime.

    python tests/install_smoke_offline.py --grammars
        The installed tree-sitter-language-pack must ship its grammars inside
        the wheel, and every language karst indexes must parse with
        KARST_OFFLINE=1.

    python tests/install_smoke_offline.py <repo>
        `karst quickstart` + `karst ask --no-llm` on <repo> with KARST_OFFLINE=1.
        Refuses to run while the network is reachable, so a pass means it
        really worked offline. CI runs it inside `unshare --net` after an
        earlier step has cached the embedding model.

Not part of the pytest suite (the name doesn't match test_*.py) — it checks
the installed package, like install_smoke_mcp.py.
"""

import os
import socket
import subprocess
import sys
from importlib.metadata import version as dist_version
from pathlib import Path


def check_grammars() -> None:
    os.environ["KARST_OFFLINE"] = "1"
    import tree_sitter_language_pack as tslp

    from karst.languages import ALL_LANGUAGES
    from karst.parser import ParserRegistry

    version = dist_version("tree-sitter-language-pack")
    if hasattr(tslp, "downloaded_languages"):
        sys.exit(
            f"tree-sitter-language-pack {version} downloads grammars at runtime; "
            "karst needs a release that bundles them (0.13.x)."
        )
    registry = ParserRegistry()
    for spec in ALL_LANGUAGES:
        tree = registry.get(spec).parse(b"\n")
        assert tree is not None, f"{spec.name}: parse returned nothing"
    names = ", ".join(spec.name for spec in ALL_LANGUAGES)
    print(f"grammars bundled in tree-sitter-language-pack {version}: {names}")


def network_reachable() -> bool:
    try:
        socket.create_connection(("pypi.org", 443), timeout=5).close()
    except OSError:
        return False
    return True


def run_offline(repo: Path) -> None:
    if network_reachable():
        sys.exit("network is reachable; run this with networking disabled (e.g. `unshare --net`).")
    env = {**os.environ, "KARST_OFFLINE": "1"}
    subprocess.run(["karst", "quickstart", str(repo)], check=True, env=env)
    out = subprocess.run(
        ["karst", "ask", "how does charging a user work?", "--no-llm"],
        cwd=repo, env=env, capture_output=True, text=True, encoding="utf-8", check=True,
    )
    print(out.stderr + out.stdout)
    assert "billing.py:" in out.stderr + out.stdout, "offline ask returned no billing.py citation"
    print("offline smoke: OK (quickstart + ask with no network)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--grammars"]:
        check_grammars()
    else:
        run_offline(Path(sys.argv[1]).resolve())
