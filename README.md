# karst

<!-- mcp-name: io.github.Moin105/karst -->

**Know what your change breaks — without your code leaving your machine.**
karst gives any AI coding tool — Cursor, Claude Desktop, a custom agent — a local
map of your codebase. It answers questions with exact `file:line` citations **and**
walks a real call / import / inheritance graph to compute the **blast radius** of a
change — *"what else breaks if I touch this?"* — the question plain search and
agentic `grep` can't answer.

It runs locally, speaks **MCP** (so it drops into any agent), and has **no
telemetry**: the CLI sends nothing anywhere by itself. Indexing, search and
impact analysis never call an LLM. Only `karst ask` and `karst review` do, and
only when you have configured one. [What leaves your machine](#what-leaves-your-machine)
lists every case. As a bonus, pack-scoped retrieval cuts **~60%** of the input
tokens per question.

> **Regulated, air-gapped, or IP-sensitive team?** karst is built for the
> environments cloud coding tools structurally can't enter — fully offline, no
> telemetry, source you can audit. Start with
> [What leaves your machine](#what-leaves-your-machine) and the
> **[Compliance & Air-Gap Pack](docs/compliance/README.md)** (attestation,
> network-egress table, pre-filled security questionnaire, offline install).

```bash
uv tool install karst      # recommended — fast, and puts `karst` on PATH for you
# or
pipx install karst         # isolated install, also handles PATH
# or
pip install karst          # if `karst` isn't found after, use `python -m karst …`
```

> [`uv`](https://docs.astral.sh/uv/) and `pipx` are the cleanest because they
> put the `karst` command on your PATH automatically. With plain `pip --user`
> (notably Microsoft Store Python) the command may not be on PATH — in that case
> `python -m karst …` always works, no PATH setup required.

### First run: what gets downloaded

karst's own code makes no network requests, but two of its dependencies fetch
files the first time they are needed. Both are cached on disk, so each happens
once.

1. **Tree-sitter parsers** (`tree-sitter-language-pack`). Its wheel contains no
   grammars: on first use of a language it downloads a parser bundle and unpacks
   that language's library. To fetch the six languages karst parses now, run
   this once with the Python environment karst is installed in:

   ```bash
   python -c "from tree_sitter_language_pack import get_parser; [get_parser(n) for n in ('python', 'javascript', 'typescript', 'go', 'rust', 'java')]"
   ```

   `.tsx` files are parsed with the `typescript` grammar, so there is no
   separate `tsx` entry. The cache is per user and per `tree-sitter-language-pack`
   version, not per virtual environment, so any Python with the same version
   installed fills it. That helps for `uv tool` and `pipx` installs, where karst
   lives in a private environment.
2. **Embedding model** (`BAAI/bge-small-en-v1.5`, about 65 MB, from
   huggingface.co) on the first `index`, `quickstart`, `ask`, `review` or MCP
   `search_code`. Run `karst quickstart` once on any small repo to fetch it, then
   set `KARST_OFFLINE=1` to forbid further model downloads.

Parser download details, for `tree-sitter-language-pack` 1.9.1 (the version
pinned in `pyproject.toml`):

| | |
|---|---|
| Host | GitHub release `v1.9.1` of `kreuzberg-dev/tree-sitter-language-pack`: a manifest, `parsers.json`, and one archive per platform, `parsers-<os>-<arch>.tar.zst` (about 18-21 MB). GitHub redirects to `xberg-io/tree-sitter-language-pack` (the repo's new name) and serves the archive from `release-assets.githubusercontent.com`. HTTPS only; `HTTPS_PROXY` / `ALL_PROXY` are honored. |
| Integrity | The archive's SHA-256 is compared with the value in the manifest. A mismatch raises `ChecksumMismatchError` and nothing is cached. The manifest and the archive come from the same release, so this catches corrupt or altered downloads, not a compromised release. There is no signature check, and the unpacked libraries (native code, loaded into the karst process) are not re-hashed on later runs. |
| Cache | Linux `${XDG_CACHE_HOME:-~/.cache}/tree-sitter-language-pack/v1.9.1/libs`, macOS `~/Library/Caches/tree-sitter-language-pack/v1.9.1/libs`, Windows `%LOCALAPPDATA%\tree-sitter-language-pack\v1.9.1\libs`. `python -c "import tree_sitter_language_pack as t; print(t.cache_dir())"` prints it. (Microsoft Store Python keeps the Windows folder under its own `LocalCache\Local` directory instead.) |
| Mirror / offline | `TREE_SITTER_LANGUAGE_PACK_MANIFEST_URL` (an `https://` or `file://` URL) replaces the manifest URL. For an air-gapped machine, run the command above on a connected machine with the same OS and CPU and copy the `libs` folder to the same path. |

After that command has run once, `analyze`, `graph-index` and `impact` make no
network requests. When a language's library is in the cache, the pack loads it
from disk and never contacts GitHub; with all six cached it works with no
manifest and no network. This holds while the cache folder for that version is
intact: a different `tree-sitter-language-pack` version uses a different cache
folder and would download again.

Do not use the pack's own `download([...])` for this. In 1.9.1 it returns
without fetching anything for languages the pack already lists; calling
`get_parser`, which is what karst does, is what fetches. `KARST_OFFLINE=1`
covers the embedding model only, not the parsers.

## Why

Most "chat with your codebase" tools dump tens of thousands of vaguely-related
tokens into the model on every question. You can't see what was loaded, you
can't scope it, and the bill arrives at the end of the month. karst inverts
that:

- **Scopes** — pack-filtered retrieval reads ~200 chunks, not 5,000.
- **Cites** — every chunk carries an exact `file:line`. Verify, don't trust.
- **Predicts** — a real call/import graph answers "what else breaks if I change
  this?" — which embeddings alone can't.

Measured on a real 246-file NestJS + Next.js repo: 906 chunks indexed, re-index
**343s → 2.3s** incremental, **~$0.019** per question on Sonnet 4.6 (shown
*before* the call), **60%** fewer tokens with packs attached.

## Quickstart (CLI)

> **`karst` command not found?** Your Python Scripts dir isn't on PATH (common
> with Microsoft Store Python). Everything below works the same with
> **`python -m karst …`** — no PATH setup. (Or install via `uv`/`pipx`, which put
> `karst` on PATH for you.)

```bash
cd your-project

# one command: index + call/import graph + suggested packs
karst quickstart                 #  or:  python -m karst quickstart

# ask questions about the code (defaults to this folder's index)
karst ask "how does checkout charge the user?" --no-llm    # cited code, no API key
karst ask -i                     # interactive: ask many questions

# what breaks if I change a function? (run inside the project; it finds the graph itself)
karst impact --target checkout

# review a diff with severity-tagged, cited findings
karst review --staged --storage ~/.karst/indexes/<your-project>-<hash>   # the path quickstart prints

karst examples                   # a copy-paste cheatsheet of everything
```

`karst quickstart` prints the exact follow-up commands with your index path
filled in. `karst ask` writes an LLM answer when `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` is set, which sends the retrieved code to that provider (see
[What leaves your machine](#what-leaves-your-machine)); add `--no-llm` for cited
chunks and no network call. The **MCP server below needs no key either** — your
IDE supplies the model.

## Use it from your IDE (MCP)

karst ships an MCP server (`karst-mcp`) exposing five tools — `search_code`,
`find_impact`, `list_packs`, `index_status`, `index_repository` — over stdio.

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor**
(`.cursor/mcp.json`) — pick whichever launcher you have:

```json
{
  "mcpServers": {
    "karst": { "command": "uvx", "args": ["--from", "karst", "karst-mcp"] }
  }
}
```

`uvx` needs nothing pre-installed — it fetches and runs karst on demand. Already
installed it? `{ "command": "karst-mcp" }` works too. No PATH at all? Use
`{ "command": "python", "args": ["-m", "karst.mcp_server"] }`.

Restart the host, then ask normally — it calls karst's tools when useful and
gets back scoped, cited context. Full setup is in [docs/MCP.md](docs/MCP.md).

## Guides

New here? Start with whichever fits you:

- **[Why karst?](docs/WHY.md)** — what it is and what it's for, in plain
  language. Read this first if you're not sure what problem it solves.
- **[Quickstart](docs/QUICKSTART.md)** — zero to asking real questions in 5
  minutes, no API key, with real output.
- **[For vibe coders](docs/FOR-VIBE-CODERS.md)** — use karst from Cursor /
  Claude Desktop with **no CLI commands** — you just chat.
- **[Connect your AI tool](docs/CONNECT.md)** — copy-paste MCP setup for every
  client: Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, Zed,
  JetBrains, plus the web apps.
- **[Self-hosted & air-gapped](docs/SELF-HOSTED.md)** — run karst *and* the AI
  answers fully on your machine with a local model. For teams whose code can't
  go to the cloud.
- **[Cookbook](docs/COOKBOOK.md)** — real scenarios (onboarding, blast radius,
  cutting token cost, reviewing a diff) with copy-paste commands.
- **[MCP setup](docs/MCP.md)** — connect karst to any MCP client.

## How it works

1. **Index** — tree-sitter splits every function, class and method into an
   AST-aware chunk (Python, JS, TS, Go, Rust, Java); chunks are embedded into a
   local Qdrant store. Incremental: a SHA manifest + embedding cache skip
   unchanged files.
2. **Graph** — a NetworkX knowledge graph of `CALLS` / `IMPORTS` / `CONTAINS` /
   `IMPLEMENTS` edges powers impact analysis ("what depends on this?" — including
   which classes implement an interface or extend a base).
3. **Pack** — related files become named, attachable context packs (`auth`,
   `billing`). A query loads only its pack.
4. **Serve** — the MCP server returns ranked, `file:line`-cited chunks; your
   host's model reasons over them.

Everything is local and offline-capable (FastEmbed/ONNX embeddings, Qdrant
local mode, sqlite caches — no Docker, no daemon). The one-time downloads and
every path that can reach the network are listed below.

## What leaves your machine

The CLI has no telemetry, analytics, update check or phone-home, and karst's own
code contains no HTTP client. Network traffic comes only from the rows below.
Each one is either a one-time download that sends none of your data, or
something you start or configure.

| Command / flag | What is sent | Where | When |
|---|---|---|---|
| `analyze`, `graph-index`, `impact`, `packs …`, MCP `find_impact` / `list_packs` / `index_status` | Nothing | — | Never. (`analyze`, `graph-index` and `packs suggest` parse code, so they need the parsers in the next row.) |
| First parse of a language (`analyze`, `graph-index`, `index`, `quickstart`, `packs suggest`, MCP `index_repository`) | Nothing of yours. A plain download of the tree-sitter parser bundle, about 18-21 MB. GitHub sees your IP address, as with any download. | `github.com` (redirects to `release-assets.githubusercontent.com`) | Once per parser version, unless already cached. [Pre-download it](#first-run-what-gets-downloaded). |
| First embedding (`index`, `quickstart`, `ask`, `review`, MCP `search_code` / `index_repository`) | Nothing of yours. A download of the embedding model, about 65 MB. Embedding itself runs locally. | `huggingface.co`, through FastEmbed and `huggingface_hub` | Once, into `~/.karst/models`. `KARST_OFFLINE=1` blocks it. |
| `ask` without `--no-llm` | Your question plus the retrieved chunks: the top 8 by default, each cut to 2,000 characters, plus up to 6 graph neighbors with `--graph`. | Anthropic (`api.anthropic.com`), OpenAI (`api.openai.com`), or your local model server | Every run, once a provider is configured. With none configured it stops with an error and sends nothing. |
| `review --staged` / `--base` / `--diff` / `--pr` | For each changed file: its diff hunks, up to 3 containing chunks per hunk (each cut to 1,500 characters) and up to 3 similar chunks per hunk (each cut to 800; `--no-neighbors` drops these). | Same provider rules as `ask`. `review` has no `--no-llm`, so it always needs an LLM. | Every run. |
| `review --pr N` | The PR number and `--repo`. It reads the PR diff. | GitHub, through your `gh` CLI, as the account `gh` is logged in to | When you use `--pr`. |
| `review --pr N --post-to-pr` | A PR review with one inline comment per finding: severity, message, suggested fix. | GitHub, through `gh api`, as your `gh` account. Visible to everyone on the PR. | When you add the flag. There is no confirmation prompt. |
| `karst-mcp` (stdio or `--http`), any tool | The retrieved code chunks and impact results go back to your MCP client (Claude Desktop, Cursor, Claude Code, …). karst sends nothing outward itself. | Your MCP client, which normally forwards tool results to its own model provider. | Every tool call. What the client does next is governed by the client, not by karst. |
| `karst-mcp --http` | Nothing outward. It serves your indexed code to clients that present the bearer token. | Listens on `127.0.0.1:8080` by default. It refuses to start without `KARST_MCP_TOKEN`, and its tools only read repos under `KARST_MCP_ROOTS` (default: the working directory). `KARST_MCP_HOST=0.0.0.0` (or `--host`) exposes it to your network. | While it runs. |

Which LLM `ask` and `review` use: `--llm` (`ask` only) or `KARST_LLM_PROVIDER` if
set; otherwise a local server if `KARST_LLM_BASE_URL` is set; otherwise
Anthropic if `ANTHROPIC_API_KEY` is set; otherwise OpenAI if `OPENAI_API_KEY` is
set. **An API key that is already in your shell for another tool is enough to
make `karst ask` send code chunks to that provider.** Use `--no-llm` for cited
chunks and no call, or `--llm local` / `KARST_LLM_PROVIDER=local` for a local
model; the local server URL defaults to `http://localhost:11434/v1` (Ollama), and
if you point `KARST_LLM_BASE_URL` at a remote host the prompt goes there. The
Anthropic and OpenAI SDKs are optional extras (`karst[anthropic]`,
`karst[openai]`, `karst[llm]`); a plain `pip install karst` cannot call either,
and the local option uses the `openai` extra.

The vector store (Qdrant) runs in embedded local-file mode under
`~/.karst/indexes/`; there is no remote Qdrant option. Once the embedding model
is cached, FastEmbed loads it from disk without a request, and `KARST_OFFLINE=1`
turns a missing model into an error instead of a download. The model download
goes through Hugging Face's client library, which has its own usage-telemetry
switch (`HF_HUB_DISABLE_TELEMETRY=1`); that setting belongs to that library, not
to karst.

## Status

Live: AST chunking (6 languages), call/import graph + impact analysis,
pack-scoped retrieval, token + cost meter, incremental indexing + embedding
cache, diff code review with inline PR posting (`review --pr --post-to-pr`), and
the MCP server over both stdio and remote Streamable-HTTP (`karst-mcp --http`).
Coming next: hosted indexing, team-shared pack libraries, an autonomous GitHub
PR review bot, and OAuth for browser connectors (claude.ai / ChatGPT).

## License

Apache-2.0. See [LICENSE](LICENSE).
