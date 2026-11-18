import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

let client: LambdaClient | null = null;

/** Lambda client for invoking sibling functions. LAMBDA_AWS_* override the default credentials (local dev). */
function lambdaClient(): LambdaClient {
  client ??= new LambdaClient({
    region: process.env.LAMBDA_AWS_REGION || process.env.AWS_REGION || 'ap-south-1',
    ...(process.env.LAMBDA_AWS_ACCESS_KEY_ID
      ? {
          credentials: {
            accessKeyId: process.env.LAMBDA_AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.LAMBDA_AWS_SECRET_ACCESS_KEY || '',
          },
        }
      : {}),
  });
  return client;
}

/** Fire-and-forget invoke (InvocationType `Event`) of a Lambda function with a JSON payload. */
export async function invokeLambdaAsync(functionName: string, payload: unknown): Promise<void> {
  await lambdaClient().send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
}
