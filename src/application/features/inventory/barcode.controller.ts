import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { BARCODE_SERVICE, IBarcodeService, INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';

@ApiTags('inventory-barcode')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('inventory/barcode')
export class BarcodeController {
  constructor(
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(INVENTORY_ITEM_SERVICE) private readonly itemService: IInventoryItemService,
  ) {}

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get barcode preview as base64 data URL' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  async preview(@Param('id') id: string, @Identity() identity: IIdentity) {
    const item = await this.itemService.getById(id, identity.userId);
    const dataUrl = await this.barcodeService.generateBarcodeDataUrl(item.sku);
    return { sku: item.sku, barcode: item.barcode, dataUrl };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download barcode PNG' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async download(@Param('id') id: string, @Identity() identity: IIdentity): Promise<StreamableFile> {
    const item = await this.itemService.getById(id, identity.userId);
    const buffer = await this.barcodeService.generateBarcodePng(item.sku);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="barcode-${item.sku}.png"`,
      length: buffer.length,
    });
  }
}
