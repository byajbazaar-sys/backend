import { PartialType } from '@nestjs/swagger';

import { CreateInventoryItemRequestModel } from './create-inventory-item.model';

/** Partial update — all fields optional (e.g. mark sold with only status/stockQuantity). */
export class UpdateInventoryItemRequestModel extends PartialType(CreateInventoryItemRequestModel) {}
