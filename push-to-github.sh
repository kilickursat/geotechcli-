#!/bin/bash
set -e

echo ""
echo "  geotechCLI branch helper"
echo ""

if [ ! -d ".git" ]; then
  echo "  This helper must be run from a real git clone."
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"

if [ "$branch" = "main" ] || [ "$branch" = "strong-beta" ]; then
  echo "  Direct pushes to $branch are discouraged."
  echo "  Open a PR instead:"
  echo "    feature/* -> master"
  echo "    master -> strong-beta"
  echo "    strong-beta -> main"
  exit 1
fi

echo "  Pushing current branch: $branch"
git push -u origin "$branch"
echo ""
echo "  Suggested PR flow:"
echo "    feature/* -> master"
echo "    master -> strong-beta"
echo "    strong-beta -> main"
echo ""
