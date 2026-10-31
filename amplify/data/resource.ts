import { a, defineData, defineFunction, type ClientSchema } from '@aws-amplify/backend';

export const runAi = defineFunction({
  name: 'run-ai-inference',
  entry: '../functions/ai/handler.ts',
  timeoutSeconds: 90,
  memoryMB: 512,
});

const schema = a.schema({
  runAI: a.mutation()
    .arguments({ action: a.string().required(), payload: a.string().required() })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(runAi)),
});
export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
