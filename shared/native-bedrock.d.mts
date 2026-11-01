export declare const NATIVE_MODEL_ID: 'bedrock:run-ai-native';
export declare const NATIVE_BEDROCK_MODEL: 'amazon.nova-micro-v1:0';
export interface NativeBedrockRequest {
  modelId:string;
  system:Array<{text:string}>;
  messages:Array<{role:'user'|'assistant';content:Array<{text:string}>}>;
  inferenceConfig:{maxTokens:number;temperature:number};
  knowledgeIds:string[];
  exampleCount:number;
}
export declare function buildNativeBedrockRequest(
 history:unknown, prompt:string
): NativeBedrockRequest;
