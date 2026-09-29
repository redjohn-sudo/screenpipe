# Matched Windows release workload

This harness uses the same release binaries for the two-core and four-core
comparisons. Run each mode in a fresh PowerShell 7 process with an isolated data
root. `run-mode.ps1` takes `Binary`, `SourceSha`, `Label`, `OutputRoot`, `DataRoot`,
`Mode`, and `Port`. Keep the fixture pages and `poll-db.ts` beside the script.

`sha256-manifest.json` records the exact files dispatched to both VMs. The
fixture pages are unchanged from the earlier benchmark.

One asynchronous sampler records process CPU, memory, system CPU, and the power
policy through startup, warmup, input, quiet periods, resets, and final text drain.
Use case timestamps to separate warmup and active input from total workload cost.
The process CPU counter uses 100% for one logical core; divide by the verified
logical core count for machine-normalized utilization. Neither quantity measures
native input latency.

Queue status comes from `recording_detail.text_pending`. A legacy response that
lacks this field is marked unsupported. It must not be reported as a verified
empty queue. Saved search responses provide separate evidence of exposed text.

The initial release producer's harness read a top-level `text_pending` field and
sampled CPU only within selected cases. Preserve those results as protocol
deviations. They cannot establish text drain time or total background CPU cost.
The v2 consumers rerun both revisions with this shared harness; they do not mix
producer measurements into the matched comparison.

Runtime parsing and native execution are validated on the disposable Windows
VMs. A hash match or local source inspection alone is not a native test pass.
