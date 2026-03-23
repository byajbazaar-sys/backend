import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SupportRequest } from '../domain';
import { ISupportRequestsRepository, SUPPORT_REQUESTS_REPOSITORY } from './i-support-requests.repository';
import { ISupportService } from './i-support.service';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class SupportService implements ISupportService {
  constructor(
    @Inject(SUPPORT_REQUESTS_REPOSITORY) private readonly supportRepo: ISupportRequestsRepository,
    @InjectPinoLogger(SupportService.name) private readonly logger: PinoLogger,
  ) {}

  async submitRequest(data: SupportRequest): Promise<SupportRequest> {
    const payload = plainToInstance(SupportRequest, data, { excludeExtraneousValues: true });
    const created = await this.supportRepo.create(payload);
    this.logger.info({ id: created.id, email: created.email }, 'Support request created');
    return created;
  }
}
