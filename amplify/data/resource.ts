import { a, defineData, defineFunction, secret, type ClientSchema } from '@aws-amplify/backend';

export const runAi = defineFunction({
  name: 'run-ai-inference',
  resourceGroupName: 'data',
  entry: '../functions/ai/handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
  // OpenRouter secret is optional. Without the enabling flag, CloudFormation
  // never references a secret that the AWS account has not configured.
  environment: {
    RUN_AI_OPENROUTER_ENABLED: process.env.RUN_AI_USE_OPENROUTER === '1' ? '1' : '0',
    ...(process.env.RUN_AI_USE_OPENROUTER === '1'
      ? { OPENROUTER_API_KEY: secret('OPENROUTER_API_KEY') }
      : {}),
  },
});

const schema = a.schema({
  health: a.query()
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(runAi)),
  runAI: a.mutation()
    .arguments({ action: a.string().required(), payload: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(runAi)),
});
export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 90 },
  },
});
