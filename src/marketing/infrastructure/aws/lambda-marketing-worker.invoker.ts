import { Injectable } from '@nestjs/common';
import { invokeLambdaAsync } from '@shared-libs';

import { MarketingQueueMessage, IMarketingWorkerInvoker } from '../../application';

@Injectable()
export class LambdaMarketingWorkerInvoker implements IMarketingWorkerInvoker {
  invoke(functionName: string, message: MarketingQueueMessage): Promise<void> {
    return invokeLambdaAsync(functionName, message);
  }
}
