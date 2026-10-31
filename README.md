# RUN AI — Personal Creative AI Playground

Responsive AI playground for AWS Amplify Gen 2, with browser experiments and optional paid Amazon Bedrock calls.

## What works

| Tool | Backend | Caveat |
|---|---|---|
| Text chat and code | WebLLM Qwen2.5 0.5B (WebGPU) | Free; downloads a model on your device; not all mobiles supported |
| Chat and image/preview frame analysis | Amazon Nova Lite | Paid AWS Bedrock; off by default |
| Text to image | Stability AI Stable Image Core | Paid AWS Bedrock; off by default |
| Text/image to video | Luma Ray2 | Paid async AWS Bedrock; off by default |
| Upload images, videos, audio, text, JSON, PDF | Browser IndexedDB | Local only; maximum 40 MB per file |
| Edit images | Browser canvas | Free, local |
| Voice dictation | Browser SpeechRecognition | Browser dependent |

PDF and audio can be stored and downloaded but *cannot yet be interpreted by the AI*. In Cloud mode, when a video is attached to chat, the app analyzes one extracted frame, not the entire video. Browser WebLLM mode only understands text. This is a prototype, not a universal model hosting server or a cloud file sync service.

## Setup

1. Open [AWS Amplify Console](https://console.aws.amazon.com/amplify/).
2. Choose **Create new app**, connect GitHub and select repository [RUN-AI](https://github.com/tanawutmalirum29-ux/RUN-AI), branch **main**.
3. Deploy with the included **amplify.yml**, using Amplify Gen 2. The backend build creates Cognito, AppSync, Lambda, DynamoDB and a private S3 output bucket.
4. Amplify runs the backend before frontend build and creates a real **amplify_outputs.json**. The repository placeholder contains {} for local offline-preview only.
5. Open your deployed URL and register using your email address (confirmation code may be needed).
6. Test browser AI, local image editing and file storage without calling a paid AI provider.

**Even with Bedrock disabled, AWS backend infrastructure may incur charges.** Configure an AWS Budget and billing alerts in advance.

## Enable paid AI (opt-in, not free)

Verify Bedrock model availability, region, permissions, and Marketplace entitlements in your account. The sample uses:
- Text + vision: Amazon Nova Lite (us-east-1)
- Image: Stable Image Core (us-west-2)
- Video: Luma Ray2 (us-west-2)

In Amplify Console > App Settings > Environment variables:

    RUN_AI_ENABLE_BEDROCK=1
    RUN_AI_ALLOWED_EMAILS=your-verified-login@example.com

Deploy backend again. Both controls are server-side, enforced in Lambda. Only the Cognito account matching an allowlisted email can call paid models. There is a DynamoDB request quota of **40 chats, 5 images and 1 video per day**. A quota is NOT a financial hard limit and AWS Budgets only send notifications.

Cloud generated files are saved privately in S3 with expiring download URLs. Files uploaded via the browser library remain on the local device and are not synchronized between devices.

## Local frontend preview

Node.js 22 recommended.

    git clone https://github.com/tanawutmalirum29-ux/RUN-AI.git
    cd RUN-AI
    npm install
    npm run dev

Without generated Amplify outputs, the frontend loads in local mode. For backend development, configure AWS credentials on your developer machine and run **npx ampx sandbox** followed by **npm run dev**. Never commit AWS credentials.

## Troubleshooting

- App shows local mode only: check the Amplify Gen 2 backend build and verify generated amplify_outputs.json is nonempty.
- Browser AI fails: WebGPU unsupported or insufficient memory; try Chrome on a stronger device.
- Cloud AI disabled: inspect RUN_AI_ENABLE_BEDROCK, RUN_AI_ALLOWED_EMAILS, deployed Lambda env, and Cognito email.
- Bedrock AccessDenied: check model access/Marketplace, IAM policies, and region; models may change over time.
- Video job unavailable: review async inference status and private S3 bucket output.
- Files disappeared: IndexedDB is local; browser storage cleanup or private mode may remove it.

## Architecture

Frontend: React + Vite on Amplify Hosting. Browser mode: WebLLM + IndexedDB + Canvas. Cloud mode: Cognito login -> AppSync mutation -> Lambda with email allowlist + daily limits -> Amazon Bedrock models. DynamoDB tracks limits/ownership; S3 stores private generated media.

Do not deploy as an open public paid-AI service without abuse protection, more extensive testing and hard account-spend controls. This is experimental source code.
