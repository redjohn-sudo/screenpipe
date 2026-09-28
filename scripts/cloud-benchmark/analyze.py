# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Analyze one downloaded native Mac benchmark artifact without executing it."""
import collections, datetime, hashlib, json, math, pathlib, re, statistics, sys
root=pathlib.Path(sys.argv[1]);bench=root/'benchmark'
def read(path, default=None):return json.loads(path.read_text()) if path.exists() else default
def lines(path):return [json.loads(x) for x in path.read_text().splitlines() if x.strip()] if path.exists() else []
def timestamp(value):
    if not value:return None
    return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def percentile(values,p):
    values=sorted(values)
    return values[max(0,math.ceil(p*len(values))-1)] if values else None
def stats(values):
    values=[v for v in values if v is not None]
    return {'n':len(values),'median':statistics.median(values),'min':min(values),'max':max(values),'p95':percentile(values,.95)} if values else None
fixture=lines(bench/'fixture'/'fixture.jsonl')
report={'sourceSha':(root/'source-sha.txt').read_text().strip(),'harnessSha':(root/'harness-sha.txt').read_text().strip(),'machine':(root/'machine.txt').read_text(),'binary':read(bench/'binary.json'),'completed':read(bench/'completed.json'),'limits':['debug-dev first-party code is unoptimized; results do not certify release builds','process CPU excludes fixture, WindowServer and host hypervisor','input delivery is synthetic OS scroll latency, not physical trackpad-to-photon latency','timer delay is a 50ms main-run-loop heartbeat, not frame presentation','audio/transcription, packaged app timeline, physical battery and thermal throttling were not benchmarked','three repetitions per case on one VM per configuration; no statistical hardware population inference','capture latency uses frame timestamps, not durable commit or rendered timeline availability'],'modes':{}}
cpu_match=re.search(r'hw.ncpu:\s*(\d+)',report['machine']); cpu_count=int(cpu_match.group(1)) if cpu_match else None
report['logicalCpuCount']=cpu_count
for mode in ['control','auto','low_impact','more_detail']:
    folder=bench/mode
    if not folder.exists():continue
    cases=read(folder/'cases.json',[]);frames=read(folder/'frames.json',[]);ui=read(folder/'ui_events.json',[]);elements=read(folder/'elements.json',[])
    samples=[x for x in lines(folder/'samples.jsonl') if 'cpuSeconds' in x]
    calibration=[x for x in lines(folder/'samples.jsonl') if x.get('kind')=='calibration']
    policy=lines(folder/'policy.jsonl')
    frame_by_id={x['id']:x for x in frames}
    row_counts=collections.Counter(x.get('frame_id') for x in elements if x.get('source')=='accessibility')
    rows=[]
    for case in cases:
        start,end=case['start'],case['end']; active_end=case['inputEnd']
        ss=[s for s in samples if start<=s['unix']<=active_end]
        received=[x for x in fixture if x['kind']=='received' and start<=x['unix']<=active_end]
        beat=[x['delayMs'] for x in fixture if x['kind']=='heartbeat' and start<=x['unix']<=active_end]
        ff=[x for x in frames if start<=timestamp(x['timestamp'])<=end]
        uu=[x for x in ui if x.get('event_type')=='scroll' and start<=timestamp(x['timestamp'])<=end]
        scroll=[x for x in ff if x.get('capture_trigger')=='scroll_stop']
        tail_input=received[-1]['unix'] if received else None
        last_ui=max(uu,key=lambda x:timestamp(x['timestamp'])) if uu else None
        tail_frame=frame_by_id.get(last_ui.get('frame_id')) if last_ui else None
        mismatches=[x['id'] for x in uu if x.get('frame_id') in frame_by_id and x.get('window_title') and frame_by_id[x['frame_id']].get('window_name') and x['window_title']!=frame_by_id[x['frame_id']]['window_name']]
        active_scroll=[x for x in scroll if timestamp(x['timestamp'])<=active_end]
        active_times=[start]+sorted(timestamp(x['timestamp']) for x in active_scroll)+[active_end]
        row={'case':case['name'],'repetition':case['repetition'],'activeSeconds':active_end-start,'inputReceived':len(received),'inputDispatchMs':stats([x['latencyMs'] for x in received]),'heartbeatDelayMs':stats(beat),'scrollOffsetRange':max(x['offset'] for x in received)-min(x['offset'] for x in received) if received else None,'frames':len(ff),'scrollFrames':len(scroll),'scrollFramesDuringInput':len(active_scroll),'maxScrollGapSeconds':max(b-a for a,b in zip(active_times,active_times[1:])) if received else None,'accessibilityFrames':sum(bool(x.get('accessibility_text')) for x in ff),'accessibilityChars':stats([len(x.get('accessibility_text') or '') for x in ff]),'accessibilityElements':stats([row_counts[x.get('elements_ref_frame_id') or x['id']] for x in ff]),'scrollUiRows':len(uu),'linkedScrollRows':sum(x.get('frame_id') in frame_by_id for x in uu),'linkedTitleMismatchIds':mismatches,'tailFrameDelaySeconds':timestamp(tail_frame['timestamp'])-tail_input if tail_frame and tail_input else None}
        if len(ss)>1:
            row.update(cpuPercentOneCore=100*(ss[-1]['cpuSeconds']-ss[0]['cpuSeconds'])/(ss[-1]['unix']-ss[0]['unix']),rssPeakMiB=max(s['rssBytes'] for s in ss)/2**20,footprintPeakMiB=max(s['footprintBytes'] for s in ss)/2**20,diskWriteMiB=(ss[-1]['writeBytes']-ss[0]['writeBytes'])/2**20)
        if cpu_count and 'cpuPercentOneCore' in row:row['cpuPercentMachineCapacity']=row['cpuPercentOneCore']/cpu_count
        rows.append(row)
    summary={}
    for case in sorted({r['case'] for r in rows}):
        subset=[r for r in rows if r['case']==case]
        metrics=['cpuPercentMachineCapacity','cpuPercentOneCore','rssPeakMiB','footprintPeakMiB','diskWriteMiB','scrollFramesDuringInput','maxScrollGapSeconds','tailFrameDelaySeconds','accessibilityFrames']
        summary[case]={key:stats([r.get(key) for r in subset]) for key in metrics}
        summary[case]['inputP95Ms']=stats([r['inputDispatchMs']['p95'] for r in subset if r['inputDispatchMs']])
        summary[case]['heartbeatP95Ms']=stats([r['heartbeatDelayMs']['p95'] for r in subset if r['heartbeatDelayMs']])
    policy_counts=collections.Counter((p['status'].get('recording_detail',{}).get('scroll_interval_ms'),p['status'].get('recording_detail',{}).get('reason'),p['status'].get('active_profile')) for p in policy)
    report['modes'][mode]={'cases':rows,'summary':summary,'cpuCalibration':calibration,'policySamples':[{'intervalMs':k[0],'reason':k[1],'powerProfile':k[2],'count':v} for k,v in policy_counts.items()],'firstInstallPower':read(folder/'power-first-install.json'),'controlledPower':read(folder/'power-controlled.json'),'storage':read(folder/'storage.json'),'frameCount':len(frames),'nonFixtureFrameCount':sum('Cloud Benchmark' not in (f.get('window_name') or '') for f in frames),'uniqueSnapshotPaths':len({f.get('snapshot_path') for f in frames if f.get('snapshot_path')}),'completeness':{'caseCount':len(cases),'expectedCases':15,'hasCpu':bool(samples),'hasAx':any(f.get('accessibility_text') for f in frames),'hasPolicy':bool(policy)}}
(root/'analysis.json').write_text(json.dumps(report,indent=2)+'\n')
for mode,data in report['modes'].items():
    print(mode,'cases',len(data['cases']),'frames',data['frameCount'],'policy',data['policySamples'])
    print(json.dumps(data['summary'].get('continuous',{}),indent=2))
