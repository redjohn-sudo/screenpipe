<!-- screenpipe — AI that knows everything you've seen, said, or heard -->
<!-- https://screenpipe.com -->

# Historical validation before the September 28 capture repairs

This is the PR description retained from head `e5e459a8e24186e0042f93b089755e38c3e0c4b1`. Its current-head statements refer to that historical revision, not the new repairs.

## Problem and resulting behavior

Continuous scrolling could collapse to one final viewport. Page switches could pair new text with old pixels, excluded-window transitions could leak pixels or UI element text, and failed timeline warm-up could leave requests waiting 30 seconds.

This PR adds configurable scroll checkpoints plus the settled tail, preserves horizontal/reverse input and correlation IDs, and releases final frame links without requiring another input. Windows polls same-HWND title changes, preserves focus settling across non-focus triggers, and checks HWND/PID/title before and after capture and asynchronous click enrichment. A permitted basic click survives when enrichment cannot safely be attributed. Blocking native input waits run outside Tokio workers.

macOS transitions request fresh pixels; exclusion changes replace the filtered stream and clear its old buffer. Element references use current content and geometry. Malformed audio offsets retain transcripts without panicking, and failed/cancelled cache warm-up releases waiters.

Depends on draft [screenpipe/sck-rs#25](https://github.com/screenpipe/sck-rs/pull/25), pinned at `60610e8c970af1ea9d47e274c1a48182e1da5bd1`.

## Current cloud validation and localization fix

Native cloud benchmarks use recorder source `c369f333f2752bd6e0c243c2d665dafc49b9f21c`, with Automatic, Low impact and More detail modes on Windows 11 and Apple Silicon/Intel Macs. **Unit tests pass, but saved-data and timing audits found failures. This is not a performance or merge certification.** [Mac run and artifacts](https://github.com/screenpipe/screenpipe/actions/runs/36461202548) · [Complete configuration report, frame diagnostics and per-case measurements](https://github.com/screenpipe/screenpipe/blob/a24caecc045245397ff8adbfe4801dd54c9ff989/scripts/cloud-benchmark/results/2026-09-28/README.md).

CPU below is median recorder-only CPU during three 60-second continuous-scroll trials, divided by logical CPU count. Diagnostic `debug-dev` builds, audio off, one VM per configuration. Mac uses High clarity at 1920×1080; Windows uses Balanced at 1024×768 with a different fixture. Compare modes within a configuration, not OS rankings. Intel trials have substantial variability; the report includes ranges and worst gaps.

| Configuration | Low impact | Automatic | More detail |
| --- | ---: | ---: | ---: |
| M1 / 3 logical CPUs / 7 GiB | 2.65% | 5.47% | 12.47% |
| Intel Mac / 4 logical CPUs / 14 GiB | 5.41% | 4.66% | 21.34% |
| Windows / 4 logical CPUs / 16 GiB | 7.01% | 7.58% | 11.63% |
| Windows / 2 logical CPUs / 8 GiB | 10.71% | **Stalled; invalid comparison** | 18.84% |

**Material findings:**
- Both Mac architectures saved correct screenshots whose visible row IDs were absent from searchable text: 368/401 M1 frames and 256/301 Intel frames. A large accessibility tree can exhaust its budget on off-screen children.
- Intel capture gaps reached 15.36 seconds in Auto, 14.51 in Low impact and 8.88 in More detail, coinciding with expensive OCR/hybrid work. A 1-second sampling target does not guarantee a frame each second.
- Two Intel scroll events from window A incorrectly link to window B screenshots after focus switches. Exact event/frame records are in the report.
- The corrected 2-core Windows Auto run saved only 1 / 0 / 5 frames during three 60-second trials, with repeated 15-second timeouts, a capture-manager restart and 78 unlinked scroll events. Coarse OS samples showed saturation; startup/load versus mode effects are not isolated. Low impact had a 13.79-second first-trial gap. Five saved Windows images lacked visible row markers in searchable text. The 4-core run had regular scroll cadence and zero zero-overlap cases among its 400 marker-readable images.

No matched base revision was run for the new fixtures, so these failures are not established PR-introduced regressions. The original 2-core Windows run used a blocking sampler and is separately labeled a protocol deviation; the correction uses the pinned final 4-core harness and identical executable. Original 4-core Auto navigation was invalid. Every retained frame is independently audited; missing/unverified cases and the M1 standalone SQLite/WAL packaging limitation remain explicit.

All 1,441 saved images across the four configurations were checked against stored rows and independent image OCR. Both ephemeral Mac jobs completed; all three task-owned Windows resource groups were verified deleted after downloading evidence. Shared evidence storage and build-image resources were preserved.

Both Mac native jobs completed successfully: 4 recording-detail and 31 power tests each. Windows producer test filters passed 6 recording-detail, 39 power, 98 event-driven capture and 16 accessibility-scroll tests (overlapping counts). The corrected 2-core consumer reuses the verified binary and does not claim an independent compilation/test run. CPU, memory, storage, cadence, visible-text coverage and event/frame context are measured separately. Physical battery/thermal, release-build performance, audio-enabled recording and actual input-to-display latency remain unverified.

Commit `e5e459a8e24186e0042f93b089755e38c3e0c4b1` fixes the production localization compiler rejecting the dynamic runtime status. `derive()` exposes the status helper's strings to the collector. This changes only the React component and its test mock; recorder source is identical to the benchmark revision.

Validation: `bun scripts/i18n/collect.mjs gt.config.json` reproduced both extraction errors before the fix and passed afterward, with all 11 runtime status messages present. `bun run test:vitest components/settings/recording-policy.test.ts components/settings/recording-mode-card.test.tsx`: 15 passed. `bun run typecheck`, `bun run coverage:all:check`, `SCREENPIPE_I18N_MODE=cached bun run build`, and `git diff --check` passed. Cached localization uses available translations/fallbacks and does not validate newly generated translations. This is a frontend build, not a packaged native-app pass.

## Recording controls and power behavior

**Settings → Screen** now separates capture sources from one **Recording mode**: Automatic (recommended), Low impact, More detail, or Custom. Detail, image clarity, idle screenshots, HD capture and power overrides live under collapsed **Advanced recording options**. Search opens the containing section. Existing custom values remain intact and display Custom.

Selecting a preset previews the affected preferences before saving: detail changes, with optional resets of power to Automatic and idle screenshots to follow the power profile. Users can uncheck either reset to keep that preference; only selected resets are written. The resulting mode label updates live, including Custom when overrides are retained. Image clarity stays at the user’s chosen value in every mode, including High or Max. Clarity alone does not change the mode label to Custom. Only changed values appear in the preview. Cancel writes nothing. Modes preserve image clarity, capture sources, privacy, audio policy, HD and keep-awake. The existing serialized Apply & Restart flow activates changes; runtime status remains separate from pending preferences. Managed settings lock bulk presets when any affected field is managed.

| Detail preference | Continuous-scroll target | Maximum AX extraction budget |
| --- | --- | --- |
| Low impact | 5 s | 1,000 nodes / 100 ms |
| Balanced (Advanced) | 2 s | 2,000 nodes / 150 ms |
| More detail | 1 s | 5,000 nodes / 250 ms |
| Auto | Starts at 2 s, adapts between 1/2/5 s | Follows the effective tier |

These are sampling targets and extraction ceilings, not guaranteed frame rates or CPU limits. More detail permits more intermediate captures and accessibility text; Low impact can retain less searchable text. Existing per-app limits apply, including in text-only capture. CLI `--recording-detail auto|low_impact|balanced|more_detail` remains available; an omitted flag preserves the saved choice.

Auto backs off after 3 consecutive focused-monitor captures above 750 ms and recovers after 10 below 250 ms. Fixed detail preferences do not adapt to capture cost. **All detail preferences now respect temporary power floors** (Performance/Balanced/Saver: 1/2/5 s). Saved detail, idle interval and image quality restore when limits lift. This also fixes image quality remaining low after returning to AC.

The status explains battery reductions, heat, capture cost, pauses and unavailable status. In Automatic power mode, unplugged battery at ≤20% pauses screenshots and by default audio; **Audio & meetings → Audio on low battery** can keep audio running while screenshots remain paused. At ≤10%, all recording pauses. Low Power Mode alone throttles rather than stops recording. The audio preference defaults to the previous pause behavior and is preserved by recording presets. Advanced manual power modes disclose that they bypass automatic low-battery pauses; Ignore battery limits requires a change confirmation. Serious/critical thermal protection applies even to that override. Keep-awake remains separately controlled and immediate; HD/meeting overrides are disclosed.

The 400 ms quiet-scroll deadline is unchanged. The native input callback still only reads a shared atomic; no new callback lock or allocation. Runtime status polling is confined to the open settings UI, every 5 seconds with overlapping requests prevented. No new screenshot admission/drop gate or database writer is added.

### Settings screenshots

Actual app components with synthetic browser-mock data, 1280×720. Before is the retained capture from `7f148a665`; overview and battery/audio states are from `838c99d791cca7721ae7e880b352ed1b74ce6f2d`; the customizable change preview is from `c369f333f2752bd6e0c243c2d665dafc49b9f21c`. These are UI evidence, not native recording or performance measurements.

| Before: controls at the same level | After: sources, mode, then Advanced |
| --- | --- |
| ![Before recording settings hierarchy](https://github.com/user-attachments/assets/9eeee631-4442-4cd0-872d-e35372ea4cc0) | ![After recording mode with collapsed advanced options](https://github.com/user-attachments/assets/7d1eaaf4-8d0a-4082-aab3-f1ab62258c82) |

| Preview changes before saving | Explain temporary battery interruption |
| --- | --- |
| ![Preset change preview lets users choose additional resets](https://github.com/user-attachments/assets/1343136c-6f5a-461c-bcb9-e088546fb4f7) | ![Low battery explains paused audio and screenshots](https://github.com/user-attachments/assets/ce2d9211-66e5-4414-86cd-93c614842d4a) |

![Independent audio policy under Audio and meetings](https://github.com/user-attachments/assets/cfb7ebde-6350-4f4c-9a3b-0672589818cf)

[Light theme and unavailable-status fallback](https://github.com/user-attachments/assets/5d55dbc8-e34a-4f43-8502-ecb0529f21ad)

Browser checks cover keyboard mode selection, Custom opening Advanced without writes, changed-value preview, cancel preserving preferences, restoring Automatic, Apply & Restart in the mock, settings search opening collapsed controls, audio policy, low/critical battery, heat and unavailable states, and light/dark appearance. The mock store resets on full navigation; native persistence is covered separately.

### Customize changes before saving

The modal offers independently selectable battery and idle resets, preserves unchecked preferences, and previews the resulting mode. Retained manual battery overrides explicitly disclose that automatic low-battery pauses remain overridden. Cancel writes nothing; each new preview starts with the proposed preset defaults. Image clarity remains independent and unchanged.

Actual synthetic browser-mock components, 1280×720. Before is retained from `dde0ac1`; after is `c369f333f2752bd6e0c243c2d665dafc49b9f21c`.

| Before: preview only | After: select changes before saving |
| --- | --- |
| ![Before modal with no choice of resets](https://github.com/user-attachments/assets/0cb21ade-8775-4ab4-bd8a-2d5a82101eac) | ![After modal with optional battery and idle resets](https://github.com/user-attachments/assets/1343136c-6f5a-461c-bcb9-e088546fb4f7) |

![Keeping current settings previews Custom and explains retained battery override](https://github.com/user-attachments/assets/48686965-2d80-47e0-bea9-942a14fcd32b)

[Light theme](https://github.com/user-attachments/assets/8d6b3efb-3876-49f8-b4ef-edf8a15942a0)

At `c369f333f2752bd6e0c243c2d665dafc49b9f21c`, the same 8-file Vitest command below passes **39 tests**. `bun run typecheck`, `bun run coverage:all:check` and `git diff --check` pass. Added tests exercise all four reset combinations, resulting labels, selected-field-only writes, cancellation and fresh defaults on reopening. Browser checks cover keyboard toggles, light/dark, and Save → Apply with More detail while retaining High clarity, a 2-second idle interval and the manual power override. Initial regression run had 7 failures/4 passes before implementation. Backend unchanged; native results below retain their actual source revision. That historical head did not establish a complete hosted CI pass. [Gateway E2E](https://github.com/screenpipe/screenpipe/actions/runs/36452426298/job/109030226934) failed before tests because the MinIO image pull was unauthorized.

### Native and hierarchy validation at 838c99d

Source: `838c99d791cca7721ae7e880b352ed1b74ce6f2d`. Focused filters overlap; counts are not a unique-test total.

| Command | Result |
| --- | --- |
| `cargo test -p screenpipe-engine --lib power:: --no-default-features` | 31 passed |
| `cargo test -p screenpipe-engine --lib recording_ --no-default-features` | 38 passed |
| `cargo test -p screenpipe-engine --lib event_driven_capture::tests --no-default-features` | 98 passed |
| `bun run test:tauri recording_detail` | 1 passed; store round-trip, legacy default, audio policy reaches engine config |
| `bun run test:tauri --features enterprise-build enterprise::managed_settings::tests` | 7 passed |
| `bun run bindings:generate` / `bun run bindings:check` | 1 generation test + 1 freshness test passed |
| Focused Vitest suite below | 32 passed across 8 files |
| `cargo check -p screenpipe-engine --bin screenpipe --no-default-features --features redact-onnx-cpu` | Passed |
| `bun run typecheck`, `cargo fmt --all -- --check`, `git diff --check`, `bun run coverage:all:check` | Passed |

Vitest command:
```sh
bun run test:vitest components/settings/recording-policy.test.ts components/settings/recording-mode-card.test.tsx components/settings/recording-detail-card.test.tsx components/settings/battery-saver-section.test.tsx components/settings/settings-disclosure.test.tsx components/settings/settings-write-queue.test.ts lib/hooks/managed-settings.test.ts lib/dev/browser-runtime.test.ts
```

Tests cover fixed-mode power limits and restoration, preserved quality/idle preferences, critical pause, thermal protection with manual override, independent audio policy without re-enabling screenshots, actual status serialization, cancel/no writes, managed locks, disclosure/search and legacy persistence. Tauri commands used the required build queue. The earlier local SwiftPM output-layout workaround remains confined to ignored build artifacts; this is not a clean-machine packaged-build claim. A CLI check without the required ONNX feature failed on an existing ungated import; the supported feature combination above passed.

**Historical evidence limit:** the native before/after videos and CPU/storage figures below predate the recording presets and hierarchy. The current cloud benchmark above measures those presets separately; its short Windows desktop clip is illustrative with recording off, not benchmark playback. Release/battery/foreground-latency performance remains unverified. Reduced work budgets must not be presented as measured percentage savings. At the preceding head, [Gateway E2E](https://github.com/screenpipe/screenpipe/actions/runs/36445964959/job/109008219749) failed before product tests because the MinIO image pull was unauthorized; it is not passing validation.

## Historical native Windows video

Native Windows source `f9021082921dc10a5344538a56dce69ce8f2794c`. Seven-case replay: continuous scroll, reverse, page navigation, short scroll with no later input, excluded Notepad transitions, ignored page in the same HWND, and idle. Actual stored images at real time, 10 fps, no interpolation or future-frame selection.

https://github.com/user-attachments/assets/7ba8cb52-91b9-43a0-b682-18b55365afd5

![Windows before and after](https://github.com/user-attachments/assets/9a940d46-b7d4-435f-a155-b66fd12d19d7)

[Raw desktop before](https://github.com/user-attachments/assets/d3747009-c5eb-498b-b0bf-8d5ee6144470) · [Raw desktop after](https://github.com/user-attachments/assets/8e4a93be-aaea-42c7-a201-53b5c1ea4f2d)

The raw AFTER is 150 seconds and covers all cases. The reviewed replay is 81.2 seconds with 1,418 checked frame selections; all delivered MP4s fully decode. Scroll/navigation baseline is genuine `dd47357e4`; the Notepad privacy RED uses `70f3b394c`. Each panel labels its actual source. After-only cases explicitly have no matched baseline; unequal-duration cases explicitly hold the last image. The guest initially supplied a mislabeled historical BEFORE clip: delivery restores the genuine retained dd473 clip and baseline metadata, with exact correction hashes included. AFTER evidence is unchanged.

## Historical native macOS video

https://github.com/user-attachments/assets/be1c1f85-5afb-4978-a164-fa55c90cd894

[Raw desktop before](https://github.com/user-attachments/assets/46cb84dd-cd94-4fe8-8ef2-f05213485d59) · [Raw desktop after](https://github.com/user-attachments/assets/4e41353c-d429-4b78-b485-d52873bfc92c)

Native macOS source `70f3b394c1954e763e1cc9cbe71261401ff4a548`, baseline main `7793b0938`. Through f902108, later commits changed formatting, nested workspace lock pins, separately tested history handling and Windows-only code. This update additionally changes macOS recording detail; the native VM video was not rerun for it. The 51.8-second replay covers continuous, short-tail, reverse, focus and idle; all 1,036 selections are preceding frames. Native engine recordings use synthetic fixtures, not personal/customer data or packaged Tauri timeline footage.

## Measured behavior and cost

| Repeated native case | Before | After |
| --- | ---: | ---: |
| macOS scroll checkpoints / 60 s | 1 | 59 |
| Windows scroll checkpoints / 60 s | 1 | 59 |
| macOS median final capture delay | 3.4 s | 0.7 s |
| macOS continuous process CPU, one core | 2.09% | 10.71% |
| Windows continuous process CPU, one core | 6.28% | 19.94% |
| macOS process writes / ~65 s case | 1.69 MiB | 13.81 MiB |
| Windows data-directory growth / ~62 s case | 1.38 MiB | 20.80 MiB |

Three continuous trials on each OS. Worst active gaps: macOS 1.31 s, Windows 1.46 s. Windows preserved all 1,200 wheel inputs / -24,000 delta in each trial, with all 59 rows linked. Final short-scroll row linked with no future input: macOS 0.603/0.590/0.506 s over three trials; Windows first observed at 0.524 s after last input in one final trial (75 ms polling; 0.430 s after poll start). Old-page rows intentionally cancelled across focus/privacy boundaries remain stored and unlinked; they are not counted as successful links.

macOS four-minute soak: 180/180 scroll rows linked, 9.46% one-core CPU, 66.0 MiB peak physical footprint, 2.8 MiB growth. Windows three-minute soak: 144/144 linked, 18.50% CPU, ending working set 58.55 MiB and private bytes 67.87 MiB (+0.72 MiB). These short soaks do not certify absence of leaks.

CPU 100% means one core, not the whole machine. Development builds, audio disabled, sequential historical VM runs. macOS 26.6.2 arm64, 4 vCPU/8 GiB; Windows 11 26100, 16 logical processors. Windows idle intervals differ before/after, so no controlled idle-speedup claim. Process writes and data-directory growth are different metrics. These results show improved fidelity with higher active CPU/storage cost; release, battery and packaged-UI performance remain unverified.

## Privacy and correctness evidence

- Windows final independent SQLite audit: 56 visual + 410 performance frames, all 451 UI rows across every column, and 100,446 resolved element rows. Zero excluded fixture markers; all nine blank-title visual frames included. Seven positive allowed clicks retain element details. Both SQLite snapshots pass quick_check with the pinned sqlite-vec extension.
- All 466 Windows saved JPEGs independently OCR-scanned, zero excluded marker hits or OCR errors; all 18 privacy-boundary images visually reviewed. This is fixture/context consistency, not every-pixel or every-glyph correctness.
- macOS: all 422 performance images, 35 video frames, and 24 frames across 20 focus switches have matching page/context markers. Five allowed/ignored cycles: all seven stored images checked including blank titles, zero excluded pixels/text/tree/elements/UI rows, all 10 allowed scroll rows linked.
- Actual failures are retained: excluded Windows pixels on 70f3 and excluded UI row 37 on f4dd. Earlier image-only/blank-title-skipping grader passes were rejected; final audits include blank metadata and all UI text. Calibration fixtures are not counted as native trials.

## Tests and receipts

The historical Windows native build at f902108 and the following focused checks passed. Test filters overlap; do not add the counts into a unique-test total.

| Command (Windows uses `--profile debug-dev`) | Passed |
| --- | ---: |
| `cargo test -p screenpipe-a11y scroll --lib` | 14 |
| `cargo test -p screenpipe-a11y platform::windows::tests --lib` | 24 |
| `cargo test -p screenpipe-engine event_driven_capture` | 98 |
| `cargo test -p screenpipe-engine ui_recorder --lib` | 65 |
| `cargo test -p screenpipe-engine --test frame_linker_actor_integration` | 7 |
| `cargo test -p screenpipe-engine hot_frame_cache --lib` | 7 |
| `cargo test -p screenpipe-engine timeline_websocket --lib` | 3 |
| `cargo test -p screenpipe-db --test timeline_frameless_audio_test --test timeline_live_meeting_test --test timeline_live_meeting_index_test` | 20 |

Native click regression `platform::windows_uia::click_privacy_tests::enrichment_requires_exact_event_time_context`: one pass, including unknown/mismatched PID, changed title and change-during-lookup cases. Native build plus final `cargo fmt --all -- --check`, `git diff --check` and `bun run coverage:all:check` pass; host formatting/diff/coverage checks also pass at f902. Raw logs retain failed compile and zero-match harness attempts; those are not behavioral RED or passing tests.

macOS focused native checks: scroll 13, UI 65, capture 97, linker filter 13, actor integration 7, cache 7, WS 3, DB 20, screen monitor 27 pass/2 ignored. Dependency: 40 focused tests pass, 8 host-surface tests filtered. Host capture 98 passed after platform scoping. Malformed negative `-1e30` offsets first reproduced a duration panic, then passed DB20 and real WS3 regressions; each WebSocket regression has a 2-second deadline. This verifies the reproduced failure class, not the identity of the original private malformed row.

## Reproduction artifacts

Extract each OS's data and image parts together. Archives include fixtures, input traces, SQLite snapshots, frame/UI metadata, all final saved images, test logs, audit/render source and file hashes. Historical baseline Mac performance images are sampled. Native control credentials/binaries are omitted.

Windows: [data and test logs](https://github.com/user-attachments/files/32716392/windows-evidence-data.zip) · [images 1](https://github.com/user-attachments/files/32716396/windows-evidence-images-1.zip) · [images 2](https://github.com/user-attachments/files/32716398/windows-evidence-images-2.zip) · [images 3](https://github.com/user-attachments/files/32716400/windows-evidence-images-3.zip)

macOS: [data and test logs](https://github.com/user-attachments/files/32713266/macos-evidence-data.zip) · [images 1](https://github.com/user-attachments/files/32713268/macos-evidence-images-1.zip) · [images 2](https://github.com/user-attachments/files/32713273/macos-evidence-images-2.zip) · [images 3](https://github.com/user-attachments/files/32713277/macos-evidence-images-3.zip)

[Timeline history RED/GREEN](https://github.com/user-attachments/files/32713490/timeline-history-regressions.zip) · [Windows pixel RED](https://github.com/user-attachments/files/32713874/windows-privacy-regression-before.zip) · [Windows UI-text RED](https://github.com/user-attachments/files/32715391/windows-ui-privacy-regression-before.zip)

## Remaining limits

Draft, no merge or release. At current head `e5e459a8e24186e0042f93b089755e38c3e0c4b1`, the checks returned by GitHub are four successful CodeQL entries; this is not a full current-head build/E2E pass. GitHub reports merge conflicts. Earlier packaged macOS/Windows onboarding E2E failures and the gateway MinIO authorization failure remain historical failures, not passing checks. The new cloud workloads expose the text-coverage, capture-stall and event-link issues above. Pre-macOS14 runtime, physical trackpad, physical low-end devices, multiple displays, release/battery/thermal and foreground input-to-display performance remain unverified. The installed host app and personal database were not replaced or restarted.
