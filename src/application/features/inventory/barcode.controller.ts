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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';

import { InventoryItem } from './domain';
import { EBarcodeFormat, EBarcodeSize } from './enums';
import { BARCODE_SERVICE, IBarcodeService, INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';

@ApiTags('inventory-barcode')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('inventory/barcode')
export class BarcodeController {
  constructor(
    @Inject(BARCODE_SERVICE) private readonly barcodeService: IBarcodeService,
    @Inject(INVENTORY_ITEM_SERVICE) private readonly itemService: IInventoryItemService,
  ) {}

  @Get('bulk/preview')
  @ApiOperation({ summary: 'Get barcode + QR previews for multiple items (label printing)' })
  @ApiQuery({ name: 'ids', description: 'Comma-separated inventory item IDs' })
  @ApiQuery({ name: 'barcodeFormat', required: false, enum: ['CODE128', 'CODE39', 'EAN13', 'UPC'] })
  @ApiQuery({ name: 'barcodeSize', required: false, enum: ['small', 'medium', 'large'] })
  @ApiQuery({ name: 'qrSize', required: false, enum: ['small', 'medium', 'large'] })
  @ApiQuery({ name: 'qrMode', required: false, enum: ['inventory', 'sku', 'barcode', 'url', 'custom'] })
  @ApiQuery({ name: 'customQrValue', required: false })
  async bulkPreview(
    @Query('ids') idsParam: string,
    @Query('barcodeFormat') barcodeFormat: string,
    @Query('barcodeSize') barcodeSize: string,
    @Query('qrSize') qrSize: string,
    @Query('qrMode') qrMode: string,
    @Query('customQrValue') customQrValue: string,
    @Identity() identity: IIdentity,
  ) {
    const ids = (idsParam ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 50);

    const opts = this.parsePreviewOptions(barcodeFormat, barcodeSize, qrSize, qrMode, customQrValue);

    const labels = await Promise.all(
      ids.map(async (id) => {
        const item = await this.itemService.getById(id, identity.userId);
        return this.buildLabelPreview(item, opts);
      }),
    );

    return { labels };
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Get barcode + QR preview as base64 data URLs' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  @ApiQuery({ name: 'barcodeFormat', required: false })
  @ApiQuery({ name: 'barcodeSize', required: false })
  @ApiQuery({ name: 'qrSize', required: false })
  @ApiQuery({ name: 'qrMode', required: false })
  @ApiQuery({ name: 'customQrValue', required: false })
  async preview(
    @Param('id') id: string,
    @Query('barcodeFormat') barcodeFormat: string,
    @Query('barcodeSize') barcodeSize: string,
    @Query('qrSize') qrSize: string,
    @Query('qrMode') qrMode: string,
    @Query('customQrValue') customQrValue: string,
    @Identity() identity: IIdentity,
  ) {
    const item = await this.itemService.getById(id, identity.userId);
    const opts = this.parsePreviewOptions(barcodeFormat, barcodeSize, qrSize, qrMode, customQrValue);
    return this.buildLabelPreview(item, opts);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download barcode PNG' })
  @ApiParam({ name: 'id', description: 'Inventory item ID' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async download(@Param('id') id: string, @Identity() identity: IIdentity): Promise<StreamableFile> {
    const item = await this.itemService.getById(id, identity.userId);
    const barcodeText = this.barcodeService.resolveBarcodeText(item.barcode, item.sku);
    const buffer = await this.barcodeService.generateBarcodePng(barcodeText);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="barcode-${barcodeText}.png"`,
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
    const payload = this.barcodeService.resolveQrPayload(item.qrValue, item.id, item.sku);
    const buffer = await this.barcodeService.generateQrPng(payload);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `attachment; filename="qr-${item.sku}.png"`,
      length: buffer.length,
    });
  }

  private parsePreviewOptions(
    barcodeFormat?: string,
    barcodeSize?: string,
    qrSize?: string,
    qrMode?: string,
    customQrValue?: string,
  ) {
    const fmt = Object.values(EBarcodeFormat).includes(barcodeFormat as EBarcodeFormat)
      ? (barcodeFormat as EBarcodeFormat)
      : EBarcodeFormat.CODE128;
    const bSize = Object.values(EBarcodeSize).includes(barcodeSize as EBarcodeSize)
      ? (barcodeSize as EBarcodeSize)
      : EBarcodeSize.Medium;
    const qSize = Object.values(EBarcodeSize).includes(qrSize as EBarcodeSize)
      ? (qrSize as EBarcodeSize)
      : EBarcodeSize.Medium;
    const mode = ['inventory', 'sku', 'barcode', 'url', 'custom'].includes(qrMode ?? '')
      ? (qrMode as 'inventory' | 'sku' | 'barcode' | 'url' | 'custom')
      : 'inventory';
    return { barcodeFormat: fmt, barcodeSize: bSize, qrSize: qSize, qrMode: mode, customQrValue };
  }

  private resolveQrPayloadForMode(
    item: InventoryItem,
    mode: 'inventory' | 'sku' | 'barcode' | 'url' | 'custom',
    customQrValue?: string,
  ): string {
    switch (mode) {
      case 'sku':
        return item.sku;
      case 'barcode':
        return item.barcode ?? item.sku;
      case 'url':
        return `/inventory/${item.id}`;
      case 'custom':
        return customQrValue?.trim() || item.sku;
      case 'inventory':
      default:
        return this.barcodeService.resolveQrPayload(item.qrValue, item.id, item.sku);
    }
  }

  private async buildLabelPreview(
    item: InventoryItem,
    opts?: {
      barcodeFormat?: EBarcodeFormat;
      barcodeSize?: EBarcodeSize;
      qrSize?: EBarcodeSize;
      qrMode?: 'inventory' | 'sku' | 'barcode' | 'url' | 'custom';
      customQrValue?: string;
    },
  ) {
    const format = opts?.barcodeFormat ?? EBarcodeFormat.CODE128;
    const barcodeSize = opts?.barcodeSize ?? EBarcodeSize.Medium;
    const qrSize = opts?.qrSize ?? EBarcodeSize.Medium;
    const qrMode = opts?.qrMode ?? 'inventory';
    const qrPayload = this.resolveQrPayloadForMode(item, qrMode, opts?.customQrValue);
    const barcodeText = this.barcodeService.resolveBarcodeText(item.barcode, item.sku);

    const [barcodeDataUrl, qrDataUrl] = await Promise.all([
      this.barcodeService.generateBarcodeDataUrl(barcodeText, format, barcodeSize),
      this.barcodeService.generateQrDataUrl(qrPayload, qrSize),
    ]);

    return {
      id: item.id,
      itemName: item.itemName,
      sku: item.sku,
      itemCode: item.itemCode,
      barcode: item.barcode,
      barcodeValue: barcodeText,
      qrValue: qrPayload,
      categoryName: item.categoryName,
      metalType: item.metalType,
      purity: item.purity,
      grossWeight: item.grossWeight,
      netWeight: item.netWeight,
      lessWeight: item.lessWeight,
      stoneWeight: item.stoneWeight,
      sellingPrice: item.sellingPrice,
      makingCharges: item.makingCharges,
      makingChargeMode: item.makingChargeMode,
      huid: item.huid,
      location: item.location,
      dataUrl: barcodeDataUrl,
      barcodeDataUrl,
      qrDataUrl,
    };
  }
}
