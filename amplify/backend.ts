import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { data, runAi } from './data/resource';

const backend = defineBackend({ data, runAi });
// The resolver Lambda is grouped in the data stack. Co-locate its
// DynamoDB and S3 resources to avoid cross-stack dependency cycles.
const stack = backend.runAi.stack;
const usageTable = new Table(stack, 'RunAiUsageAndJobs', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  // Preserve accounting and kill-switch state if the Amplify stack is removed.
  timeToLiveAttribute: 'expiresAt',
  removalPolicy: RemovalPolicy.RETAIN,
});
const outputBucket = new Bucket(stack, 'RunAiOutputs', {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: BucketEncryption.S3_MANAGED,
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
});
// Amplify exposes IFunction in its public interface, but the generated
// Lambda is a concrete CDK Function at synthesis time.
const lambda = backend.runAi.resources.lambda as LambdaFunction;
usageTable.grantReadWriteData(lambda);
outputBucket.grantReadWrite(lambda);
lambda.addEnvironment('USAGE_TABLE', usageTable.tableName);
lambda.addEnvironment('OUTPUT_BUCKET', outputBucket.bucketName);
// Anonymous cloud experiment is on by default. Override with
// RUN_AI_ENABLE_BEDROCK=0 in Amplify build environment to disable paid calls.
lambda.addEnvironment('RUN_AI_ENABLE_BEDROCK', process.env.RUN_AI_ENABLE_BEDROCK === '0' ? '0' : '1');
lambda.addEnvironment('RUN_AI_PAID_VIDEO_ENABLED', process.env.RUN_AI_PAID_VIDEO_ENABLED === '1' ? '1' : '0');
// Configurable risk budgets (integer USD cents); these are NOT actual bills.
lambda.addEnvironment('RUN_AI_RISK_DAY_CENTS', process.env.RUN_AI_RISK_DAY_CENTS || '300');
lambda.addEnvironment('RUN_AI_RISK_MONTH_CENTS', process.env.RUN_AI_RISK_MONTH_CENTS || '1500');
lambda.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['bedrock:InvokeModel', 'bedrock:StartAsyncInvoke'],
  resources: [
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0',
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0',
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
    'arn:aws:bedrock:us-west-2::foundation-model/stability.stable-image-core-v1:1',
    'arn:aws:bedrock:us-west-2::foundation-model/luma.ray-v2:0',
  ],
}));
lambda.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['bedrock:GetAsyncInvoke'],
  resources: ['*'],
}));
outputBucket.addToResourcePolicy(new PolicyStatement({
  principals: [new ServicePrincipal('bedrock.amazonaws.com')],
  actions: ['s3:PutObject'],
  resources: [outputBucket.arnForObjects('videos/*')],
  conditions: { StringEquals: { 'aws:SourceAccount': Stack.of(stack).account } },
}));
