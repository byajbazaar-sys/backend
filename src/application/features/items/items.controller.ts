import { UseGuards, Controller, Post, Get, Patch, Delete, HttpStatus, HttpCode, Body, Param, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiResponse, ApiTags, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { USER_STRATEGY, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { CreateItemRequestModel, UpdateItemRequestModel, ItemResponseModel, GetItemParamsModel } from './models';
import { IItemService, ITEM_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { Item } from './domain';

@ApiTags('items')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('items')
export class ItemsController {
  constructor(
    @InjectPinoLogger(ItemsController.name) private readonly logger: PinoLogger,
    @Inject(ITEM_SERVICE) private readonly itemService: IItemService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ItemResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateItemRequestModel, @Identity() identity: IIdentity): Promise<ItemResponseModel> {
    this.logger.info({ body }, 'create item called');
    const item = await this.itemService.create(body, identity.userId);
    return plainToInstance(ItemResponseModel, item, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Get all items' })
  @ApiOkResponse({ description: 'Items fetched successfully', type: [ItemResponseModel] })
  @HttpCode(HttpStatus.OK)
  async getAll(): Promise<ItemResponseModel[]> {
    this.logger.info('getAll items called');
    const items = await this.itemService.getAll();
    return plainToInstance(ItemResponseModel, items, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', description: 'Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: ItemResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Item not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param() params: GetItemParamsModel): Promise<ItemResponseModel> {
    this.logger.info({ params }, 'getById item called');
    const item = await this.itemService.getById(params.id);
    return plainToInstance(ItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update item by ID' })
  @ApiParam({ name: 'id', description: 'Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: ItemResponseModel })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetItemParamsModel,
    @Body() body: UpdateItemRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<ItemResponseModel> {
    this.logger.info({ params, body, identity }, 'update item called');
    const itemData = plainToInstance(Item, body, {
      excludeExtraneousValues: true,
    });
    const item = await this.itemService.update(params.id, itemData, identity.userId);
    return plainToInstance(ItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete item by ID' })
  @ApiParam({ name: 'id', description: 'Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ description: 'Item deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Item not found' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param() params: GetItemParamsModel): Promise<void> {
    this.logger.info({ params }, 'delete item called');
    await this.itemService.delete(params.id);
  }
}
