#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 || -z "$1" ]]; then
  echo "Usage: $0 \"commit message\"" >&2
  exit 1
fi

commit_message="$1"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Including current working-tree changes in the release commit."
fi

echo "Building the current package..."
pnpm run build
test -s dist/plugin_package.zip

next_version="$(node scripts/bump-version.mjs)"

echo "Bumped version to $next_version."
echo "Building the release package..."
pnpm run build
test -s dist/plugin_package.zip

built_version="$(unzip -p dist/plugin_package.zip manifest.json | node -e 'let input=""; process.stdin.on("data", c => input += c); process.stdin.on("end", () => process.stdout.write(JSON.parse(input).version));')"
if [[ "$built_version" != "$next_version" ]]; then
  echo "Built manifest version $built_version does not match $next_version." >&2
  exit 1
fi

git diff --check
git add -A
git commit -m "$commit_message"
git push origin main
gh workflow run release.yml --ref main

echo "Release workflow started for $next_version."
