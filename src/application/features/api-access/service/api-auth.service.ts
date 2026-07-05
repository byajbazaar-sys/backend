import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomBytes } from 'crypto';
import { compareSync, hashSync } from 'bcrypt';
import { BCRYPT_SALT_ROUNDS, IIdentity, hashAccessToken } from '@shared-libs';
import { IUsersRepository, USERS_REPOSITORY } from '../../users';
import { ApiConfiguration } from '../domain';
import {
  API_ACCESS_TOKEN_REPOSITORY,
  IApiAccessTokenRepository,
} from './i-api-access-token.repository';
import {
  API_CONFIGURATION_REPOSITORY,
  IApiConfigurationRepository,
} from './i-api-configuration.repository';
import {
  API_ACCESS_TOKEN_TTL_SECONDS,
  ApiCredentialsGenerateResult,
  ApiTokenExchangeResult,
  IApiAuthService,
} from './i-api-auth.service';

function generateApiKey(): string {
  return `pk_live_${randomBytes(24).toString('hex')}`;
}

function generateApiSecret(): string {
  return `sk_live_${randomBytes(32).toString('hex')}`;
}

function generateAccessToken(): string {
  return `at_live_${randomBytes(32).toString('hex')}`;
}

@Injectable()
export class ApiAuthService implements IApiAuthService {
  constructor(
    @Inject(API_CONFIGURATION_REPOSITORY)
    private readonly configRepo: IApiConfigurationRepository,
    @Inject(API_ACCESS_TOKEN_REPOSITORY)
    private readonly tokenRepo: IApiAccessTokenRepository,
    @Inject(USERS_REPOSITORY) private readonly usersRepo: IUsersRepository,
    @InjectPinoLogger(ApiAuthService.name) private readonly logger: PinoLogger,
  ) {}

  async exchangeCredentials(apiKey: string, apiSecret: string): Promise<ApiTokenExchangeResult> {
    const trimmedKey = apiKey?.trim();
    const trimmedSecret = apiSecret?.trim();
    if (!trimmedKey || !trimmedSecret) {
      throw new UnauthorizedException('Invalid API credentials');
    }

    const configuration = await this.configRepo.findByApiKey(trimmedKey);
    if (!configuration || !configuration.isActive) {
      throw new UnauthorizedException('Invalid API credentials');
    }

    if (!compareSync(trimmedSecret, configuration.apiSecretHash)) {
      throw new UnauthorizedException('Invalid API credentials');
    }

    const accessToken = generateAccessToken();
    const expiresAt = new Date(Date.now() + API_ACCESS_TOKEN_TTL_SECONDS * 1000);
    await this.tokenRepo.create({
      apiConfigurationId: configuration.id!,
      accessTokenHash: hashAccessToken(accessToken),
      expiresAt,
    });
    await this.configRepo.touchLastUsed(configuration.id!);

    this.logger.info({ userId: configuration.userId }, 'API access token issued');

    return {
      accessToken,
      expiresIn: API_ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  async validateAccessToken(accessToken: string): Promise<IIdentity> {
    const trimmed = accessToken?.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Invalid access token');
    }

    const tokenRecord = await this.tokenRepo.findValidByHash(hashAccessToken(trimmed));
    if (!tokenRecord?.id) {
      throw new UnauthorizedException('Invalid access token');
    }

    const configuration = await this.configRepo.findById(tokenRecord.apiConfigurationId);
    if (!configuration?.isActive) {
      throw new UnauthorizedException('API access disabled');
    }

    const user = await this.usersRepo.findById(configuration.userId);
    if (!user?.id) {
      throw new UnauthorizedException('Invalid access token');
    }

    const now = new Date();
    await Promise.all([
      this.tokenRepo.touchLastUsed(tokenRecord.id, now),
      this.configRepo.touchLastUsed(configuration.id!, now),
    ]);

    return {
      userId: user.id,
      userType: user.userType,
      email: user.email,
      emailVerified: user.isEmailVerified,
    };
  }

  async getConfiguration(userId: string): Promise<ApiConfiguration | null> {
    return this.configRepo.findByUserId(userId);
  }

  async generateCredentials(
    userId: string,
    confirmRegenerate = false,
  ): Promise<ApiCredentialsGenerateResult> {
    const existing = await this.configRepo.findByUserId(userId);
    if (existing && !confirmRegenerate) {
      throw new ConflictException('API credentials already exist. Confirm regeneration to continue.');
    }

    if (existing?.id) {
      await this.tokenRepo.revokeAllByConfigurationId(existing.id);
      await this.configRepo.deleteByUserId(userId);
    }

    const apiKey = generateApiKey();
    const apiSecret = generateApiSecret();
    const configuration = await this.configRepo.save({
      userId,
      apiKey,
      apiSecretHash: hashSync(apiSecret, BCRYPT_SALT_ROUNDS),
      isActive: true,
    });

    this.logger.info({ userId }, 'API credentials generated');

    return { apiKey, apiSecret, configuration };
  }

  async updateStatus(userId: string, isActive: boolean): Promise<ApiConfiguration> {
    const existing = await this.configRepo.findByUserId(userId);
    if (!existing) {
      throw new NotFoundException('API configuration not found');
    }
    return this.configRepo.updateStatus(userId, isActive);
  }

  async deleteCredentials(userId: string): Promise<void> {
    const existing = await this.configRepo.findByUserId(userId);
    if (!existing?.id) {
      throw new NotFoundException('API configuration not found');
    }
    await this.tokenRepo.revokeAllByConfigurationId(existing.id);
    await this.configRepo.deleteByUserId(userId);
    this.logger.info({ userId }, 'API credentials deleted');
  }
}
