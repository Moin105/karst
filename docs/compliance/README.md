# karst — Compliance & Air-Gap Pack

> For the platform / DevEx / security engineer evaluating karst for a regulated
> or air-gapped environment. Hand these documents to your AppSec / procurement
> team — they are written to answer their questions, not a developer's.

## The one-paragraph version

**You are not procuring a SaaS vendor. You are installing an open-source library
you can read and run entirely inside your own perimeter.** karst's own code
contains **no network client** — no telemetry, no phone-home, no license server,
no sub-processors; the CLI sends nothing anywhere by itself. It indexes your code,
builds a dependency graph, and answers questions *on the machine it runs on*. In a
fully air-gapped configuration (parser and model caches pre-seeded, no cloud LLM),
**nothing — including your source code — ever leaves your boundary.** Because it's
Apache-2.0 and source-available, your security team can verify every claim below
by reading the code instead of trusting us. The full list of what can reach the
network is the table in
[What leaves your machine](../../README.md#what-leaves-your-machine).

## What's in this pack

| Document | Purpose | Hand to |
|----------|---------|---------|
| [SECURITY.md](SECURITY.md) | Air-gap attestation, data-flow & trust boundary, full network-egress table, data residency | AppSec / security review |
| [SECURITY-QUESTIONNAIRE.md](SECURITY-QUESTIONNAIRE.md) | Pre-filled answers to the standard vendor questionnaire (CAIQ / SIG-style) | Procurement / vendor risk |
| [AIR-GAP-INSTALL.md](AIR-GAP-INSTALL.md) | Install from your internal mirror with no internet, generate an SBOM, and run the "prove it offline" test yourself | Platform / DevEx team |

## Why the review is lighter than a typical AI tool

| Typical cloud AI coding tool | karst (self-hosted) |
|---|---|
| Source code transits the vendor's cloud | Source never leaves the machine |
| Vendor data-residency / sub-processor review | No data leaves the boundary → nothing to assess |
| Trust a black-box binary / API | Read the Apache-2.0 source |
| Telemetry & usage analytics to whitelist | None — no phone-home |
| New-vendor onboarding + DPA + SOC 2 of *their* cloud | Installs from your mirror like any vetted library |

The structural fact that collapses most of a vendor questionnaire: **there is no
data flow to assess.** A cloud architecture cannot make that claim; karst can,
and you can prove it (see [AIR-GAP-INSTALL.md](AIR-GAP-INSTALL.md) → "Prove it
offline").

## Scope & honesty note

karst has two **one-time downloads** and two **optional, operator-chosen
integrations** that *can* reach the network, all documented in
[SECURITY.md](SECURITY.md):

1. **Tree-sitter parsers** — downloaded once from GitHub releases by the
   `tree-sitter-language-pack` dependency, SHA-256 checked, then cached. Pre-seed
   the cache for an air-gapped host. No code is sent.
2. **The embedding model** — downloaded once from huggingface.co, then cached.
   `KARST_OFFLINE=1` blocks it. No code is sent.
3. **A cloud LLM** for written answers (`ask`) and reviews (`review`) — only if *you*
   configure an Anthropic/OpenAI key. Use a local model (`--llm local`, e.g. Ollama)
   or, for `ask`, retrieval-only (`--no-llm`) and no prompt ever leaves the box.
4. **GitHub PR review** (`karst review --pr`) — shells out to *your* `gh` CLI. Don't
   use that one command and there is no GitHub traffic.

The core — `index`, `ask --no-llm`, `impact`, `search` — never touches the network
once the parser and embedding-model caches exist locally. One more path sits
outside karst: the MCP server hands retrieved code to whichever MCP client you
connect, and that client may forward it to its own model provider.

One known limitation, stated plainly: the local vector store (`qdrant-client`) loads
pickled data when it opens an index, so write access to the index directory is code
execution as the karst user. karst keeps the directories private and refuses stores
owned by another user; see [SECURITY.md](SECURITY.md) §2.

---

*Pack version tracks the karst release it ships with. Current: karst 0.2.7,
Apache-2.0. Maintainer attestation in [SECURITY.md](SECURITY.md).*
