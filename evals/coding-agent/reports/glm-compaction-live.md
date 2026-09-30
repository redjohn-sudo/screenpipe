# GLM compaction evaluation

## Scope and method

This evaluates the app's configured `glm-5.3-flash-reap50-iq3m` model (32,768-token
context, 8,192-token output limit) through Screenpipe's authenticated, attested,
encrypted transport. Inputs are fictional. No recorder queries, customer records,
catalog changes, installed runtime edits, or external actions are involved.

The baseline uses the installed Pi 0.84.1 summarizer and serializer. The candidate
uses the same pinned SDK in a disposable installation, patched by the production
Rust installer. Both use the SDK's actual summary/update prompts, the shipped GLM
tool-result guard and request adapter, low reasoning, the same output allowance,
120-second request deadlines, and no SDK retries or model fallback. The first
candidate changed only serialization of evidence before summarization. Its partial
outputs remain available; it was superseded after the baseline exposed a separate
uncertainty error. The final candidate also preserves uncertainty explicitly in
the existing summary instructions and rejects incomplete summaries. Both installs
use Pi AI 0.84.1 and OpenAI SDK 6.26.0; their provider adapter hashes match.

The eight fictional task variants cover source references at three positions,
user corrections and measured time, partial saves and failed searches,
deduplication/missing screenshots/no-change, untrusted instructions and user stop,
and exact Unicode references. Each has a full-context control and two independently
generated summaries followed by continuation. Two tasks also undergo a second
summary before continuation, for 20 compacted continuations per arm. Expected
answers are local scorer inputs and are never supplied to the model.

A separate stress case uses real SDK cut-point selection with 8,192 recent tokens,
turn-prefix compaction, a disk-backed session and reopening. It repeats compaction
without new evidence to test retention across cycles. The stress test forces
compaction; automatic triggering and cancellation are covered separately by the
real-runtime deterministic tests.

The original strict grader requires the requested JSON values. A supplemental,
versioned rubric distinguishes fact loss from formatting and accepts `prepared`,
`unsent`, `not sent` and the source's `prepared, not sent` as descriptions of an unsent `draft`, because the task did not prescribe an enum and
the source explicitly used that word. Original outputs and strict verdicts remain
unchanged. Both arms receive supplemental rubric v3. Calibration rejects
missing fields, guessed references, fabricated duration, false completion,
publication after stop, and malformed responses.

## Failure and repair

Pi's serializer retained only the first 2,000 characters of every tool result.
The live baseline lost source identifiers, pagination cursors and verified coverage
when they occurred later in a result, despite the full-context control reading
them correctly. Inspection confirmed those facts were absent from the actual
summarization request, before GLM could evaluate them.

The repair retains tool results up to the existing private-provider 8,000-character
bound. Larger results retain their beginning and end, with an explicit instruction
to reread omitted material. It does not expand GLM's tool-result limit, recorder
storage or the model's context window. It can send more evidence to the summary
model than the old cutoff, so preserving information has a bounded token cost.
The installer checks all pinned runtime files before writing any, writes each
atomically, and resumes idempotently.

A later long-history run returned an empty summary on its second compaction. The
SDK accepted it and the resumed model could no longer recover the task. The
original trace did not retain that response's stop reason, so its cause is unknown.
A separate repair validates completed, nonempty text before accepting either a
history or turn-prefix summary. Empty, cancelled and output-truncated responses
now fail without replacing the original history. This guard does not change the
prompts or successful summaries in the paired serialization experiment. Later
stress runs record per-request stop reason, usage, timestamps and verification.

The instrumented repeat reproduced a `length` response with zero text on the
second oversized cycle (the history estimate exceeded the advertised window).
The new validation rejected it. Reopening that session confirmed only the first
compaction was stored, its checkpoint survived, and all 15 second-cycle lookup
results remained. A separate run tests two cycles near the normal threshold.

The baseline also invented a zero duration in two summaries where the source only
said no duration was measured. The original summary prompt did not explicitly
prohibit this conversion. The final instructions preserve unknown values, exact
references, user corrections and unfinished work, and prevent captured instructions
from becoming user authorization. This is a general factuality constraint; it
contains no fixture IDs, customer names, workflow-specific answers or target scores.

## Recorded results

Executed September 29, 2026 (America/Los_Angeles). The final candidate was split
into two invocations with identical code and fixture hashes. No failed response
was replaced with a later response in these results.

| Evaluation | Baseline | Final candidate |
| --- | --- | --- |
| Full-context control, strict JSON | 5/8 | 4/8 |
| Full-context control, supplemental rubric | 6/8 | 6/8 |
| Compacted continuation, strict JSON | 10/20 | 11/18 returned answers |
| Compacted continuation, supplemental rubric | 14/20 | 15/18 returned answers |
| Planned compacted continuations completed | 20/20 | 18/20 |
| Requests / verified responses / transport failures | 48 / 48 / 0 | 46 / 45 / 1 |

One final continuation received HTTP 502. The harness retained the error and
stopped that case, leaving its second repeat's two continuations unscored. Counting
all planned continuations, the final run has 15 passes, three answer failures,
one transport failure and one unattempted continuation. These are small component
runs, not a statistically established improvement in production success rate.

A separate bounded recheck of the interrupted partial-save case passed its full-context
control and both compaction cycles (five requests, all verified). This establishes
that the case can complete after the gateway error; it does not erase that error
or turn the original incomplete run into a clean pass.

The three remaining answer failures are explicit:

- One middle-position continuation refused to return the handoff despite its
  summary retaining the correct reference, cursor and coverage. It interpreted
  returning existing coverage as permission to advance it. The other repeat passed.
- One duplicate-observation continuation returned the two correct source IDs as
  an array instead of the expected count. The task did not spell out this field's
  numeric type; this is a schema ambiguity, not proof of lost source information.
- The other duplicate-observation continuation returned UI elements instead of
  the number of unique source observations. This is an interpretation failure.

Both final duplicate-observation summaries and continuations kept unknown duration
unknown; both baseline summaries invented zero. Neither final answer claimed a
screenshot existed or requested a duplicate workflow. Corrections, partial-save
state, user stop and Unicode references passed the supplemental rubric in every
returned compacted continuation for those cases. Formatting-only errors remain
failures under the strict grader.

A separate final-code near-threshold run passed both real compaction, persistence
and reload cycles (four requests, all verified). Estimated context shrank from
23,568 to 8,467 tokens, then from 24,355 to 8,751 tokens. These are SDK context
estimates, not billed token savings. Both resumptions retained the exact source,
cursor and verified coverage. The separate oversized-history test exercised safe
failure: a zero-text `length` response was rejected and the original history
remained recoverable.

The deterministic checks passed: seven runtime tests (46 assertions), seven Rust
installer tests, and four scorer/calibration tests (91 assertions). The serializer
regression test failed against the original SDK and passed after the patch.

### Provenance

Raw fictional outputs, verification receipts, request traces and original strict
scores remain in the private evaluation directory. The report deliberately keeps
partial exploratory attempts separate from the final candidate. Fixture and
runtime fingerprints make the recorded comparison reproducible:

| Input | SHA-256 |
| --- | --- |
| Frozen fixture source, every arm | `5cc373df22609ce9111f439a699921dd44a78a39e01372d5b7813a43fb787a63` |
| Baseline serializer | `eba26429c8ed717754bcdc3c1164715b1d2f2d68655530cf1e0df975c18f6891` |
| Final serializer and summary instructions | `3c3bc7f35f81f3fe7fe8296ec1dd3b0a26ad5a287ae1796582183f1e126597a8` |
| Baseline compaction module | `fcb12f1eb4d38578978e1a8e3e382a3fccfd5e0ccf87bc86979a9a8d9c145c7b` |
| Final compaction module | `e69e9c4746d51a601b92668cd00b25294765d63b460c8478a018504db911b54d` |
| Identical Pi provider adapter | `727d744f20985f667151e8ecee3ad30af388d9d66d91a92d0fb9ad3261da4363` |

## Reproduction

These commands make no model calls:

```sh
bun test evals/coding-agent/glm-compaction-cases.test.ts
bun run apps/screenpipe-app-tauri/scripts/eval-pi-compaction.ts
cargo test --locked -p screenpipe-core agents::pi_compaction::tests --lib
```

Live calls require an installed authenticated Screenpipe Pi configuration and
explicit opt-in. Set `SCREENPIPE_EVAL_OUTPUT` to a private directory. Optionally
set `SCREENPIPE_TEST_PI_DIR` to an isolated installation of the pinned SDK; apply
the production patch using `cargo run --locked -p screenpipe-core --example
patch_pi_compaction -- <installation>` before evaluating the candidate.

```sh
bun run apps/screenpipe-app-tauri/scripts/eval-glm-compaction.ts --live
bun run apps/screenpipe-app-tauri/scripts/eval-glm-compaction.ts --live --split-only
bun run apps/screenpipe-app-tauri/scripts/eval-glm-compaction.ts --live --split-only --near-threshold
bun run evals/coding-agent/score-glm-compaction.ts <baseline-results.json> <candidate-results.json>
```

`SCREENPIPE_EVAL_CASES` selects comma-separated case IDs and
`SCREENPIPE_EVAL_REPEATS` selects one to three repetitions. The runner caps each
invocation at 60 calls and 25 minutes. Results include model/SDK identity, source
hashes, token usage, serialized fact exposure, response verification, raw fictional
outputs and strict verdicts. Supplemental scoring writes a separate file.

## Limits

This is a live model component evaluation, not installed-app end-to-end testing
or proof that arbitrary histories are lossless. Record retrieval and writes are
fictional. Extremely large results still omit their middle before summarization
and require narrower retrieval. Summaries may omit or distort facts even when the
serializer retains them. A small repeated suite does not establish population
reliability, and no latency comparison is claimed between overlapping runs.

The first stress attempt completed and reopened its first compaction successfully,
then stopped on an incorrect harness assertion that every subsequent compaction
must also split a turn. That attempt is retained as incomplete. The corrected
harness requires the first split and accepts the SDK's regular history-summary
path on the next cycle.
