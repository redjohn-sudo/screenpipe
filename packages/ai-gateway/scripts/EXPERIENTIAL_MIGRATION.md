# Experiential migration preparation

Status: preparation and synthetic probes only. These scripts stay outside the
Worker import graph. They do not change the production provider factory,
Cloudflare routing, secrets, webhooks, deployment configuration or traffic.

```text
Before: customer -> existing gateway/auth/limits -> existing providers
After:  customer -> existing gateway/auth/limits -> existing providers
        operator -> read-only preflight -> Experiential account
        operator -> approved synthetic probe + provider.zdr=true -> Experiential
                 <- require x-gateway-zdr:true before reading JSON/SSE
```

## Offline inventory

From `packages/ai-gateway`:

```sh
bun scripts/export-migration-inventory.ts > migration-inventory.json
```

Imports the current repository model/plan policy. Destination mappings and live
allowances remain null. Source credit constants are not a live rule export. Run
from a clean reviewed checkout; the report records the current Git revision.
Keep generated reports private when enriched with account or production facts.

## Read-only preflight

Load the test credential into `EXPLABS_API_KEY` from your secret manager inside
the calling process. Never put it in CLI arguments, source, logs or a ticket.
Do not use your Cloudflare or upstream provider credential for this request.

```sh
bun scripts/experiential-preflight.ts > experiential-preflight.json
```

Only GETs the documented API host. Compares exact authenticated model IDs and
reads prompt capture, ZDR entitlement, continuation storage and upstream policy.
Reports exact boolean model ZDR capability separately from catalog membership.
Refuses redirects, redacts upstream
errors, and never tries another key or host. Exit 1 means inspection failed;
exit 2 means a report was produced with migration gates still unresolved. Catalog
access cannot mark the account production ready.

## Optional synthetic probes

Require spending approval, a test-only credential, billing activation, ZDR
entitlement (or an existing grandfathered org ZDR policy), no-training routing,
disabled ZDR continuation storage and a model with an authenticated catalog ZDR
route. Missing or malformed privacy facts block dispatch. Preflight runs again each time. Each
invocation sends exactly one synthetic POST, at most 64 output tokens, with no
retries or fallback. Review the model price before approving: token bounds are
not a dollar guarantee. Reconcile uncertain requests before retrying.

```sh
bun scripts/experiential-smoke.ts --allow-spend gpt-5.4-nano chat
bun scripts/experiential-smoke.ts --allow-spend gpt-5.4-nano stream
bun scripts/experiential-smoke.ts --allow-spend gpt-5.4-nano tools
bun scripts/experiential-smoke.ts --allow-spend gpt-5.4-nano json-schema
bun scripts/experiential-smoke.ts --allow-spend gpt-6-astra responses
bun scripts/experiential-smoke.ts --allow-spend claude-sonnet-5 messages
```

Run only approved cases. These are examples, not a batch command. An unavailable
model fails without substitution. Responses keeps Astra stateless with low
reasoning and Standard service (OpenAI wire value `service_tier: "default"`, checked
against the installed SDK type). Confidential/custom, classifier, Auto and background
rescue IDs are excluded. Streaming requires content, successful finish, usage and
DONE. Plain Chat and schema probes require `finish_reason: "stop"`; filtered,
truncated and unexpected finish reasons fail. Messages requires `end_turn` and
nonempty text. Responses requires overall completion and a completed assistant
message containing nonempty output text. Reasoning alone, refusals and partial
answers do not pass; reasoning alongside a completed answer is allowed.
Tool/schema checks inspect actual arguments or JSON, not just HTTP status.
The output omits prompts, completion content, raw headers and secrets. It records
only the boolean ZDR request/response confirmations and existing usage fields. Inline cost is
optional and never proves settlement or customer allowance accounting.

These probes test the vendor wire contract, not the deployed Screenpipe Worker
or a completed routing adapter. Images, cache accounting, provider-native stream
translation and multi-customer enforcement still need end-to-end proof.

## Per-request privacy and consent boundary

Every probe sends a top-level `"provider": {"zdr": true}` in the JSON body on
Chat Completions, Responses and Messages. This is a request field, not a request
header. With the Anthropic SDK it belongs in `extra_body`. The documented
`x-gateway-zdr: true` response header is required before reading either JSON or
SSE; missing, false or ambiguous values cancel the body and fail without retry.
A response confirmation reports the vendor's verdict, not an independent audit
of its storage. Check live enforcement before sending customer content.

According to the vendor's data-controls contract, per-request ZDR suppresses
prompt/response capture even when `capture_prompt_content` is on, excludes
noncompliant upstream routes including fallbacks, and never loosens org policy.
That is why account capture being on alone no longer blocks a ZDR probe. Pro
entitlement still applies. `403 needs_subscription`, `403 model_not_granted`, and
an older engine's `400` for unsupported `provider` all terminate the probe. Never
remove the field or retry on a retaining route to make it succeed. No-training is
a separate requirement and cannot substitute for ZDR.

These probes have no consent-based exception: all requests use ZDR. Responses
uses `store:false` and no `previous_response_id`; ZDR continuation storage must be
explicitly off. No batch upload or `Idempotency-Key` replay storage is used.
Content-free billing metadata is still retained by the vendor.

The production consent integration is **not implemented here**. Screenpipe's
existing Workflows opt-in covers redacted contributions and training Screenpipe's
own models (`lib/trajectories/collector.ts` and
`components/workflows/workflow-sharing-controls.tsx` in the desktop app). It does
not authorize Experiential to retain raw inference requests. Keep inference ZDR
for both opted-in and opted-out users; consented sharing remains a separate flow.
Before any future retention exception, verify the specific consent purpose and
version against the authenticated account server-side. Missing, stale, revoked,
cross-account or client-supplied consent cannot relax privacy. Exercise these
cases, account switching, all protocol paths and fallbacks in the future runtime
adapter; neither this report nor these synthetic tests prove those customer flows.

## Gates before implementing production selection

1. Pin deployed behavior and read actual Cloudflare limits, reset windows,
   settled usage, reservations and late/pending exposure.
2. Verify native enforcement across the serving fleet. The documented disjoint
   model groups and UTC-month allowances do not alone preserve shared-total plus
   frontier caps or other windows. Do not invent or approximate commercial limits.
3. Bind customer keys to authenticated identities and approved plans before
   issuance. Keep management credentials separate. Test two synthetic identities,
   rotation, forbidden models, concurrent holds, plan transitions and scoped
   reporting. Request labels authorize nothing.
4. Verify exact model mappings, rates, privacy, cache accounting and retries.
   Keep encrypted Tinfoil/EHBP, custom GLM, Vertex Messages, classifier, audio
   and background rescue separate without their own compatibility proof.
5. Reconcile usage carry-in and rollback across both gateways. A fresh destination
   balance must not reset usage or grant duplicate allowance.
6. Then review a separate routing change and stage with synthetic users.
   Production promotion still requires the owner's explicit signal.

Do not use an unrestricted org key as a temporary customer route. These scripts
never mint keys, assign plans, upload BYOK, change settings, purchase, deploy,
connect subscription webhooks or revoke existing gateway credentials.

Official contracts checked September 28, 2026:

- [Account and identities](https://platform.experientiallabs.ai/docs/account-api)
- [Usage and allowances](https://platform.experientiallabs.ai/docs/cost-api)
- [Privacy](https://platform.experientiallabs.ai/docs/data-controls)
- [Wire reference](https://platform.experientiallabs.ai/llms.txt)
