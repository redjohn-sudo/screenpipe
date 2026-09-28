// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! User-authorized history sampling and bounded text extraction. This never
//! gates capture admission, changes privacy filters, or changes audio settings.
//! Native input reads one atomic; adaptation runs only after a durable capture.
use crate::power::ProfileName;
use screenpipe_config::RecordingDetail;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

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
            reason: if state.power_floor > state.cost_interval {
                "power".to_string()
            } else if self.mode == RecordingDetail::Auto && state.cost_interval > 2_000 {
                "capture_cost".to_string()
            } else {
                "preference".to_string()
            },
        }
    }

    /// Duration is a recording-cost proxy, not a whole-machine CPU measurement.
    /// Three consecutive captures above 750 ms back off one level; ten below
    /// 250 ms recover one level. The dead band prevents mode flapping.
    /// Call only for successful durable captures on the focused monitor.
    pub fn observe_capture(&self, elapsed: Duration) {
        if self.mode != RecordingDetail::Auto {
            return;
        }
        let mut state = self.adaptive.lock().unwrap_or_else(|p| p.into_inner());
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
}
