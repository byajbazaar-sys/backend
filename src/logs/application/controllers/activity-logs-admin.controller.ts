import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { EUserType, getPaginationValues, Roles, RolesGuard, toPaged, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import { ActivityLogResponseModel, ActivityLogsPagedResponseModel, ListActivityLogsQueryModel } from '../models';
import { ACTIVITY_LOGS_REPOSITORY, IActivityLogsRepository } from '../ports';

/** Admin view of the activity log (dues, payments, marketing), newest first. */
@ApiTags('logs-admin')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Roles(EUserType.Admin)
@Controller('logs/admin/activity')
export class ActivityLogsAdminController {
  constructor(@Inject(ACTIVITY_LOGS_REPOSITORY) private readonly store: IActivityLogsRepository) {}

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
