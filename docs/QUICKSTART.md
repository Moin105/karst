# Quickstart — karst in 5 minutes

This walks you from zero to asking real questions about your own codebase, with
**no API key required**. Every command below is real; the output blocks are
actual runs against karst's own repo.

> **What is karst?** A librarian for your codebase that AI tools can talk to.
> Instead of an AI grepping files or dumping whole folders into the model, it
> asks karst for *the exact, relevant slice* — ranked and cited to `file:line`.
> See [WHY.md](WHY.md) for the "why should I care".

---

## 0. Prerequisites

- Python 3.10 or newer.
- That's it. karst runs entirely on your machine. No account, no server, no
  database to set up (it uses a local file-based vector store).

## 1. Install

```bash
uv tool install karst      # recommended — also puts `karst` on your PATH
# or
pipx install karst         # isolated, also handles PATH
# or
pip install -U karst       # if `karst` isn't found afterwards, use `python -m karst …`
```

> `uv` and `pipx` are separate tools you install once (see
> [uv](https://docs.astral.sh/uv/) / [pipx](https://pipx.pypa.io/)). Don't have
> them? Just use `pip install -U karst`.
>
> If you typed `karst` and got "command not found", your Python scripts folder
> isn't on PATH. Everything still works with `python -m karst …` — just prefix
> it. The `uv`/`pipx` installs avoid this entirely.

## 2. Index your project (one command)

```bash
cd your-project
karst quickstart
```

`quickstart` does three things in order: **indexes** your code, builds a
**call/import graph**, and suggests **context packs**. The first run downloads the
tree-sitter parsers for your languages (about 20 MB) and a small embedding model
(about 65 MB). Both are one-time downloads and send none of your data — after
that it's local and offline.

When it finishes it prints exactly what to try next, with your storage path
filled in.

> **Where does it put things?** Everything lands in
> `~/.karst/indexes/<your-project>-<hash>/` (the hash is 12 hex characters taken
> from the project's full path, so two projects with the same folder name never
> share an index; quickstart prints the exact path). On macOS and Linux that
> folder is private to you (mode 0700). Your code never leaves your machine.
>
> Upgrading from karst 0.2.10 or earlier? Indexes used to live at
> `~/.karst/indexes/<your-project>`, and karst prints a one-line hint when it finds
> one. Run `karst quickstart` again, then delete the old folder. An old `graph.pkl`
> is refused (graphs are `graph.json` now); re-run `karst graph-index`.

## 3. Ask a question — free, no API key

The `--no-llm` flag skips the answer-writing model and just shows you the
**cited code** karst retrieved. This is the fastest way to feel what it does:

```bash
karst ask "where is the vector store similarity search implemented?" --no-llm --top-k 4
```

```text
Retrieved chunks:
  [1] karst/store.py:176-222          method    ChunkStore.search        (score 0.720)
  [2] tests/test_review_agent.py:65   method    indexed_store            (score 0.721)
  [3] tests/test_review_agent.py:64   function  indexed_store            (score 0.711)
  [4] karst/mcp_server.py:174-226     method    search_code              (score 0.669)

# [1] karst/store.py:176-222 - method ChunkStore.search
def search(self, vector, *, limit=8, pack_ids=None, query_text=None):
    ...

~1,383 in + ~500 out tok | $0.0041 + $0.0075 = $0.0116 (anthropic:claude-sonnet-4-6)
```

Two things to notice:

- **Citations.** Every hit is anchored to an exact `file:line`. You can open it
  and verify — you're never trusting a black box.
- **The token meter.** karst tells you what an LLM answer *would* cost
  (`$0.0116` here) **before** you spend anything. No surprise bill.

## 4. Ask for a written answer (optional)

Drop `--no-llm` to get a synthesized answer grounded in those same cited chunks.
This needs two things the free path doesn't: the **provider library** (an
optional extra) and an **API key**. karst itself never holds your key — it just
passes the prompt to your provider.

```bash
# install the provider you'll use (one-time; --no-llm needs none of this)
uv tool install 'karst[anthropic]'    # or 'karst[openai]', or 'karst[llm]' for both
#   with pip:  pip install -U 'karst[anthropic]'

export ANTHROPIC_API_KEY=sk-...       # or OPENAI_API_KEY
karst ask "how does the checkout flow charge the user?"
```

Or run an interactive session to ask many questions against the same index:

```bash
karst ask -i
```

## 5. Before you change something: check the blast radius

This is the part embeddings alone can't do. Ask karst what depends on a symbol.
`impact` reads the graph that quickstart built. Run it from inside your project and
it finds that graph by itself:

```bash
karst impact --target search
```

(The graph is `graph.json` in your index folder, `<your-index>/graph.json`, where
`<your-index>` is the storage path quickstart printed at the end of step 2. From
another folder, pass `--repo-path /path/to/project` or
`--graph-path <your-index>/graph.json`.)

```text
Targets (1):
  - karst/store.py::ChunkStore.search
Affected: 27  Risk: HIGH

  [function ] depth 1  score 1.150  via calls            karst/ask.py::ask  (karst/ask.py:55-97)
  [function ] depth 1  score 1.150  via calls,contains   karst/mcp_server.py::search_code  (karst/mcp_server.py:173-226)
  [function ] depth 2  score 0.575  via calls            karst/cli.py::_answer_once  (karst/cli.py:176-235)
  [file     ] depth 2  score 0.345  via contains,imports karst/store.py  (karst/store.py)
  …and more
```

Now you know: touching `search` ripples to **27** places, it's **HIGH** risk,
and you can see *how* each one is connected (`via calls`, `via imports`). That's
your code-review checklist, generated before you write a line.

---

## What just happened?

| Step | Command | What you got |
|------|---------|--------------|
| Index | `karst quickstart` | A local, searchable map of your repo |
| Ask | `karst ask … --no-llm` | Ranked code, cited to `file:line`, with a cost estimate |
| Impact | `karst impact --target …` | The blast radius of a change, before making it |

## Next steps

- **[WHY.md](WHY.md)** — the problem karst solves and who it's for.
- **[COOKBOOK.md](COOKBOOK.md)** — real scenarios: onboarding to a new repo,
  cutting token costs with packs, reviewing a diff.
- **[FOR-VIBE-CODERS.md](FOR-VIBE-CODERS.md)** — use karst from Cursor / Claude
  with **zero CLI commands** — you just chat, your AI calls karst for you.
- **[MCP.md](MCP.md)** — connect karst to any MCP-capable AI client.
- Run `karst examples` anytime for a copy-paste cheatsheet.
