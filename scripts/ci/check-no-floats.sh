#!/usr/bin/env bash
set -euo pipefail

# SV-08 / RTSD-03: Zero binary floats (f32/f64) in financial, app, and Tauri shell Rust crates,
# and mandatory serde_json arbitrary_precision so exchange JSON decimals never round-trip via f64.
REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
CRATES=(
  "crates/allegedly-core/src"
  "crates/allegedly-ipc/src"
  "crates/allegedly-ingest/src"
  "crates/allegedly-storage/src"
  "crates/allegedly-orderflow/src"
  "crates/allegedly-replay/src"
  "crates/allegedly-oms/src"
  "crates/allegedly-app/src"
  "apps/desktop/src-tauri/src"
)

FOUND=0
for dir in "${CRATES[@]}"; do
  target="$REPO_ROOT/$dir"
  if [[ -d "$target" ]]; then
    # Catch standalone f32/f64 tokens AND float-conversion methods (as_f64, to_f64, from_f64, etc.)
    if grep -rnE '(^|[^[:alnum:]_])(f32|f64)([^[:alnum:]_]|$)|(_f32|_f64|as_f32|as_f64|to_f32|to_f64|from_f32|from_f64)' "$target" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//' ; then
      echo "FAIL [SV-08]: Forbidden f32/f64 token or float conversion detected in $dir" >&2
      FOUND=1
    fi
  fi
done

# Verify serde_json arbitrary_precision is enabled in workspace Cargo.toml so JSON numbers never parse via f64
if ! grep -qE 'serde_json[[:space:]]*=.*arbitrary_precision' "$REPO_ROOT/Cargo.toml"; then
  echo "FAIL [SV-08]: Root Cargo.toml must enable serde_json arbitrary_precision feature" >&2
  FOUND=1
fi

if [[ "$FOUND" -ne 0 ]]; then
  exit 1
fi
echo "PASS [SV-08]: 0 f32/f64 occurrences across all 9 financial/app/shell crates + serde_json arbitrary_precision verified."
