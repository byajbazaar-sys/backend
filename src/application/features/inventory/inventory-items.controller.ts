import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  CreateInventoryItemRequestModel,
  InventoryItemResponseModel,
  InventoryItemSaleResponseModel,
  InventoryItemsPagedResponseModel,
  InventoryImageAiPreviewResponseModel,
  ListInventoryItemsQueryModel,
  UpdateInventoryItemRequestModel,
  BulkDeleteInventoryItemsRequestModel,
  BulkDeleteInventoryItemsResponseModel,
} from './models';
import { INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';

const INVENTORY_IMAGE_UPLOAD = {
  limits: { fileSize: 10 * 1024 * 1024 },
};

@ApiTags('inventory-items')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('inventory/items')
export class InventoryItemsController {
  constructor(
    @InjectPinoLogger(InventoryItemsController.name) private readonly logger: PinoLogger,
    @Inject(INVENTORY_ITEM_SERVICE) private readonly itemService: IInventoryItemService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create inventory item (auto-generates SKU and barcode)' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateInventoryItemRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.create(body, identity.userId);
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOperation({ summary: 'List inventory items with pagination and filters' })
  async getAll(
    @Query() query: ListInventoryItemsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemsPagedResponseModel> {
    const paged = await this.itemService.getAll(identity.userId, query);
    return plainToInstance(
      InventoryItemsPagedResponseModel,
      {
        ...paged,
        items: plainToInstance(InventoryItemResponseModel, paged.items, { excludeExtraneousValues: true }),
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get('barcode/:barcode')
  @ApiOperation({ summary: 'Lookup inventory item by barcode/SKU' })
  async getByBarcode(
    @Param('barcode') barcode: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.getByBarcode(barcode, identity.userId);
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple inventory items' })
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @Body() body: BulkDeleteInventoryItemsRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<BulkDeleteInventoryItemsResponseModel> {
    const result = await this.itemService.bulkDelete(body.ids, identity.userId);
    return plainToInstance(BulkDeleteInventoryItemsResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post('image/ai-preview')
  @ApiOperation({
    summary: 'Generate AI background-cleared preview without saving; returns original + AI images',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', INVENTORY_IMAGE_UPLOAD))
  async previewAiImage(@UploadedFile() image: Express.Multer.File): Promise<InventoryImageAiPreviewResponseModel> {
    const result = await this.itemService.previewAiImage(image);
    return plainToInstance(InventoryImageAiPreviewResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':id/image/ai-preview')
  @ApiOperation({
    summary: 'Regenerate AI preview from the item’s stored image without saving',
  })
  @ApiParam({ name: 'id' })
  async previewAiImageForItem(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryImageAiPreviewResponseModel> {
    const result = await this.itemService.previewAiImageForItem(id, identity.userId);
    return plainToInstance(InventoryImageAiPreviewResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id/sales-history')
  @ApiOperation({ summary: 'List completed bill sales for an inventory item with profit/loss' })
  @ApiParam({ name: 'id' })
  async getSalesHistory(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemSaleResponseModel[]> {
    const sales = await this.itemService.getSalesHistory(id, identity.userId);
    return plainToInstance(
      InventoryItemSaleResponseModel,
      sales.map((sale) => ({
        ...sale,
        issuedAt: sale.issuedAt instanceof Date ? sale.issuedAt.toISOString() : sale.issuedAt,
      })),
      { excludeExtraneousValues: true },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  @ApiParam({ name: 'id' })
  async getById(@Param('id') id: string, @Identity() identity: IIdentity): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.getById(id, identity.userId);
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Patch(':id/image')
  @ApiOperation({ summary: 'Upload or remove inventory item image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', INVENTORY_IMAGE_UPLOAD))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body('removeImage') removeImage: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.uploadImage(
      id,
      identity.userId,
      image,
      removeImage === 'true' || removeImage === '1',
    );
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inventory item' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateInventoryItemRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.update(id, body, identity.userId);
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete inventory item' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Identity() identity: IIdentity): Promise<void> {
    await this.itemService.delete(id, identity.userId);
  }
}
