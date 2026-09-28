# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
# Supplementary OCR audit: normalize only a standalone letter O after 'row' to 0.
from pathlib import Path
import collections,json,re,sqlite3,sys
r=Path(sys.argv[1]);p=r/'independent-pixel-audit.json';j=json.loads(p.read_text());con={m:sqlite3.connect((r/f'evidence-extracted/evidence/db-backups/{m}-db.sqlite') if (r/'evidence-extracted/evidence/db-backups').exists() else (r/f'evidence-extracted/{m}/db-consistent.sqlite')) for m in ['automatic','low-impact','more-detail']};counts=collections.Counter()
for f in j['frames']:
    if not f['visibleRows']:continue
    t=con[f['mode']].execute('select full_text from frames where id=?',(f['id'],)).fetchone()[0] or ''
    normalized=re.sub(r'(\brow\s+)[oO]\b',r'\g<1>0',t)
    mm=set((a,int(b)) for a,b in re.findall(r'PAGE\s+([AB])\s*[-—–:]?\s*row\s*(\d+)',normalized,re.I))
    v=set(map(tuple,f['visibleRows']));f['visibleRowRecallO0Normalized']=len(v&mm)/len(v)
    cls='strict_complete' if f['visibleRowRecall']==1 else ('complete_after_O0_normalization' if f['visibleRowRecallO0Normalized']==1 else 'still_partial_after_O0_normalization');counts[cls]+=1;f['coverageClass']=cls
j['summary']['normalizedO0CoverageClasses']=dict(counts)
j['summary']['remainingPartialExamples']=[{k:f[k] for k in ['mode','id','visibleRows','storedFullTextRows','textSource','visibleRowRecallO0Normalized']} for f in j['frames'] if f.get('coverageClass')=='still_partial_after_O0_normalization']
p.write_text(json.dumps(j,indent=2));print(json.dumps(j['summary']))
