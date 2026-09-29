# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Export frozen Windows evidence for the shared image, text and replay auditors."""
import argparse
import json
import pathlib
import sqlite3
from analyze_whole_run import timestamp, analyze

parser = argparse.ArgumentParser()
parser.add_argument('artifact', type=pathlib.Path)
parser.add_argument('output', type=pathlib.Path)
parser.add_argument('--cores', type=int, required=True)
args = parser.parse_args()
root = args.artifact.resolve()
read = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
for side in ('before', 'after'):
    for mode in ('auto', 'low_impact', 'more_detail'):
        data_root = root / ('data' if (root / 'data').exists() else 'original-storage')
        source = data_root / f'{side}-{mode}'
        raw = root / 'raw' / f'{side}-{mode}'
        target = args.output / side / 'benchmark' / mode
        target.mkdir(parents=True, exist_ok=True)
        backup = root / 'consistent-db-backups' / f'{side}-{mode}.sqlite'
        original_path = backup if backup.exists() else source / 'db.sqlite'
        flags = 'mode=ro&immutable=1' if backup.exists() else 'mode=ro'
        original = sqlite3.connect(f'file:{original_path}?{flags}', uri=True)
        database = sqlite3.connect(target / 'database-snapshot.sqlite')
        original.backup(database)
        original.close()
        database.row_factory = sqlite3.Row
        for table in ('frames', 'ui_events', 'elements'):
            write(target / f'{table}.json', [dict(row) for row in database.execute(f'SELECT * FROM {table}')])
        tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        write(target / 'pending.json', {'jobs': database.execute('SELECT count(*) FROM frame_ocr_jobs').fetchone()[0] if 'frame_ocr_jobs' in tables else None})
        database.close()
        images = target / 'data'
        if not images.exists():
            images.symlink_to(source / 'data', target_is_directory=True)
        search = raw / 'search-at-end.json'
        if search.exists(): write(target / 'search-at-end.json', read(search))
        cases = read(raw / 'cases.json')
        sha = next(c['sourceSha'] for c in cases if c['kind'] == 'warmup')
        write(target.parent / 'binary.json', {'profile': 'release', 'sourceSha': sha, 'provenance': 'Verified producer binary manifest; guest case metadata agrees.'})
        adapted = []
        for case in cases:
            if case['kind'] == 'warmup': continue
            input_end = case.get('finalEventUtc') or case['endUtc']
            adapted.append({'name': 'focus' if case['kind']=='navigation-focus' else case['kind'],
                            'repetition': case.get('repeat', 1)-1,
                            'start': timestamp(case['startUtc']), 'inputEnd': timestamp(input_end),
                            'end': timestamp(case.get('quietEndUtc') or input_end),
                            'originalCase': case})
        write(target / 'cases.json', adapted)
        write(target / 'cpu-audit.json', analyze(raw, args.cores))
print(args.output)
