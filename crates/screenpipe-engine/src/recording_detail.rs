// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! User-authorized history sampling and bounded text extraction. This never
//! gates capture admission, changes privacy filters, or changes audio settings.
//! Native input reads one atomic; adaptation uses durable captures and processing health.
use crate::power::ProfileName;
use screenpipe_config::RecordingDetail;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

#[derive(Debug)]
pub struct RecordingDetailController {
    mode: RecordingDetail,
    interval: Arc<AtomicU64>,
    adaptive: Mutex<Adaptive>,
}

#[derive(Debug)]
struct Adaptive {
    cost_interval: u64,
    power_floor: u64,
    slow: u8,
    fast: u8,
    in_flight: Option<Instant>,
    failed: bool,
    last_success: Option<Instant>,
    text_pending: u64,
    text_oldest_age_seconds: u64,
}

impl RecordingDetailController {
    pub fn new(mode: RecordingDetail) -> Self {
        let interval = match mode {
            RecordingDetail::LowImpact => 5_000,
            RecordingDetail::MoreDetail => 1_000,
            _ => 2_000,
        };
        Self {
            mode,
            interval: Arc::new(AtomicU64::new(interval)),
            adaptive: Mutex::new(Adaptive {
                cost_interval: interval,
                power_floor: 1_000,
                slow: 0,
                fast: 0,
                in_flight: None,
                failed: false,
                last_success: None,
                text_pending: 0,
                text_oldest_age_seconds: 0,
            }),
        }
    }

    pub fn scroll_interval(&self) -> Arc<AtomicU64> {
        self.interval.clone()
    }

    /// Existing per-app budgets remain an upper bound. Reduced work can yield
    /// less searchable text, but never introduces a new screenshot drop gate.
    pub fn tree_budget(&self) -> (usize, Duration) {
        match self.interval.load(Ordering::Relaxed) {
            0..=1_000 => (5_000, Duration::from_millis(250)),
            1_001..=2_000 => (2_000, Duration::from_millis(150)),
            _ => (1_000, Duration::from_millis(100)),
        }
    }

    pub fn set_power_profile(&self, profile: ProfileName) {
        let mut state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        let floor = match profile {
            ProfileName::Performance => 1_000,
            ProfileName::Balanced => 2_000,
            _ => 5_000,
        };
        // Multiple monitor loops share this controller. Repeating a profile
        // must not reset evidence accumulated by the focused monitor.
        if floor != state.power_floor {
            state.power_floor = floor;
            state.slow = 0;
            state.fast = 0;
        }
        self.interval
            .store(state.cost_interval.max(floor), Ordering::Relaxed);
    }

    /// Read on the status endpoint, never in a native input callback.
    pub fn status(&self) -> RecordingDetailStatus {
        let state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        let interval = state.cost_interval.max(state.power_floor);
        RecordingDetailStatus {
            preferred_mode: self.mode,
            scroll_interval_ms: interval,
            capture_delayed: state.failed
                || state
                    .in_flight
                    .is_some_and(|started| started.elapsed() >= Duration::from_secs(3)),
            last_success_age_ms: state
                .last_success
                .map(|at| at.elapsed().as_millis().min(u64::MAX as u128) as u64),
            text_pending: state.text_pending,
            text_oldest_age_seconds: state.text_oldest_age_seconds,
            reason: if state.power_floor > state.cost_interval {
                "power".to_string()
            } else if self.mode == RecordingDetail::Auto && state.cost_interval > 2_000 {
                "capture_cost".to_string()
            } else {
                "preference".to_string()
            },
        }
    }

    /// Indexing status is informational. Processing backlog must not reduce
    /// recording cadence; the OCR worker budgets its own background work.
    pub fn observe_text_queue(&self, pending: u64, oldest_age_seconds: u64) {
        let mut state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        state.text_pending = pending;
        state.text_oldest_age_seconds = oldest_age_seconds;
    }

    /// Rest between serial OCR jobs. This bounds worker busy time rather than
    /// promising a CPU percentage: native OCR may use several cores at once.
    /// Battery profiles can reduce background work without changing image quality.
    pub fn text_processing_rest(&self, work: Duration) -> Duration {
        let state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        let preference = match self.mode {
            RecordingDetail::MoreDetail => 1, // at most half the worker's time
            RecordingDetail::LowImpact => 9,  // at most one tenth
            _ => 3,                           // at most one quarter
        };
        let power = match state.power_floor {
            0..=1_000 => 1,
            1_001..=2_000 => 3,
            _ => 9,
        };
        work.saturating_mul(preference.max(power))
    }

    /// Track actual capture work, not idle time, pauses or privacy exclusions.
    pub fn capture_started(&self) {
        self.adaptive
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .in_flight = Some(Instant::now());
    }

    pub fn capture_skipped(&self) {
        self.adaptive
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .in_flight = None;
    }

    /// A timeout is pressure even if no successful duration was observed.
    /// Keep fixed preferences intact; all modes expose the recording failure.
    pub fn observe_failure(&self) {
        let mut state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        state.in_flight = None;
        state.failed = true;
        state.fast = 0;
        state.slow = 0;
        if self.mode == RecordingDetail::Auto {
            state.cost_interval = 5_000;
            self.interval.store(
                state.cost_interval.max(state.power_floor),
                Ordering::Relaxed,
            );
        }
    }

    /// Duration is a recording-cost proxy, not a whole-machine CPU measurement.
    /// Three consecutive captures above 750 ms back off one level; ten below
    /// 250 ms recover one level. The dead band prevents mode flapping.
    /// Call only for successful durable captures on the focused monitor.
    pub fn observe_capture(&self, elapsed: Duration) {
        let mut state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
        state.in_flight = None;
        state.failed = false;
        state.last_success = Some(Instant::now());
        if self.mode != RecordingDetail::Auto {
            return;
        }
        if elapsed > Duration::from_millis(750) {
            state.fast = 0;
            state.slow += 1;
            if state.slow >= 3 {
                state.cost_interval = if state.cost_interval == 1_000 {
                    2_000
                } else {
                    5_000
                };
                state.slow = 0;
            }
        } else if elapsed < Duration::from_millis(250) {
            state.slow = 0;
            state.fast += 1;
            if state.fast >= 10 {
                state.cost_interval = if state.cost_interval == 5_000 {
                    2_000
                } else {
                    1_000
                };
                state.fast = 0;
            }
        } else {
            state.slow = 0;
            state.fast = 0;
        }
        self.interval.store(
            state.cost_interval.max(state.power_floor),
            Ordering::Relaxed,
        );
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RecordingDetailStatus {
    pub preferred_mode: RecordingDetail,
    pub scroll_interval_ms: u64,
    pub reason: String,
    pub capture_delayed: bool,
    pub last_success_age_ms: Option<u64>,
    pub text_pending: u64,
    pub text_oldest_age_seconds: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    fn interval(c: &RecordingDetailController) -> u64 {
        c.interval.load(Ordering::Relaxed)
    }
    fn samples(c: &RecordingDetailController, n: usize, ms: u64) {
        for _ in 0..n {
            c.observe_capture(Duration::from_millis(ms));
        }
    }

    #[test]
    fn text_backlog_does_not_reduce_recording_or_block_capture_recovery() {
        for mode in [
            RecordingDetail::Auto,
            RecordingDetail::LowImpact,
            RecordingDetail::MoreDetail,
        ] {
            let c = RecordingDetailController::new(mode);
            let original = interval(&c);
            c.observe_text_queue(10_000, 3_600);
            assert_eq!(interval(&c), original);
            assert_eq!(c.status().text_pending, 10_000);
            if mode == RecordingDetail::Auto {
                c.observe_failure();
                assert_eq!(interval(&c), 5_000);
                samples(&c, 20, 10);
                assert_eq!(interval(&c), 1_000);
            }
            c.observe_text_queue(0, 0);
            assert_eq!(c.status().text_pending, 0);
        }
    }

    #[test]
    fn text_worker_budget_honors_detail_and_battery_without_changing_cadence() {
        for (mode, rest_ms) in [
            (RecordingDetail::Auto, 300),
            (RecordingDetail::Balanced, 300),
            (RecordingDetail::MoreDetail, 100),
            (RecordingDetail::LowImpact, 900),
        ] {
            let c = RecordingDetailController::new(mode);
            let cadence = interval(&c);
            assert_eq!(
                c.text_processing_rest(Duration::from_millis(100)),
                Duration::from_millis(rest_ms)
            );
            assert_eq!(interval(&c), cadence);
            c.set_power_profile(ProfileName::Saver);
            assert_eq!(
                c.text_processing_rest(Duration::from_millis(100)),
                Duration::from_millis(900)
            );
            c.set_power_profile(ProfileName::Performance);
            assert_eq!(
                c.text_processing_rest(Duration::from_millis(100)),
                Duration::from_millis(rest_ms)
            );
        }
    }

    #[test]
    fn fixed_preferences_survive_power_limits_and_restore_without_cost_adaptation() {
        for (mode, ms, nodes) in [
            (RecordingDetail::LowImpact, 5_000, 1_000),
            (RecordingDetail::Balanced, 2_000, 2_000),
            (RecordingDetail::MoreDetail, 1_000, 5_000),
        ] {
            let c = RecordingDetailController::new(mode);
            samples(&c, 30, 5_000);
            c.set_power_profile(ProfileName::Saver);
            samples(&c, 30, 10);
            assert_eq!(interval(&c), 5_000);
            assert_eq!(c.tree_budget().0, 1_000);
            assert_eq!(c.status().preferred_mode, mode);
            c.set_power_profile(ProfileName::Performance);
            assert_eq!(interval(&c), ms);
            assert_eq!(c.tree_budget().0, nodes);
        }
    }

    #[test]
    fn auto_backs_off_and_recovers_with_hysteresis() {
        let c = RecordingDetailController::new(RecordingDetail::Auto);
        samples(&c, 2, 900);
        assert_eq!(interval(&c), 2_000);
        samples(&c, 1, 900);
        assert_eq!(interval(&c), 5_000);
        samples(&c, 9, 100);
        assert_eq!(interval(&c), 5_000);
        samples(&c, 1, 100);
        assert_eq!(interval(&c), 2_000);
        samples(&c, 10, 100);
        assert_eq!(interval(&c), 1_000);
        samples(&c, 3, 900);
        assert_eq!(interval(&c), 2_000);
    }

    #[test]
    fn auto_power_floor_survives_fast_samples_and_recovers_on_ac() {
        let c = RecordingDetailController::new(RecordingDetail::Auto);
        c.set_power_profile(ProfileName::Saver);
        samples(&c, 30, 100);
        assert_eq!(interval(&c), 5_000);
        c.set_power_profile(ProfileName::Balanced);
        assert_eq!(interval(&c), 2_000);
        c.set_power_profile(ProfileName::Performance);
        assert_eq!(interval(&c), 1_000);
        for profile in [ProfileName::AudioPaused, ProfileName::FullPause] {
            c.set_power_profile(profile);
            assert_eq!(interval(&c), 5_000);
        }
    }

    #[test]
    fn mixed_cost_does_not_flap_and_sessions_are_independent() {
        let c = RecordingDetailController::new(RecordingDetail::Auto);
        let other = RecordingDetailController::new(RecordingDetail::Auto);
        for _ in 0..20 {
            samples(&c, 2, 900);
            samples(&c, 1, 500);
            samples(&c, 9, 100);
            samples(&c, 1, 250);
        }
        assert_eq!(interval(&c), 2_000);
        samples(&c, 3, 900);
        assert_eq!(interval(&other), 2_000);
    }
    #[test]
    fn failed_capture_backs_off_auto_without_misreading_idle_cpu_as_recovery() {
        let c = RecordingDetailController::new(RecordingDetail::Auto);
        samples(&c, 9, 100);
        c.capture_started();
        c.observe_failure();
        assert_eq!(interval(&c), 5_000);
        assert!(c.status().capture_delayed);
        c.capture_started();
        c.capture_skipped();
        assert!(c.status().capture_delayed);
        samples(&c, 9, 100);
        assert!(!c.status().capture_delayed);
        assert_eq!(interval(&c), 5_000);
        samples(&c, 1, 100);
        assert_eq!(interval(&c), 2_000);
        assert!(c.status().last_success_age_ms.is_some());
    }

    #[test]
    fn delayed_status_does_not_treat_idle_as_stalled_or_change_fixed_detail() {
        let c = RecordingDetailController::new(RecordingDetail::MoreDetail);
        assert!(!c.status().capture_delayed);
        c.adaptive.lock().unwrap().in_flight = Some(Instant::now() - Duration::from_secs(4));
        assert!(c.status().capture_delayed);
        c.capture_skipped();
        assert!(!c.status().capture_delayed);
        c.observe_failure();
        assert_eq!(interval(&c), 1_000);
        assert!(c.status().capture_delayed);
        c.observe_capture(Duration::from_millis(100));
        assert!(!c.status().capture_delayed);
    }
}
