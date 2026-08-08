import { Plan } from '../domain';
import { UpdatePlanPatch } from '../models';

export const PLANS_REPOSITORY = 'PLANS_REPOSITORY';

export interface IPlansRepository {
  findAll(): Promise<Plan[]>;
  findById(id: string): Promise<Plan>;
  findByProviderPlanId(providerPlanId: string): Promise<Plan>;
  findByNameAndPrice(name: string, price: number): Promise<Plan>;
  findActiveDefault(): Promise<Plan>;
  insert(data: Plan): Promise<Plan>;
  update(id: string, data: UpdatePlanPatch): Promise<Plan>;
}
