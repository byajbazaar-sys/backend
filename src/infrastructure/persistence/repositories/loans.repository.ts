import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { LoanEntity } from '../entities/loan.entity';
import { plainToInstance } from 'class-transformer';
import {
  ELoanStatus,
  ILoansRepository,
  Loan,
  LoanExtended,
  LoansFilterOptions,
  LoanStats,
  LoanStatsFilterOptions,
} from '../../../application';
import { ESortOrder, getPaginationValues, toPaged } from '@shared-libs';

@Injectable()
export class LoansRepository implements ILoansRepository {
  constructor(@InjectRepository(LoanEntity) private loanRepo: Repository<LoanEntity>) { }

  async create(createLoan: Loan): Promise<Loan> {
    const { loanItems, ...loanData } = createLoan as Loan & { loanItems?: unknown[] };
    const entity = this.loanRepo.create({
      ...loanData,
      createdBy: createLoan.createdBy,
    });
    const created = await this.loanRepo.save(entity);
    return plainToInstance(Loan, created, { excludeExtraneousValues: true });
  }

  async findByCustomerId(customerId: string): Promise<Loan[]> {
    const loans = await this.loanRepo.find({ where: { customerId } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async update(id: string, updateDto: Loan): Promise<Loan> {
    const { loanItems, id: _omitId, ...data } = updateDto as Loan & { loanItems?: unknown[] };
    const createdBy = updateDto.createdBy;
    await this.loanRepo.update(
      { id, createdBy: createdBy },
      { ...data, createdBy: createdBy } as Partial<LoanEntity>,
    );
    const updated = await this.loanRepo.findOne({ where: { id, createdBy: createdBy } });
    if (!updated) return null;
    return plainToInstance(Loan, updated, { excludeExtraneousValues: true });
  }

  async findById(id: string, createdBy: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({ where: { id, createdBy: createdBy } });
    if (!loan) return null;
    return plainToInstance(Loan, loan, { excludeExtraneousValues: true });
  }

  async findByIds(ids: string[]): Promise<Loan[]> {
    if (!ids?.length) return [];
    const loans = await this.loanRepo.find({ where: { id: In(ids) } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async findByCreatedBy(createdBy: string): Promise<Loan[]> {
    const loans = await this.loanRepo.find({ where: { createdBy: createdBy } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async listLoans(params: LoansFilterOptions): Promise<LoanExtended> {
    const { customerId, createdBy, status } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .where('1=1')
      .andWhere(customerId ? 'loan.customer_id = :customerId' : '1=1', { customerId })
      .andWhere(createdBy ? 'loan.created_by = :createdBy' : '1=1', { createdBy })
      .andWhere(status ? 'loan.status = :status' : '1=1', { status });

    const [loans, totalCount] = await qb
      .orderBy(`loan.${sortField}`, sortOrder)
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    const totals = await this.loanRepo
      .createQueryBuilder('loan')
      .select([
        'SUM(loan.amount_remaining) as "totalAmountRemaining"',
        'SUM(loan.amount_paid) as "totalAmountPaid"',
        'SUM(loan.interest_remaining) as "totalInterestRemaining"',
        'SUM(loan.interest_paid) as "totalInterestPaid"',
      ])
      .where('1=1')
      .andWhere(customerId ? 'loan.customer_id = :customerId' : '1=1', { customerId })
      .andWhere(createdBy ? 'loan.created_by = :createdBy' : '1=1', { createdBy })
      .andWhere(status ? 'loan.status = :status' : '1=1', { status })
      .getRawOne();

    const data = toPaged(Loan, {
      items: loans,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });

    return plainToInstance(LoanExtended, {
      ...data,
      totalAmountRemaining: Number(totals?.totalAmountRemaining ?? totals?.totalamountremaining ?? 0),
      totalAmountPaid: Number(totals?.totalAmountPaid ?? totals?.totalamountpaid ?? 0),
      totalInterestRemaining: Number(totals?.totalInterestRemaining ?? totals?.totalinterestremaining ?? 0),
      totalInterestPaid: Number(totals?.totalInterestPaid ?? totals?.totalinterestpaid ?? 0),
    });
  }

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    const { startDate, endDate, itemId } = filterOptions;

    const qb = this.loanRepo
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.loanItems', 'li')
      .where('loan.created_by = :userId', { userId })
      .andWhere('loan.created_at >= :startDate', { startDate })
      .andWhere('loan.created_at <= :endDate', { endDate });

    const loans = await qb.getMany();

    let allocationRatio = 1;
    if (itemId && loans.length > 0) {
      const loanIds = loans.map((l) => l.id);
      const itemTotals = await this.loanRepo.manager
        .createQueryBuilder()
        .select('li.loan_id', 'loanId')
        .addSelect('SUM(li.amount)', 'totalValue')
        .addSelect(
          `SUM(CASE WHEN li.item_id = :itemId THEN li.amount ELSE 0 END)`,
          'matchedValue',
        )
        .from('loan_items', 'li')
        .where('li.loan_id IN (:...loanIds)', { loanIds, itemId })
        .groupBy('li.loan_id')
        .getRawMany();

      const totalValue = itemTotals.reduce((s, r) => s + Number(r.totalvalue || 0), 0);
      const matchedValue = itemTotals.reduce((s, r) => s + Number(r.matchedvalue || 0), 0);
      allocationRatio = totalValue > 0 ? matchedValue / totalValue : 0;
    }

    const stats = loans.reduce(
      (acc, loan) => {
        const ratio = itemId ? allocationRatio : 1;
        acc.amountRemaining += Number(loan.amountRemaining || 0) * ratio;
        acc.amountPaid += Number(loan.amountPaid || 0) * ratio;
        acc.interestRemaining += Number(loan.interestRemaining || 0) * ratio;
        acc.interestPaid += Number(loan.interestPaid || 0) * ratio;
        acc.total += 1;
        acc.open += loan.status === ELoanStatus.OPEN ? 1 : 0;
        acc.closed += loan.status === ELoanStatus.CLOSED ? 1 : 0;
        return acc;
      },
      {
        amountRemaining: 0,
        amountPaid: 0,
        interestRemaining: 0,
        interestPaid: 0,
        total: 0,
        open: 0,
        closed: 0,
      },
    );

    const customersCount = await this.loanRepo.manager
      .createQueryBuilder()
      .select('COUNT(DISTINCT c.id)', 'count')
      .from('customers', 'c')
      .where('c.created_by = :userId', { userId })
      .getRawOne();

    const itemStats = itemId
      ? await this.loanRepo.manager
        .createQueryBuilder()
        .select('COUNT(li.id)', 'totalItems')
        .addSelect('SUM(li.net_weight_in_grams)', 'totalNetWeight')
        .addSelect('SUM(li.gross_weight_in_grams)', 'totalGrossWeight')
        .from('loan_items', 'li')
        .innerJoin('loans', 'l', 'l.id = li.loan_id')
        .where('l.created_by = :userId', { userId })
        .andWhere('l.created_at >= :startDate', { startDate })
        .andWhere('l.created_at <= :endDate', { endDate })
        .andWhere('li.item_id = :itemId', { itemId })
        .getRawOne()
      : await this.loanRepo.manager
        .createQueryBuilder()
        .select('COUNT(li.id)', 'totalItems')
        .addSelect('SUM(li.net_weight_in_grams)', 'totalNetWeight')
        .addSelect('SUM(li.gross_weight_in_grams)', 'totalGrossWeight')
        .from('loan_items', 'li')
        .innerJoin('loans', 'l', 'l.id = li.loan_id')
        .where('l.created_by = :userId', { userId })
        .andWhere('l.created_at >= :startDate', { startDate })
        .andWhere('l.created_at <= :endDate', { endDate })
        .getRawOne();

    return plainToInstance(LoanStats, {
      ...stats,
      customersCount: Number(customersCount?.count ?? 0),
      totalItems: Number(itemStats?.totalitems ?? 0),
      totalNetWeight: Number(itemStats?.totalnetweight ?? 0),
      totalGrossWeight: Number(itemStats?.totalgrossweight ?? 0),
    });
  }

  async delete(id: string, createdBy: string): Promise<void> {
    await this.loanRepo.delete({ id, createdBy: createdBy });
  }

  async deleteByCustomerId(customerId: string, createdBy: string): Promise<void> {
    await this.loanRepo.delete({ customerId, createdBy: createdBy });
  }
}
