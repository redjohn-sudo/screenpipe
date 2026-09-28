# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Golden measurement checks; these are NOT native capture evidence."""
import datetime,json,pathlib,subprocess,sys,tempfile,unittest

class AnalysisGoldenTest(unittest.TestCase):
    def test_normalization_tail_links_reused_elements_and_partial_run(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);bench=root/'benchmark';mode=bench/'auto';fixture=bench/'fixture'
            mode.mkdir(parents=True);fixture.mkdir()
            def save(path, value):path.write_text(json.dumps(value))
            def trace(path, rows):path.write_text(''.join(json.dumps(x)+'\n' for x in rows))
            def iso(t):return datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat()
            (root/'machine.txt').write_text('hw.ncpu: 4\nhw.memsize: 8589934592\n')
            (root/'source-sha.txt').write_text('golden-source')
            (root/'harness-sha.txt').write_text('golden-harness')
            save(mode/'cases.json',[{'name':'continuous','repetition':0,'start':1,'inputEnd':3,'end':4}])
            save(mode/'frames.json',[{'id':i,'timestamp':iso(t),'capture_trigger':'scroll_stop','window_name':'Cloud Benchmark A','accessibility_text':'ROW 0001','elements_ref_frame_id':1 if i==2 else None} for i,t in [(1,1.5),(2,2.5),(3,3.5)]])
            save(mode/'ui_events.json',[{'id':1,'timestamp':iso(3.1),'event_type':'scroll','frame_id':3,'window_title':'Cloud Benchmark A'}])
            save(mode/'elements.json',[{'frame_id':1,'source':'accessibility'},{'frame_id':3,'source':'accessibility'}])
            trace(mode/'samples.jsonl',[{'unix':t,'cpuSeconds':cpu,'rssBytes':2**20,'footprintBytes':2**20,'writeBytes':i*2**20} for i,(t,cpu) in enumerate([(1,10),(3,14)])])
            trace(fixture/'fixture.jsonl',[{'kind':'received','unix':t,'latencyMs':delay,'offset':offset} for t,delay,offset in [(1,10,100),(3,20,200)]]+[{'kind':'heartbeat','unix':2,'delayMs':7}])
            subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name('analyze.py')),str(root)],check=True,stdout=subprocess.DEVNULL)
            report=json.loads((root/'analysis.json').read_text());result=report['modes']['auto'];case=result['cases'][0]
            self.assertEqual(case['cpuPercentOneCore'],200)
            self.assertEqual(case['cpuPercentMachineCapacity'],50)
            self.assertEqual(case['tailFrameDelaySeconds'],.5)
            self.assertEqual(case['maxScrollGapSeconds'],1)
            self.assertEqual(case['accessibilityElements']['min'],1)
            self.assertEqual(case['inputDispatchMs']['p95'],20)
            self.assertEqual(case['linkedTitleMismatchIds'],[])
            self.assertEqual(case['scrollFramesDuringInput'],2)
            self.assertEqual(result['completeness']['caseCount'],1)
            self.assertEqual(result['completeness']['expectedCases'],15)
            self.assertIsNone(report['completed'])

if __name__=='__main__':unittest.main()
