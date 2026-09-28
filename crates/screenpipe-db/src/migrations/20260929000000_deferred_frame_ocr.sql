-- screenpipe — AI that knows everything you've seen, said, or heard
-- https://screenpipe.com
CREATE TABLE IF NOT EXISTS frame_ocr_jobs (
    frame_id INTEGER PRIMARY KEY,
    snapshot_path TEXT NOT NULL,
    options_json TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    retry_after INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS frame_ocr_jobs_ready ON frame_ocr_jobs(retry_after, frame_id);
CREATE INDEX IF NOT EXISTS frame_ocr_jobs_age ON frame_ocr_jobs(created_at);
