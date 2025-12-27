import { Injectable } from '@nestjs/common';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ILambdaService } from '../../application';
import { LambdaOptions } from './options';

@Injectable()
export class LambdaService implements ILambdaService {
  private lambdaClient: LambdaClient;

  constructor(protected options: LambdaOptions) {
    this.lambdaClient = new LambdaClient({
      region: this.options.region,
      credentials: { accessKeyId: this.options.accessKeyId, secretAccessKey: this.options.secretAccessKey },
    });
  }

  async invokeLambda(functionName: string, payload: any): Promise<any> {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
      InvocationType: 'RequestResponse', // for synchronous invocation
    });

    try {
      const response = await this.lambdaClient.send(command);

      if (response.Payload) {
        // Response payload is Uint8Array buffer
        const decodedPayload = Buffer.from(response.Payload).toString('utf-8');
        return JSON.parse(decodedPayload);
      }
      return null;
    } catch (error) {
      // Handle error appropriately
      console.log(error);
      throw error;
    }
  }
}
