# PR 7335 cloud configuration benchmark

This is a test-only branch. It temporarily replaces `benchmark.yml` with a manual-only workflow so GitHub can dispatch the workflow already registered on main. Do not merge that workflow replacement into the product branch.

The recorder source is pinned independently of the harness to `c369f333f2752bd6e0c243c2d665dafc49b9f21c`. Every artifact records both SHAs, actual machine identity and the executed binary hash. The profile is `debug-dev`: first-party Rust is unoptimized, dependencies use opt-level 2. These are diagnostic comparisons, not release or battery certification.

Run:

```sh
gh workflow run benchmark.yml --repo screenpipe/screenpipe --ref codex/pr7335-cloud-bench-20260928
```

The matrix uses isolated GitHub-hosted `macos-14` Apple Silicon and `macos-15-intel` guests. It first proves native scroll delivery and TCC permissions on the disposable guest. It then builds the exact engine and runs a synthetic AppKit fixture with 800 rows and three text fields per row. No local user app or recording database is involved.

For each of recorder off, Auto, Low impact and More detail, the workload runs three repetitions of:

- 30 seconds idle.
- 60 seconds sustained scroll, native input at approximately 20 Hz.
- A 2-second short scroll.
- Three seconds down, then three seconds up.
- Scrolling across two fixture windows.

Each input case includes six seconds to observe a settled capture. Resets and startup are excluded from active-window metrics. Mode order is reversed between the two architectures, but repetitions are sequential within one VM; this does not remove all order or shared-host effects.

Screenshot quality is explicitly `high`, audio and snapshot compaction are disabled, and the local API is unauthenticated only on the disposable loopback-bound test process. The initial hardware-tier power policy is recorded, then changed to `auto` for a controlled comparison across modes. `/power` is sampled once per second. The fresh-install policy evidence is separate from the performance measurement under controlled power policy.

CPU and process memory come from `proc_pid_rusage` every 500 ms. CPU units are calibrated against `CLOCK_PROCESS_CPUTIME_ID` on each guest before sampling. One fully occupied core is 100%; machine-capacity percentages divide that by the guest's actual logical CPU count. These counters exclude the fixture, WindowServer, host hypervisor and child processes.

Native input latency is measured from `NSEvent.timestamp` to entry into the scroll handler. A separate 50 ms main-run-loop heartbeat reports scheduling delay. Neither metric is physical input-to-photon latency. Frame latency uses persisted frame timestamps, not commit completion or timeline rendering. Event coalescing and document boundaries must be considered when interpreting input counts and final captures.

Artifacts retain cases, input/heartbeat traces, policy state, resource samples, frame and UI metadata, accessibility elements, database and screenshots. Uploads use an allowlist that excludes settings, authentication and secret-store files. `analyze.py <downloaded-artifact-directory>` writes `analysis.json`. Inspect images and validate native activity before interpreting its summaries.

Native recording-detail and power regression tests run after the workload. Failures and incomplete workloads remain failures; artifact upload alone does not establish a pass. Each job has a 150-minute maximum and GitHub disposes of the guest afterward. Evidence artifacts expire after 14 days; exact test binaries after 7 days. Retain the compact final report and required evidence separately.
