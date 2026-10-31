# RUN AI — Creative AI Playground

AI experimentation studio for AWS Amplify Gen 2: chat, image generation, video generation, media inspection, uploads, local file library and local image editor.

**STATUS: EXPERIMENTAL PROTOTYPE.** AWS Amplify Hosting does not run GPU models. Paid AI features use Amazon Bedrock and can incur significant AWS charges. **Paid inference is disabled by default.**

## Features

| Feature | Processing | Readiness |
| --- | --- | --- |
| Text chat | Browser WebLLM (Qwen2.5 0.5B) | Free; requires WebGPU, downloads model |
| Cloud chat + image understanding | Amazon Nova Lite (Bedrock us-east-1) | Requires paid backend access |
| Image generation | Stability Stable Image Core (Bedrock us-west-2) | Requires paid backend access |
| Text/image-to-video | Luma Ray2 (Bedrock us-west-2) | Asynchronous, paid |
| File library | Local IndexedDB | Store/download images, video, audio, PDF, text |
| Image editing | Browser Canvas | Brightness, contrast, saturation, rotate, flip |

**File limitations:** Chat accepts TXT, JSON, Markdown and CSV text plus images. Attached videos are currently converted to one *still frame* for visual analysis; full-video understanding is not implemented. PDF files can be stored, but PDF extraction is not implemented. Audio recording/transcription or audio generation is not implemented yet. The browser file library does not sync between devices.

## Deploy on AWS Amplify

1. Open the AWS Amplify console, create an application from GitHub, select this repository and the main branch. Use Amplify Gen 2.
2. The included amplify.yml installs packages, runs Amplify Gen 2 backend deployment, and builds the Vite web app. Node.js 22 is recommended.
3. Once the backend deploy completes, Amplify generates amplify_outputs.json and the site presents an email login. The placeholder empty JSON in the repository is only for local preview.
4. **Do not enable paid inference without checking AWS costs.** Create an AWS Budget notification and review quotas/model access. Stability and Luma models may require AWS Marketplace access.
5. To activate the backend, set these environment variables in the Amplify Console and redeploy:

    RUN_AI_ENABLE_BEDROCK=1
    RUN_AI_ALLOWED_EMAILS=your-actual-login@example.com

   Allowed email addresses can be comma separated. These are server-side environment settings, not VITE frontend variables. Backend authorization also requires Cognito login.
6. Log in with an allowed email. Open Settings to check configured/allowed status. Only after authorization and flag checks will inference requests run.

## Cloud Architecture

- React + Vite frontend on AWS Amplify Hosting
- Amplify Gen 2 Cognito (email auth), AppSync GraphQL custom mutation, Lambda handler
- Amazon Nova Lite in us-east-1 for text chat and single-frame image analysis
- Stability Stable Image Core and Luma Ray2 in us-west-2 for image/video
- DynamoDB counters and server-side video ownership records
- Private S3 storage for generated images and videos; short-lived signed URLs
- Server-side per-user daily request limit (UTC day): 40 chats, 5 images, 1 video
- The quotas are **NOT** an AWS spending cap. Invalid requests can still consume infrastructure resources.

Experimental infrastructure is currently configured for deletion on stack destruction (RemovalPolicy.DESTROY); do not use for irreplaceable data. Production requires more automated tests, retention policies, stronger rate-limit and abuse protections, and CloudWatch alarms.

## Local preview

Requires Node.js 22+.

    npm install
    npm run dev

The frontend can run without AWS to demonstrate UI, local file editing, and browser AI on a supported WebGPU device. Cloud chat/image/video requires AWS backend deployment and Bedrock access.

    npm run build
    npm run check

The check command type-checks Amplify TypeScript. AWS integration tests must still be performed after deployment; this project does **not** promise a working Bedrock invocation without AWS permissions and enabled models.

## Components

- src/App.jsx — AI studio interface, browser/cloud chat, media workflows
- src/db.js — IndexedDB file storage and video frame extraction
- src/ImageEditor.jsx — local Canvas editor
- src/service.js — GraphQL client
- amplify/auth/resource.ts — Cognito auth
- amplify/data/resource.ts — GraphQL mutation
- amplify/functions/ai/handler.ts — Bedrock calls, quotas, signed outputs
- amplify/backend.ts — deployment resources, IAM roles, S3 and DynamoDB

## Troubleshooting

- Local preview only: Backend not deployed or amplify_outputs.json not generated.
- Cloud AI disabled: Set both environment variables, redeploy, use allowed email.
- Bedrock AccessDenied: Check model availability, AWS Marketplace acceptance and region.
- WebGPU unavailable: Try supported Chrome desktop/Android with enough memory.
- Video status stays InProgress: Luma Ray2 is async; check Bedrock jobs in AWS console.
- Amplify build failure: Check backend logs before frontend logs, and confirm supported Node.js and AWS account permissions.

## Security and costs

Never commit AWS keys, access tokens or passwords into the repository. Do not expose the Bedrock API through unauthenticated calls. Generated downloads use private S3 signed URLs that expire. AWS Amplify, Lambda, DynamoDB, S3 and Bedrock may incur charges, particularly video generation. Always configure AWS Budgets before enabling models.
