import { a, defineData, defineFunction, type ClientSchema } from '@aws-amplify/backend';

export const runAi = defineFunction({
  name: 'run-ai-inference',
  resourceGroupName: 'data',
  entry: '../functions/ai/handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
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
