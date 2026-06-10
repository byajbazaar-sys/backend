import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { SalesAnalytics } from './domain';
import {
  CreateSalesBillRequestModel,
  ListSalesBillsQueryModel,
  SalesBillResponseModel,
  SalesBillsPagedResponseModel,
} from './models';
import { SALES_BILL_SERVICE, ISalesBillService } from './service';

@ApiTags('bills')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
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
  ): Promise<SalesAnalytics> {
    return this.billService.getAnalytics(identity.userId, dateFrom, dateTo);
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

  @Get(':id')
  @ApiOperation({ summary: 'Get bill by id' })
  @ApiParam({ name: 'id', type: String })
  async getById(@Param('id') id: string, @Identity() identity: IIdentity): Promise<SalesBillResponseModel> {
    const bill = await this.billService.getById(id, identity.userId);
    return plainToInstance(SalesBillResponseModel, bill, { excludeExtraneousValues: true });
  }
}
