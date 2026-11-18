import { Injectable } from '@nestjs/common';
import { invokeLambdaAsync } from '@shared-libs';

import { IAsyncFunctionInvoker } from '../../application';

@Injectable()
export class LambdaFunctionInvoker implements IAsyncFunctionInvoker {
  invoke(functionName: string, payload: unknown): Promise<void> {
    return invokeLambdaAsync(functionName, payload);
  }
}
