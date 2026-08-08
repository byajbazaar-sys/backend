import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { IPlansRepository, Plan, UpdatePlanPatch } from '../../../application';
import { PlanEntity } from '../entities/plan.entity';

@Injectable()
export class PlansRepository implements IPlansRepository {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
  ) {}

  private mapEntity(entity: PlanEntity): Plan {
    return plainToInstance(
      Plan,
      {
        ...entity,
        price: Number(entity.price),
      },
      { excludeExtraneousValues: true },
    );
  }

  async findAll(): Promise<Plan[]> {
    const entities = await this.planRepo.find({ order: { createdAt: 'DESC' } });
    return entities.map((entity) => this.mapEntity(entity));
  }

  async findById(id: string): Promise<Plan> {
    const entity = await this.planRepo.findOne({ where: { id } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByProviderPlanId(providerPlanId: string): Promise<Plan> {
    const entity = await this.planRepo.findOne({ where: { providerPlanId } });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findByNameAndPrice(name: string, price: number): Promise<Plan> {
    const entity = await this.planRepo.findOne({
      where: { name: name.trim(), price },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async findActiveDefault(): Promise<Plan> {
    const entity = await this.planRepo.findOne({
      where: { active: true, interval: 'monthly', intervalCount: 1 },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.mapEntity(entity);
  }

  async insert(data: Plan): Promise<Plan> {
    const entity = this.planRepo.create({
      name: data.name,
      price: data.price,
      currency: data.currency,
      interval: data.interval,
      intervalCount: data.intervalCount,
      providerPlanId: data.providerPlanId,
      active: data.active ?? true,
    });
    const created = await this.planRepo.save(entity);
    return this.mapEntity(created);
  }

  async update(id: string, data: UpdatePlanPatch): Promise<Plan> {
    const updateData: QueryDeepPartialEntity<PlanEntity> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.interval !== undefined) updateData.interval = data.interval;
    if (data.intervalCount !== undefined) updateData.intervalCount = data.intervalCount;
    if (data.providerPlanId !== undefined) updateData.providerPlanId = data.providerPlanId;
    if (data.active !== undefined) updateData.active = data.active;

    await this.planRepo.update(id, updateData);
    const updated = await this.planRepo.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Plan ${id} not found after update`);
    }
    return this.mapEntity(updated);
  }
}
