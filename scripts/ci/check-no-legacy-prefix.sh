#!/usr/bin/env bash
set -euo pipefail

# ADR-0001 §3.2: Hard-ban retired legacy crate prefixes, file extensions, and brand names in production code.
REPO_ROOT="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
BANNED_REGEX='\b(mv-[a-z0-9_-]+|mv_[a-z0-9_-]+|MotiveView|MotiveScript)\b|\.mv(vault|depth|workspace|analysis|template)'

TARGETS=(
  "Cargo.toml"
  "crates"
  "packages"
  "apps"
  "schemas"
)

FOUND=0
for item in "${TARGETS[@]}"; do
  target="$REPO_ROOT/$item"
  if [[ -e "$target" ]]; then
    if grep -rnE --exclude-dir=node_modules --exclude-dir=target --exclude-dir=dist "$BANNED_REGEX" "$target"; then
      echo "FAIL [ADR-0001]: Retired legacy prefix/extension detected in $item" >&2
      FOUND=1
    fi
  fi
done

if [[ "$FOUND" -ne 0 ]]; then
  exit 1
fi
echo "PASS [ADR-0001]: 0 retired legacy prefixes/extensions in production tree."
