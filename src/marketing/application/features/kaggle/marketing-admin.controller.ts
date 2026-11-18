import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  BulkCreateKaggleCredentialResultModel,
  BulkCreateKaggleCredentialsRequestModel,
  CreateKaggleCredentialRequestModel,
  KaggleCredentialResponseModel,
  KaggleCredentialVerifyResponseModel,
  KaggleHealthResponseModel,
  KaggleOverviewResponseModel,
  KaggleRecoveryResponseModel,
  KaggleSettingsModel,
  RestartRenderJobResponseModel,
  UpdateKaggleCredentialRequestModel,
} from './models';
import { KaggleCredentialsAdminService } from './service';
const out = <T>(cls: new () => T, value: unknown): T => plainToInstance(cls, value, { excludeExtraneousValues: true });

/** Admin-only management of the Kaggle accounts that render marketing videos (replaces KAGGLE_WORKERS). */
@ApiTags('marketing-admin')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('marketing/admin/kaggle-credentials')
export class MarketingAdminController {
  constructor(private readonly kaggle: KaggleCredentialsAdminService) {}

  @Get()
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'List Kaggle accounts (keys masked) with their setup status' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel, isArray: true })
  async list(): Promise<KaggleCredentialResponseModel[]> {
    return (await this.kaggle.list()).map((c) => out(KaggleCredentialResponseModel, c));
  }

  @Get('overview')
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Render capacity, queue length and the jobs running on each account' })
  @ApiOkResponse({ type: KaggleOverviewResponseModel })
  async overview(): Promise<KaggleOverviewResponseModel> {
    return out(KaggleOverviewResponseModel, await this.kaggle.overview());
  }

  @Get('health')
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Is rendering working? Status, problems with each account, and waiting renders' })
  @ApiOkResponse({ type: KaggleHealthResponseModel })
  async health(): Promise<KaggleHealthResponseModel> {
    return out(KaggleHealthResponseModel, await this.kaggle.health());
  }

  @Post('recover')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restart Kaggle: re-run failed setups, end cool-downs, move stuck renders to other accounts, dispatch',
  })
  @ApiOkResponse({ type: KaggleRecoveryResponseModel })
  async recover(): Promise<KaggleRecoveryResponseModel> {
    return out(KaggleRecoveryResponseModel, await this.kaggle.recover());
  }

  @Get('settings')
  @Roles(EUserType.Admin)
  @ApiOkResponse({ type: KaggleSettingsModel })
  async getSettings(): Promise<KaggleSettingsModel> {
    return out(KaggleSettingsModel, await this.kaggle.getSettings());
  }

  @Patch('settings')
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Turn automatic recovery of stuck renders on or off' })
  @ApiOkResponse({ type: KaggleSettingsModel })
  async updateSettings(@Body() body: KaggleSettingsModel): Promise<KaggleSettingsModel> {
    return out(KaggleSettingsModel, await this.kaggle.updateSettings(body));
  }

  @Post('jobs/:jobId/restart')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restart one render in a fresh Kaggle session (a waiting one is dispatched again)' })
  @ApiParam({ name: 'jobId' })
  @ApiOkResponse({ type: RestartRenderJobResponseModel })
  async restartJob(@Param('jobId', ParseUUIDPipe) jobId: string): Promise<RestartRenderJobResponseModel> {
    return out(RestartRenderJobResponseModel, await this.kaggle.restartJob(jobId));
  }

  @Post('bulk')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add several Kaggle accounts at once; each is verified and saved on its own' })
  @ApiOkResponse({ type: BulkCreateKaggleCredentialResultModel, isArray: true })
  async bulkCreate(
    @Body() body: BulkCreateKaggleCredentialsRequestModel,
  ): Promise<BulkCreateKaggleCredentialResultModel[]> {
    return (await this.kaggle.bulkCreate(body.accounts)).map((r) => out(BulkCreateKaggleCredentialResultModel, r));
  }

  @Get(':username')
  @Roles(EUserType.Admin)
  @ApiParam({ name: 'username' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel })
  async get(@Param('username') username: string): Promise<KaggleCredentialResponseModel> {
    return out(KaggleCredentialResponseModel, await this.kaggle.get(username));
  }

  @Post()
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a Kaggle account (credentials are verified, then a one-time setup notebook runs)' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel })
  async create(@Body() body: CreateKaggleCredentialRequestModel): Promise<KaggleCredentialResponseModel> {
    return out(KaggleCredentialResponseModel, await this.kaggle.create(body));
  }

  @Patch(':username')
  @Roles(EUserType.Admin)
  @ApiOperation({ summary: 'Update key / concurrency / label, or enable / disable a Kaggle account' })
  @ApiParam({ name: 'username' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel })
  async update(
    @Param('username') username: string,
    @Body() body: UpdateKaggleCredentialRequestModel,
  ): Promise<KaggleCredentialResponseModel> {
    return out(KaggleCredentialResponseModel, await this.kaggle.update(username, body));
  }

  @Post(':username/verify')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the stored credentials against Kaggle and report GPU hours left' })
  @ApiParam({ name: 'username' })
  @ApiOkResponse({ type: KaggleCredentialVerifyResponseModel })
  async verify(@Param('username') username: string): Promise<KaggleCredentialVerifyResponseModel> {
    return out(KaggleCredentialVerifyResponseModel, await this.kaggle.verify(username));
  }

  @Post(':username/retry-setup')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run the account setup notebook again now' })
  @ApiParam({ name: 'username' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel })
  async retrySetup(@Param('username') username: string): Promise<KaggleCredentialResponseModel> {
    return out(KaggleCredentialResponseModel, await this.kaggle.retrySetup(username));
  }

  @Post(':username/clear-cooldown')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Let an account that failed to start a notebook take jobs again right away' })
  @ApiParam({ name: 'username' })
  @ApiOkResponse({ type: KaggleCredentialResponseModel })
  async clearCooldown(@Param('username') username: string): Promise<KaggleCredentialResponseModel> {
    return out(KaggleCredentialResponseModel, await this.kaggle.clearCooldown(username));
  }

  @Delete(':username')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a Kaggle account (its kaggle_accounts row is marked DISABLED)' })
  @ApiParam({ name: 'username' })
  async remove(@Param('username') username: string): Promise<void> {
    await this.kaggle.remove(username);
  }
}
