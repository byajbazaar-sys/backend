import { Plan } from '../domain';
import { CreatePlanRequestModel, UpdatePlanRequestModel } from '../models';

export const PLAN_SERVICE = 'PLAN_SERVICE';

export interface IPlanService {
  list(): Promise<Plan[]>;
  create(body: CreatePlanRequestModel): Promise<Plan>;
  update(id: string, body: UpdatePlanRequestModel): Promise<Plan>;
}
