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
  echo "  Ask Adam to set it up. Nothing is broken."
  echo
  read -r -p "  Press return to close." _
  exit 1
fi

echo "  Getting everyone's latest questions..."
if ! git pull --rebase --autostash; then
  echo
  echo "  Couldn't reach GitHub, so you may not have the newest questions."
  echo "  You can still write - press Publish when you're back online."
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
