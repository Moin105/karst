# karst MCP server

Connect karst to any MCP host — **Claude Desktop, Cursor, Continue, Cline, or a
custom agent** — and your AI tool gets scoped, cited code context instead of
reading your repo blind.

The server returns *context*, not answers: it never calls an LLM, so **you don't
need to give karst an API key**. Your host (Claude Desktop / Cursor) already has
the model; karst just feeds it the right slice of the repo.

---

## 1. Install

```bash
uv tool install karst      # recommended — fast, handles PATH for you
# or
pipx install karst         # isolated, also handles PATH
# or
pip install karst          # fallback (see PATH note below)
```

(From a clone of this repo for development: `pip install -e .`)

This installs two console commands:

- `karst` — the CLI (`index`, `ask`, `impact`, `packs`, `review`)
- `karst-mcp` — the MCP server (this doc)

> **PATH note.** `uv tool install` / `pipx` put these commands on your PATH for
> you. Plain `pip install --user` (notably Microsoft Store Python) drops the
> scripts in a `Scripts\` folder that often isn't on PATH — then `karst` /
> `karst-mcp` won't be found. Two PATH-free options that always work:
> `python -m karst …` (CLI) and `python -m karst.mcp_server` (server). The MCP
> configs below include launchers that need no PATH at all.

## 2. Index a repo (one time)

The MCP tools read a prebuilt index. Build it once per repo:

```bash
karst index /path/to/your-repo
# optional but recommended — enables find_impact and pack scoping:
karst graph-index /path/to/your-repo
karst packs --storage ~/.karst/indexes/<your-repo>-<hash> \
  suggest /path/to/your-repo --apply --retag
```

> The `--storage` folder is `~/.karst/indexes/<folder>-<hash>`: the repo's folder
> name plus the first 12 hex characters of a SHA-256 of its real path, so two repos
> with the same folder name never share an index. Indexing `/path/to/myapp` stores
> it at something like `~/.karst/indexes/myapp-1a2b3c4d5e6f` (the `--storage` you
> pass later must match). Simpler: run `karst quickstart /path/to/your-repo`, which
> does all three steps and prints the exact storage path. The MCP tools work the
> folder out themselves from the repo path you give them.

(You can also do this from inside the host by calling the `index_repository`
tool — handy for small repos. For large repos prefer the CLI so you don't block
the host on a long call.)

## 3. Wire it into your IDE

### Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Use whichever launcher you have (all three are equivalent):

```json
{
  "mcpServers": {
    "karst": { "command": "uvx", "args": ["--from", "karst", "karst-mcp"] }
  }
}
```

- **`uvx` (recommended)** — needs nothing pre-installed; fetches and runs karst
  on demand. Requires [`uv`](https://docs.astral.sh/uv/).
- **Installed already?** `{ "command": "karst-mcp" }` (works if it's on PATH —
  it is after `uv tool install` / `pipx`).
- **No PATH at all?** `{ "command": "python", "args": ["-m", "karst.mcp_server"] }`
  — the most universal option (just needs `python` on PATH).

Restart Claude Desktop. You'll see a 🔌 / tools icon — `karst` and its 5 tools
should be listed.

### Cursor

Create `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for all
projects):

```json
{
  "mcpServers": {
    "karst": { "command": "uvx", "args": ["--from", "karst", "karst-mcp"] }
  }
}
```

(Same three launcher options as above — swap in `karst-mcp` or
`python -m karst.mcp_server` if you prefer.) Reload Cursor. Settings → MCP should
show `karst` as connected.

### Continue / Cline / other MCP hosts

Any host that speaks MCP over stdio works. Point it at the command `karst-mcp`
(or `python -m karst.mcp_server`). No args, no env vars required.

## 4. Use it

Once connected, just ask your IDE's model normally. It will call karst's tools
when useful. Examples that trigger them:

- *"Using karst, how does checkout charge the user in /path/to/repo?"*
  → `search_code` returns the relevant functions with `file:line` citations.
- *"What breaks if I change the `login` function in this repo?"*
  → `find_impact` returns the blast radius from the call graph.
- *"What context packs exist for this repo?"* → `list_packs`.

You can always pass the repo's absolute path; the tools resolve the index from
`~/.karst/indexes/<repo-folder>-<hash>`.

---

## Tools

| Tool | What it does | Needs |
|---|---|---|
| `search_code(query, repo_path, packs?, limit?)` | Ranked code chunks for a question, each cited to `file:line`. Scope with `packs` to cut tokens. | vector index |
| `find_impact(symbol, repo_path, max_depth?)` | Blast radius of changing a symbol — what depends on it, ranked. | graph (`graph-index`) |
| `list_packs(repo_path)` | Named context packs available for the repo. | packs (suggest+apply) |
| `index_status(repo_path)` | Whether a repo is indexed and how big the index is. | — |
| `index_repository(repo_path, reset?)` | Build/refresh the vector index **and** the graph. Slow first run; instant after. | — |

## Why this design

Most "code context" integrations dump files into the model and hope. karst
instead:

1. **Scopes** — pack-filtered retrieval reads ~200 chunks, not 5,000.
2. **Cites** — every chunk carries an exact `file:line`, so the model (and you)
   can verify, not trust.
3. **Predicts** — `find_impact` answers "what else breaks?" from a real call
   graph, which embeddings alone can't do.

Net effect on a real 246-file repo (Byfoods): ~60% fewer input tokens per
question, and answers grounded in citations.

## Remote / hosted mode (claude.ai, ChatGPT, shared servers)

By default karst-mcp speaks **stdio** — for local hosts that launch it as a
subprocess. To connect a **browser/cloud host** (claude.ai, ChatGPT) or share
one server with a team, run it over **Streamable HTTP** instead:

```bash
# on a machine that has the repos indexed (it reads ~/.karst/indexes locally)
export KARST_MCP_TOKEN="a-long-random-secret"   # required
export KARST_MCP_ROOTS=/srv/repos               # repos the tools may read
karst-mcp --http                  # binds 127.0.0.1, port $PORT or 8080
```

- Endpoint: `https://your-host/mcp`  ·  health check: `GET /healthz` (open).
- **Auth (required):** the server refuses to start without `KARST_MCP_TOKEN` (exit
  code 2; there is no bypass), and every request needs
  `Authorization: Bearer $KARST_MCP_TOKEN`.
- **Binds `127.0.0.1` by default** (`--host` or `KARST_MCP_HOST` overrides). Set
  `KARST_MCP_HOST=0.0.0.0` only behind a firewall or reverse proxy you control.
- **Tools are limited to `KARST_MCP_ROOTS`.** Every tool's `repo_path` must resolve
  to a directory under one of those roots (a list separated by `:` on macOS/Linux,
  `;` on Windows; default: the server's working directory). `..` and symlink
  escapes are rejected. stdio mode is unchanged and accepts any path.
- **Put it behind HTTPS** (your platform's TLS, or a reverse proxy). The port comes
  from `--port`, `KARST_MCP_PORT` or `$PORT`.
- **Hosted platforms (Fly / Render / Railway) don't work as-is yet.** They need
  `KARST_MCP_HOST=0.0.0.0` and `KARST_MCP_ROOTS` set, and there is a known
  limitation: the MCP SDK's Host-header check answers `421 Invalid Host header` to
  any request whose `Host` is not localhost, which is what a hostname-routed
  platform sends. A proxy or tunnel you control that sends `Host: 127.0.0.1:<port>`
  to karst works; a host allow-list in karst is a follow-up.

**Important:** the server reads indexes from its **own disk**
(`~/.karst/indexes/<repo>-<hash>`). A hosted server can't see your laptop's files — so
index the repos **on the server** (run `karst index` / `karst quickstart` there,
or mount a volume that has them).

**Connecting clients:**
- Clients that support a remote MCP URL + custom headers → point them at
  `https://your-host/mcp` with the `Authorization: Bearer …` header.
- stdio-only clients (e.g. Claude Desktop) can bridge to it:
  `npx mcp-remote https://your-host/mcp --header "Authorization: Bearer $TOKEN"`.
- claude.ai / ChatGPT's built-in connector UIs currently expect **OAuth**; the
  bearer-token server works today for header-capable clients and the
  `mcp-remote` bridge — native OAuth is the next step on the roadmap.

## Troubleshooting

- **"This repo isn't indexed yet."** Run `karst index <path>` (and
  `graph-index` for impact), or call the `index_repository` tool.
- **`--http` exits with "KARST_MCP_TOKEN is not set".** HTTP mode requires a token;
  set `KARST_MCP_TOKEN` to a long random secret.
- **A tool says the repo path is outside `KARST_MCP_ROOTS`.** In HTTP mode, tools
  only read repos under those roots (default: the working directory the server was
  started in). Add the repo's parent folder to `KARST_MCP_ROOTS`.
- **HTTP `421 Invalid Host header`.** A request reached karst with a non-localhost
  `Host`. See the hosted-mode note above.
- **`karst-mcp` not found.** Use `python -m karst.mcp_server` in the
  config, or add the pip Scripts dir to PATH.
- **Host shows no tools.** Fully quit and reopen the host after editing its
  config — most hosts only read MCP config at startup.
- **First `search_code` is slow.** The embedding model downloads + loads on
  first use (~once), then it's fast.
