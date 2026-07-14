import { Plan } from '../domain';

export const PLANS_REPOSITORY = 'PLANS_REPOSITORY';

export interface IPlansRepository {
  findAll(): Promise<Plan[]>;
  findById(id: string): Promise<Plan | null>;
  findByProviderPlanId(providerPlanId: string): Promise<Plan | null>;
  findByNameAndPrice(name: string, price: number): Promise<Plan | null>;
  findActiveDefault(): Promise<Plan | null>;
  insert(data: Plan): Promise<Plan>;
  update(id: string, data: Partial<Plan>): Promise<Plan>;
}
