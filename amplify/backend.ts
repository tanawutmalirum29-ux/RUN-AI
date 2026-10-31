import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { auth } from './auth/resource';
import { data, runAi } from './data/resource';

const backend = defineBackend({ auth, data, runAi });
// The resolver Lambda is grouped in the data stack. Co-locate its
// DynamoDB and S3 resources to avoid cross-stack dependency cycles.
const stack = backend.runAi.stack;
const usageTable = new Table(stack, 'RunAiUsageAndJobs', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
const outputBucket = new Bucket(stack, 'RunAiOutputs', {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: BucketEncryption.S3_MANAGED,
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
});
const lambda = backend.runAi.resources.lambda;
usageTable.grantReadWriteData(lambda);
outputBucket.grantReadWrite(lambda);
lambda.addEnvironment('USAGE_TABLE', usageTable.tableName);
lambda.addEnvironment('OUTPUT_BUCKET', outputBucket.bucketName);
lambda.addEnvironment('RUN_AI_ENABLE_BEDROCK', process.env.RUN_AI_ENABLE_BEDROCK === '1' ? '1' : '0');
lambda.addEnvironment('RUN_AI_ALLOWED_EMAILS', process.env.RUN_AI_ALLOWED_EMAILS ?? '');
lambda.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['bedrock:InvokeModel', 'bedrock:StartAsyncInvoke'],
  resources: [
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0',
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
