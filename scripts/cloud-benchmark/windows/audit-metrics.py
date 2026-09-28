# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
from pathlib import Path
import json,datetime,statistics,sys,re
root=Path(sys.argv[1]);logical_cpus=int(sys.argv[2]);assert logical_cpus>0
raw=root/'evidence-extracted/raw'; out=[]
def load(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def dt(s): return datetime.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+(?=[+-]|$)', r'\1', s.replace('Z','+00:00')))
for md in sorted(raw.glob('mode-*')):
 for c in load(md/'cases.json'):
  if c['kind'] not in ['continuous','idle']:continue
  end=dt(c.get('finalEventUtc') or c['endUtc']);start=dt(c['startUtc'])
  ss=[s for s in load(md/'samples'/f"{c['case']}.json") if start<=dt(s['utc'])<=end]
  pts=[(dt(s['utc']),p) for s in ss for p in s['processes'] if p['name']=='screenpipe']
  elapsed=(pts[-1][0]-pts[0][0]).total_seconds();pids={p['pid'] for _,p in pts};assert len(pids)==1
  cpu=(pts[-1][1]['cpuSeconds']-pts[0][1]['cpuSeconds'])/elapsed*100
  inst=[(b[1]['cpuSeconds']-a[1]['cpuSeconds'])/(b[0]-a[0]).total_seconds()*100 for a,b in zip(pts,pts[1:])]
  children=sorted({p['name'] for s in ss for p in s['processes'] if p['name']!='screenpipe'})
  out.append({'mode':md.name[5:],'case':c['case'],'kind':c['kind'],'requestedIntervalSeconds':(end-start).total_seconds(),'sampledIntervalSeconds':elapsed,'sampleCount':len(pts),'engineCpuOneCoreAvgPercent':cpu,'engineCpuMachineAvgPercent':cpu/logical_cpus,'engineCpuOneCoreP95Percent':sorted(inst)[int((len(inst)-1)*.95)],'engineRssMedianMiB':statistics.median(p['workingSet'] for _,p in pts)/1048576,'engineRssActiveSampleMaxMiB':max(p['workingSet'] for _,p in pts)/1048576,'engineRssLifetimePeakMiB':max(p['peakWorkingSet'] for _,p in pts)/1048576,'otherEngineDescendantsObserved':children,'note':'CPU-time deltas from first/last recorder-only samples inside active interval; no endpoint extrapolation; unrelated quiet/reset time excluded.'})
(root/'independent-active-metrics.json').write_text(json.dumps(out,indent=2))
for mode in ['automatic','low-impact','more-detail']:
 rows=[x for x in out if x['mode']==mode and x['kind']=='continuous'];print(mode,[round(x['engineCpuMachineAvgPercent'],3) for x in rows], 'median',round(statistics.median(x['engineCpuMachineAvgPercent'] for x in rows),3), 'RSSMiB',[round(x['engineRssMedianMiB'],1) for x in rows], 'sampleSecs',[round(x['sampledIntervalSeconds'],1) for x in rows])
