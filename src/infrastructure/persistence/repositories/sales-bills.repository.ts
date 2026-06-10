import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { getPaginationValues, Paged, toPaged } from '@shared-libs';
import { SalesBillEntity } from '../entities/sales-bill.entity';
import { SalesBillItemEntity } from '../entities/sales-bill-item.entity';
import { SalesBill } from '../../../application/features/sales-bills/domain';
import {
  ISalesBillsRepository,
  SalesBillFilter,
  SalesBillPagination,
} from '../../../application/shared/repository/i-sales-bills.repository';

@Injectable()
export class SalesBillsRepository implements ISalesBillsRepository {
  constructor(
    @InjectRepository(SalesBillEntity)
    private readonly billsRepo: Repository<SalesBillEntity>,
    @InjectRepository(SalesBillItemEntity)
    private readonly itemsRepo: Repository<SalesBillItemEntity>,
  ) {}

  private mapBill(entity: SalesBillEntity): SalesBill {
    return plainToInstance(SalesBill, entity, { excludeExtraneousValues: true });
  }

  private buildQuery(filter: SalesBillFilter) {
    const qb = this.billsRepo
      .createQueryBuilder('bill')
      .leftJoinAndSelect('bill.items', 'items')
      .where('bill.createdBy = :createdBy', { createdBy: filter.createdBy });

    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      qb.andWhere(
        '(bill.billNumber ILIKE :term OR bill.customerName ILIKE :term OR bill.customerMobile ILIKE :term)',
        { term },
      );
    }
    if (filter.dateFrom) {
      qb.andWhere('bill.issuedAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('bill.issuedAt <= :dateTo', { dateTo: filter.dateTo });
    }
    if (filter.paymentMode) {
      qb.andWhere('bill.paymentMode = :paymentMode', { paymentMode: filter.paymentMode });
    }
    if (filter.status) {
      qb.andWhere('bill.status = :status', { status: filter.status });
    }
    if (filter.customerId) {
      qb.andWhere('bill.customerId = :customerId', { customerId: filter.customerId });
    }

    const sortColumn = filter.sortField === 'grandTotal' ? 'bill.grandTotal' : 'bill.createdAt';
    const sortOrder = filter.sortOrder === 'asc' ? 'ASC' : 'DESC';
    qb.orderBy(sortColumn, sortOrder as 'ASC' | 'DESC');

    return qb;
  }

  async create(data: SalesBill): Promise<SalesBill> {
    const { items, ...billData } = data;
    const entity = this.billsRepo.create(billData as Partial<SalesBillEntity>);
    const saved = await this.billsRepo.save(entity);

    if (items?.length) {
      const lineEntities = items.map((item) =>
        this.itemsRepo.create({ ...item, billId: saved.id } as Partial<SalesBillItemEntity>),
      );
      await this.itemsRepo.save(lineEntities);
    }

    return this.findById(saved.id) as Promise<SalesBill>;
  }

  async findById(id: string): Promise<SalesBill | null> {
    const entity = await this.billsRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!entity) return null;
    return this.mapBill(entity);
  }

  async findAll(filter: SalesBillFilter, pagination: SalesBillPagination): Promise<Paged<SalesBill>> {
    const { pageNumber, pageSize, skip } = getPaginationValues(pagination);
    const qb = this.buildQuery(filter).skip(skip).take(pageSize);
    const [rows, totalCount] = await qb.getManyAndCount();
    return toPaged(SalesBill, {
      items: rows.map((e) => this.mapBill(e)),
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });
  }

  async findByCustomerId(
    createdBy: string,
    customerId: string,
    pagination: SalesBillPagination,
  ): Promise<Paged<SalesBill>> {
    return this.findAll({ createdBy, customerId }, pagination);
  }

  async getNextBillSequence(createdBy: string, year: number): Promise<number> {
    const prefix = `INV-${year}-`;
    const result = await this.billsRepo
      .createQueryBuilder('bill')
      .select('bill.billNumber', 'billNumber')
      .where('bill.createdBy = :createdBy', { createdBy })
      .andWhere('bill.billNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('bill.billNumber', 'DESC')
      .limit(1)
      .getRawOne();

    if (!result?.billNumber) return 1;
    const seq = parseInt(String(result.billNumber).replace(prefix, ''), 10);
    return isNaN(seq) ? 1 : seq + 1;
  }
}
