// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use std::future::Future;
use tokio::sync::Mutex;

/// Unlike an interactive start, an authorization continuation must wait for a
/// pending teardown and must never override newer recording intent.
pub(super) async fn run<F: Future<Output = Result<(), String>>>(
    lifecycle: &Mutex<()>,
    should_start: impl FnOnce() -> bool,
    start: impl FnOnce() -> F,
) -> Result<(), String> {
    let _lifecycle = lifecycle.lock().await;
    if should_start() {
        start().await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn login_survives_webview_teardown_and_starts_after_gate_stop() {
        let lifecycle = Arc::new(Mutex::new(()));
        let stopping = lifecycle.lock().await;
        let starts = Arc::new(AtomicUsize::new(0));
        let (webview_reply, webview) = tokio::sync::oneshot::channel::<()>();
        let native = tokio::spawn({
            let lifecycle = lifecycle.clone();
            let starts = starts.clone();
            async move {
                // Authentication replies to a webview that hidden mode has
                // already destroyed. The native continuation still owns start.
                let _ = webview_reply.send(());
                run(
                    &lifecycle,
                    || true,
                    || async {
                        starts.fetch_add(1, Ordering::SeqCst);
                        Ok(())
                    },
                )
                .await
            }
        });
        drop(webview);
        tokio::task::yield_now().await;
        assert_eq!(starts.load(Ordering::SeqCst), 0);
        assert!(
            !native.is_finished(),
            "a busy lifecycle must not discard login recovery"
        );
        drop(stopping);
        tokio::time::timeout(std::time::Duration::from_secs(1), native)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(starts.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn pause_or_revocation_while_waiting_cancels_native_start() {
        for revoke in [false, true] {
            let lifecycle = Arc::new(Mutex::new(()));
            let stopping = lifecycle.lock().await;
            let intent = Arc::new(AtomicBool::new(true));
            let authorized = Arc::new(AtomicBool::new(true));
            let native = tokio::spawn({
                let lifecycle = lifecycle.clone();
                let intent = intent.clone();
                let authorized = authorized.clone();
                async move {
                    run(
                        &lifecycle,
                        || intent.load(Ordering::SeqCst) && authorized.load(Ordering::SeqCst),
                        || async { panic!("cancelled capture must never start") },
                    )
                    .await
                }
            });
            tokio::task::yield_now().await;
            if revoke {
                authorized.store(false, Ordering::SeqCst);
            } else {
                intent.store(false, Ordering::SeqCst);
            }
            drop(stopping);
            native.await.unwrap().unwrap();
            assert_eq!(intent.load(Ordering::SeqCst), revoke);
            assert_eq!(authorized.load(Ordering::SeqCst), !revoke);
        }
    }

    #[tokio::test]
    async fn failed_start_releases_lifecycle_and_preserves_retry_intent() {
        let lifecycle = Mutex::new(());
        let intent = AtomicBool::new(true);
        let result = run(
            &lifecycle,
            || intent.load(Ordering::SeqCst),
            || async { Err("temporary startup failure".into()) },
        )
        .await;
        assert_eq!(result, Err("temporary startup failure".into()));
        let starts = AtomicUsize::new(0);
        run(
            &lifecycle,
            || intent.load(Ordering::SeqCst),
            || async {
                starts.fetch_add(1, Ordering::SeqCst);
                Ok(())
            },
        )
        .await
        .unwrap();
        assert_eq!(starts.load(Ordering::SeqCst), 1);
    }
}
