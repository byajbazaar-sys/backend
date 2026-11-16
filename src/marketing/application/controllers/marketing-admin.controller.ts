import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  CreateKaggleCredentialRequestModel,
  KaggleCredentialResponseModel,
  KaggleCredentialVerifyResponseModel,
  UpdateKaggleCredentialRequestModel,
} from '../models/kaggle-credentials.models';
import { KaggleCredentialsAdminService } from '../services/kaggle-credentials-admin.service';

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

  @Delete(':username')
  @Roles(EUserType.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a Kaggle account (its kaggle_accounts row is marked DISABLED)' })
  @ApiParam({ name: 'username' })
  async remove(@Param('username') username: string): Promise<void> {
    await this.kaggle.remove(username);
  }
}
