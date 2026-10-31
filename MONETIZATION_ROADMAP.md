# RUN-AI — Monetization roadmap and security gates

## Business choice

Free local Browser AI + pay-as-you-go Cloud AI credits, with a possible
Pro tier after operating costs are measured. No unbounded paid AI.
Example package prices (99 THB, 299 THB) are only hypotheses, NOT
actual sale prices until provider costs and merchant fees are verified.

## Phase 1: Cost protection (code written; live AWS verification pending)

- Global/model request quotas, transactional risk reservations.
- Kill switch managed directly by owner in DynamoDB, never public UI.
- Request UUID and atomic idempotency record with 90-day TTL.
- Read-only guard status. Paid video turned off by default.
- Operator still must configure AWS Budgets, optional eligible AWS
  Settings spend limits, OpenRouter provider limits.

Acceptance: GitHub CI PASS, Amplify successful deployment, and live
tests proving both paid providers stop when switch is false.

## Phase 2: Verified identity and credit ledger (NOT implemented)

- Free browser mode remains no-login; account identity (Cognito,
  Google login or email OTP) is required only for paid services.
- Store wallet balances and append-only transactions on the SERVER.
  Use integer smallest units and atomic reserve/capture/refund.
- Bind wallet operations to authenticated identity. Never trust a
  client-provided user ID, credit grant, amount, SKU, or price.
- Lock concurrent requests, prevent negative balances and replay
  attacks; audit chargebacks, refunds, expirations and retention.
- Separate owner/admin authorization from public API key functions.

Acceptance: no anonymous wallet mutation, no duplicate credits/debits,
strong concurrent tests, verifiable settlement ledger.

## Phase 3: Real payments (NOT implemented)

- Complete merchant onboarding, tax compliance, support information.
- Server creates signed fixed-SKU checkout sessions for approved prices.
- Only VERIFIED payment webhooks can grant credits. Browser redirects
  and "success" query parameters do not authorize credit grants.
- Webhooks idempotent; handle duplicate, late, disputed, refunded and
  chargeback events.
- Terms/privacy/refund/support and model/provider commercial-use terms.
  Verify payment provider policies for open-tuned and any
  provider-labelled uncensored model before commercialization.

Acceptance: forged webhook gives zero credits; signed test payments
reconcile; no API keys or payment secrets in browser/source.

## Phase 4: Product launch and finance operations (NOT implemented)

- Measure actual tokens and provider invoice prices per operation.
- Compare costs across Bedrock, OpenRouter, Hosting, CloudWatch,
  Lambda, S3, AppSync, DynamoDB.
- Add owner-only revenue / credit liabilities / per-model margin
  dashboard and usage anomaly alerts.
- Start with small external pilot; calibrate pricing, risk weights,
  credit issuance and refund reserve over multiple billing cycles.
- Keep anonymous paid video disabled until tested and priced.

Until the Phase 2 and 3 acceptance gates pass, RUN-AI must NOT
advertise purchasable credits or accept actual customer payments.
