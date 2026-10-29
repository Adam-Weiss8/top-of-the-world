#!/bin/bash
# Double-click this to write questions. macOS may ask once to allow it to run.
cd "$(dirname "$0")" || exit 1

echo
echo "  Top of the World - question writer"
echo

if ! command -v git >/dev/null 2>&1; then
  echo "  Git isn't installed on this computer yet."
  echo "  Ask Adam to set it up. Nothing is broken."
  echo
  read -r -p "  Press return to close." _
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "  Node isn't installed on this computer yet."
  echo "  If you just installed it, close Terminal and double-click this again."
  echo "  Ask Adam to set it up. Nothing is broken."
  echo
  read -r -p "  Press return to close." _
  exit 1
fi

# A previous run may have been interrupted part-way through an update, which leaves the copy
# in a state where Publish refuses to work. These are no-ops if all is well.
git rebase --abort >/dev/null 2>&1
git merge --abort >/dev/null 2>&1

echo "  Getting everyone's latest questions..."
if ! git pull --rebase --autostash; then
  # Never leave a half-finished update behind - that's what strands people.
  git rebase --abort >/dev/null 2>&1
  echo
  echo "  Couldn't get everyone's latest questions just now."
  echo "  Your own work is safe. You can still write, and press Publish later."
  echo
fi

echo "  Getting ready..."
npm install --silent

echo
echo "  Opening the question writer in your browser."
echo "  Keep this window open while you work, then just close it."
echo
npm run dev -- --open /admin.html

echo
echo "  Stopped. You can close this window."
read -r -p "  Press return to close." _
