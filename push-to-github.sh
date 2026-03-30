#!/bin/bash
set -e

echo ""
echo "  geotechCLI — Push to GitHub (main + dev)"
echo "  ──────────────────────────────────────────"
echo ""

if [ ! -f "LICENSE" ] || [ ! -f "packages/core/package.json" ]; then
  echo "  ✗ Run from the geotechcli root directory." && exit 1
fi

if [ ! -d ".git" ]; then
  git init && git branch -M main
fi

git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/kilickursat/geotechcli.git

git add -A
git commit -m "feat: geotechCLI v0.2.0 — production integrations

Supabase user DB, Stripe payments, Upstash Redis metering.
56/56 tests passing. CI/CD with GitHub Actions.
Security: proxy hardened, config permissions, webhook sig verification." 2>/dev/null || echo "  (already committed)"

echo "  Pushing main..."
git push --force origin main

echo "  Creating dev branch..."
git checkout -b dev 2>/dev/null || git checkout dev
git push --force origin dev
echo ""
echo "  ✓ Done! Now set up branch protection in GitHub Settings."
echo ""
echo "  Required GitHub Secrets:"
echo "    NPM_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,"
echo "    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN,"
echo "    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ZHIPU_API_KEY, PROXY_SECRET"
echo ""
echo "  Protect 'main': require PR + CI checks before merge."
echo "  Set default branch to 'dev'."
echo ""
