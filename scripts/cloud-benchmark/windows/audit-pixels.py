# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
from pathlib import Path
import json,re,sqlite3,datetime,statistics,sys
r=Path(sys.argv[1]);raw=r/'evidence-extracted'
def dt(s):return datetime.datetime.fromisoformat(re.sub(r'(\.\d{6})\d+(?=[+-]|$)', r'\1', s.replace('Z','+00:00')))
def marks(s):return sorted(set((p,int(i)) for p,i in re.findall(r'PAGE\s+([AB])\s*[-—–:]?\s*row\s*(\d+)',s or '',re.I)))
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
by={}
for line in (r/'ocr.jsonl').read_text().splitlines():
 o=json.loads(line);m=re.search(r'(automatic|low-impact|more-detail)-frame-(\d+)\.jpg$',o['path']);assert m
 by[(m[1],int(m[2]))]=o
frames=[];runs=[]
for mode in ['automatic','low-impact','more-detail']:
 c=sqlite3.connect(raw/f'evidence/db-backups/{mode}-db.sqlite');c.row_factory=sqlite3.Row
 db=[dict(x) for x in c.execute('select id,timestamp,full_text,accessibility_text,accessibility_tree_json,text_source,capture_trigger,window_name,elements_ref_frame_id from frames')]
 for f in db:
  o=by.get((mode,f['id']),{});v=marks(o.get('text',''));t=marks(f['full_text']);a=marks(f['accessibility_text']);cov=len(set(v)&set(t))/len(v) if v else None
  frames.append({'mode':mode,'id':f['id'],'timestamp':f['timestamp'],'visibleRows':v,'storedFullTextRows':t,'storedAccessibilityRows':a,'visibleRowRecall':cov,'textSource':f['text_source'],'hasTree':bool(f['accessibility_tree_json']),'elementsRef':f['elements_ref_frame_id'],'ocrError':o.get('error'),'snapshotMissing':not bool(o)})
 for case in load(raw/f'raw/mode-{mode}/cases.json'):
  if case['kind']!='continuous':continue
  start,end=dt(case['startUtc']),dt(case['finalEventUtc']);ff=[f for f in frames if f['mode']==mode and start<=dt(f['timestamp'])<=end and f['visibleRows']]
  pos=[{'id':f['id'],'seconds':(dt(f['timestamp'])-start).total_seconds(),'minRow':min(x[1] for x in f['visibleRows']),'maxRow':max(x[1] for x in f['visibleRows']),'recall':f['visibleRowRecall']} for f in ff]
  bottom=[p for p in pos if p['minRow']>=78];first=bottom[0] if bottom else None
  runs.append({'mode':mode,'case':case['case'],'durationSeconds':(end-start).total_seconds(),'storedActiveFrames':len(ff),'firstObservedBottomSeconds':first['seconds'] if first else None,'observedBoundaryTailSeconds':(end-start).total_seconds()-first['seconds'] if first else 0,'positions':pos,'distinctVisibleRowSets':len({tuple(map(tuple,f['visibleRows'])) for f in ff})})
valid=[f for f in frames if f['visibleRows']];summary={'totalDbFrames':len(frames),'totalOcrImages':len(by),'missingSnapshots':sum(f['snapshotMissing'] for f in frames),'ocrErrors':sum(bool(f['ocrError']) for f in frames),'framesWithVisibleRowMarkers':len(valid),'fullTextZeroVisibleMarkerCoverage':sum(f['visibleRowRecall']==0 for f in valid),'fullTextCompleteVisibleMarkerCoverage':sum(f['visibleRowRecall']==1 for f in valid),'note':'Vision OCR provides independently observed visible row IDs; row OCR errors possible. Boundary timing is first stored image showing only final rows, so actual arrival lies between it and preceding capture.'}
(r/'independent-pixel-audit.json').write_text(json.dumps({'summary':summary,'runs':runs,'frames':frames},indent=2));print(summary)
for x in runs:print(x['mode'],x['case'],'activeframes',x['storedActiveFrames'],'firstbottom',x['firstObservedBottomSeconds'],'tail',round(x['observedBoundaryTailSeconds'],2),'distinct',x['distinctVisibleRowSets'])
