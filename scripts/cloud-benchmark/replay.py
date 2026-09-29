# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Replay matched saved frames at their observed cadence, never future frames."""
import argparse
import bisect
import datetime
import functools
import json
import math
import pathlib
import subprocess

from PIL import Image, ImageDraw, ImageFont, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('root', type=pathlib.Path)
parser.add_argument('--mode', choices=['auto', 'low_impact', 'more_detail'], default='auto')
parser.add_argument('--machine', required=True)
args = parser.parse_args()
root = args.root.resolve()
out = root / 'replays'
out.mkdir(exist_ok=True)
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
fonts = {n: ImageFont.truetype(font_path, n) for n in [20, 24, 28, 34]}

def timestamp(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()

data = {}
for label in ['before', 'after']:
    folder = root / label / 'benchmark' / args.mode
    frames = sorted([{**f, 'unix': timestamp(f['timestamp'])} for f in
                     json.loads((folder / 'frames.json').read_text())], key=lambda f: (f['unix'], f['id']))
    cases = {(c['name'], c['repetition']): c for c in json.loads((folder / 'cases.json').read_text())}
    images = {}
    for path in (folder / 'data').rglob('*'):
        if path.suffix.lower() in ['.jpg', '.jpeg', '.png']:
            if path.name in images:
                raise ValueError('Ambiguous snapshot basename: ' + path.name)
            images[path.name] = path
    binary = json.loads((folder.parent / 'binary.json').read_text())
    assert binary['profile'] == 'release', binary
    data[label] = dict(frames=frames, times=[f['unix'] for f in frames], cases=cases,
                       images=images, source=binary['sourceSha'])

@functools.lru_cache(64)
def picture(label, frame_id):
    item = data[label]
    frame = next(f for f in item['frames'] if f['id'] == frame_id)
    path = item['images'][pathlib.Path(frame['snapshot_path']).name]
    with Image.open(path) as image:
        return ImageOps.contain(image.convert('RGB'), (944, 531), Image.Resampling.LANCZOS)

width, height, fps = 1920, 790, 10
video = out / (args.mode + '.mp4')
command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo',
           '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', str(fps), '-i', '-',
           '-an', '-c:v', 'libx264', '-preset', 'fast', '-threads', '2', '-crf', '20',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(video)]
proc = subprocess.Popen(command, stdin=subprocess.PIPE)
selections, chapters = [], []
elapsed = 0
names = {'continuous': 'Continuous scroll', 'short': 'Short scroll and settle',
         'reverse': 'Scroll and reverse', 'focus': 'Switch window while scrolling'}
try:
    for name in names:
        key = (name, 0)
        durations = {label: item['cases'][key]['end'] - item['cases'][key]['start']
                     for label, item in data.items()}
        duration = max(durations.values())
        chapters.append(dict(case=name, repetition=0, videoStart=elapsed, durations=durations))
        for i in range(math.ceil(duration * fps)):
            offset = i / fps
            canvas = Image.new('RGB', (width, height), '#101827')
            draw = ImageDraw.Draw(canvas)
            draw.text((24, 14), f'{args.machine} | {args.mode.replace("_", " ")} | {names[name]}', font=fonts[34], fill='white')
            draw.text((24, 60), 'Actual saved frames, synthetic fixture | 1x replay | first repetition | no interpolation', font=fonts[24], fill='#bac8dd')
            for column, (label, item) in enumerate(data.items()):
                x = 16 + column * 960
                case = item['cases'][key]
                now = case['start'] + min(offset, durations[label])
                position = bisect.bisect_right(item['times'], now) - 1
                frame = item['frames'][position] if position >= 0 else None
                assert frame is None or frame['unix'] <= now
                ended = offset > durations[label]
                selections.append(dict(videoTime=elapsed + offset, case=name, build=label,
                                       targetTimestamp=now, frameId=frame['id'] if frame else None,
                                       frameTimestamp=frame['unix'] if frame else None, caseEnded=ended))
                draw.text((x + 8, 105), f'{label.upper()} {item["source"][:9]}', font=fonts[28], fill='#f6aeae' if label == 'before' else '#81e2b2')
                if frame:
                    image = picture(label, frame['id'])
                    canvas.paste(image, (x + (944 - image.width) // 2, 145 + (531 - image.height) // 2))
                    draw.text((x + 8, 690), f'Frame {frame["id"]} | age {now - frame["unix"]:.1f}s | {frame.get("capture_trigger") or "unknown trigger"}', font=fonts[24], fill='white')
                else:
                    draw.text((x + 8, 350), 'No preceding saved frame', font=fonts[28], fill='white')
                phase = 'case ended, holding last frame' if ended else ('input active' if now < case['inputEnd'] else 'quiet, waiting for settled capture')
                count = sum(case['start'] <= f['unix'] <= now for f in item['frames'])
                draw.text((x + 8, 728), f'{offset:.1f}s | {phase} | {count} new frames', font=fonts[20], fill='#bac8dd')
            if name == 'continuous' and i == 100:
                canvas.save(out / (args.mode + '-comparison.png'))
            proc.stdin.write(canvas.tobytes())
        elapsed += math.ceil(duration * fps) / fps
finally:
    proc.stdin.close()
    code = proc.wait()
assert code == 0, code
subprocess.run(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'null', '-'], check=True)
(out / (args.mode + '-selections.json')).write_text(json.dumps(selections, indent=2) + '\n')
(out / (args.mode + '-verification.json')).write_text(json.dumps(dict(
    machine=args.machine, mode=args.mode, sources={k:v['source'] for k,v in data.items()},
    fps=fps, durationSeconds=elapsed, chapters=chapters, selectionsChecked=len(selections),
    futureFramesShown=0, fullDecodePassed=True,
    rule='Latest saved frame at or before each case-relative timestamp. Unequal durations end explicitly; recording gaps hold the preceding frame.'), indent=2) + '\n')
print(video)
