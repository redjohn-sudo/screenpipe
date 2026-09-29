# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""CPU/memory accounting for v2 Windows samples, including background work."""
import argparse
import datetime
import json
import pathlib
import re


def timestamp(value):
    return datetime.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+', r'\1', value).replace('Z', '+00:00')).timestamp()


def process_map(row):
    return {p['pid']: p for p in row.get('processes', []) if p.get('cpuSeconds') is not None}


def measure(samples, start, end, cores):
    cpu_seconds = covered = 0.0
    lost = set()
    intervals = []
    for left, right in zip(samples, samples[1:]):
        a, b = timestamp(left['utc']), timestamp(right['utc'])
        overlap = max(0, min(b, end) - max(a, start))
        if b <= a or not overlap:
            continue
        before, after = process_map(left), process_map(right)
        lost.update(before.keys() - after.keys())
        # A newly seen child may have started between observations. Its current
        # counter is retained; exited children have an explicitly unmeasured tail.
        delta = sum(max(0, p['cpuSeconds'] - before.get(pid, {}).get('cpuSeconds', 0))
                    for pid, p in after.items())
        cpu_seconds += delta * overlap / (b - a)
        covered += overlap
        intervals.append(b - a)
    visible = [s for s in samples if start <= timestamp(s['utc']) <= end]
    return dict(requestedSeconds=end-start, observedSeconds=covered, cpuSeconds=cpu_seconds,
                cpuPercentOneCore=100*cpu_seconds/covered if covered else None,
                cpuPercentMachineCapacity=100*cpu_seconds/covered/cores if covered else None,
                rssPeakMiB=max((sum(p.get('workingSet') or 0 for p in s.get('processes', [])) for s in visible), default=0)/2**20,
                privatePeakMiB=max((sum(p.get('privateBytes') or 0 for p in s.get('processes', [])) for s in visible), default=0)/2**20,
                maximumSampleGapSeconds=max(intervals, default=None),
                disappearedProcessIds=sorted(lost), samples=len(visible))


def analyze(folder, cores):
    read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
    samples = sorted(read(folder/'samples'/'whole-run.json'), key=lambda r: timestamp(r['utc']))
    cases = read(folder/'cases.json')
    measured = [c for c in cases if c['kind'] != 'warmup']
    details = [(s.get('power') or {}).get('recording_detail') or {} for s in samples]
    status = [d for d in details if 'text_pending' in d]
    rows = []
    for case in cases:
        end = case.get('endUtc') or case['finalEventUtc']
        row = dict(case=case['case'], kind=case['kind'],
                   input=measure(samples, timestamp(case['startUtc']), timestamp(end), cores))
        if case.get('quietEndUtc'):
            row['throughQuiet'] = measure(samples, timestamp(case['startUtc']), timestamp(case['quietEndUtc']), cores)
        rows.append(row)
    return dict(logicalCores=cores, cases=rows,
                workloadIncludingQuietResetAndDrain=measure(samples, min(timestamp(c['startUtc']) for c in measured), timestamp(samples[-1]['utc']), cores) if measured else None,
                textQueue=dict(supportedSamples=len(status), peakPending=max((d['text_pending'] for d in status), default=None), oldestAgeSeconds=max((d.get('text_oldest_age_seconds', 0) for d in status), default=None), captureDelayedSamples=sum(bool(d.get('capture_delayed')) for d in details)),
                drain=read(folder/'drain.json') if (folder/'drain.json').exists() else None,
                limits=['Per-process cumulative counters; 100% equals one logical core.',
                        'Case boundaries prorate overlapping sample intervals; sub-sample CPU timing is approximate.',
                        'Exited child processes may have an unobserved final counter; disappearedProcessIds records them.',
                        'Includes engine descendants, excludes benchmark/browser/OS CPU. System CPU is retained in raw samples.',
                        'Warmup excluded from workload total. Native input-to-render latency remains unmeasured.'])


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('folder', type=pathlib.Path)
    parser.add_argument('--cores', type=int, required=True)
    args=parser.parse_args()
    assert args.cores > 0
    result=analyze(args.folder, args.cores)
    (args.folder/'cpu-audit.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
