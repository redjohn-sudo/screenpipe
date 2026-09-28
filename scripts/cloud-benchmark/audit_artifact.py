# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Read-only integrity/context audit of downloaded Mac evidence; requires Pillow."""
import collections
import hashlib
import json
import pathlib
import re
import sqlite3
import sys

from PIL import Image

root = pathlib.Path(sys.argv[1]).resolve()
report = {}
ocr_paths = []
for mode in ("auto", "low_impact", "more_detail"):
    folder = root / "benchmark" / mode
    if not (folder / "frames.json").exists():
        report[mode] = {"complete": False, "reason": "No frame export"}
        continue
    frames = json.loads((folder / "frames.json").read_text())
    by_id = {row["id"]: row for row in frames}
    elements = json.loads((folder / "elements.json").read_text())
    elements_by_frame = collections.defaultdict(list)
    for row in elements:
        elements_by_frame[row["frame_id"]].append(row)
    images = collections.defaultdict(list)
    for path in (folder / "data").rglob("*"):
        if path.is_file() and path.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            images[path.name].append(path)
    counts = {}
    databases = list((folder / "data").rglob("*.sqlite"))
    if (folder / "database-snapshot.sqlite").exists():
        databases.append(folder / "database-snapshot.sqlite")
    for db in databases:
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro&immutable=1", uri=True)
            counts[str(db.relative_to(root))] = {
                table: con.execute(f"select count(*) from {table}").fetchone()[0]
                for table in ("frames", "ui_events", "elements")
            }
            con.close()
        except sqlite3.Error as error:
            counts[str(db.relative_to(root))] = {"error": str(error)}
    audited = []
    for frame in frames:
        title = frame.get("window_name") or ""
        match = re.search(r"Cloud Benchmark ([AB])", title)
        expected = match.group(1) if match else None
        source, seen, ref_error = frame["id"], set(), None
        while source in by_id and by_id[source].get("elements_ref_frame_id") is not None:
            if source in seen:
                ref_error = "Reference cycle"
                break
            seen.add(source)
            source = by_id[source]["elements_ref_frame_id"]
        if source not in by_id:
            ref_error = "Missing referenced frame"
        pages = lambda value: sorted(set(re.findall(r"\b([AB])\s+ROW\s+\d+", value or "")))
        contexts = {
            "text": pages(frame.get("accessibility_text")),
            "tree": pages(frame.get("accessibility_tree_json")),
            "elements": pages(" ".join(str(x.get("text") or "") for x in elements_by_frame[source])),
        }
        row = {
            "frameId": frame["id"], "timestamp": frame["timestamp"],
            "title": title, "expectedPage": expected, "contexts": contexts,
            "referenceError": ref_error, "elementSourceFrameId": source,
            "mismatches": [key for key, value in contexts.items() if expected and value and value != [expected]],
        }
        paths = images[pathlib.Path(frame.get("snapshot_path") or "").name]
        if len(paths) != 1:
            row["imageError"] = f"Expected one saved image; found {len(paths)}"
        else:
            path = paths[0]
            row["image"] = str(path.relative_to(root))
            row["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            try:
                with Image.open(path) as im:
                    im.load()
                    row["dimensions"] = list(im.size)
                    row["extrema"] = im.convert("RGB").getextrema()
                ocr_paths.append(str(path))
            except Exception as error:
                row["imageError"] = str(error)
        audited.append(row)
    report[mode] = {
        "complete": True, "databaseCountsWithoutWal": counts,
        "exportCounts": {name: len(json.loads((folder / f"{name}.json").read_text())) for name in ("frames", "ui_events", "elements")},
        "framesAudited": len(audited),
        "imageErrors": sum("imageError" in x for x in audited),
        "referenceErrors": sum(bool(x["referenceError"]) for x in audited),
        "contextMismatches": sum(bool(x["mismatches"]) for x in audited),
        "missingTextMarker": sum(not x["contexts"]["text"] for x in audited),
        "uniqueImages": len({x.get("sha256") for x in audited if x.get("sha256")}),
        "frames": audited,
    }
(root / "integrity.json").write_text(json.dumps(report, indent=2) + "\n")
(root / "ocr-paths.json").write_text(json.dumps(sorted(set(ocr_paths)), indent=2) + "\n")
print(json.dumps({k: {a: b for a, b in v.items() if a != "frames"} for k, v in report.items()}, indent=2))
