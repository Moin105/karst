# karst — Security & Air-Gap Attestation

**Product:** karst (Python CLI + MCP server for local code context)
**Version:** 0.2.7 · **License:** Apache-2.0 (source-available)
**Deployment model:** self-hosted, runs entirely on customer-controlled machines
**Last reviewed:** 2026-06-23

---

## 1. Attestation

To the best of the maintainer's knowledge, for the version above:

1. **karst's own source code makes no outbound network calls.** It contains no
   `requests` / `httpx` / `urllib` / raw-socket HTTP client of its own. (Verifiable:
   grep the `karst/` package for those imports — there are none.)
2. **No telemetry, analytics, usage tracking, or phone-home of any kind.** The CLI
   sends nothing anywhere by itself. There is no analytics SDK, no license-server
   callback, and no "check for updates" ping.
3. **No sub-processors.** karst does not transmit code, queries, or metadata to any
   third party as part of its own operation.
4. **Your source code is processed locally.** Indexing, embedding, the vector store
   (Qdrant local-file mode), the dependency graph, and impact analysis all run in
   the same process/host, writing only to a local directory you control (default
   `~/.karst/`).
5. **Air-gappable.** With `KARST_OFFLINE=1` and pre-seeded model and tree-sitter
   parser caches, karst runs with **zero outbound connectivity**, including with the
   network physically disconnected. See [AIR-GAP-INSTALL.md](AIR-GAP-INSTALL.md) to
   reproduce.

The only network activity karst can produce comes from the clearly-scoped paths
enumerated in §3: two one-time downloads of tooling (rows 1–2) and **optional,
operator-enabled** integrations (rows 3–5). In an air-gapped deployment the
downloads are pre-seeded and the integrations are off.

---

## 2. Trust boundary & data flow

```
        ┌──────────────────────── customer host / VDI / golden image ───────────────────────┐
        │                                                                                     │
  your  │   source files ─▶ tree-sitter parse ─▶ chunks ─▶ embeddings (local ONNX) ─▶ Qdrant │
  repo ─┼──▶                                  └─▶ call/import/impl graph (NetworkX, local)    │
        │                                                                                     │
  agent │   Claude Code / Cursor / VS Code ──(MCP, stdio or localhost HTTP)──▶ karst tools    │
 (MCP)  │      returns: cited code snippets + impact results  (no code leaves this box)       │
        │                                                                                     │
        └─────────────────────────────────────────────────────────────────────────────────-─┘
              ▲ everything above this line stays on the customer host ▲
```

**What is stored, and where:** the local index (`~/.karst/indexes/<repo>-<hash>/`,
where `<hash>` is the first 12 hex characters of the SHA-256 of the repo's real path)
holds your code chunks, their embeddings (vectors), a SHA manifest, and the graph —
all on local disk. There is no remote store. The graph is data-only JSON
(`graph.json`); karst never unpickles it, and refuses an old `graph.pkl`. On POSIX,
`~/.karst`, `~/.karst/indexes` and the index directories are mode 0700 and the graph
file is 0600. Data at rest is otherwise protected by the host's own disk encryption /
file permissions; karst adds no separate at-rest service.

**Known limitation — the vector store loads pickles.** `qdrant-client`'s local mode
keeps points in `<index>/collection/*/storage.sqlite` and unpickles them when it
opens the store, so anyone who can write those files can run code as the karst user.
karst cannot change that format. It mitigates it with the private directories above
and, on POSIX, by refusing to open a store that is owned by another user (other than
root) or is world-writable. A data-only vector backend is a planned follow-up. Until
then, keep the index on a disk only you can write, and do not point `--storage` at a
shared or downloaded folder.

**What crosses the trust boundary:** in a default air-gapped deployment, **nothing.**
The MCP transport is either stdio (same machine, no socket) or Streamable-HTTP, which
binds `127.0.0.1` unless you choose another host/port, refuses to start without a
bearer token (`KARST_MCP_TOKEN`), and limits its tools to `KARST_MCP_ROOTS`. Retrieved
snippets are handed to whichever MCP client you connect (see §3, row 5).

---

## 3. Complete network-egress table

| # | What | When | Direction | Contains your code? | How to disable |
|---|------|------|-----------|---------------------|----------------|
| 1 | **Embedding model download** (HuggingFace, ~65 MB, one-time) | First embedding only, then cached in `~/.karst/models` | Outbound to huggingface.co | **No** — downloads a model, sends nothing | `KARST_OFFLINE=1` (pre-seed the cache first); or pre-install via your mirror |
| 2 | **tree-sitter parsers** (`tree-sitter-language-pack` 1.9.1, ~18–21 MB bundle, one-time) | First parse of each language, then cached outside `~/.karst` (Linux `~/.cache/tree-sitter-language-pack/`, macOS `~/Library/Caches/tree-sitter-language-pack/`, Windows `%LOCALAPPDATA%\tree-sitter-language-pack\`) | Outbound over HTTPS to github.com (release assets; GitHub redirects to `release-assets.githubusercontent.com`). The archive's SHA-256 is checked against the manifest from the same release. | **No** — downloads native parser libraries, sends nothing | Pre-seed the cache (README, "First run: what gets downloaded"), or point `TREE_SITTER_LANGUAGE_PACK_MANIFEST_URL` at an internal mirror. **`KARST_OFFLINE=1` does not cover this row.** |
| 3 | **Cloud LLM call** (Anthropic / OpenAI) | Only if *you* configure a provider (an API key, or a remote `KARST_LLM_BASE_URL`) and run `ask` without `--no-llm`, or run `review` | Outbound to the LLM provider | **Yes — the assembled prompt** (selected code snippets, or diff hunks plus context for `review`) | Set no cloud key, or use `KARST_LLM_PROVIDER=local` (Ollama/vLLM/LM Studio) or `ask --no-llm`. `review` always needs an LLM, so for zero egress give it a local one. A plain `pip install karst` (no `anthropic` / `openai` extra) cannot make this call. |
| 4 | **GitHub PR review** | Only `karst review --pr` (reads the PR diff) and `--post-to-pr` (posts inline comments) | Outbound via your `gh` CLI, as the account `gh` is logged in to | Diff + the LLM's findings | Don't use the `--pr` path; core review reads local diffs |
| 5 | **MCP client** | Every MCP tool call | Retrieved chunks go back to the client you connected (Claude Desktop, Cursor, …), which may forward them to its own model provider | **Yes — retrieved snippets** | This leg is the client's, not karst's. Use a client whose model is on-prem or approved. |

**Reading the table:** rows 1–2 download *tooling*, never your code. Rows 3–5 are
the only paths by which code could leave the host, and each is something you start
or configure. For a zero-egress build: pre-seed the model and parser caches, set
`KARST_OFFLINE=1`, use `KARST_LLM_PROVIDER=local` (or `ask --no-llm`), do not use PR
review, and connect only an MCP client whose model is inside your boundary.

> **Key point for review:** the value-delivering core (`index`, `ask --no-llm`,
> `impact`, `search_code`, `find_impact` over MCP) requires **none** of rows 1–4
> once the one-time model and parser caches exist.

---

## 4. Data residency & retention

- **Residency:** 100% on the customer host. No multi-tenant cloud, no vendor region.
- **Retention:** the index lives in a local directory until you delete it. karst
  retains nothing elsewhere. Re-indexing overwrites in place.
- **Right to delete:** `rm -rf ~/.karst/indexes/<repo>-<hash>` (or your configured `--storage` path).

## 5. Identity, access & auditing (self-hosted gateway)

For single-developer / single-host use, access control is the host's own OS
permissions on `~/.karst/`. For **team deployment**, the (open-core) gateway adds a
single authenticated MCP endpoint with per-team keys and a usage log. SSO/SAML/OIDC,
RBAC, and a SIEM-exportable audit log are on the enterprise roadmap — if your review
requires them today, contact the maintainer to confirm status before deployment.
*(Do not assume enterprise identity features are present in the OSS core.)*

## 6. Supply chain

- **License:** Apache-2.0 (permissive; no copyleft obligations).
- **Direct dependencies** are mainstream, permissively-licensed OSS:
  `tree-sitter` / `tree-sitter-language-pack` (parsing), `fastembed` (ONNX embeddings),
  `qdrant-client` (local vector store), `networkx` (graph), `mcp` (protocol),
  `unidiff` (diff parsing). Optional extras: `anthropic`, `openai`.
- **SBOM:** generate a CycloneDX SBOM in one command — see
  [AIR-GAP-INSTALL.md](AIR-GAP-INSTALL.md) → "Generate an SBOM."
- **Integrity:** releases are published to PyPI via GitHub Actions Trusted Publishing
  (OIDC, no long-lived tokens). Pin to a known version + hashes in your lockfile and
  mirror it internally.

## 7. How to verify everything here yourself

1. **Read the code** — it's Apache-2.0. Start with `karst/` (no network clients;
   the downloads in rows 1–2 and the LLM calls in row 3 come from dependencies).
2. **Run it offline** — follow [AIR-GAP-INSTALL.md](AIR-GAP-INSTALL.md): install from
   a local wheelhouse, disconnect the network, and confirm `index` + `ask --no-llm`
   still work.
3. **Watch the network** — pre-seed the model and parser caches, then run karst
   under your egress monitor / `netstat` / Little Snitch with `KARST_OFFLINE=1` and
   confirm no connections.

---

*This document is a good-faith engineering attestation, not a legal warranty. It
describes karst 0.2.7 in a self-hosted configuration. For a signed copy, a completed
copy of your specific questionnaire, or current status of roadmap items, contact
the maintainer (see the repository README).*
