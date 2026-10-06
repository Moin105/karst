# karst impact gate for Claude Code

A PreToolUse hook. Before Claude edits a file, it asks karst how far the change reaches. If the blast radius is CRITICAL, you get a yes/no prompt.

It is a plain script. No language model runs in it. It uses only the Python standard library and talks to karst through its command line.

## What it does

1. Reads the hook JSON from stdin.
2. Skips anything that is not an `Edit`, `Write` or `MultiEdit` of a code file karst parses.
3. Works out which lines the edit changes in the current file.
4. Maps those lines to symbols with `karst analyze`.
5. Runs `karst impact` on each symbol (or on the whole file for module-level code).
6. Asks you when the risk is at or above the threshold. Otherwise it stays silent.

It fails closed. If karst is missing, slow, broken, has no graph, or has no node for the edited symbol, it asks. It never allows because something went wrong. "No node found" is treated as a coverage gap, not as "nothing depends on this".

The gate never returns `deny` and never exits 2. It asks. There is no switch that turns it off.

## Install

1. Install a karst build that has the decorated-method chunker fix. It is on `main` and not on PyPI yet: `pip install git+https://github.com/Moin105/karst`. karst 0.2.10 and earlier drop methods such as httpx's `Client.request` from the graph, so the gate would report a coverage gap for them.
2. Build the graph for your repo, once, and again when the code has moved on:

   ```
   karst graph-index /path/to/repo
   ```

   The graph root must be the repo root. The gate uses the nearest parent directory with a `.git`, or the session `cwd` if there is none.

3. Copy both files from `contrib/claude-code/` in the karst repo into your hooks folder. The shim finds the `.py` next to itself.

   ```
   cd contrib/claude-code
   cp karst-impact-gate.sh karst_impact_gate.py ~/.claude/hooks/
   chmod +x ~/.claude/hooks/karst-impact-gate.sh ~/.claude/hooks/karst_impact_gate.py
   ```

4. Register it in `~/.claude/settings.json` (or the project's `.claude/settings.json`):

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Write|Edit|MultiEdit",
           "hooks": [
             {
               "type": "command",
               "command": "~/.claude/hooks/karst-impact-gate.sh",
               "timeout": 60
             }
           ]
         }
       ]
     }
   }
   ```

   Without bash you can point `command` at `python3 ~/.claude/hooks/karst_impact_gate.py` instead.

By default the gate runs karst as `<its own python> -m karst`. If karst lives in another environment, set `KARST_BIN`, for example `KARST_BIN=/path/to/venv/bin/karst`.

## Configuration

All settings are environment variables. None of them disables the gate.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KARST_GATE_ASK_AT` | `CRITICAL` | Lowest risk that asks. One of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. Any other value makes the gate ask. |
| `KARST_GATE_TIMEOUT` | `8` | Seconds allowed for each karst call. |
| `KARST_BIN` | `<python> -m karst` | The karst command, split with `shlex`. |
| `KARST_GRAPH_PATH` | `~/.karst/indexes/<repo dir name>/graph.pkl` | Graph file. The default is where `karst graph-index` writes. |
| `KARST_GATE_LOG` | `~/.claude/global-observation/karst-gate-log.jsonl` | Decision log. |

Each decision adds one JSON line to the log: `ts`, `tool`, `file`, `targets`, `decision`, `risk`, `affected`, `reason`, `elapsed_ms`. A logging failure never changes the decision.

## Decision table

| Situation | Decision |
| --- | --- |
| Tool is not Edit, Write or MultiEdit | allow |
| Input is not valid JSON, or `tool_name` is missing | ask |
| Gated tool without `file_path` (or Write without `content`) | ask |
| Extension is not one karst parses (`.py .pyi .js .jsx .mjs .cjs .ts .tsx .go .rs .java`) | allow |
| File does not exist yet (new file) | allow |
| File is outside the repo root, or under a hidden, vendored or build directory (`.git`, `node_modules`, `vendor`, `build`, `dist`, `target`, ...) | allow, logged |
| `old_string` is not in the file, or a Write changes nothing | allow (the Edit tool rejects a bad `old_string` itself) |
| No graph file | ask: run `karst graph-index` |
| karst missing, times out, exits non-zero, or prints something unreadable | ask, with the cause |
| Edited symbol has no node in the graph | ask: coverage gap |
| Invalid `KARST_GATE_ASK_AT` or `KARST_GATE_TIMEOUT` | ask |
| Any bug inside the gate | ask |
| Risk is at or above `KARST_GATE_ASK_AT` | ask: names the symbol, risk, count and up to 5 top callers |
| Risk is below the threshold | allow |

Example ask reason (httpx):

```
karst-impact-gate: editing httpx/_client.py::BaseClient._merge_url — blast radius CRITICAL (63 affected). Top callers: BaseClient.build_request (httpx/_client.py:340), Client.request (...), ... (+N tests). Approve to continue.
```

How the top callers are chosen:

- Non-test code comes before tests. A path is test code if a directory is `tests`, `test` or `__tests__`, or the file is named `test_*`, `*_test.*`, `test.*`, `tests.*`, `*.test.*` or `*.spec.*`.
- Then nearer callers come first (depth 1 before depth 2), then karst's score.
- The class or file that merely contains the edited symbol is skipped.
- It lists up to 5. If there are fewer than 5 non-test callers, tests fill the list. `(+N tests)` counts the tests that did not fit.

Risk labels come from karst: `none`, `low`, `medium`, `high`, `critical`. karst scores by direct dependents and total affected nodes. It counts the containing class and file as dependents, so even a method nobody calls scores at least `medium`. That is why the default threshold is `CRITICAL`.

## How edits become targets

- Edit and MultiEdit: each `old_string` is located in the current file (all matches with `replace_all`, otherwise the first).
- Write over an existing file: old and new content are diffed by line. Changed old lines are the edited range.
- Each range maps to the innermost function, method or class that overlaps it. Edited lines outside every symbol (imports, constants) target the whole file with `--file`.
- More than 6 symbols in one edit is judged at file level.
- CRLF files are handled.

## Known limitations

- **Latency.** Each gated edit starts karst twice (`analyze`, then `impact`). A cold `python -m karst` takes about 1.1 s on the machine this was built on, mostly import time. An edit on httpx takes about 2.4 s. Edits that need no karst call (docs, new files) are instant.
- **The graph can be stale.** The gate does not rebuild it. A symbol added since the last `graph-index` is reported as a coverage gap. A symbol whose callers changed since then is judged on the old edges.
- **Call edges are best effort.** karst matches calls by name. Counts can be too high or too low.
- **Output format.** `karst impact --jsonl` prints the risk and the affected count on stderr (`Affected: N  Risk: LEVEL`), and the callers on stdout. The gate reads both. If a future karst changes this, the gate asks instead of guessing. Pin the karst version you test with.
- **Graph root.** If the graph was built from a subdirectory of the git root, names will not match and every edit is a coverage gap. Build the graph from the repo root.
- **`.gitignore`.** The gate does not read it. A file karst skipped because it is git-ignored shows up as a coverage gap.
- **File size.** karst skips files over 1.5 MB, so edits to them show up as a coverage gap.
- **Exact matching.** `old_string` is matched exactly. If the Edit tool would still accept an `old_string` that only matches after its own quote normalization, the gate does not see it and allows.
- **MultiEdit chains.** If a later edit only matches text created by an earlier edit, its range is taken from the earlier edit.
- **Not gated.** `NotebookEdit`, and shell commands that change files (`sed -i`, redirects), are not covered by this matcher.
- **Windows.** The shim needs Git Bash (Claude Code on Windows has it). `KARST_BIN` is split in non-POSIX mode so Windows paths keep their backslashes. Wrap paths with spaces in double quotes.
- **Extension and skip lists are copies.** They come from `karst/languages.py` and `karst/walker.py`. Update them when karst adds a language.

## Tests

From the karst repo root:

```
python -m pytest -q tests/test_impact_gate.py
```

The tests run the gate as a subprocess with synthetic hook JSON. They build a graph of `tests/fixtures/httpx_like`, copy the fixture into a temp repo, and use karst from this checkout (`PYTHONPATH`). They take about 30 seconds because each karst call is a fresh process. The shim test runs only where a POSIX bash exists.
