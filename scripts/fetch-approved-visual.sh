#!/usr/bin/env bash
set -euo pipefail
DEST="${1:?destination required}"
mkdir -p "$DEST"
tmp=$(mktemp -d);trap 'rm -rf "$tmp"' EXIT
run=$(python3 -c 'import json; print(int(json.load(open("visual-baseline/approval.json"))["runId"]))')
tag=$(python3 -c 'import json; print(json.load(open("visual-baseline/approval.json"))["releaseTag"])')
asset=$(python3 -c 'import json; a=json.load(open("visual-baseline/approval.json")); print(a.get("assetName","visual-baseline-"+a["releaseTag"]+".zip"))')
[[ "$asset" =~ ^visual-baseline-[a-zA-Z0-9._-]+\.zip$ ]] || { echo "Invalid baseline asset name" >&2; exit 1; }
if gh release download "$tag" --pattern "$asset" --dir "$tmp" --repo "$GITHUB_REPOSITORY" 2>/dev/null; then
  python3 - "$tmp/$asset" "$DEST" <<'PY'
import zipfile,sys,pathlib
with zipfile.ZipFile(sys.argv[1]) as z:
 for n in z.namelist():
  if n.endswith(".png") and pathlib.Path(n).name==n: pathlib.Path(sys.argv[2],n).write_bytes(z.read(n))
PY
else
  attempt=$(python3 -c 'import json; print(int(json.load(open("visual-baseline/approval.json")).get("runAttempt",1)))')
  id=$(python3 -c 'import json; print(int(json.load(open("visual-baseline/approval.json"))["artifactId"]))')
  gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id" | jq -e --argjson id "$id" --argjson run "$run" --arg name "workbench-regression-$attempt" '.id == $id and .workflow_run.id == $run and .name == $name and .expired == false' >/dev/null
  gh run download "$run" --name "workbench-regression-$attempt" --dir "$tmp" --repo "$GITHUB_REPOSITORY"
  cp "$tmp"/visual-candidate/*.png "$DEST"/
fi
