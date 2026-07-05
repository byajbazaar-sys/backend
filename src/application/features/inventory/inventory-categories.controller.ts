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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Identity, IIdentity, RolesGuard, UserAuthGuard } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import {
  CreateInventoryCategoryRequestModel,
  InventoryCategoryResponseModel,
} from './models';
import { INVENTORY_CATEGORY_SERVICE, IInventoryCategoryService } from './service';

@ApiTags('inventory-categories')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('inventory/categories')
export class InventoryCategoriesController {
  constructor(
    @InjectPinoLogger(InventoryCategoriesController.name) private readonly logger: PinoLogger,
    @Inject(INVENTORY_CATEGORY_SERVICE) private readonly categoryService: IInventoryCategoryService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create inventory category' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateInventoryCategoryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryCategoryResponseModel> {
    const category = await this.categoryService.create(body, identity.userId);
    return plainToInstance(InventoryCategoryResponseModel, category, { excludeExtraneousValues: true });
  }

  @Get()
  @ApiOperation({ summary: 'List inventory categories' })
  @ApiOkResponse({ type: [InventoryCategoryResponseModel] })
  async getAll(@Identity() identity: IIdentity): Promise<InventoryCategoryResponseModel[]> {
    const categories = await this.categoryService.getAll(identity.userId);
    return plainToInstance(InventoryCategoryResponseModel, categories, { excludeExtraneousValues: true });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory category by ID' })
  @ApiParam({ name: 'id' })
  async getById(
    @Param('id') id: string,
    @Identity() identity: IIdentity,
  ): Promise<InventoryCategoryResponseModel> {
    const category = await this.categoryService.getById(id, identity.userId);
    return plainToInstance(InventoryCategoryResponseModel, category, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inventory category' })
  async update(
    @Param('id') id: string,
    @Body() body: CreateInventoryCategoryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<InventoryCategoryResponseModel> {
    const category = await this.categoryService.update(id, body, identity.userId);
    return plainToInstance(InventoryCategoryResponseModel, category, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete inventory category' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Identity() identity: IIdentity): Promise<void> {
    await this.categoryService.delete(id, identity.userId);
  }
}
