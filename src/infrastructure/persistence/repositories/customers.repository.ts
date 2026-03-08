import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { CustomerEntity } from '../entities/customer.entity';
import { plainToInstance } from 'class-transformer';
import {
  ICustomersRepository,
  Customer,
  CustomersFilterOptions,
  CustomersDownloadFilterOptions,
} from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class CustomersRepository implements ICustomersRepository {
  constructor(@InjectRepository(CustomerEntity) private customerRepo: Repository<CustomerEntity>) { }

  async create(createCustomer: Customer): Promise<Customer> {
    const entity = this.customerRepo.create({
      ...createCustomer,
      createdBy: createCustomer.createdBy,
    });
    const created = await this.customerRepo.save(entity);
    return plainToInstance(Customer, created, { excludeExtraneousValues: true });
  }

  async findByEmail(email: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { email } });
    if (!customer) return null;
    return plainToInstance(Customer, customer, { excludeExtraneousValues: true });
  }

  async update(id: string, updateDto: Customer, createdBy: string): Promise<Customer> {
    const {
      id: _omitId,
      createdBy: _omitCreatedBy,
      profilePhoto: _omitProfilePhoto,
      aadharCard: _omitAadharCard,
      panCard: _omitPanCard,
      ...rest
    } = updateDto as Customer & { id?: string; createdBy?: string };
    await this.customerRepo.update({ id, createdBy: createdBy }, rest as Partial<CustomerEntity>);
    const updated = await this.customerRepo.findOne({ where: { id, createdBy: createdBy } });
    if (!updated) return null;
    return plainToInstance(Customer, updated, { excludeExtraneousValues: true });
  }

  async findById(id: string, createdBy: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id, createdBy: createdBy } });
    if (!customer) return null;
    return plainToInstance(Customer, customer, { excludeExtraneousValues: true });
  }

  async listCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>> {
    const { name, createdBy } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where(createdBy ? 'c.created_by = :createdBy' : '1=1', { createdBy })
      .orderBy(`c.${sortField}`, sortOrder)
      .skip(skip)
      .take(pageSize);

    if (name?.trim()) {
      const searchTerm = name.trim();
      qb.andWhere(
        '(c.first_name ILIKE :search OR c.last_name ILIKE :search OR c.email ILIKE :search)',
        { search: `%${searchTerm}%` },
      );
    }

    const [items, totalCount] = await qb.getManyAndCount();
    return toPaged(Customer, {
      items,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async listAllCustomers(params: CustomersDownloadFilterOptions): Promise<Customer[]> {
    const { name, createdBy, startDate, endDate } = params;
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where(createdBy ? 'c.created_by = :createdBy' : '1=1', { createdBy })
      .orderBy(`c.${sortField}`, sortOrder);

    if (name?.trim()) {
      const searchTerm = name.trim();
      qb.andWhere(
        '(c.first_name ILIKE :search OR c.last_name ILIKE :search OR c.email ILIKE :search)',
        { search: `%${searchTerm}%` },
      );
    }
    if (startDate) qb.andWhere('c.created_at >= :startDate', { startDate });
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      qb.andWhere('c.created_at <= :endDate', { endDate: endOfDay });
    }

    const items = await qb.getMany();
    return plainToInstance(Customer, items, { excludeExtraneousValues: true });
  }

  async delete(id: string, createdBy: string): Promise<void> {
    await this.customerRepo.delete({ id, createdBy: createdBy });
  }
}
