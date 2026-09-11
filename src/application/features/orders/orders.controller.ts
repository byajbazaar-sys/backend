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
import { ApiBearerAuth, ApiConsumes, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { CreateOrderData, UpdateOrderData } from './domain';
import {
  AddOrderAdvanceRequestModel,
  AddOrderNoteRequestModel,
  CreateOrderRequestModel,
  GetOrderParamsModel,
  ListOrdersQueryModel,
  NotifyOrderRequestModel,
  NotifyOrderResponseModel,
  OrderActivityResponseModel,
  OrderResponseModel,
  OrderStatsResponseModel,
  OrdersPagedResponseModel,
  UpdateOrderRequestModel,
  UpdateOrderStatusRequestModel,
} from './models';
import { OrdersFilterOptions } from './options';
import { ORDER_SERVICE, IOrdersService } from './service';

@ApiTags('orders')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(ORDER_SERVICE) private readonly ordersService: IOrdersService,
    @InjectPinoLogger(OrdersController.name) private readonly logger: PinoLogger,
  ) {}

  @Get('stats')
  @ApiOkResponse({ type: OrderStatsResponseModel })
  @HttpCode(HttpStatus.OK)
  async getStats(@Identity() identity: IIdentity): Promise<OrderStatsResponseModel> {
    const stats = await this.ordersService.getStats(identity.userId);
    return plainToInstance(OrderStatsResponseModel, stats, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOkResponse({ type: OrdersPagedResponseModel })
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: ListOrdersQueryModel,
    @Identity() identity: IIdentity,
  ): Promise<OrdersPagedResponseModel> {
    const options = plainToInstance(OrdersFilterOptions, {
      ...query,
      createdBy: identity.userId,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
    const result = await this.ordersService.findAll(options);
    return {
      items: plainToInstance(OrderResponseModel, result.items, { excludeExtraneousValues: true }),
      meta: {
        page: result.page,
        limit: result.perPage,
        totalItems: result.totalCount,
        totalPages: result.totalPages,
      },
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create an order' })
  @ApiResponse({ status: HttpStatus.CREATED, type: OrderResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateOrderRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const data = plainToInstance(CreateOrderData, body, { excludeExtraneousValues: true });
    const order = await this.ordersService.create(identity.userId, data);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Get(':id')
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param() params: GetOrderParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.findOne(params.id, identity.userId);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetOrderParamsModel,
    @Body() body: UpdateOrderRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const data = plainToInstance(UpdateOrderData, body, { excludeExtraneousValues: true });
    const order = await this.ordersService.update(params.id, identity.userId, data);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param() params: GetOrderParamsModel,
    @Body() body: UpdateOrderStatusRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.updateStatus(params.id, identity.userId, body.status, body.note);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Post(':id/notes')
  @ApiOkResponse({ type: OrderActivityResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async addNote(
    @Param() params: GetOrderParamsModel,
    @Body() body: AddOrderNoteRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderActivityResponseModel> {
    const activity = await this.ordersService.addNote(params.id, identity.userId, body.note, body.internal);
    return plainToInstance(OrderActivityResponseModel, activity, { excludeExtraneousValues: true });
  }

  @Post(':id/advance')
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async addAdvance(
    @Param() params: GetOrderParamsModel,
    @Body() body: AddOrderAdvanceRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.addAdvance(params.id, identity.userId, {
      amount: body.amount,
      note: body.note,
      paymentMode: body.paymentMode,
      transactionReference: body.transactionReference,
    });
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Post(':id/notify')
  @ApiOkResponse({ type: NotifyOrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async notifyCustomer(
    @Param() params: GetOrderParamsModel,
    @Body() body: NotifyOrderRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<NotifyOrderResponseModel> {
    const result = await this.ordersService.notifyCustomer(params.id, identity.userId, body.note);
    return plainToInstance(NotifyOrderResponseModel, result, { excludeExtraneousValues: true });
  }

  @Post(':id/attachments')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @Param() params: GetOrderParamsModel,
    @UploadedFile() file: Express.Multer.File,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.addAttachment(params.id, identity.userId, file);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Delete(':id/attachments/:attachmentId')
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async removeAttachment(
    @Param() params: GetOrderParamsModel,
    @Param('attachmentId') attachmentId: string,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.removeAttachment(params.id, attachmentId, identity.userId);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel an order (soft delete)' })
  @ApiOkResponse({ type: OrderResponseModel })
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param() params: GetOrderParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderResponseModel> {
    const order = await this.ordersService.cancel(params.id, identity.userId);
    return plainToInstance(OrderResponseModel, order, { excludeExtraneousValues: true });
  }

  @Get(':id/activity')
  @ApiOkResponse({ type: [OrderActivityResponseModel] })
  @HttpCode(HttpStatus.OK)
  async getActivity(
    @Param() params: GetOrderParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<OrderActivityResponseModel[]> {
    const activities = await this.ordersService.getActivity(params.id, identity.userId);
    return plainToInstance(OrderActivityResponseModel, activities, { excludeExtraneousValues: true });
  }
}
