import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, getPaginationValues, Roles, RolesGuard, toPaged, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import { ActivityLogsStore } from '../../infrastructure/persistence/stores/activity-logs.store';
import {
  ActivityLogResponseModel,
  ActivityLogsPagedResponseModel,
  ListActivityLogsQueryModel,
} from '../models/activity-log.models';

/** Admin view of the activity log (dues, payments, marketing), newest first. */
@ApiTags('logs-admin')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('logs/admin/activity')
export class ActivityLogsAdminController {
  constructor(private readonly store: ActivityLogsStore) {}

  @Get()
  @ApiOperation({ summary: 'Search the activity log (admin)' })
  @ApiOkResponse({ type: ActivityLogsPagedResponseModel })
  async list(@Query() query: ListActivityLogsQueryModel): Promise<ActivityLogsPagedResponseModel> {
    const { pageNumber, pageSize, skip } = getPaginationValues({
      pageNumber: query.pageNumber,
      pageSize: query.pageSize ?? 50,
    });
    const { items, totalCount } = await this.store.find({ ...query, limit: pageSize, offset: skip });
    const paged = toPaged(ActivityLogResponseModel, { items, page: pageNumber, perPage: pageSize, totalCount });
    return plainToInstance(ActivityLogsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }
}
