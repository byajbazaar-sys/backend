import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { BARCODE_SERVICE, IBarcodeService, INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';
import { InventoryItem } from './domain';

@ApiTags('inventory-barcode')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('inventory/barcode')
export class BarcodeController {
  constructor(
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(INVENTORY_ITEM_SERVICE) private readonly itemService: IInventoryItemService,
  ) {}

  @Get('bulk/preview')
  @ApiOperation({ summary: 'Get barcode + QR previews for multiple items (label printing)' })
  @ApiQuery({ name: 'ids', description: 'Comma-separated inventory item IDs' })
  async bulkPreview(@Query('ids') idsParam: string, @Identity() identity: IIdentity) {
    const ids = (idsParam ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50);

    const labels = await Promise.all(
      ids.map(async (id) => {
        const item = await this.itemService.getById(id, identity.userId);
        return this.buildLabelPreview(item);
      }),
    );

    return { labels };
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get barcode + QR preview as base64 data URLs' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  async preview(@Param('id') id: string, @Identity() identity: IIdentity) {
    const item = await this.itemService.getById(id, identity.userId);
    return this.buildLabelPreview(item);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download barcode PNG' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async download(@Param('id') id: string, @Identity() identity: IIdentity): Promise<StreamableFile> {
    const item = await this.itemService.getById(id, identity.userId);
    const buffer = await this.barcodeService.generateBarcodePng(item.sku!);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="barcode-${item.sku}.png"`,
      length: buffer.length,
    });
  }

  @Get(':id/qr/download')
  @ApiOperation({ summary: 'Download inventory item QR PNG' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async downloadQr(@Param('id') id: string, @Identity() identity: IIdentity): Promise<StreamableFile> {
    const item = await this.itemService.getById(id, identity.userId);
    const payload = this.barcodeService.resolveQrPayload(item.qrValue, item.id!, item.sku!);
    const buffer = await this.barcodeService.generateQrPng(payload);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="qr-${item.sku}.png"`,
      length: buffer.length,
    });
  }

  private async buildLabelPreview(item: InventoryItem) {
    const qrPayload = this.barcodeService.resolveQrPayload(item.qrValue, item.id!, item.sku!);
    const [barcodeDataUrl, qrDataUrl] = await Promise.all([
      this.barcodeService.generateBarcodeDataUrl(item.sku!),
      this.barcodeService.generateQrDataUrl(qrPayload),
    ]);

    return {
      id: item.id,
      itemName: item.itemName,
      sku: item.sku,
      barcode: item.barcode,
      barcodeValue: item.barcode,
      qrValue: qrPayload,
      netWeight: item.netWeight,
      sellingPrice: item.sellingPrice,
      dataUrl: barcodeDataUrl,
      barcodeDataUrl,
      qrDataUrl,
    };
  }
}
