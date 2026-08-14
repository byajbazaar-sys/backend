import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  ApiConfigurationResponseModel,
  GenerateApiCredentialsRequestModel,
  GenerateApiCredentialsResponseModel,
  UpdateApiStatusRequestModel,
} from './models';
import { API_AUTH_SERVICE, IApiAuthService } from './service/i-api-auth.service';

@ApiTags('settings')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('settings/api')
export class SettingsApiController {
  constructor(
    @InjectPinoLogger(SettingsApiController.name) private readonly logger: PinoLogger,
    @Inject(API_AUTH_SERVICE) private readonly apiAuthService: IApiAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get API access configuration (never returns secret)' })
  @ApiOkResponse({ type: ApiConfigurationResponseModel })
  async getConfiguration(@Identity() identity: IIdentity): Promise<ApiConfigurationResponseModel> {
    const configuration = await this.apiAuthService.getConfiguration(identity.userId);
    if (!configuration) return null;
    return plainToInstance(
      ApiConfigurationResponseModel,
      {
        apiKey: configuration.apiKey,
        isActive: configuration.isActive,
        createdAt: configuration.createdAt,
        lastUsedAt: configuration.lastUsedAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate or regenerate API credentials' })
  @ApiOkResponse({ type: GenerateApiCredentialsResponseModel })
  async generateCredentials(
    @Identity() identity: IIdentity,
    @Body() body: GenerateApiCredentialsRequestModel,
  ): Promise<GenerateApiCredentialsResponseModel> {
    this.logger.info({ userId: identity.userId }, 'generateApiCredentials called');
    const result = await this.apiAuthService.generateCredentials(identity.userId, body.confirmRegenerate === true);
    return plainToInstance(
      GenerateApiCredentialsResponseModel,
      {
        apiKey: result.apiKey,
        apiSecret: result.apiSecret,
        isActive: result.configuration.isActive,
        createdAt: result.configuration.createdAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Patch('status')
  @ApiOperation({ summary: 'Enable or disable API access' })
  @ApiOkResponse({ type: ApiConfigurationResponseModel })
  async updateStatus(
    @Identity() identity: IIdentity,
    @Body() body: UpdateApiStatusRequestModel,
  ): Promise<ApiConfigurationResponseModel> {
    const configuration = await this.apiAuthService.updateStatus(identity.userId, body.isActive);
    return plainToInstance(
      ApiConfigurationResponseModel,
      {
        apiKey: configuration.apiKey,
        isActive: configuration.isActive,
        createdAt: configuration.createdAt,
        lastUsedAt: configuration.lastUsedAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete API credentials and revoke all access tokens' })
  async deleteCredentials(@Identity() identity: IIdentity): Promise<void> {
    await this.apiAuthService.deleteCredentials(identity.userId);
  }
}
