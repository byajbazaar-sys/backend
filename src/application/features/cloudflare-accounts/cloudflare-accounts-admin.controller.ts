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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, Roles, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  BulkCreateCloudflareAccountResultModel,
  BulkCreateCloudflareAccountsRequestModel,
  CloudflareAccountResponseModel,
  CloudflareAccountsSummaryResponseModel,
  CloudflareAccountVerifyResponseModel,
  CreateCloudflareAccountRequestModel,
  UpdateCloudflareAccountRequestModel,
} from './models';
import { CloudflareAccountsAdminService } from './service';

const out = <T>(cls: new () => T, value: unknown): T => plainToInstance(cls, value, { excludeExtraneousValues: true });

/** Admin-only management of the Cloudflare Workers AI accounts (try-on, inventory background removal). */
@ApiTags('cloudflare-admin')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('admin/cloudflare-accounts')
export class CloudflareAccountsAdminController {
  constructor(private readonly cloudflare: CloudflareAccountsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'List Cloudflare accounts (tokens masked)' })
  @ApiOkResponse({ type: CloudflareAccountResponseModel, isArray: true })
  async list(): Promise<CloudflareAccountResponseModel[]> {
    return (await this.cloudflare.list()).map((a) => out(CloudflareAccountResponseModel, a));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Where Workers AI calls take their accounts from, and how many are in rotation' })
  @ApiOkResponse({ type: CloudflareAccountsSummaryResponseModel })
  async summary(): Promise<CloudflareAccountsSummaryResponseModel> {
    return out(CloudflareAccountsSummaryResponseModel, await this.cloudflare.summary());
  }

  @Post()
  @ApiOperation({ summary: 'Add a Cloudflare account (token checked against Workers AI first)' })
  @ApiOkResponse({ type: CloudflareAccountResponseModel })
  async create(@Body() body: CreateCloudflareAccountRequestModel): Promise<CloudflareAccountResponseModel> {
    return out(CloudflareAccountResponseModel, await this.cloudflare.create(body));
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add several Cloudflare accounts; each one succeeds or fails on its own' })
  @ApiOkResponse({ type: BulkCreateCloudflareAccountResultModel, isArray: true })
  async bulkCreate(
    @Body() body: BulkCreateCloudflareAccountsRequestModel,
  ): Promise<BulkCreateCloudflareAccountResultModel[]> {
    return (await this.cloudflare.bulkCreate(body.accounts)).map((r) => out(BulkCreateCloudflareAccountResultModel, r));
  }

  @Post('import-env')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Copy the CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN accounts into the database' })
  @ApiOkResponse({ type: BulkCreateCloudflareAccountResultModel, isArray: true })
  async importFromEnv(): Promise<BulkCreateCloudflareAccountResultModel[]> {
    return (await this.cloudflare.importFromEnv()).map((r) => out(BulkCreateCloudflareAccountResultModel, r));
  }

  @Get(':id')
  @ApiOkResponse({ type: CloudflareAccountResponseModel })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<CloudflareAccountResponseModel> {
    return out(CloudflareAccountResponseModel, await this.cloudflare.get(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change the token, label or enabled flag' })
  @ApiOkResponse({ type: CloudflareAccountResponseModel })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCloudflareAccountRequestModel,
  ): Promise<CloudflareAccountResponseModel> {
    return out(CloudflareAccountResponseModel, await this.cloudflare.update(id, body));
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check the stored token against Cloudflare Workers AI' })
  @ApiOkResponse({ type: CloudflareAccountVerifyResponseModel })
  async verify(@Param('id', ParseUUIDPipe) id: string): Promise<CloudflareAccountVerifyResponseModel> {
    return out(CloudflareAccountVerifyResponseModel, await this.cloudflare.verify(id));
  }

  @Post(':id/clear-cooldown')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put an account that is cooling down back into rotation now' })
  @ApiOkResponse({ type: CloudflareAccountResponseModel })
  async clearCooldown(@Param('id', ParseUUIDPipe) id: string): Promise<CloudflareAccountResponseModel> {
    return out(CloudflareAccountResponseModel, await this.cloudflare.clearCooldown(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a Cloudflare account' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.cloudflare.remove(id);
  }
}
