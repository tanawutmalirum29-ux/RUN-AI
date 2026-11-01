/**
 * Server-side request for RUN AI Native on existing AWS Bedrock.
 * GitHub is the source of prompt-side RAG/Few-shot data; this does
 * NOT fine-tune weights, and Nova Micro usage is paid per Bedrock tokens.
 */
import { buildNativeMessages } from '../native-ai/rag.mjs';

export const NATIVE_MODEL_ID = 'bedrock:run-ai-native';
export const NATIVE_BEDROCK_MODEL = 'amazon.nova-micro-v1:0';

export function buildNativeBedrockRequest(history,prompt) {
  const { messages, knowledgeIds, exampleCount } = buildNativeMessages(history,prompt);
  const [system,...turns] = messages;
  if(!system || system.role!=='system' || !turns.length || turns[0].role!=='user')
    throw new Error('Invalid Native conversation');
  const bedrockMessages=turns.map(turn=>({
    role:turn.role,
    content:[{text:turn.content}],
  }));
  return {
    modelId:NATIVE_BEDROCK_MODEL,
    system:[{text:system.content}],
    messages:bedrockMessages,
    inferenceConfig:{maxTokens:850,temperature:0.6},
    knowledgeIds,
    exampleCount,
  };
}
