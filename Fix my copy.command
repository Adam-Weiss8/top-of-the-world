#!/bin/bash
# Double-click to repair a copy that Publish says is in a bad state.
# Nothing you have written can be lost: src/data is copied aside before anything else happens.
cd "$(dirname "$0")" || exit 1

echo
echo "  Fixing this copy of Top of the World"
echo
echo "  Your unpublished questions are copied somewhere safe first,"
echo "  so nothing you have written can be lost."
echo

if ! command -v git >/dev/null 2>&1; then
  echo "  Git isn't installed, so there is nothing to fix here. Ask Adam."
  echo
  read -r -p "  Press return to close." _
  exit 1
fi

BACKUP="rescued-questions/$(date +%Y%m%d-%H%M%S)"
echo "  1. Copying everything in src/data to $BACKUP"
mkdir -p "$BACKUP"
cp -R src/data/. "$BACKUP"/ 2>/dev/null || true

echo "  2. Undoing any half-finished update"
git rebase --abort >/dev/null 2>&1
git merge --abort >/dev/null 2>&1

echo "  3. Going back to the shared copy"
git checkout main >/dev/null 2>&1
git fetch origin
git reset --hard origin/main >/dev/null 2>&1

echo "  4. Putting your unpublished questions back"
if [ -d "$BACKUP/inbox" ]; then
  mkdir -p src/data/inbox
  cp -R "$BACKUP/inbox/." src/data/inbox/ 2>/dev/null || true
fi

echo
echo "  Done. This copy is on \"$(git rev-parse --abbrev-ref HEAD)\" and matches GitHub again."
echo
echo "  Everything src/data held before the fix is in the folder:"
echo "      $BACKUP"
echo "  You can delete it once you are sure nothing is missing."
echo
echo "  Now double-click \"Write questions\" as usual."
echo
read -r -p "  Press return to close." _
