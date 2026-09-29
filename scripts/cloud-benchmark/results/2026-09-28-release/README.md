# Native release comparison for PR 7335

This report compares the PR before the first repairs (`bd766a7597004df1c60a79b223a1cd11f957e219`) with the first repaired release (`e08fa22b93425806cc1a9dedcc8f56830cb51844`). Later changes to OCR budgets, exact-pixel caching, cancellation, error propagation and browser-chrome detection are outside these source pins. The M1 budget follow-up is reported separately when its evidence is available.

The first repair improves data correctness but increases OCR work on the Mac fixture. It is not an across-the-board performance win.

## Completed configurations

| Configuration | Before → after frames, Auto / Low / More | Invalid event links, all modes | Independent visible-row coverage, median |
| --- | --- | --- | --- |
| macOS 14, M1 virtual, 3 logical CPUs, 7 GiB | 82 / 28 / 84 → 28 / 28 / 91 | 3 → 0 | 0% → 100% in each mode |
| macOS 15, Intel i7-8700B virtual, 4 logical CPUs, 14 GiB | 82 / 28 / 84 → 30 / 28 / 93 | 3 → 0 | 0% → 100% in each mode |
| Windows 11, 4 logical CPUs, 16 GiB | 110 / 59 / 120 → 112 / 59 / 124 | 13 → 0 | 100% in both versions |
| Windows 11, 2 logical CPUs, 8 GiB | 110 / 62 / 117 → 84 / 54 / 111 | 15 → 0 | 100% in both versions |

Every saved frame is audited, including frames without readable fixture row markers. Median coverage is not complete text recall. Partial overlap remains in several frames. One four-core Windows repaired Auto frame indexed browser controls while omitting both visible page rows. That native fixture reproduced an OCR-fallback error and now has a separate failing-before/passing-after regression in the product PR.

All 1,808 saved images across these four comparisons decoded. Frame reference chains and page identity checks passed. Independent Apple Vision OCR compared visible row IDs against each stored frame's full text and the actual search API response. The per-frame results, image hashes, reference checks and link failures are in each configuration's `integrity.json` and `visible-text.json` files.

## Process cost

CPU below is normalized to the VM's logical CPU capacity. Windows totals include quiet periods, reset work and the final drain, with warmup excluded. Mac totals also include post-input text processing. CPU excludes the fixture/browser, OS compositor and hypervisor, so these are not whole-system power measurements.

| Configuration | Auto before → after | Low impact before → after | More detail before → after |
| --- | --- | --- | --- |
| Windows 4 CPU, whole workload | 1.36% → 1.23% | 1.19% → 1.18% | 1.28% → 1.69% |
| Windows 2 CPU, whole workload | 4.25% → 3.90% | 3.41% → 3.16% | 4.26% → 4.25% |
| M1, continuous-input median | 2.50% → 30.83% | 1.14% → 31.09% | 7.46% → 42.83% |
| Intel Mac, continuous-input median | 2.86% → 36.30% | 1.39% → 36.13% | 8.54% → 42.02% |

The two-core Windows decrease coincides with fewer saved frames. The four-core More detail increase is small in absolute terms but real in this run. Cross-platform comparisons would be misleading because the fixtures, display sizes and native text providers differ.

On M1, More detail's maximum continuous-scroll gap fell from 7.55 s to 1.63 s. However, the first repair increased OCR CPU, peak RSS and queue depth. It also pushed Automatic to five-second sampling when text was pending. Follow-up `0f44642ee1f810195367b3ded1075ac9af822462` removes that queue-to-capture feedback, budgets the serial text worker and reuses OCR for exactly matching cropped pixels. Its [matched M1 release comparison](https://github.com/screenpipe/screenpipe/actions/runs/36505313243) compares against `e08fa22b9`; results must be assessed before claiming a performance fix. Worker-time budgets are not whole-machine CPU caps.

M1 and Windows repaired runs drained their OCR queue. Intel More detail still had nine jobs after the 120-second drain limit, with nine corresponding frames missing all visible row IDs in indexed/search text. Its queue peaked at 41 jobs and 161 seconds oldest age. Worst continuous-scroll gap improved from 9.25 s to 1.55 s, but the whole workload consumed 542.74 CPU-seconds over 331.74 wall-seconds. Auto and Low impact drained; they also showed substantial CPU increases. Two delayed-capture samples were during startup, before measured input. M1 More detail peaked at 24 jobs and 47 seconds oldest age, then drained for 9.37 seconds after the workload. Windows after-runs peaked at at most one job in sampled status. The two-core More detail delayed-capture sample occurred during startup, before measured input.

## Windows arrival evidence

The guest summary incorrectly described all quiet-poll traces as empty. Raw traces contain observations for all scroll/reversal cases. Across both tiers and versions, all 60 such cases observed a post-input `scroll_stop` frame. In the repaired runs, the first observation was 0.18 to 1.34 seconds after the final input. This is an upper bound from roughly 100 ms polling, not exact commit time, proof of settled pixels or timeline rendering latency.

Navigation/focus polling begins after its actions and waits. An empty post-action poll can therefore follow a successfully saved transition. No timestamp-query fix was made on the basis of the incorrect guest interpretation.

## Recordings and provenance

The [Windows recording](https://github.com/user-attachments/assets/22480ba5-5ccb-4638-a006-f26b2a126a89) and [M1 recording](https://github.com/user-attachments/assets/cefe38f2-dac3-45bf-843a-6be1373b257a) replay the engine's actual saved screenshots at 1×, using the latest frame at or before each displayed timestamp. Gaps hold the previous image. The clips cover continuous, short and reverse scrolling, plus navigation/focus. Full decode and frame-selection checks passed. They do not measure database arrival or packaged timeline rendering.

- [Mac workflow and downloadable raw evidence](https://github.com/screenpipe/screenpipe/actions/runs/36494902200), harness `b1a7ab479867065cb7e955048b1c834b0f72d4c4`. M1 ran before then after; Intel ran the reverse order.
- Both Windows tiers ran identical release binaries. Binary ZIP SHA-256: `ce0119d2c54066f69060754c08ccee7b464da4e1d133473d6d80b5d86949925a`. Before executable: `292bf41b37f9c7956c2ef34a384e4091bfb821152cfeda7c412fc1ce0b8b601e`. After executable: `0f3433d17b06a00561ed6efa3a186ba7339285ca295525895998e1f95c4cb707`.
- Windows matched-v2 harness ZIP SHA-256: `35d416997fdb7293e815f73579c4f706cc82f17910394910c735018601b31715`. The two-core VM ran after then before; the four-core VM ran before then after. Harness hashes were unchanged after execution.
- Windows evidence ZIP SHA-256: two-core `edabfbd92145ed1da56f531cd37dee6633c93a2bb2eccc79352f2b039beb2bd5`; four-core `b9f29e8d722dd123871960e98a6224b324b4d23c0a6b325d97369ad1ff8c5c6c`. Archives passed CRC and source/output manifest checks. Public audit files omit the ephemeral browser profiles and raw private infrastructure logs.
- The original Windows build producer used a weaker first harness. It did not sample all quiet/drain periods and read an obsolete queue-status path. Its CPU and queue summary is excluded from performance rankings. Its binaries and separately run native tests remain usable evidence.

## Limits and tests

One VM per configuration and two input repetitions are insufficient to characterize a hardware population. All runs used AC power, synthetic input and audio disabled. Physical battery, sustained thermal throttling, physical GPUs, multiple displays, audio-enabled workloads, trackpad-to-photon delay and packaged timeline rendering remain unverified. macOS and Windows use different fixtures.

The initial M1 release workloads completed. Its subsequent test stage failed when a tree-worker test silently accepted a 100 ms setup timeout under load. The repair now checks the initial response and allows five seconds for setup while retaining the continuation-spacing assertion. This is separate from changing production timeouts. The Intel release workloads also completed, but its native test stage hit its 30-minute limit while still compiling. That stage is incomplete, not a passing test result. The newer M1 budget run is pending when this report was prepared.

`summary.json` contains the machine-readable comparison; `sha256.json` pins the published audit files. The analysis tools live beside this results directory. An adversarial frame-audit calibration verifies wrong context, missing reference chains, partial visible rows and missing OCR/search evidence. The Windows cumulative-counter calibration verifies normalization, interval boundaries, background cost, absent observations, disappeared processes and seven-digit timestamp fractions.
