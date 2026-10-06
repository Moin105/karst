#!/usr/bin/env bash
# Shim: runs karst_impact_gate.py (next to this file) with python3, else python.
# stdin (the PreToolUse JSON) passes straight through to the gate.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for py in python3 python; do
  "$py" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null && exec "$py" "$here/karst_impact_gate.py"
done
# No usable Python 3.10+. Fail closed: ask instead of allowing.
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"karst-impact-gate: fail-closed: no Python 3.10+ found (python3 or python), so the gate could not run. Approve to continue without the check."}}'
exit 0
