# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Audit first database observation of a post-input scroll capture, not render latency."""
import argparse
import json
import pathlib
import statistics
from analyze_whole_run import timestamp

parser = argparse.ArgumentParser()
parser.add_argument('normalized', type=pathlib.Path)
parser.add_argument('raw', type=pathlib.Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
frames = read(args.normalized / 'frames.json')
report = {'cases': [], 'limits': [
    'Frame time is capture time; firstObserved time is an upper bound on DB arrival at roughly 100 ms polling resolution.',
    'A post-input scroll frame is not proof of settled pixels, text availability, or app rendering latency.',
    'Navigation polling begins after its focus actions and waits, so an empty post-action poll does not imply a missing transition.',
]}
for case in read(args.raw / 'cases.json'):
    if case['kind'] in ('warmup', 'idle'): continue
    start, end = timestamp(case['startUtc']), timestamp(case['finalEventUtc'])
    times = sorted(timestamp(f['timestamp']) for f in frames if start <= timestamp(f['timestamp']) <= end)
    gaps = [b-a for a,b in zip(times,times[1:])]
    poll = args.raw / 'quiet-polls' / (case['case'] + '.json')
    observations = read(poll).get('observations', []) if poll.exists() else []
    found = None
    for observation in observations:
        candidates = [f for f in observation.get('frames', []) if f.get('capture_trigger')=='scroll_stop' and timestamp(f['timestamp']) >= end and f.get('snapshot_path')]
        if candidates:
            frame = min(candidates, key=lambda f: timestamp(f['timestamp']))
            found = {'frameId': frame['id'], 'captureDelayMs': 1000*(timestamp(frame['timestamp'])-end),
                     'firstObservedAfterInputMs': 1000*(timestamp(observation['observedUtc'])-end)}
            break
    report['cases'].append({'case': case['case'], 'kind':case['kind'], 'inputDurationSeconds':end-start,
                            'framesDuringInput':len(times), 'maximumCaptureGapSeconds':max(gaps,default=None),
                            'medianCaptureGapSeconds':statistics.median(gaps) if gaps else None,
                            'pollObservations':len(observations), 'pollErrors':sum('error' in o for o in observations),
                            'observationsWithFrames':sum(bool(o.get('frames')) for o in observations),
                            'firstPostInputScrollFrame':found})
(args.normalized / 'arrival-audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
