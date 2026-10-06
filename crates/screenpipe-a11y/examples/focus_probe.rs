//! Times one AT-SPI focused-window lookup (the GNOME Wayland fallback): `cargo run --example focus_probe`.
fn main() {
    #[cfg(target_os = "linux")]
    {
        let start = std::time::Instant::now();
        let found = screenpipe_a11y::tree::focused_window_info();
        println!("{:?} in {:.1} s", found.map(|(app, title, _)| (app, title)), start.elapsed().as_secs_f64());
    }
}
