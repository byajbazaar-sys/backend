import { PartialType } from '@nestjs/swagger';
import { CreateInventoryCategoryRequestModel } from './create-inventory-category.model';

export class UpdateInventoryCategoryRequestModel extends PartialType(
  CreateInventoryCategoryRequestModel,
) {}
