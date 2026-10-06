# karst — Air-Gapped Install, SBOM & "Prove It Offline"

For the platform / DevEx team. This installs karst with **no internet on the target
host**, generates an SBOM for your records, and gives you a test your security team
can run to confirm zero egress. End state: karst lives in your internal mirror /
golden image and developers receive it pre-installed.

---

## 1. Build an offline bundle (on a connected build host)

```bash
# a) Download karst + all dependencies as wheels into a local folder ("wheelhouse")
python -m pip download "karst==0.2.7" -d ./karst-wheelhouse
#    add the LLM extra only if you intend to use a cloud model:
#    python -m pip download "karst[anthropic]==0.2.7" -d ./karst-wheelhouse

# b) Pre-seed the embedding model cache (one-time, needs internet ONCE)
python -m pip install --no-index --find-links ./karst-wheelhouse karst
karst index .            # downloads the ~65 MB model into ~/.karst/models
#    -> copy ~/.karst/models  alongside the wheelhouse for transfer

# c) Pre-seed the tree-sitter parser cache (one-time, needs internet ONCE).
#    tree-sitter-language-pack ships no grammars in its wheel; it downloads them
#    from github.com on first use. The six languages karst parses:
python -c "from tree_sitter_language_pack import get_parser; [get_parser(n) for n in ('python','javascript','typescript','go','rust','java')]"
python -c "import tree_sitter_language_pack as t; print(t.cache_dir())"
#    -> copy the folder it prints (the 'libs' directory) for transfer
```

Transfer `karst-wheelhouse/`, the `~/.karst/models` folder **and** the parser `libs`
folder to the air-gapped host (USB / one-way diode / approved transfer). The parser
libraries are native code, so the build host and the air-gapped host must share OS
and CPU architecture. The parser cache is not covered by `KARST_OFFLINE=1`.

## 2. Install on the air-gapped host (no internet)

```bash
# Restore the pre-seeded model cache
mkdir -p ~/.karst && cp -r ./models ~/.karst/models

# Install entirely from the local wheelhouse — no PyPI, no network
python -m pip install --no-index --find-links ./karst-wheelhouse karst

# Restore the parser cache to the same path the build host printed in step 1c
# (Linux default: ~/.cache/tree-sitter-language-pack/v1.9.1/libs)
mkdir -p ~/.cache/tree-sitter-language-pack/v1.9.1 && cp -r ./libs ~/.cache/tree-sitter-language-pack/v1.9.1/libs

# Force offline mode for the embedding model (HF_HUB_OFFLINE). This does NOT stop
# the parser download; with the parser cache restored above none is attempted.
export KARST_OFFLINE=1
```

If the host must fetch parsers from an internal mirror instead of copying the
cache, set `TREE_SITTER_LANGUAGE_PACK_MANIFEST_URL` to your mirror's `parsers.json`
(an `https://` or `file://` URL; the manifest's archive URLs and SHA-256 values
must match your mirrored files).

## 3. Run it — fully offline

```bash
cd /path/to/your/repo
karst index .                         # parse + embed + graph, all local
karst ask "how does auth work?" --no-llm     # cited chunks, no LLM, no network
karst impact --target UserModel       # blast-radius, pure local graph walk
```

`--no-llm` returns cited code with zero LLM. To add **on-prem** AI answers, point
karst at a local model and still stay air-gapped:

```bash
export KARST_LLM_PROVIDER=local
export KARST_LLM_BASE_URL=http://localhost:11434/v1   # your internal Ollama/vLLM
karst ask "how does auth work?"
```

## 4. Wire it into the sanctioned dev path

Pick whichever matches your environment — developers then **receive karst
pre-installed and never run `pip install` themselves**:

- **Internal mirror:** publish the wheelhouse to Artifactory / Nexus; devs/CI install
  the pinned, approved version from there.
- **Golden image / dev container:** add the offline install + `~/.karst/models` +
  `KARST_OFFLINE=1` to your base image (Dockerfile / Nix / Packer).
- **Managed workspaces:** bake it into your Coder / Gitpod / VDI template.
- **Central MCP gateway:** run one self-hosted karst MCP endpoint (`karst-mcp --http`
  with `KARST_MCP_TOKEN` set, `KARST_MCP_HOST` set to the interface you serve on and
  `KARST_MCP_ROOTS` limited to the repo folders; see docs/MCP.md for the Host-header
  caveat) that every developer's agent points at — one approved deployment for the
  whole org. (Team identity/audit features: see SECURITY.md §5.)

## 5. Generate an SBOM (CycloneDX)

```bash
python -m pip install cyclonedx-bom
# From an environment where karst is installed:
cyclonedx-py environment -o karst-sbom.json
# …or directly from the locked requirements you mirrored:
cyclonedx-py requirements requirements.txt -o karst-sbom.json
```

Hand `karst-sbom.json` to your supply-chain review. All components are mainstream and
permissively licensed (see SECURITY.md §6).

## 6. "Prove it offline" — the test for your security team

Don't trust the attestation — verify it:

```bash
# 1. Install from the wheelhouse, pre-seed the model and parser caches (steps 1–2 above).
# 2. Physically disconnect the network (or block egress for the user/process).
# 3. Run the core workflow under your egress monitor (netstat / Little Snitch / eBPF):
export KARST_OFFLINE=1
karst index .
karst ask "where is rate limiting enforced?" --no-llm
karst impact --target <some-symbol>
# 4. Confirm: the commands succeed AND your monitor shows ZERO outbound connections.
```

If you want to be exhaustive, also confirm the package has no HTTP client of its own:

```bash
# Expect: no matches in karst's own code
python - <<'PY'
import karst, pathlib, re
root = pathlib.Path(karst.__file__).parent
hits = [p for p in root.rglob("*.py")
        if re.search(r"\b(import\s+requests|import\s+httpx|urllib\.request|urlopen)\b", p.read_text(encoding="utf-8"))]
print("network-client imports in karst/:", hits or "NONE")
PY
```

## 7. What to escalate before deployment

These are honest gaps to confirm with the maintainer if your policy requires them
*today* (they are not in the OSS core yet):

- SSO/SAML/OIDC + SCIM and RBAC on the team gateway.
- SIEM-exportable, tamper-evident audit log.
- A signed/dated copy of your specific vendor questionnaire.

Everything else above is reproducible by you, right now, with no vendor involvement.
