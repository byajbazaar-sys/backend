import { Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { plainToInstance } from 'class-transformer';

import { ListPublicCatalogQueryModel, PublicCatalogResponseModel } from './models';
import { IPublicCatalogService, PUBLIC_CATALOG_SERVICE } from './service/i-public-catalog.service';

@ApiTags('public-catalog')
@UseGuards(ThrottlerGuard)
@Controller('public/catalog')
export class PublicCatalogController {
  constructor(@Inject(PUBLIC_CATALOG_SERVICE) private readonly catalogService: IPublicCatalogService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get public inventory catalog for a business slug' })
  @ApiParam({ name: 'slug', example: 'shri-rk-jewellers' })
  async getCatalog(
    @Param('slug') slug: string,
    @Query() query: ListPublicCatalogQueryModel,
  ): Promise<PublicCatalogResponseModel> {
    const result = await this.catalogService.getCatalogBySlug(slug, query);
    return plainToInstance(PublicCatalogResponseModel, result, { excludeExtraneousValues: true });
  }
}
