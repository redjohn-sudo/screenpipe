# M1 release comparison: OCR budget and exact-pixel cache

Sources: `e08fa22b93425806cc1a9dedcc8f56830cb51844` before, `0f44642ee1f810195367b3ded1075ac9af822462` after. [Native cloud run](https://github.com/screenpipe/screenpipe/actions/runs/36505313243).

| Mode | Continuous CPU, % machine | Worst continuous gap, s | Frames total | OCR jobs remaining | Median visible-row coverage |
| --- | --- | --- | --- | --- | --- |
| auto | 31.44% → 17.42% | 5.52 → 2.39 | 32 → 74 | 0 → 30 | 100% → 98% |
| low_impact | 31.49% → 8.12% | 5.53 → 5.53 | 28 → 30 | 0 → 11 | 100% → 100% |
| more_detail | 47.66% → 24.71% | 1.62 → 1.40 | 92 → 92 | 0 → 32 | 100% → 100% |

The table includes unfinished indexing as observed. A lower CPU figure does not establish equal-work efficiency if the after run saved fewer frames or left more work queued. Full case CPU, RSS, queue age, drain times, image hashes and every frame's text coverage are in the JSON files.

## What this establishes

The lower foreground CPU comes with a larger indexing backlog. After the two-minute drain limit, Auto/Low/More still had 30/11/32 jobs, with oldest waits of 188/248/190 seconds. All 73 corresponding frames lacked their visible row markers in both persisted full text and the actual search response. Median coverage hides this failure, especially in Low and More. Keep the PR in draft: this bounds background work but does not establish sustainable OCR throughput.

All 348 images decoded, reference chains were valid, and event-link identity checks found no invalid links. Before More detail frame 88 is labeled window B while its saved image and searchable rows show window A. It was visually confirmed. No such mismatch was observed in the after run; this small sample does not prove the timing-sensitive problem is eliminated.

Whole-workload CPU time, including quiet/reset/drain, was Auto 97.43 → 135.77 CPU-seconds, Low 89.90 → 62.75, and More 350.25 → 256.96. The after runs lasted about 331 seconds versus 211/211/238 before, and left work unfinished. These are not equal-completed-work energy comparisons. After Auto captured 74 frames versus 32; More captured 92 in both versions. No capture-delayed status samples occurred in either version.

## Evidence and test limitations

Artifact `11011005365` is 59,782,141 bytes; ZIP SHA-256 `0f8c972b78b428ce55cb9af4da7e2c235dd10c7343b1b45ef47b567e57fed227`, 517 entries, all ZIP CRC checks passed. Binary hashes match the signed application receipts. The pinned harness is `a33e923d2ed66b9c172889648f0ce5b642e97f88`. Machine: virtual M1, 3 logical CPUs, 7 GiB, macOS 14.8.9; release builds, High image quality, audio off.

The Mac harness exported recorder rows correctly but overwrote its standalone SQLite backup when it later visited an auxiliary database. All six SQLite backups contain no recorder tables and cannot verify the database independently. The same defect affects the earlier M1 and Intel release artifacts. This is an evidence-packaging defect, not proof of recording corruption. This audit uses complete frame/event/element/job JSON exports, saved-image hashes and the real search API responses. The auxiliary stores contain zero secret rows. Future exports now require exactly one database with the recorder schema; three regression tests cover auxiliary, absent and ambiguous databases. No corrected native export was rerun for these pinned workloads.

The regression step hit its 30-minute limit, so the workflow is failed. Uploaded logs independently record 8 recording-policy, 31 power, 51 capture, 2 queue and 5 frame-link tests passing. The final five-test result is present in the uploaded file although GitHub truncated the live stream at the deadline. These completed assertions are evidence; they do not turn the timed-out workflow into a pass. Source head `cdfb542d0` separately passed hosted Mac and Windows native OCR checks, Windows cancellation helpers, frontend/typecheck and AppImage smoke.

## Limits

One virtual M1 configuration, two repetitions per case and audio disabled. No physical battery, thermal, multiple-display, physical input-to-photon or packaged timeline-rendering certification. The capture timestamps used for gaps are not database arrival timestamps. Worker busy-time limits are not whole-machine CPU caps.
