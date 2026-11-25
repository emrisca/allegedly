#!/usr/bin/env bash
set -euo pipefail

# SV-08: Zero binary floats (f32/f64) in financial Rust crates.
# Scans crates/{allegedly-core,allegedly-ipc,allegedly-ingest,allegedly-storage,allegedly-orderflow,allegedly-replay,allegedly-oms}/src
REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
CRATES=(
  "crates/allegedly-core/src"
  "crates/allegedly-ipc/src"
  "crates/allegedly-ingest/src"
  "crates/allegedly-storage/src"
  "crates/allegedly-orderflow/src"
  "crates/allegedly-replay/src"
  "crates/allegedly-oms/src"
)

FOUND=0
for dir in "${CRATES[@]}"; do
  target="$REPO_ROOT/$dir"
  if [[ -d "$target" ]]; then
    # Ignore pure line comments (// ...) and match word-bounded f32 or f64
    if grep -rnE '(^|[^[:alnum:]_])(f32|f64)([^[:alnum:]_]|$)' "$target" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*//' ; then
      echo "FAIL [SV-08]: Forbidden f32/f64 token detected in $dir" >&2
      FOUND=1
    fi
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  exit 1
fi
echo "PASS [SV-08]: 0 f32/f64 occurrences in financial crates."
