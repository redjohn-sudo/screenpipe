# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
from pathlib import Path
import json,re,sqlite3,sys,collections
r=Path(sys.argv[1]).resolve();raw=r/'evidence-extracted'
def pages(s):return sorted(set(re.findall(r'PAGE\s+([AB])\s*[-—–:]?\s*row\s*(?:\d+|[oO])\b',s or '',re.I)))
ocr={}
for l in (r/'ocr.jsonl').read_text().splitlines():
 d=json.loads(l);p=Path(d['path']);m=re.search(r'(automatic|low-impact|more-detail)-frame-(\d+)',p.name) or re.search(r'(automatic|low-impact|more-detail)/stored-screenshots/frame-(\d+)',str(p))
 if m:ocr[(m[1],int(m[2]))]=d
out=[]
for mode in ['automatic','low-impact','more-detail']:
 db=raw/f'evidence/db-backups/{mode}-db.sqlite'
 if not db.exists():db=raw/mode/'db-consistent.sqlite'
 c=sqlite3.connect(db);c.row_factory=sqlite3.Row
 for f in c.execute('select id,timestamp,window_name,full_text,accessibility_text from frames'):
  o=ocr.get((mode,f['id']),{});v=pages(o.get('text'));title=re.search(r'ScrollBench Page ([AB])',f['window_name'] or '',re.I);title=title[1].upper() if title else None
  text=pages(f['full_text']);ax=pages(f['accessibility_text']);record={'mode':mode,'id':f['id'],'timestamp':f['timestamp'],'visiblePages':v,'windowTitlePage':title,'fullTextRowPages':text,'accessibilityRowPages':ax}
  for key,val in [('windowTitle',([title] if title else [])),('fullText',text),('accessibilityText',ax)]:
   record[key+'Status']='unverified_no_visible_marker' if not v else 'unverified_no_stored_page' if not val else 'match' if v==val else 'mismatch'
  out.append(record)
summary={'frames':len(out),'framesWithVisiblePageMarkers':sum(bool(f['visiblePages']) for f in out),'framesWithoutVisiblePageMarkers':sum(not f['visiblePages'] for f in out),'definitions':'Visible pages come from independent screenshot OCR PAGE A/B row markers. Stored text identity uses corresponding row markers (navigation-link text excluded). Window identity uses ScrollBench Page A/B title. A match is page identity only, not row completeness, temporal alignment or successful navigation.'}
for k in ['windowTitle','fullText','accessibilityText']:summary[k+'ComparisonCounts']=dict(collections.Counter(f[k+'Status'] for f in out))
summary['visiblePageCountsByMode']={m:dict(collections.Counter(','.join(f['visiblePages']) or 'no_marker' for f in out if f['mode']==m)) for m in ['automatic','low-impact','more-detail']}
d={'summary':summary,'mismatches':[f for f in out if any(f[k+'Status']=='mismatch' for k in ['windowTitle','fullText','accessibilityText'])],'frames':out};(r/'independent-page-coherence-audit.json').write_text(json.dumps(d,indent=2))
p=r/'independent-audit-summary.json'
if p.exists():s=json.loads(p.read_text());s['pageCoherenceAudit']=summary;p.write_text(json.dumps(s,indent=2))
print(json.dumps(summary))
