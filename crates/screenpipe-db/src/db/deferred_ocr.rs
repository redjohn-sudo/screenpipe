// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::DatabaseManager;
use crate::write_queue::WriteOp;

#[derive(Debug, sqlx::FromRow)]
pub struct DeferredFrameOcr {
    pub frame_id: i64,
    pub snapshot_path: String,
    pub options_json: String,
    pub attempts: i64,
    pub captured_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Default, serde::Serialize, sqlx::FromRow)]
pub struct DeferredOcrStatus {
    pub pending: i64,
    pub oldest_age_seconds: i64,
}

impl DatabaseManager {
    /// The frame and its pending OCR request enter the same writer transaction.
    /// A reader never sees a job without its durable screenshot row.
    pub async fn next_frame_ocr_job(&self) -> Result<Option<DeferredFrameOcr>, sqlx::Error> {
        sqlx::query_as("SELECT j.frame_id,j.snapshot_path,j.options_json,j.attempts,f.timestamp AS captured_at FROM frame_ocr_jobs j LEFT JOIN frames f ON f.id=j.frame_id WHERE j.retry_after<=unixepoch() ORDER BY j.frame_id LIMIT 1")
            .fetch_optional(&mut *self.acquire_read().await?).await
    }

    pub async fn deferred_ocr_status(&self) -> Result<DeferredOcrStatus, sqlx::Error> {
        sqlx::query_as("SELECT (SELECT COUNT(*) FROM frame_ocr_jobs) AS pending,COALESCE(unixepoch()-(SELECT MIN(created_at) FROM frame_ocr_jobs),0) AS oldest_age_seconds")
            .fetch_one(&mut *self.acquire_read().await?).await
    }

    pub async fn finish_frame_ocr_job(&self, frame_id: i64) -> Result<(), sqlx::Error> {
        self.write_queue
            .submit(WriteOp::FinishFrameOcr { frame_id })
            .await?;
        Ok(())
    }

    pub async fn retry_frame_ocr_job(
        &self,
        frame_id: i64,
        attempts: i64,
    ) -> Result<(), sqlx::Error> {
        let delay_seconds = (5i64.saturating_mul(1i64 << attempts.clamp(0, 8))).min(300);
        self.write_queue
            .submit(WriteOp::RetryFrameOcr {
                frame_id,
                delay_seconds,
            })
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    async fn insert(db: &DatabaseManager, options: Option<String>) -> Result<i64, sqlx::Error> {
        db.insert_snapshot_frame_with_ocr_job(
            "display",
            chrono::Utc::now(),
            "/saved/frame.jpg",
            Some("Editor"),
            Some("notes"),
            None,
            None,
            true,
            Some("scroll"),
            Some("original AX"),
            Some("accessibility"),
            None,
            None,
            None,
            None,
            None,
            options,
        )
        .await
    }

    #[tokio::test]
    async fn queue_failure_rolls_back_frame_and_does_not_block_next_capture() {
        let db = DatabaseManager::new("sqlite::memory:", Default::default())
            .await
            .unwrap();
        // Force the second statement in the writer operation to fail.
        sqlx::query("CREATE TRIGGER reject_test_job BEFORE INSERT ON frame_ocr_jobs BEGIN SELECT RAISE(ABORT, 'test queue failure'); END").execute(&db.pool).await.unwrap();
        assert!(insert(&db, Some("{}".into())).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM frames")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
        assert!(insert(&db, None).await.is_ok());
        assert_eq!(db.deferred_ocr_status().await.unwrap().pending, 0);
    }

    #[tokio::test]
    async fn sealed_frame_can_receive_ocr_and_queue_ack_after_reopen() {
        let root = tempfile::tempdir().unwrap();
        let db = DatabaseManager::new_hybrid(root.path(), Default::default(), Default::default())
            .await
            .unwrap();
        let id = insert(&db, Some("{}".into())).await.unwrap();
        assert_eq!(db.seal_frame_payloads().await.unwrap(), 1);
        db.close().await;
        drop(db);
        let db = DatabaseManager::new(
            root.path().join("db.sqlite").to_str().unwrap(),
            Default::default(),
        )
        .await
        .unwrap();
        assert_eq!(db.next_frame_ocr_job().await.unwrap().unwrap().frame_id, id);
        db.insert_ocr_text(
            id,
            "original AX\nvisible row 99",
            "[]",
            std::sync::Arc::new(crate::OcrEngine::AppleNative),
        )
        .await
        .unwrap();
        let data = db
            .frame_payloads(&[id], crate::storage::Projection::All)
            .await
            .unwrap();
        assert_eq!(
            data[&id].full_text.as_deref(),
            Some("original AX\nvisible row 99")
        );
        assert_eq!(data[&id].accessibility_text.as_deref(), Some("original AX"));
        db.finish_frame_ocr_job(id).await.unwrap();
        assert_eq!(db.deferred_ocr_status().await.unwrap().pending, 0);
        db.close().await;
    }
}
