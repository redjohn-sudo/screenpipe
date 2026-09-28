# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Plot actual saved-frame timestamps from the worst-gap trial of each Mac mode."""
import datetime
import json
from pathlib import Path
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

root, output = Path(sys.argv[1]), Path(sys.argv[2])
analysis = json.loads((root / 'analysis.json').read_text())
def timestamp(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
fig, ax = plt.subplots(figsize=(12, 6.2), dpi=160)
fig.patch.set_facecolor('#ffffff')
colors = {'ax': '#147c9c', 'ocr': '#cf5a13'}
labels = []
for y, (mode, label) in zip([2, 1, 0], [('auto', 'Auto'), ('low_impact', 'Low impact'), ('more_detail', 'More detail')]):
    metrics = max((c for c in analysis['modes'][mode]['cases'] if c['case'] == 'continuous'), key=lambda c: c['maxScrollGapSeconds'])
    case = next(c for c in json.loads((root/'benchmark'/mode/'cases.json').read_text()) if c['name'] == 'continuous' and c['repetition'] == metrics['repetition'])
    frames = [f for f in json.loads((root/'benchmark'/mode/'frames.json').read_text()) if case['start'] <= timestamp(f['timestamp']) <= case['inputEnd']]
    ax.plot([0, case['inputEnd']-case['start']], [y, y], color='#d9e2e9', linewidth=12, solid_capstyle='butt', zorder=1)
    for source, color, marker in [('accessibility', colors['ax'], 'o'), ('ocr', colors['ocr'], 'D'), ('hybrid', colors['ocr'], 'D')]:
        points = [timestamp(f['timestamp'])-case['start'] for f in frames if f.get('text_source') == source]
        ax.scatter(points, [y]*len(points), s=42, color=color, marker=marker, zorder=3, edgecolors='white', linewidths=.5)
    gap, left, right = max((timestamp(b['timestamp'])-timestamp(a['timestamp']), a, b) for a, b in zip(frames, frames[1:]))
    a, b = timestamp(left['timestamp'])-case['start'], timestamp(right['timestamp'])-case['start']
    ax.annotate('', (a, y+.23), (b, y+.23), arrowprops={'arrowstyle':'<->','color':'#a33d09','lw':1.5})
    ax.text((a+b)/2, y+.28, f'{gap:.2f} s gap', ha='center', va='bottom', fontsize=11, color='#8c3207', weight='bold')
    labels.append(f"{label} · trial {case['repetition']+1}\nCPU {metrics['cpuPercentMachineCapacity']:.1f}% of VM")
ax.set_yticks([2,1,0], labels, fontsize=11)
ax.set_xlim(0, 61.5); ax.set_ylim(-.55, 2.7)
ax.set_xticks(range(0,61,10)); ax.set_xlabel('Seconds after continuous scrolling began', fontsize=11, labelpad=12)
ax.grid(axis='x', color='#e7ebee', zorder=0)
ax.tick_params(axis='y', length=0, pad=14)
for side in ['top','right','left']: ax.spines[side].set_visible(False)
ax.spines['bottom'].set_color('#bec9d1')
fig.suptitle('Intel Mac: saved screenshots during 60 seconds of scrolling', x=.06, ha='left', y=.96, fontsize=18, weight='bold', color='#173346')
fig.text(.06,.90,'Worst-gap trial for each mode · 4 logical CPUs / 14 GiB · debug-dev · audio off',fontsize=11,color='#405c6e')
fig.legend(handles=[Line2D([0],[0],marker='o',color='none',markerfacecolor=colors['ax'],label='Accessibility-only frame',markersize=7),Line2D([0],[0],marker='D',color='none',markerfacecolor=colors['ocr'],label='OCR / hybrid frame',markersize=7)],loc='lower left',bbox_to_anchor=(.06,.08),frameon=False,ncol=2,fontsize=10)
fig.text(.06,.055,'Dots use saved capture timestamps, not database availability. Gray bars show the active input interval.',fontsize=9,color='#536976')
fig.text(.06,.025,'Source c369f333 · native cloud run 36461202548 · no matched base revision or release-performance claim.',fontsize=9,color='#536976')
fig.subplots_adjust(left=.21,right=.96,top=.81,bottom=.23)
output.parent.mkdir(parents=True,exist_ok=True);fig.savefig(output,facecolor=fig.get_facecolor());plt.close(fig)
print(output)
