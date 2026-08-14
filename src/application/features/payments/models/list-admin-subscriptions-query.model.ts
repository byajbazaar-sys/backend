import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationFilterOptions } from '@shared-libs';
import { Expose } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListAdminSubscriptionsQueryModel extends PaginationFilterOptions {
  @Expose()
  @ApiPropertyOptional({ enum: ['active', 'cancelled', 'pending', 'halted'] })
  @IsOptional()
  @IsIn(['active', 'cancelled', 'pending', 'halted'])
  status?: 'active' | 'cancelled' | 'pending' | 'halted';

  @Expose()
  @ApiPropertyOptional({ description: 'Search by user name or email' })
  @IsOptional()
  @IsString()
  search?: string;
}
