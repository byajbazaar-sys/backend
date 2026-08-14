import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { SalesAnalytics } from './domain';
import {
  CreateSalesBillRequestModel,
  ListSalesBillsQueryModel,
  SalesBillResponseModel,
  SalesBillsPagedResponseModel,
  UpdateSalesBillRequestModel,
  BulkDeleteSalesBillsRequestModel,
  BulkDeleteSalesBillsResponseModel,
} from './models';
import { SALES_BILL_SERVICE, ISalesBillService } from './service';

@ApiTags('bills')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('bills')
export class SalesBillsController {
  constructor(
    @InjectPinoLogger(SalesBillsController.name) private readonly logger: PinoLogger,
    @Inject(SALES_BILL_SERVICE) private readonly billService: ISalesBillService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a sales bill' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSalesBillRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillResponseModel> {
    const bill = await this.billService.create(body, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOperation({ summary: 'List sales bills with filters and pagination' })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async list(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    const paged = await this.billService.list(identity.userId, query);
    return plainToInstance(SalesBillsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search sales bills' })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async search(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    return this.list(query, identity);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Sales analytics for dashboard charts' })
  async stats(
    @Identity() identity: IIdentity,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('documentType') documentType?: string,
  ): Promise<SalesAnalytics> {
    return this.billService.getAnalytics(identity.userId, dateFrom, dateTo, documentType);
  }

  @Get('export/gst')
  @ApiOperation({ summary: 'Export filtered sales bills as GST CSV (one row per line item)' })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
  async exportGstCsv(
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    this.logger.info({ query }, 'exportGstCsv called');
    const { buffer, filename } = await this.billService.exportGstCsv(identity.userId, query);
    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Delete multiple sales bills' })
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @Body() body: BulkDeleteSalesBillsRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<BulkDeleteSalesBillsResponseModel> {
    const result = await this.billService.bulkDelete(body.ids, identity.userId);
    return plainToInstance(BulkDeleteSalesBillsResponseModel, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'List bills for a customer' })
  @ApiParam({ name: 'customerId', type: String })
  @ApiOkResponse({ type: SalesBillsPagedResponseModel })
  async listByCustomer(
    @Param('customerId') customerId: string,
    @Query() query: ListSalesBillsQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillsPagedResponseModel> {
    const paged = await this.billService.listByCustomer(customerId, identity.userId, query);
    return plainToInstance(SalesBillsPagedResponseModel, paged, { excludeExtraneousValues: true });
  }

  @Post(':id/convert-to-normal')
  @ApiOperation({ summary: 'Convert an informal bill to a normal GST bill' })
  @ApiParam({ name: 'id', type: String })
  async convertToNormal(@Param('id') id: string, @Identity() identity: IIdentity): Promise<SalesBillResponseModel> {
    const bill = await this.billService.convertToNormalBill(id, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a sales bill' })
  @ApiParam({ name: 'id', type: String })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateSalesBillRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<SalesBillResponseModel> {
    const bill = await this.billService.update(id, body, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sales bill' })
  @ApiParam({ name: 'id', type: String })
  async delete(@Param('id') id: string, @Identity() identity: IIdentity): Promise<void> {
    await this.billService.delete(id, identity.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bill by id' })
  @ApiParam({ name: 'id', type: String })
  async getById(@Param('id') id: string, @Identity() identity: IIdentity): Promise<SalesBillResponseModel> {
    const bill = await this.billService.getById(id, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }
}
