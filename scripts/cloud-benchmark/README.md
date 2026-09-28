# PR 7335 cloud configuration benchmark

This is a test-only branch. It temporarily replaces `benchmark.yml` with a manual-only workflow so GitHub can dispatch the workflow already registered on main. Do not merge that workflow replacement into the product branch.

The current matched comparison uses release engines from `bd766a7597004df1c60a79b223a1cd11f957e219` (before repair) and `e08fa22b93425806cc1a9dedcc8f56830cb51844` (after repair). Both revisions use the same main baseline. Every artifact records the source and harness SHAs, actual machine identity and binary hash. The later product commit `683a832a1f1803a7e56e3dfd89db29bf4718d46f` only synchronizes nested Cargo lockfiles; recorder source and the root lockfile are unchanged. Historical results under `results/2026-09-28` used `debug-dev` and remain diagnostic evidence, separate from the release comparison.

Run:

```sh
gh workflow run benchmark.yml --repo screenpipe/screenpipe --ref codex/pr7335-cloud-bench-20260928
```

The matrix uses isolated GitHub-hosted `macos-14` Apple Silicon and `macos-15-intel` guests. It first proves native scroll delivery and TCC permissions on the disposable guest. It then builds the exact engine and runs a synthetic AppKit fixture with 800 rows and three text fields per row. No local user app or recording database is involved.

For each of recorder off, Auto, Low impact and More detail, the workload runs two repetitions of:

- 15 seconds idle.
- 30 seconds sustained scroll, native input at approximately 20 Hz.
- A 2-second short scroll.
- Three seconds down, then three seconds up.
- Scrolling across two fixture windows.

Each input case includes six seconds to observe a settled capture. A fixed 60-second startup settling period precedes each recording mode. Resets and startup are excluded from active-window metrics. Total workload CPU also includes resets, quiet periods and up to 120 seconds of final text processing, so deferred OCR cost is retained. Pending text jobs and the drain time are reported separately. Mode order is reversed between the two architectures. M1 runs before then after; Intel runs after then before. Repetitions remain sequential within one VM, so shared-host and order effects are not fully removed.

Screenshot quality is explicitly `high`, audio and snapshot compaction are disabled, and the local API is unauthenticated only on the disposable loopback-bound test process. The initial hardware-tier power policy is recorded, then changed to `auto` for a controlled comparison across modes. `/power` is sampled once per second. The fresh-install policy evidence is separate from the performance measurement under controlled power policy.

CPU and process memory come from `proc_pid_rusage` every 500 ms. CPU units are calibrated against `CLOCK_PROCESS_CPUTIME_ID` on each guest before sampling. One fully occupied core is 100%; machine-capacity percentages divide that by the guest's actual logical CPU count. These counters exclude the fixture, WindowServer, host hypervisor and child processes.

Native input latency is measured from `NSEvent.timestamp` to entry into the scroll handler. A separate 50 ms main-run-loop heartbeat reports scheduling delay. Neither metric is physical input-to-photon latency. Frame latency uses persisted frame timestamps, not commit completion or timeline rendering. Event coalescing and document boundaries must be considered when interpreting input counts and final captures.

Artifacts retain cases, input/heartbeat traces, policy state, resource samples, frame and UI metadata, accessibility elements, database and screenshots. Uploads use an allowlist that excludes settings, authentication and secret-store files. `analyze.py <downloaded-artifact-directory>/before` and the corresponding `after` command write separate `analysis.json` files. Shared machine metadata stays in the parent directory. The analyzer also accepts the original flat artifact layout. Inspect images and validate native activity before interpreting its summaries.

After the September 28 run exposed committed rows remaining in the WAL, the harness also creates `database-snapshot.sqlite` with SQLite's backup API. This standalone file includes committed WAL contents. This correction applies to future runs; the original run's More detail database artifact remains incomplete and its full JSON exports/images are the retained evidence. `audit_artifact.py` checks saved image decoding, references, page identity and database/export counts; `Ocr.swift` plus `audit_ocr.py` independently compare visible fixture row IDs against searchable text. A nonempty tree alone is not a text-coverage pass.

Native recording-detail and power regression tests run after the workload. Failures and incomplete workloads remain failures; artifact upload alone does not establish a pass. Each job has a 180-minute maximum and GitHub disposes of the guest afterward. Evidence artifacts expire after 14 days. Current artifacts retain binary hashes and build logs; they do not retain the executable files. Retain the compact final report and required evidence separately.
