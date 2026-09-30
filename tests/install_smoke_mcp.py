"""Install smoke test: drive the *installed* `karst-mcp` over stdio like a host.

Run after `pip install karst` and `karst quickstart <repo>`:

    python tests/install_smoke_mcp.py <repo>

Not part of the pytest suite (the name doesn't match test_*.py) — it launches
the real console script, so it checks what an MCP host actually gets.
"""

import asyncio
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

EXPECTED_TOOLS = {"search_code", "find_impact", "list_packs", "index_status", "index_repository"}


async def main(repo: Path) -> None:
    params = StdioServerParameters(command="karst-mcp", args=[], cwd=str(repo))
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = {t.name for t in (await session.list_tools()).tools}
            print("tools:", sorted(tools))
            assert EXPECTED_TOOLS <= tools, f"missing tools: {EXPECTED_TOOLS - tools}"

            r = await session.call_tool("search_code", {"query": "charge a user", "repo_path": str(repo)})
            text = r.content[0].text
            print("search_code:\n" + text[:600])
            assert "billing.py:" in text, "search_code returned no billing.py citation"

            r = await session.call_tool("find_impact", {"symbol": "get_user", "repo_path": str(repo)})
            text = r.content[0].text
            print("find_impact:\n" + text[:600])
            assert "charge" in text or "login" in text, "find_impact found no dependents of get_user"

    print("MCP install smoke: OK")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]).resolve()))
