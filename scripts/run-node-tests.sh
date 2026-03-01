#!/usr/bin/env bash

set -euo pipefail

scope="${1:-all}"

pnpm exec tsc -p tests/tsconfig.json

case "$scope" in
  all)
    search_dir="tests/dist/tests"
    ;;
  unit)
    search_dir="tests/dist/tests/unit"
    ;;
  contracts)
    search_dir="tests/dist/tests/contracts"
    ;;
  *)
    echo "Unknown test scope: $scope" >&2
    exit 1
    ;;
esac

if [[ ! -d "$search_dir" ]]; then
  echo "Compiled test directory not found: $search_dir" >&2
  exit 1
fi

mapfile -d '' test_files < <(find "$search_dir" -type f -name '*.test.js' -print0 | sort -z)

if [[ "${#test_files[@]}" -eq 0 ]]; then
  echo "No compiled test files found in $search_dir" >&2
  exit 1
fi

workspace_node_modules=()
while IFS= read -r path; do
  workspace_node_modules+=("$path")
done < <(find services packages -maxdepth 2 -type d -name node_modules | sort)

node_path_entries=()
if [[ -d "node_modules" ]]; then
  node_path_entries+=("$(pwd)/node_modules")
fi

for entry in "${workspace_node_modules[@]}"; do
  node_path_entries+=("$(pwd)/$entry")
done

if [[ "${#node_path_entries[@]}" -gt 0 ]]; then
  export NODE_PATH
  NODE_PATH="$(IFS=:; printf '%s' "${node_path_entries[*]}")"
fi

node --test "${test_files[@]}"
