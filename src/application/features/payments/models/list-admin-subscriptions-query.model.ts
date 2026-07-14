import { Expose } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationFilterOptions } from '@shared-libs';

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
