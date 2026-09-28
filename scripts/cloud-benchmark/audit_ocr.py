# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Compare independently OCR-read visible fixture rows with persisted search text."""
import collections
import json
import pathlib
import re
import statistics
import sys

root = pathlib.Path(sys.argv[1]).resolve()
ocr = {str(pathlib.Path(row["path"]).resolve().relative_to(root)): row for row in
       (json.loads(line) for line in (root / "ocr.jsonl").read_text().splitlines() if line.strip())}
integrity = json.loads((root / "integrity.json").read_text())
report = {"method": "Independent Apple Vision OCR of every saved image. Row IDs identify visible fixture content, not every glyph. Unreadable/missing OCR remains unverified.", "modes": {}}
def markers(text):
    return set((page.upper(), int(row)) for page, row in re.findall(r"\b([AB])\s+ROW\s+(\d{4})\b", text or "", re.I))
for mode, audit in integrity.items():
    if not audit.get("complete"):
        continue
    frames = {f["id"]: f for f in json.loads((root / "benchmark" / mode / "frames.json").read_text())}
    search_path = root / "benchmark" / mode / "search-at-end.json"
    search = json.loads(search_path.read_text()) if search_path.exists() else None
    search_text = {item['content']['frame_id']: item['content'].get('text', '')
                   for item in (search or {}).get('data', [])
                   if item.get('type', '').lower() == 'ocr'}
    rows = []
    for image in audit["frames"]:
        frame = frames[image["frameId"]]
        pixels = ocr.get(image.get("image"), {})
        visible = markers(pixels.get("text"))
        indexed = markers(frame.get("full_text"))
        exposed = markers(search_text.get(frame['id']))
        tree = json.loads(frame.get("accessibility_tree_json") or "[]")
        pages = sorted({page for page, _ in visible})
        expected = image["expectedPage"]
        rows.append({
            "frameId": frame["id"], "image": image.get("image"),
            "captureTrigger": frame.get("capture_trigger"), "textSource": frame.get("text_source"),
            "expectedPage": expected, "visiblePages": pages,
            "pageMismatch": bool(expected and pages and pages != [expected]),
            "ocrError": pixels.get("error"), "ocrPresent": bool(pixels),
            "visibleRows": sorted(visible), "indexedRows": sorted(indexed),
            "visibleRowCoverage": len(visible & indexed) / len(visible) if visible else None,
            "searchApiFramePresent": frame['id'] in search_text if search is not None else None,
            "searchApiVisibleRowCoverage": len(visible & exposed) / len(visible) if visible and frame['id'] in search_text else None,
            "treeNodeCount": len(tree), "onScreenTreeNodes": sum(n.get("on_screen") is True for n in tree),
        })
    checked = [r for r in rows if r["visibleRowCoverage"] is not None]
    report["modes"][mode] = {
        "frames": len(rows), "ocrReadableFrames": len(checked),
        "ocrMissingFrames": sum(not r["ocrPresent"] for r in rows),
        "ocrErrors": sum(bool(r["ocrError"]) for r in rows),
        "pixelPageMismatches": sum(r["pageMismatch"] for r in rows),
        "noVisibleRowInSearchText": sum(r["visibleRowCoverage"] == 0 for r in checked),
        "allVisibleRowsInSearchText": sum(r["visibleRowCoverage"] == 1 for r in checked),
        "medianVisibleRowCoverage": statistics.median(r["visibleRowCoverage"] for r in checked) if checked else None,
        "textSources": dict(collections.Counter(r["textSource"] for r in rows)),
        "searchApiEvidencePresent": search is not None,
        "searchApiFramesFound": sum(r['searchApiFramePresent'] is True for r in rows),
        "searchApiFramesMissing": sum(r['searchApiFramePresent'] is False for r in rows),
        "searchApiZeroVisibleOverlap": sum(r['searchApiVisibleRowCoverage'] == 0 for r in rows),
        "searchApiAllVisibleRows": sum(r['searchApiVisibleRowCoverage'] == 1 for r in rows),
        "details": rows,
    }
(root / "ocr-audit.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({m: {k: v for k, v in data.items() if k != "details"} for m, data in report["modes"].items()}, indent=2))
