#!/usr/bin/env sh
# scripts/tidy.sh — bring this clone back to "just main", the way GitHub looks
# after a merge.
#
#   npm run tidy
#
# A branch lives for one piece of work: branch → PR → merge → GitHub deletes
# the head branch → this command deletes the local copy. Everything it removes
# is a branch whose remote is already gone, and every deletion is printed with
# its commit so `git branch <name> <sha>` brings it straight back.
#
# It never touches main, never touches the branch you are standing on, and
# refuses to run at all while the working tree is dirty.

set -e

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Working tree is not clean — commit or stash first, then run again."
  git status --short
  exit 1
fi

echo "→ Fetching and pruning…"
git fetch origin --prune --quiet

current=$(git rev-parse --abbrev-ref HEAD)
if [ "$current" != "main" ]; then
  echo "→ Switching from $current to main…"
  git checkout --quiet main
fi

echo "→ Updating main…"
git pull --ff-only --quiet origin main

# A branch whose upstream is [gone] was merged and deleted on GitHub. Anything
# that never had an upstream is unpushed work in progress and is left alone.
gone=$(git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads \
  | awk '$2 == "[gone]" { print $1 }' \
  | grep -v '^main$' || true)

if [ -z "$gone" ]; then
  echo "✓ Nothing to tidy · main $(git rev-parse --short HEAD)"
  exit 0
fi

count=0
for b in $gone; do
  sha=$(git rev-parse --short "$b")
  echo "  deleting $b ($sha)"
  git branch -D "$b" > /dev/null
  count=$((count + 1))
done

echo "✓ $count branch(es) deleted · main $(git rev-parse --short HEAD)"
echo "  (to bring one back: git branch <name> <sha> — the shas are printed above)"
