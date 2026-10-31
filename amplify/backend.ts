import { defineBackend } from '@aws-amplify/backend';
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { auth } from './auth/resource';
import { data, runAi } from './data/resource';

const backend = defineBackend({ auth, data, runAi });
const stack = backend.runAi.stack;
const usageTable = new Table(stack, 'RunAiUsageAndJobs', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY, // experimental app; don't use for irreplaceable data
});
const outputBucket = new Bucket(stack, 'RunAiOutputs', {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  enforceSSL: true,
  encryption: BucketEncryption.S3_MANAGED,
  autoDeleteObjects: true,
  removalPolicy: RemovalPolicy.DESTROY,
});
usageTable.grantReadWriteData(backend.runAi.resources.lambda);
outputBucket.grantReadWrite(backend.runAi.resources.lambda);
backend.runAi.addEnvironment('USAGE_TABLE', usageTable.tableName);
backend.runAi.addEnvironment('OUTPUT_BUCKET', outputBucket.bucketName);
backend.runAi.addEnvironment('RUN_AI_ENABLE_BEDROCK', process.env.RUN_AI_ENABLE_BEDROCK === '1' ? '1' : '0');
backend.runAi.addEnvironment('RUN_AI_ALLOWED_EMAILS', process.env.RUN_AI_ALLOWED_EMAILS ?? '');

backend.runAi.resources.lambda.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['bedrock:InvokeModel', 'bedrock:StartAsyncInvoke'],
  resources: [
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0',
    'arn:aws:bedrock:us-west-2::foundation-model/stability.stable-image-core-v1:1',
    'arn:aws:bedrock:us-west-2::foundation-model/luma.ray-v2:0',
  ],
}));
backend.runAi.resources.lambda.addToRolePolicy(new PolicyStatement({
  effect: Effect.ALLOW,
  actions: ['bedrock:GetAsyncInvoke'],
  resources: ['*'],
}));

// Bedrock writes asynchronously generated video into this private S3 bucket.
outputBucket.addToResourcePolicy(new PolicyStatement({
  principals: [new ServicePrincipal('bedrock.amazonaws.com')],
  actions: ['s3:PutObject'],
  resources: [outputBucket.arnForObjects('videos/*')],
  conditions: { StringEquals: { 'aws:SourceAccount': Stack.of(stack).account } },
}));
