import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { SupportRequestEntity } from '../entities/support-request.entity';
import { ISupportRequestsRepository, SupportRequest } from '../../../application/features/support';

@Injectable()
export class SupportRequestsRepository implements ISupportRequestsRepository {
  constructor(
    @InjectRepository(SupportRequestEntity) private readonly repo: Repository<SupportRequestEntity>,
  ) {}

  async create(data: SupportRequest): Promise<SupportRequest> {
    const entity = this.repo.create({
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      message: data.message,
    });
    const saved = await this.repo.save(entity);
    return plainToInstance(SupportRequest, saved, { excludeExtraneousValues: true });
  }
}
