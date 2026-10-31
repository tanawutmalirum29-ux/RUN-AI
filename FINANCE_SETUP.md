# RUN-AI — Finance Safety Setup

Current stage: cost-protection foundation, NOT a checkout service.
The website is anonymous. The AppSync API key is public. Do not sell
credits or accept payments until authenticated wallets and payment
verification are implemented.

## 1. Existing protections

- Every paid provider request uses a DynamoDB all-or-nothing transaction
  to validate global/model day/month quotas AND daily/monthly risk reservations.
- Default USD-denominated RISK RESERVATIONS: $3/day and $15/month for the
  entire website. These are fixed weights and NOT actual AWS/provider bills.
- Risk weights (not current model prices): Nova Micro $0.03,
  Nova Lite $0.08, Nova Pro $0.35, OpenRouter free endpoint $0.02,
  other OpenRouter $0.20 (provider-labelled uncensored $0.25),
  image $0.35, video $2.50.
- Paid VIDEO creation is OFF by default. Local Browser AI and the editor
  do not consume risk quota.
- New paid requests include a UUID. An atomic unique request record,
  retained for 90 days, stops retrying the same UUID from invoking a
  paid provider twice.
- A read-only public status displays quota/risk counters and kill-switch
  state; no public mutation is provided to change the switch.
- These are risk reservations on accepted attempts; an upstream failure
  can still count. AWS charges include Hosting, S3, AppSync, Lambda,
  DynamoDB, CloudWatch and other services not tracked by this counter.
  It cannot guarantee a real-money cap.

## 2. Emergency kill switch WITHOUT redeploy

Use the AWS Console with your own IAM credentials (never expose them
on the RUN-AI website).

1. Find RUN-AI's DynamoDB table in the AWS region of its Amplify Gen 2
   data backend. CloudFormation logical name: RunAiUsageAndJobs.
   The physical table name may have an Amplify suffix. Its exact name
   is available to the Lambda through environment variable USAGE_TABLE.
2. Open DynamoDB → Tables → the table → Explore table items → Create item.
3. Create the item with attributes:

    pk          String    CONTROL
    sk          String    PAID_AI
    enabled     Boolean   false

4. Save. The next new paid Cloud AI request fails the backend atomic
   ConditionCheck. Requests already running and async video jobs cannot
   be stopped retroactively.
5. To allow requests again, edit enabled to Boolean true and save.
   Never expose this update through the public AppSync API key.

For compatibility with older deployments, if this item DOES NOT EXIST,
the backend defaults to enabled. An existing item with enabled=false or
a malformed enabled field fails closed. To stop paid AI, CREATE the row.

## 3. Amplify environment settings (require backend redeploy)

    RUN_AI_ENABLE_BEDROCK=0       # stop Bedrock only
    RUN_AI_USE_OPENROUTER=0       # stop OpenRouter only
    RUN_AI_PAID_VIDEO_ENABLED=0  # default: video disabled
    RUN_AI_RISK_DAY_CENTS=300    # internal reservations only
    RUN_AI_RISK_MONTH_CENTS=1500

RUN_AI_ENABLE_BEDROCK=0 does NOT disable OpenRouter; to stop ALL
providers immediately, use the DynamoDB CONTROL/PAID_AI switch.
Paid video can be explicitly enabled with RUN_AI_PAID_VIDEO_ENABLED=1,
only after you verify provider authorization, price and S3 delivery.
Risk limits use positive whole USD cents and daily <= monthly.
Invalid limits reject new inference, rather than silently widening them.

## 4. AWS spending checks YOU must configure in your account

- In AWS Billing & Cost Management → Budgets, create a monthly budget
  and notifications (e.g. 50%, 80%, 100%). AWS billing data and budget
  notices are DELAYED: this is not a real-time spend stop switch.
- If eligible, check the NEW AWS Settings → Billing → Spend limit feature.
  AWS says this is rolling out to a limited set of eligible paid-plan
  projects and the minimum allowed project limit is max($20, its
  conservative estimated likely monthly spend). A reached spend limit
  can pause the project and its resources; it is not enabled here.
- Review Cost Explorer by service (Amplify, Bedrock, AppSync, Lambda,
  DynamoDB, S3, CloudWatch). If you have other AWS projects, be careful
  with account-wide versus RUN-AI costs; project tagging helps only
  after appropriate allocation has been enabled.
- Separately configure and review your OpenRouter account credit limits:
  OpenRouter charges are NOT part of the AWS monthly bill.
- Check tax, provider model access and current pricing before sale.

Official documents:
https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-best-practices.html
https://docs.aws.amazon.com/accounts/latest/reference/create-spend-limit.html
https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html
https://aws.amazon.com/bedrock/pricing/

## 5. Live test checklist after Amplify deployment

1. Open RUN-AI Settings → FINANCE SAFETY. Check enabled/disabled state
   and daily/monthly reserved allowance amounts.
2. Call a model that you have already authorized. Refresh usage.
   Both global quota and risk reserved amount should increase.
3. Repeat the *identical requestId*: the second call must fail without
   invoking the provider or incrementing counters a second time.
4. Create DynamoDB item CONTROL / PAID_AI with enabled=false.
   Verify both Bedrock AND OpenRouter are blocked even from an
   already-open browser tab. Browser AI still works.
5. Switch enabled to true only when you intentionally resume.
6. Independently review AWS Billing and OpenRouter billing.

CI checks tests, TypeScript and Vite builds. A GitHub CI PASS alone
does not prove the AWS backend has deployed or a model has billed at
the assumed weight.
