#!/usr/bin/env bash
# Deploy the PUBLIC domain rinkhockeyil.com.
#
# WHY THIS EXISTS: `git push` to main auto-deploys ONLY hockey-league-pro.vercel.app.
# The public domain rinkhockeyil.com is a SEPARATE, self-owned Vercel project that
# does NOT auto-deploy. Standing rule (Ariel): ALWAYS run this after pushing web
# changes to main, so the public site never lags behind the -pro preview.
#
# It deploys origin/main (the committed, pushed state) from a CLEAN worktree — NOT
# the working tree — so parallel sessions' uncommitted WIP never leaks to the public
# site. Requires: `vercel` CLI logged into the rinkhockeyil team, and the repo's
# .vercel/ link present (it points the CLI at the rinkhockeyil project).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WT="$(mktemp -d)/rinkdeploy"

echo "→ fetching origin/main…"
git -C "$REPO" fetch origin --quiet

echo "→ creating clean worktree at origin/main…"
git -C "$REPO" worktree add --detach "$WT" origin/main >/dev/null
cp -R "$REPO/.vercel" "$WT/.vercel"
echo "  deploying: $(git -C "$WT" log -1 --oneline)"

echo "→ vercel --prod (remote build)…"
( cd "$WT" && vercel --prod --yes )

echo "→ cleaning up worktree…"
git -C "$REPO" worktree remove "$WT" --force
git -C "$REPO" worktree prune
echo "✓ rinkhockeyil.com is now serving origin/main"
