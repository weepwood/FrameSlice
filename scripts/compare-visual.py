"""Compare explicitly approved PNG baselines against a new CI artifact.
Requires Pillow. Never creates or updates baselines automatically.
"""
import argparse, json
from pathlib import Path
from PIL import Image, ImageChops
p=argparse.ArgumentParser()
p.add_argument("baseline",type=Path)
p.add_argument("current",type=Path)
p.add_argument("--output",type=Path,default=Path("visual-diff"))
p.add_argument("--threshold",type=float,default=.02)
a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=True)
report=[]
for path in sorted(a.baseline.glob("*.png")):
    current=a.current/path.name
    row={"name":path.name}
    if not current.exists():
        row.update(passed=False,reason="missing current screenshot")
    else:
        x,y=Image.open(path).convert("RGB"),Image.open(current).convert("RGB")
        if x.size!=y.size:
            row.update(passed=False,reason="dimensions changed")
        else:
            diff=ImageChops.difference(x,y)
            mask=ImageChops.lighter(ImageChops.lighter(*diff.split()[:2]),diff.split()[2]).point(lambda v:255 if v>16 else 0)
            ratio=mask.histogram()[255]/(x.width*x.height)
            diff.save(a.output/path.name)
            row.update(passed=ratio<=a.threshold,changedRatio=ratio)
    report.append(row)
if not report: raise SystemExit("No approved baseline PNGs")
(a.output/"report.json").write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
raise SystemExit(0 if all(x["passed"] for x in report) else 1)
