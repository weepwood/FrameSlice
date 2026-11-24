"""Fail closed for missing, corrupt or mismatched approved screenshots."""
import sys,hashlib,json
from pathlib import Path
a=json.loads(Path("visual-baseline/approval.json").read_text())
base=Path(sys.argv[1])
names={f"{mode}-{theme}-{width}.png" for mode in ("split","frames","captions","jobs") for theme in ("light","dark") for width in (1440,390)}
images={x["name"]:x for x in a["images"]}
assert a["schema"]==1 and len(a["images"])==16 and set(images)==names
assert {p.name for p in base.glob("*.png")}==names
for name,x in images.items():
 assert hashlib.sha256((base/name).read_bytes()).hexdigest()==x["sha256"],name+" baseline digest mismatch"
if len(sys.argv)>2:
 current=Path(sys.argv[2])
 c=json.loads((current/"candidate.json").read_text())
 assert c["chrome"]==a["chrome"],"Browser version changed; explicit baseline review required"
 assert {x["name"] for x in c["images"]}==names
 for x in c["images"]:
  assert hashlib.sha256((current/x["name"]).read_bytes()).hexdigest()==x["sha256"],x["name"]+" current digest mismatch"
print("approved visual hashes and complete candidate set verified")
