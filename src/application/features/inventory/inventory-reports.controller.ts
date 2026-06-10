import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY, toCSV, toPDF, IPdfColumnConfig } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { ExportFormat } from '../../shared/enums/e-export-format.enum';
import { InventoryItemResponseModel } from './models';
import { InventoryAnalytics } from './domain';
import { INVENTORY_REPORT_SERVICE, IInventoryReportService } from './service';

@ApiTags('inventory-reports')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('inventory/reports')
export class InventoryReportsController {
  constructor(
    @Inject(INVENTORY_REPORT_SERVICE) private readonly reportService: IInventoryReportService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Inventory dashboard statistics' })
  async dashboard(@Identity() identity: IIdentity) {
    return this.reportService.getDashboardStats(identity.userId);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Jewellery inventory analytics for dashboard charts' })
  async analytics(@Identity() identity: IIdentity): Promise<InventoryAnalytics> {
    return this.reportService.getAnalytics(identity.userId);
  }

  @Get('current')
  @ApiOperation({ summary: 'Current inventory report' })
  async current(@Identity() identity: IIdentity) {
    const items = await this.reportService.getCurrentInventory(identity.userId);
    return plainToInstance(InventoryItemResponseModel, items, { excludeExtraneousValues: true });
  }

  @Get('valuation')
  @ApiOperation({ summary: 'Inventory valuation report' })
  async valuation(@Identity() identity: IIdentity) {
    const items = await this.reportService.getValuationReport(identity.userId);
    return plainToInstance(InventoryItemResponseModel, items, { excludeExtraneousValues: true });
  }

  @Get('category-wise')
  @ApiOperation({ summary: 'Category-wise inventory report' })
  async categoryWise(@Identity() identity: IIdentity) {
    return this.reportService.getCategoryWiseReport(identity.userId);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Low stock report' })
  @ApiQuery({ name: 'threshold', required: false })
  async lowStock(@Identity() identity: IIdentity, @Query('threshold') threshold?: string) {
    const items = await this.reportService.getLowStockReport(
      identity.userId,
      threshold ? parseFloat(threshold) : 1,
    );
    return plainToInstance(InventoryItemResponseModel, items, { excludeExtraneousValues: true });
  }

  @Get('barcode')
  @ApiOperation({ summary: 'Barcode report listing all items with SKU/barcode' })
  async barcode(@Identity() identity: IIdentity) {
    const items = await this.reportService.getBarcodeReport(identity.userId);
    return plainToInstance(InventoryItemResponseModel, items, { excludeExtraneousValues: true });
  }

  @Get('download')
  @ApiOperation({ summary: 'Download inventory report as CSV or PDF' })
  @ApiQuery({ name: 'format', enum: ExportFormat })
  @ApiQuery({ name: 'reportType', enum: ['current', 'valuation', 'barcode', 'low-stock'] })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition')
  async download(
    @Identity() identity: IIdentity,
    @Query('format') format: ExportFormat,
    @Query('reportType') reportType: string,
  ): Promise<StreamableFile> {
    let items;
    switch (reportType) {
      case 'valuation':
        items = await this.reportService.getValuationReport(identity.userId);
        break;
      case 'barcode':
        items = await this.reportService.getBarcodeReport(identity.userId);
        break;
      case 'low-stock':
        items = await this.reportService.getLowStockReport(identity.userId);
        break;
      default:
        items = await this.reportService.getCurrentInventory(identity.userId);
    }

    const mapped = plainToInstance(InventoryItemResponseModel, items, { excludeExtraneousValues: true });
    const filename = `inventory-${reportType}-${Date.now()}`;

    if (format === ExportFormat.CSV) {
      const buffer = Buffer.from(toCSV(mapped as unknown as Record<string, unknown>[]), 'utf-8');
      return new StreamableFile(buffer, {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${filename}.csv"`,
        length: buffer.length,
      });
    }

    const columns: IPdfColumnConfig[] = [
      { header: 'SKU', key: 'sku', width: 70 },
      { header: 'Name', key: 'itemName', width: 100 },
      { header: 'Category', key: 'categoryName', width: 70 },
      { header: 'Metal', key: 'metalType', width: 50 },
      { header: 'Net Wt', key: 'netWeight', width: 50 },
      { header: 'Price', key: 'sellingPrice', width: 60 },
      { header: 'Status', key: 'status', width: 55 },
    ];
    const pdf = await toPDF(mapped as unknown as Record<string, unknown>[], columns, 'Inventory Report');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}.pdf"`,
      length: pdf.length,
    });
  }
}
