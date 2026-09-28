# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Audit calibration, not native recording evidence."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


class SearchCoverageTest(unittest.TestCase):
    def test_stored_text_does_not_substitute_for_missing_search_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            mode = root / 'benchmark' / 'auto'
            mode.mkdir(parents=True)
            frames = [{'id':i, 'full_text':'A ROW 0001 A ROW 0002'} for i in (1,2)]
            (mode / 'frames.json').write_text(json.dumps(frames))
            (mode / 'search-at-end.json').write_text(json.dumps({'data':[
                {'type':'OCR','content':{'frame_id':1,'text':'A ROW 0001'}},
            ]}))
            (root / 'integrity.json').write_text(json.dumps({'auto':{'complete':True,'frames':[
                {'frameId':i,'image':f'{i}.jpg','expectedPage':'A'} for i in (1,2)
            ]}}))
            (root / 'ocr.jsonl').write_text(''.join(json.dumps({'path':str(root / f'{i}.jpg'),'text':'A ROW 0001 A ROW 0002'})+'\n' for i in (1,2)))
            subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name('audit_ocr.py')),str(root)],check=True,stdout=subprocess.DEVNULL)
            result = json.loads((root / 'ocr-audit.json').read_text())['modes']['auto']
            self.assertEqual(result['allVisibleRowsInSearchText'],2)
            self.assertEqual(result['searchApiFramesFound'],1)
            self.assertEqual(result['searchApiFramesMissing'],1)
            self.assertEqual(result['searchApiAllVisibleRows'],0)
            self.assertEqual(result['details'][0]['searchApiVisibleRowCoverage'],0.5)
            self.assertIsNone(result['details'][1]['searchApiVisibleRowCoverage'])


if __name__ == '__main__':
    unittest.main()
