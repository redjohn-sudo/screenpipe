# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Select recorder evidence without exporting auxiliary credential stores."""
import pathlib
import sqlite3


def recorder_database(data: pathlib.Path) -> pathlib.Path:
    candidates = []
    for path in data.rglob('*.sqlite'):
        connection = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        try:
            tables = {row[0] for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            connection.close()
        if {'frames', 'ui_events', 'elements'}.issubset(tables):
            candidates.append(path)
    if len(candidates) != 1:
        raise RuntimeError(f'Expected one recorder database, found {len(candidates)}')
    return candidates[0]
