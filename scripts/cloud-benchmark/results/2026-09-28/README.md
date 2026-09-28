# PR 7335: cloud configuration benchmark, September 28, 2026

Status: partial. Apple Silicon and 4-core Windows are audited. Intel Mac has completed workloads and is running native tests. The original 2-core Windows run deviated from the protocol; one correction run uses the pinned 4-core harness and the same binary. This is not an all-platform pass or merge approval.

Recorder source: `c369f333f2752bd6e0c243c2d665dafc49b9f21c`. The later `e5e459a8e24186e0042f93b089755e38c3e0c4b1` changes only frontend localization and its test mock; recorder code is identical. Running Mac harness: `39683a741`. Diagnostic `debug-dev` builds, audio off, High image quality on Mac and Balanced on Windows, controlled automatic power policy. First-party Rust is unoptimized; these are not release or battery estimates.

## Apple Silicon result

Apple M1 VM, 3 logical CPUs, 7 GiB, macOS 14.8.9, 1920×1080. Three 60-second continuous-scroll repetitions per mode. CPU is a share of the VM's total logical CPU capacity; medians below. Max gap is the worst observed interval across the three repetitions, including the initial/final active boundary.

| Mode | Recorder CPU / machine capacity | Intermediate scroll captures / minute | Worst checkpoint gap | Process writes / active minute |
| --- | ---: | ---: | ---: | ---: |
| Low impact | 2.65% | 11 | 5.54 s | 6.73 MiB |
| Auto | 5.47% | 29 | 2.62 s | 11.62 MiB |
| More detail | 12.47% | 57 | 1.63 s | 26.25 MiB |

Auto stayed at 2 seconds throughout this fixture. Low impact stayed at 5 seconds and More detail at 1 second. First-launch power was battery saver on the 7 GiB machine; each run records that state before explicitly switching power to Automatic. No live adaptive transition was observed, so these trials do not independently validate its recovery/backoff thresholds.

Median per-trial p95 native event-dispatch latency: recorder off 4.32 ms, Low impact 5.52 ms, Auto 4.79 ms, More detail 7.85 ms. This is OS-event-to-handler latency in a synthetic AppKit fixture, not trackpad-to-photon latency. Native event coalescing also occurs with the recorder off. Main-run-loop heartbeat p95 was already 36.3 ms in the control, so it is not an FPS measurement. Short-scroll settled captures were present in all nine mode trials, at 0.35–0.83 seconds after the last received input. Final-frame timing is the persisted frame timestamp, not database commit or timeline visibility.

All 60 workload cases completed (15 each for control and the three modes). Native policy tests: `recording_detail::tests` 4 passed; `power::` 31 passed. All 401 images decode, match the expected fixture window by independent OCR, and have matching page identity in text/tree/elements. Nine old-window scroll rows remain unlinked at focus transitions, one in each mode/repetition; they are not counted as linked successes.

### Searchable-text failure in the large document fixture

Nonempty accessibility text is insufficient as a correctness gate. Independent OCR found no visible row IDs in `full_text` for 111/122 Auto frames, 49/57 Low impact frames and 208/222 More detail frames: 368/401 total. All visible row IDs were indexed in 11, 6 and 14 frames respectively; two Low impact frames were partial. This fixture has 800 rows × 3 AppKit labels. The traversal can exhaust its budget on off-screen children; the thin-text heuristic counts those characters as content. All 401 recorded accessibility walks were marked truncated by timeout; mean walk time was 103–105 ms per mode. Higher detail permits larger extraction budgets but does not guarantee more useful visible text per frame, and the existing per-app work limit can be tighter. No matched base revision was run for this new fixture, so introduction of this issue is not attributed to the PR.

Frame 83 (More detail) shows rows 411–429; the persisted tree/full text contains only eight off-screen nodes from rows 0–2. The diagnostic below crops the actual saved image and lists its indexed row/column markers. [Exact frame metadata](m1-frame83.json).

![Saved viewport and indexed text](m1-visible-text-gap.png)

### Evidence and limits

[Native run and artifacts](https://github.com/screenpipe/screenpipe/actions/runs/36461202548), [M1 evidence artifact](https://github.com/screenpipe/screenpipe/actions/runs/36461202548/artifacts/10990990978), [all per-case measurements and integrity summary](macos-14.json). Evidence artifacts expire after 14 days. Raw images, JSON exports, fixture traces and logs are also retained in the originating task workspace.

The More detail standalone SQLite artifact is incomplete: its WAL was omitted by the artifact allowlist, leaving 204 database frames versus 222 in the complete JSON export. All 222 exported images are present. The Auto and Low impact standalone databases match all exported table counts. This is an evidence-packaging limitation; it is not proof of recording data loss. Use exported rows and saved images for the full More detail trial.

Only one cloud VM per configuration, sequential repetitions, synthetic native input and one display. Window B starts at its scroll boundary; the focus case validates switching and input delivery, not actual scrolling in both windows. CPU excludes the fixture, WindowServer, children and host hypervisor. Audio/transcription, physical battery/thermals, physical input, release builds and the packaged timeline were not measured. Different OS fixtures and display sizes are not a controlled cross-OS CPU comparison.


## Windows 11, 4 logical CPUs / 16 GiB

Azure Standard_D4as_v5, AMD EPYC 9V74, Windows 11 build 26100, Edge 154.0.4258.37, 1024×768. Same `c369f333` source, `debug-dev`, audio off, Balanced image quality. Three 60-second native-wheel trials per mode. The final 4.3–6.0 seconds are at the document boundary; saved-image row markers confirm movement throughout the preceding 54–55 seconds. [Independent results, hardware, per-trial measurements and test commands](windows-4core.json).

| Mode | Recorder CPU / machine capacity | Scroll-triggered checkpoints during input, median | All frames during input, median | Worst interval between active frames |
| --- | ---: | ---: | ---: | ---: |
| Low impact | 7.01% | 11 | 13 | 5.25 s |
| Auto | 7.58% | 11 | 14 | 5.25 s |
| More detail | 11.63% | 58 | 58 | 1.28 s |

CPU is the median of three recorder-only CPU-time delta averages, using samples strictly inside the input interval (58.7–59.9 seconds observed). It excludes child Bun/conhost processes, fixture/Edge and the OS. The original guest's per-sample medians include a different process set and must not be mixed with these averages. Windows gaps above are between stored active frames; unlike the Mac checkpoint-gap metric they do not include the initial/final active boundary. Windows process I/O was not sampled; saved JPEG bytes are recorded separately and are not total disk writes.

Auto began at 2 seconds and ended at 5 seconds with reason `capture_cost`, while AC power stayed nominal/performance. This confirms live backoff in the fixture, not a precise switch-time or recovery measurement. Low impact stayed at 5 seconds and More detail at 1 second. All nine continuous final captures were present: frame timestamps were 0.22–0.87 seconds after input. The first database poll already contained the tail, so its 1.51–2.73-second observations are upper bounds from delayed polling, not precise database write latency. Frame-link completion timing was not measured.

All 406 database frames have corresponding readable images, with complete stopped-database evidence. Of 400 images containing visible row markers, zero had no marker represented in searchable text. Strict marker recall is complete in 354; another 45 become complete after normalizing the OCR confusion O→0. One remains partial. This measures fixture row-marker recall, not general text transcription accuracy. Stored text includes accessibility, OCR and hybrid sources, so zero tree nodes alone does not mean missing text.

Native test filters passed: recording detail 6, power 39, event-driven capture 98, accessibility scroll 16. Filters overlap, so these counts are not a unique-test total. The optional Tauri persistence test was skipped for budget. Automatic's navigation action failed to change pages and is retained as an invalid case; the other modes verified Page B and focus-away/back. Quiet samples include reset/focus-related captures. Foreground latency was not measured; CPU alone cannot establish that users will see no lag. The accompanying 15-second desktop video is illustrative native scrolling with the recorder off, not a recording of the full benchmark or saved-frame playback.
