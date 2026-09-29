# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
import pathlib
import sqlite3
import tempfile
import unittest

from database_evidence import recorder_database


class DatabaseEvidenceTests(unittest.TestCase):
    def database(self, path, tables):
        connection = sqlite3.connect(path)
        for table in tables:
            connection.execute(f'CREATE TABLE {table} (id INTEGER)')
        connection.commit()
        connection.close()

    def test_auxiliary_store_cannot_overwrite_recording_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            main, auxiliary = root / 'db.sqlite', root / 'secrets.sqlite'
            self.database(main, ['frames', 'ui_events', 'elements'])
            self.database(auxiliary, ['secrets'])
            selected = recorder_database(root)
            self.assertEqual(selected, main)
            backup = root / 'evidence.db'
            with sqlite3.connect(selected) as source, sqlite3.connect(backup) as target:
                source.backup(target)
                self.assertEqual(target.execute('SELECT COUNT(*) FROM frames').fetchone()[0], 0)
                self.assertIsNone(target.execute("SELECT name FROM sqlite_master WHERE name='secrets'").fetchone())

    def test_no_recorder_schema_fails_instead_of_exporting_an_auxiliary_store(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            self.database(root / 'secrets.sqlite', ['secrets'])
            with self.assertRaisesRegex(RuntimeError, 'found 0'):
                recorder_database(root)

    def test_multiple_recording_databases_are_ambiguous(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in ['db.sqlite', 'stale.sqlite']:
                self.database(root / name, ['frames', 'ui_events', 'elements'])
            with self.assertRaisesRegex(RuntimeError, 'found 2'):
                recorder_database(root)


if __name__ == '__main__':
    unittest.main()
