import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ApiAccessTokenEntity } from '../entities/api-access-token.entity';
import { ApiAccessToken, IApiAccessTokenRepository } from '../../../application';

@Injectable()
export class ApiAccessTokenRepository implements IApiAccessTokenRepository {
  constructor(
    @InjectRepository(ApiAccessTokenEntity)
    private readonly repo: Repository<ApiAccessTokenEntity>,
  ) {}

  private map(entity: ApiAccessTokenEntity): ApiAccessToken {
    return plainToInstance(ApiAccessToken, entity, { excludeExtraneousValues: true });
  }

  async create(token: ApiAccessToken): Promise<ApiAccessToken> {
    const entity = this.repo.create(token);
    const saved = await this.repo.save(entity);
    return this.map(saved);
  }

  async findValidByHash(accessTokenHash: string): Promise<ApiAccessToken | null> {
    const entity = await this.repo.findOne({
      where: {
        accessTokenHash,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['configuration'],
    });
    return entity ? this.map(entity) : null;
  }

  async revokeAllByConfigurationId(apiConfigurationId: string): Promise<void> {
    await this.repo.update(
      { apiConfigurationId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async touchLastUsed(id: string, at: Date = new Date()): Promise<void> {
    await this.repo.update(id, { lastUsedAt: at });
  }
}
