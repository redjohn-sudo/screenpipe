# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Adversarial calibration: broken references, wrong context and partial text stay visible."""
import json
import pathlib
import subprocess
import sys
import tempfile
from PIL import Image

scripts = pathlib.Path(__file__).resolve().parent
write = lambda path, value: path.write_text(json.dumps(value))
with tempfile.TemporaryDirectory() as temp:
    root = pathlib.Path(temp)
    folder = root / 'benchmark' / 'auto'
    images = folder / 'data'
    images.mkdir(parents=True)
    for name in ['one.png', 'two.png']:
        Image.new('RGB', (20, 20), 'white').save(images / name)
    frames = [dict(id=1, timestamp='2026-09-29T00:00:00Z', window_name='ScrollBench Page A',
                   app_name='Edge', browser_url='https://fixture.invalid/a',
                   snapshot_path='C:\\capture\\one.png', elements_ref_frame_id=None,
                   accessibility_text='A - ROW 1', full_text='A - ROW 1', accessibility_tree_json='[]'),
              dict(id=2, timestamp='2026-09-29T00:00:01Z', window_name='ScrollBench Page A',
                   app_name='Edge', browser_url='https://fixture.invalid/a',
                   snapshot_path='C:\\capture\\two.png', elements_ref_frame_id=999,
                   accessibility_text='B ROW 2', full_text='B ROW 2', accessibility_tree_json='[]')]
    write(folder / 'frames.json', frames)
    write(folder / 'elements.json', [])
    write(folder / 'ui_events.json', [dict(id=1, frame_id=1, app_name='Edge', window_title='Other window', browser_url=None)])
    write(folder / 'search-at-end.json', {'data':[{'type':'OCR','content':{'frame_id':1,'text':'A - ROW 1'}}]})
    subprocess.run([sys.executable, str(scripts / 'audit_artifact.py'), str(root)], check=True, stdout=subprocess.DEVNULL)
    integrity = json.loads((root / 'integrity.json').read_text())['auto']
    assert integrity['imageErrors'] == 0, 'Windows paths must resolve on the auditing Mac'
    assert integrity['referenceErrors'] == 1 and integrity['contextMismatches'] == 1
    assert integrity['eventLinks']['invalid'] == 1, 'Wrong-window links must not be counted as correct'
    # The second image intentionally has no independent OCR record.
    (root / 'ocr.jsonl').write_text(json.dumps({'path':str(images / 'one.png'),'text':'A - ROW 1\nA - ROW 2'})+'\n')
    subprocess.run([sys.executable, str(scripts / 'audit_ocr.py'), str(root)], check=True, stdout=subprocess.DEVNULL)
    result=json.loads((root / 'ocr-audit.json').read_text())['modes']['auto']
    assert result['ocrMissingFrames']==1 and result['ocrReadableFrames']==1
    assert result['medianVisibleRowCoverage']==0.5 and result['allVisibleRowsInSearchText']==0
    assert result['searchApiFramesMissing']==1
    assert result['details'][1]['visibleRowCoverage'] is None, 'Unreadable evidence must remain unknown, not zero or success'
print('Frame-audit calibration passed: Windows paths, wrong context, missing references, partial rows and missing OCR/search evidence')
