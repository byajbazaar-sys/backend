import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, USER_STRATEGY } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import {
  CreateInventoryItemRequestModel,
  InventoryItemResponseModel,
  ListInventoryItemsQueryModel,
} from './models';
import { INVENTORY_ITEM_SERVICE, IInventoryItemService } from './service';

@ApiTags('inventory-items')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
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
  async getAll(@Query() query: ListInventoryItemsQueryModel, @Identity() identity: IIdentity) {
    const paged = await this.itemService.getAll(identity.userId, query);
    return {
      ...paged,
      items: plainToInstance(InventoryItemResponseModel, paged.items, { excludeExtraneousValues: true }),
    };
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

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  @ApiParam({ name: 'id' })
  async getById(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryItemResponseModel> {
    const item = await this.itemService.getById(id, identity.userId);
    return plainToInstance(InventoryItemResponseModel, item, { excludeExtraneousValues: true });
  }

  @Patch(':id/image')
  @ApiOperation({ summary: 'Upload or remove inventory item image' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() image: Express.Multer.File,
    @Body('removeImage') removeImage: string | undefined,
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
    @Body() body: CreateInventoryItemRequestModel,
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
