# RUN AI — Anonymous AI Playground

**No login required.** Deploy this React + Vite + AWS Amplify Gen 2 project from GitHub/main. Opening the website gives immediate access to Browser AI, local files, image editing, and Cloud AI (if the AWS deployment and model permissions are ready).

## How it works
- Frontend: Vite/React on AWS Amplify.
- API: AppSync `apiKey` mode, public Query.health and Mutation.runAI; public keys are **NOT secrets**.
- Chat: free browser-local WebLLM on supported WebGPU devices, or paid Amazon Nova Lite on Bedrock.
- Image: Stability Stable Image Core (Bedrock, us-west-2), paid.
- Video: Luma Ray2 (Bedrock, us-west-2), paid; restricted to **five seconds** for anonymous experiments.
- Uploads: browser-local IndexedDB; TXT, JSON, Markdown, CSV may be attached as text. Videos are analyzed as **one extracted frame**, not the whole video. Audio/PDF may be stored but not analyzed by AI.
- Canvas image editor and local file management work without AWS inference.

## Security and cost
**Anyone who discovers or guesses the website or extracts its public AppSync API key can use the public API. A secret link provides no security.** Never put AWS credentials in the repository. The backend role, not the frontend, invokes Bedrock.

This deliberately limited experiment allows paid inference by default. You can disable it with `RUN_AI_ENABLE_BEDROCK=0` in AWS Amplify environment variables followed by a redeploy. The server enforces **atomic global** DynamoDB quotas across all browsers (UTC):
- Per day: 12 chat calls, 2 images, 1 video call.
- Per month: 60 chat calls, 8 images, 1 video call.
- Videos: 5 seconds, 720p only.

These limits reduce but **DO NOT guarantee a cost ceiling**: normal Amplify, Lambda, DynamoDB, AppSync, S3, marketplace billing and errors can incur charges. **Set AWS Budgets and review [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) before enabling paid model access**. Luma Ray2 can be very expensive. Enabling this app publicly is at your own financial risk.

The frontend generates a random browser capability stored in localStorage. The server hashes it to segregate generated output paths and authorize video job polling and file URL renewal. Clearing browser storage loses access to those previous private outputs. This is not authentication; the data belongs to the holder of that token.

## Deploy
1. Connect GitHub `tanawutmalirum29-ux/RUN-AI`, branch `main`, in AWS Amplify Gen 2.
2. Use `amplify.yml` to synthesize and deploy backend and Vite frontend. Node.js 22 recommended.
3. Ensure AppSync GraphQLSchema creates successfully (the schema defines Query.health and Mutation.runAI).
4. Confirm the site opens without a login screen. Check Settings for connection status.
5. To use Cloud AI you must have compatible Bedrock/Marketplace model access in the regions specified in the backend. Actual model availability is account-specific.
6. Set AWS Budget notifications. To disable paid operations: `RUN_AI_ENABLE_BEDROCK=0` and redeploy.

## Local development
```bash
npm install
npm run check
npm run build
npm run dev
```
Local frontend previews work without an Amplify backend, but cloud features require generated `amplify_outputs.json`.

## Limitations
Prototype only; no user accounts, no dedicated private access, no CAPTCHA/WAF, no custom billing hard-stop, no multi-device sync. AWS Budgets are alerts, not automatic suspension. For a public production release, use access controls, WAF/CAPTCHA and dedicated billing controls.
