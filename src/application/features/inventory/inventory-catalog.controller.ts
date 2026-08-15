import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

import {
  BulkUpdateCatalogVisibilityRequestModel,
  BulkUpdateCatalogVisibilityResponseModel,
  InventoryCatalogSummaryResponseModel,
  InventoryItemResponseModel,
  InventoryItemsPagedResponseModel,
  UpdateCatalogSettingsRequestModel,
} from './models';
import { INVENTORY_CATALOG_SERVICE, IInventoryCatalogService } from './service/i-inventory-catalog.service';
import { INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';

@ApiTags('inventory-catalog')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('inventory/catalog')
export class InventoryCatalogController {
  constructor(
    @Inject(INVENTORY_CATALOG_SERVICE) private readonly catalogService: IInventoryCatalogService,
    @Inject(INVENTORY_ITEM_SERVICE) private readonly itemService: IInventoryItemService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get catalog URL, status, and published item count for the current business' })
  async getSummary(@Identity() identity: IIdentity): Promise<InventoryCatalogSummaryResponseModel> {
    const summary = await this.catalogService.getSummary(identity.userId);
    return plainToInstance(InventoryCatalogSummaryResponseModel, summary, { excludeExtraneousValues: true });
  }

  @Get('items')
  @ApiOperation({ summary: 'List inventory items published to the public catalog' })
  async listPublishedItems(@Identity() identity: IIdentity): Promise<InventoryItemsPagedResponseModel> {
    const paged = await this.itemService.getLiveCatalogItems(identity.userId, {
      pageNumber: 0,
      pageSize: 100,
    });
    return plainToInstance(
      InventoryItemsPagedResponseModel,
      {
        ...paged,
        items: plainToInstance(InventoryItemResponseModel, paged.items, { excludeExtraneousValues: true }),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update catalog enable/disable for the current business' })
  async updateSettings(
    @Body() body: UpdateCatalogSettingsRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryCatalogSummaryResponseModel> {
    const summary = await this.catalogService.updateSettings(identity.userId, body);
    return plainToInstance(InventoryCatalogSummaryResponseModel, summary, { excludeExtraneousValues: true });
  }

  @Post('bulk-visibility')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk add/remove inventory items from the public catalog' })
  async bulkUpdateVisibility(
    @Body() body: BulkUpdateCatalogVisibilityRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<BulkUpdateCatalogVisibilityResponseModel> {
    const result = await this.catalogService.bulkUpdateVisibility(
      identity.userId,
      body.ids,
      body.isCatalogVisible,
    );
    return plainToInstance(BulkUpdateCatalogVisibilityResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }
}
