# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
from pathlib import Path
import json,re,sqlite3,sys,collections
r=Path(sys.argv[1]).resolve();raw=r/'evidence-extracted';pages=json.loads((r/'independent-page-coherence-audit.json').read_text());pmap={(f['mode'],f['id']):f for f in pages['frames']}
def titlepage(s):
 m=re.search(r'ScrollBench Page ([AB])',s or '',re.I);return m[1].upper() if m else None
rows=[]
for mode in ['automatic','low-impact','more-detail']:
 db=raw/f'evidence/db-backups/{mode}-db.sqlite'
 if not db.exists():db=raw/mode/'db-consistent.sqlite'
 c=sqlite3.connect(db);c.row_factory=sqlite3.Row
 for f in c.execute('select u.id,u.timestamp,u.event_type,u.window_title,u.app_name,u.frame_id,f.timestamp frame_timestamp,f.window_name frame_window_name,f.app_name frame_app from ui_events u left join frames f on f.id=u.frame_id'):
  q=dict(f);q['mode']=mode;a=titlepage(q['window_title']);b=titlepage(q['frame_window_name']);p=pmap.get((mode,q['frame_id']),{}).get('visiblePages',[]);q.update(eventTitlePage=a,linkedFrameTitlePage=b,linkedVisiblePages=p)
  common='unlinked' if q['frame_id'] is None else 'dangling_frame_id' if q['frame_timestamp'] is None else 'unknown_event_page' if a is None else None
  q['titleStatus']=common or ('unknown_frame_page' if b is None else 'match' if a==b else 'mismatch')
  q['pixelStatus']=common or ('unknown_visible_page' if not p else 'match' if [a]==p else 'mismatch')
  rows.append(q)
summary={'eventCount':len(rows),'definitions':'Compare UI event ScrollBench Page A/B title with linked frame title and independently OCR-visible PAGE A/B row markers. Unknown, unlinked and dangling rows are separate. Match checks page identity only, not temporal freshness, row accuracy or navigation success.'}
for group,rr in [('allEvents',rows),('scrollEvents',[q for q in rows if q['event_type']=='scroll'])]:summary[group]={'count':len(rr),'titleCounts':dict(collections.Counter(q['titleStatus'] for q in rr)),'pixelCounts':dict(collections.Counter(q['pixelStatus'] for q in rr))}
out={'summary':summary,'mismatches':[q for q in rows if 'mismatch' in [q['titleStatus'],q['pixelStatus']]],'events':rows};(r/'independent-event-frame-link-audit.json').write_text(json.dumps(out,indent=2))
p=r/'independent-audit-summary.json'
if p.exists():s=json.loads(p.read_text());s['eventFrameLinkAudit']=summary;p.write_text(json.dumps(s,indent=2))
print(json.dumps(summary));print('mismatches',len(out['mismatches']))
