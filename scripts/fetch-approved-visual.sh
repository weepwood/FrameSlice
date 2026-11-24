#!/usr/bin/env bash
set -euo pipefail
DEST="${1:?destination required}"
mkdir -p "$DEST"
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
run=$(python3 -c 'import json; print(int(json.load(open("visual-baseline/approval.json"))["runId"]))')
tag=$(python3 -c 'import json; print(json.load(open("visual-baseline/approval.json"))["releaseTag"])')
asset="visual-baseline-$tag.zip"
if gh release download "$tag" --pattern "$asset" --dir "$tmp" --repo "$GITHUB_REPOSITORY" 2>/dev/null; then
  python3 - "$tmp/$asset" "$DEST" <<'PY'
import zipfile,sys,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 for n in z.namelist():
  if n.endswith(".png") and pathlib.Path(n).name==n: pathlib.Path(sys.argv[2],n).write_bytes(z.read(n))
PY
else
  gh run download "$run" --name workbench-regression-1 --dir "$tmp" --repo "$GITHUB_REPOSITORY"
  cp "$tmp"/visual-candidate/*.png "$DEST"/
fi
