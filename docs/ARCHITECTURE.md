# karst — architecture

karst is a local program: a CLI (`karst`) and an MCP server (`karst-mcp`) that
run on your machine and keep their state in a folder under `~/.karst/`. There is
no hosted service behind it and no account. **The CLI sends nothing anywhere by
itself** — no telemetry, no analytics, no update check. The few things that can
reach the network are listed in
[What leaves your machine](../README.md#what-leaves-your-machine), and every one
of them is something you start or configure.

## Pipeline

```
 INDEX   repo files -> walker -> parser (tree-sitter) -> chunker -> embedder (FastEmbed / ONNX) -> Qdrant (local files)
                                        \
                                         -> graph builder (NetworkX: CALLS / IMPORTS / CONTAINS / IMPLEMENTS)

 ASK     question -> embedder -> Qdrant top-k -> (optional graph expansion) -> cited chunks      karst ask --no-llm, MCP search_code
                                                                              \
                                                                               -> LLM you configure -> answer   karst ask, karst review

 IMPACT  symbol or diff -> graph walk -> blast radius                                            karst impact, MCP find_impact
```

## Components

| Piece | Module | What it does |
|---|---|---|
| Walker | `karst/walker.py` | Walks the repo, skips noise directories, honors the root `.gitignore`. |
| Parser | `karst/parser.py`, `karst/languages.py` | tree-sitter parse for Python, JavaScript, TypeScript, Go, Rust, Java. Grammars come from `tree-sitter-language-pack` and are downloaded on first use (see the README). |
| Chunker | `karst/chunker.py` | Splits each file into function / class / method chunks with exact `file:line` ranges. |
| Embedder | `karst/embedder.py`, `karst/embedding_cache.py` | Local ONNX embeddings (default `BAAI/bge-small-en-v1.5`) with a content-hash cache so unchanged code is never re-embedded. |
| Store | `karst/store.py`, `karst/indexer.py` | Qdrant in embedded local-file mode. There is no remote-Qdrant option. Incremental via a SHA manifest. On POSIX karst refuses to open a store owned by another user or writable by everyone, because Qdrant's local mode unpickles stored points (see [SECURITY.md](compliance/SECURITY.md)). |
| Graph | `karst/graph/` | NetworkX call / import / containment / inheritance graph; impact analysis walks it. Saved as `graph.json`: data-only JSON, written atomically and validated on load. karst never unpickles a graph. |
| Packs | `karst/packs/` | Named, attachable scopes over the index; retrieval can be limited to a pack. |
| LLM (optional) | `karst/llm.py`, `karst/ask.py`, `karst/review/` | Used only by `ask` (without `--no-llm`) and `review`. Anthropic, OpenAI, or a local OpenAI-compatible server. |
| MCP server | `karst/mcp_server.py` | `search_code`, `find_impact`, `list_packs`, `index_status`, `index_repository`. stdio by default, Streamable HTTP with `--http` (binds 127.0.0.1, requires `KARST_MCP_TOKEN`, tools limited to `KARST_MCP_ROOTS`). It never calls an LLM. |

## Where state lives

Everything is plain files on your disk:

- `~/.karst/indexes/<folder>-<hash>/` — one directory per repo, where `<hash>` is
  the first 12 hex characters of the SHA-256 of the repo's normalized real path, so
  same-named repos never share an index. It holds the Qdrant files, the SHA
  manifest, the embedding cache, the packs database, the attached/pinned pack
  state, and the call graph (`graph.json`). On POSIX `~/.karst`, `~/.karst/indexes`
  and the index directories are mode 0700 and the graph file is 0600.
- `~/.karst/models/` — the embedding model weights.
- The tree-sitter grammar cache, owned by `tree-sitter-language-pack` and kept
  outside `~/.karst/` (location and details in the README install section).

Deleting those folders removes everything karst has stored.

## Network behavior

See [What leaves your machine](../README.md#what-leaves-your-machine) for the
authoritative table. In short: two one-time downloads (tree-sitter grammars and
the embedding model), an LLM call only when you configure one for `ask` or
`review`, and `gh` calls only for `review --pr`. For an offline setup, see
[SELF-HOSTED.md](SELF-HOSTED.md).

The project's website has its own admin dashboard. It is not part of this
repository, and karst does not talk to it.
