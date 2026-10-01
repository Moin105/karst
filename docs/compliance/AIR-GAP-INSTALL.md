# karst — Air-Gapped Install, SBOM & "Prove It Offline"

For the platform / DevEx team. This installs karst with **no internet on the target
host**, generates an SBOM for your records, and gives you a test your security team
can run to confirm zero egress. End state: karst lives in your internal mirror /
golden image and developers receive it pre-installed.

---

## 1. Build an offline bundle (on a connected build host)

```bash
# a) Download karst + all dependencies as wheels into a local folder ("wheelhouse").
#    Pin the version you approved, e.g. "karst==<version>".
python -m pip download karst -d ./karst-wheelhouse
#    add the LLM extra only if you intend to use a cloud model:
#    python -m pip download "karst[anthropic]" -d ./karst-wheelhouse

# b) Pre-seed the embedding model cache (one-time, needs internet ONCE)
python -m pip install --no-index --find-links ./karst-wheelhouse karst
karst index .            # downloads the ~65 MB model into ~/.karst/models
#    -> copy ~/.karst/models  alongside the wheelhouse for transfer
```

Build the wheelhouse on the same OS, CPU architecture and Python version as the
target host: several dependencies ship compiled wheels.

The tree-sitter grammars karst parses with are compiled into the
`tree-sitter-language-pack` wheel (karst pins its 0.13.x line), so they travel in
the wheelhouse and nothing is fetched at runtime. **karst 0.2.10 and earlier**
allow `tree-sitter-language-pack` 1.x, which downloads each grammar from GitHub on
first use and fails on an air-gapped host. If you mirror one of those versions,
constrain it when you download:

```bash
python -m pip download "karst==0.2.10" "tree-sitter-language-pack>=0.13,<1" -d ./karst-wheelhouse
```

Transfer `karst-wheelhouse/` **and** the `~/.karst/models` folder to the air-gapped
host (USB / one-way diode / approved transfer).

## 2. Install on the air-gapped host (no internet)

```bash
# Restore the pre-seeded model cache
mkdir -p ~/.karst && cp -r ./models ~/.karst/models

# Install entirely from the local wheelhouse — no PyPI, no network
python -m pip install --no-index --find-links ./karst-wheelhouse karst

# Force fully-offline mode: the embedder reads only the cached model, and
# karst refuses any grammar download (a guard in case a 1.x language pack
# ever lands in the environment)
export KARST_OFFLINE=1
```

## 3. Run it — fully offline

```bash
cd /path/to/your/repo
karst quickstart .                    # parse + embed + graph + packs, all local
karst ask "how does auth work?" --no-llm     # cited chunks, no LLM, no network
karst impact --target UserModel --graph-path "$(karst where)/graph.pkl"   # blast radius, local graph walk
```

The index lands in `~/.karst/indexes/<repo>-<id>` (`<id>` comes from the repo's
absolute path, so two checkouts with the same folder name never share one);
`karst where` prints it.

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
- **Central MCP gateway:** run one self-hosted karst MCP endpoint (`karst-mcp --http`,
  behind `KARST_MCP_TOKEN`) that every developer's agent points at — one approved
  deployment for the whole org. (Team identity/audit features: see SECURITY.md §5.)

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
# 1. Install from the wheelhouse, pre-seed the model (steps 1–2 above).
# 2. Physically disconnect the network (or block egress for the user/process).
# 3. Run the core workflow under your egress monitor (netstat / Little Snitch / eBPF):
export KARST_OFFLINE=1
karst quickstart .
karst ask "where is rate limiting enforced?" --no-llm
karst impact --target <some-symbol> --graph-path "$(karst where)/graph.pkl"
# 4. Confirm: the commands succeed AND your monitor shows ZERO outbound connections.
```

karst's own CI runs the same flow on every change: the install-smoke workflow
runs `quickstart` and `ask` on Linux inside a network namespace with no
interfaces, with `KARST_OFFLINE=1`, and checks on every OS that the installed
language pack bundles its grammars.

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
