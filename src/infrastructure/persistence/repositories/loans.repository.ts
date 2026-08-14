import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ESortOrder, getPaginationValues, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';
import { EntityManager, In, Repository } from 'typeorm';

import {
  ELoanStatus,
  ELoanTenureType,
  ILoansRepository,
  Loan,
  LoanExtended,
  LoanBaselineData,
  LoansFilterOptions,
  LoansDownloadFilterOptions,
  LoanStats,
  LoanStatsFilterOptions,
} from '../../../application';
import { Due, EDueType } from '../../../application/shared';
import { DueEntity } from '../entities/due.entity';
import { LoanEntity } from '../entities/loan.entity';
import { TransactionalContext } from '../transactional-context';

@Injectable()
export class LoansRepository implements ILoansRepository {
  constructor(@InjectRepository(LoanEntity) private readonly defaultLoanRepo: Repository<LoanEntity>) {}

  private get loanRepo(): Repository<LoanEntity> {
    return TransactionalContext.repositoryFor(LoanEntity, this.defaultLoanRepo);
  }

  /**
   * Serialises every writer on this loan for the rest of the surrounding
   * transaction, so balance reads taken after it cannot go stale before commit.
   * Outside a transaction there is nothing to hold a lock for, so it degrades
   * to a plain read.
   */
  async lockLoan(id: string, createdBy: string): Promise<Loan> {
    // TypeORM drops undefined conditions instead of matching nothing, so an
    // absent id would lock and return an arbitrary loan of this user's.
    if (!id) return null;
    if (!TransactionalContext.getManager()) {
      return this.findById(id, createdBy);
    }
    const loan = await this.loanRepo.findOne({
      where: { id, createdBy },
      lock: { mode: 'pessimistic_write' },
    });
    if (!loan) return null;
    return plainToInstance(Loan, loan, { excludeExtraneousValues: true });
  }

  async create(createLoan: Loan): Promise<Loan> {
    const { loanItems, ...loanData } = createLoan as Loan & { loanItems?: unknown[] };
    const entity = this.loanRepo.create({
      ...loanData,
      createdBy: createLoan.createdBy,
    });
    const created = await this.loanRepo.save(entity);
    return plainToInstance(Loan, created, { excludeExtraneousValues: true });
  }

  /**
   * Single statement so the row lock Postgres takes on UPDATE serialises
   * concurrent allocations; two requests can never receive the same number.
   */
  async allocateTransactionSeq(loanId: string, createdBy: string): Promise<number> {
    if (!loanId) {
      throw new Error('Cannot allocate a transaction sequence without a loan id');
    }
    const result = await this.loanRepo.query(
      `UPDATE "loans"
          SET "txn_seq_counter" = "txn_seq_counter" + 1,
              "version" = "version" + 1
        WHERE "id" = $1 AND "created_by" = $2
        RETURNING "txn_seq_counter"`,
      [loanId, createdBy],
    );
    // An UPDATE ... RETURNING comes back as [rows, affectedCount], unlike a
    // SELECT which returns the rows directly.
    const rows: { txn_seq_counter: number }[] = Array.isArray(result?.[0]) ? result[0] : result;
    if (!rows?.length) {
      throw new Error(`Loan ${loanId} not found while allocating transaction sequence`);
    }
    const allocated = Number(rows[0]?.txn_seq_counter);
    if (!Number.isFinite(allocated)) {
      // Guards the shape above: a non-numeric sequence would otherwise reach the
      // insert as NaN and fail there, well away from the real cause.
      throw new Error(`Loan ${loanId} returned a non-numeric transaction sequence (${JSON.stringify(rows[0])})`);
    }
    return allocated;
  }

  async setBaseline(loanId: string, createdBy: string, baseline: LoanBaselineData): Promise<void> {
    await this.loanRepo.query(
      `UPDATE "loans"
          SET "baseline_amount_remaining" = $3,
              "baseline_amount_paid" = $4,
              "baseline_interest_remaining" = $5,
              "baseline_interest_paid" = $6,
              "baseline_seq" = $7,
              "version" = "version" + 1
        WHERE "id" = $1 AND "created_by" = $2`,
      [
        loanId,
        createdBy,
        baseline.amountRemaining,
        baseline.amountPaid,
        baseline.interestRemaining,
        baseline.interestPaid,
        baseline.seq,
      ],
    );
  }

  async getMaxTransactionSeq(loanId: string): Promise<number> {
    const rows: { max_seq: number }[] = await this.loanRepo.query(
      `SELECT MAX("loan_seq") AS max_seq FROM "transactions" WHERE "loan_id" = $1`,
      [loanId],
    );
    return Number(rows?.[0]?.max_seq ?? 0);
  }

  async findByCustomerId(customerId: string): Promise<Loan[]> {
    const loans = await this.loanRepo.find({ where: { customerId } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async update(id: string, updateDto: Loan): Promise<Loan | null> {
    if (!id) return null;
    // version is server-owned: callers may carry a stale one they read earlier.
    const { loanItems, interestPrincipalBasis: _basis, version: _version, ...data } = updateDto;
    const createdBy = updateDto.createdBy;
    const existing = await this.loanRepo.findOne({ where: { id, createdBy } });
    if (!existing) return null;

    // save() so loan start date (createdAt) can be updated — update() skips @CreateDateColumn
    Object.assign(existing, data);
    delete (existing as { loanItems?: unknown }).loanItems;
    existing.version = Number(existing.version ?? 0) + 1;
    const saved = await this.loanRepo.save(existing);
    return plainToInstance(Loan, saved, { excludeExtraneousValues: true });
  }

  async updateAndReplaceUnpaidDues(
    id: string,
    updateDto: Loan,
    unpaidDues: Due[],
    unpaidTypes: EDueType[] = [EDueType.UPCOMING_DUE, EDueType.PAST_DUE, EDueType.OVERDUE],
  ): Promise<Loan | null> {
    if (!id) return null;
    const { loanItems, interestPrincipalBasis: _basis, version: _version, ...data } = updateDto;
    const createdBy = updateDto.createdBy;

    const run = async (manager: EntityManager): Promise<Loan> => {
      const loanRepo = manager.getRepository(LoanEntity);
      const dueRepo = manager.getRepository(DueEntity);

      const existing = await loanRepo.findOne({ where: { id, createdBy } });
      if (!existing) return null;

      Object.assign(existing, data);
      delete (existing as { loanItems?: unknown }).loanItems;
      existing.version = Number(existing.version ?? 0) + 1;
      await loanRepo.save(existing);

      const deleteQb = dueRepo.createQueryBuilder().delete().from(DueEntity).where('loanId = :loanId', { loanId: id });
      if (unpaidTypes.length) {
        deleteQb.andWhere('type IN (:...types)', { types: unpaidTypes });
      }
      await deleteQb.execute();

      if (unpaidDues.length > 0) {
        const entities = dueRepo.create(
          unpaidDues.map((d) => ({
            loanId: d.loanId,
            customerId: d.customerId,
            dueAmount: Number(d.dueAmount),
            principalAmount: Number(d.principalAmount),
            interestAmount: Number(d.interestAmount),
            type: d.type,
            dueDate: d.dueDate,
            createdBy: d.createdBy,
            customer: d.customerId ? { id: d.customerId } : undefined,
            loan: d.loanId ? { id: d.loanId } : undefined,
          })),
        );
        await dueRepo.save(entities);
      }

      const updated = await loanRepo.findOne({ where: { id, createdBy } });
      if (!updated) return null;
      return plainToInstance(Loan, updated, { excludeExtraneousValues: true });
    };

    // Opening a second transaction while an outer one holds this loan's row
    // lock would deadlock, so join the caller's transaction when there is one.
    const active = TransactionalContext.getManager();
    return active ? run(active) : this.defaultLoanRepo.manager.transaction(run);
  }

  async findById(id: string, createdBy: string): Promise<Loan | null> {
    if (!id) return null;
    const loan = await this.loanRepo.findOne({
      where: { id, createdBy },
      relations: ['loanItems'],
    });
    if (!loan) return null;
    return plainToInstance(Loan, loan, { excludeExtraneousValues: true });
  }

  async findByIds(ids: string[]): Promise<Loan[]> {
    if (!ids?.length) return [];
    const loans = await this.loanRepo.find({ where: { id: In(ids) } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async findByCreatedBy(createdBy: string): Promise<Loan[]> {
    const loans = await this.loanRepo.find({ where: { createdBy } });
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async listLoans(params: LoansFilterOptions): Promise<LoanExtended> {
    const { customerId, createdBy, status } = params;
    const { pageNumber, pageSize, skip } = getPaginationValues(params);

    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.loanRepo.createQueryBuilder('loan');

    if (customerId) {
      qb.andWhere('loan.customer_id = :customerId', { customerId });
    }

    if (createdBy) {
      qb.andWhere('loan.created_by = :createdBy', { createdBy });
    }

    if (status) {
      qb.andWhere('loan.status = :status', { status });
    }

    const [loans, totalCount] = await qb
      .orderBy(`loan.${sortField}`, sortOrder)
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    const totals = await qb
      .clone()
      .orderBy() // removes order by
      .select([
        'ROUND(SUM(loan.amount_remaining),2) as "totalAmountRemaining"',
        'ROUND(SUM(loan.amount_paid),2) as "totalAmountPaid"',
        'ROUND(SUM(loan.interest_remaining),2) as "totalInterestRemaining"',
        'ROUND(SUM(loan.interest_paid),2) as "totalInterestPaid"',
      ])
      .getRawOne();

    const data = toPaged(Loan, {
      items: loans,
      page: pageNumber,
      perPage: pageSize,
      totalCount,
    });

    return plainToInstance(LoanExtended, {
      ...data,
      totalAmountRemaining: Number(totals?.totalAmountRemaining ?? 0),
      totalAmountPaid: Number(totals?.totalAmountPaid ?? 0),
      totalInterestRemaining: Number(totals?.totalInterestRemaining ?? 0),
      totalInterestPaid: Number(totals?.totalInterestPaid ?? 0),
    });
  }

  async listAllLoans(params: LoansDownloadFilterOptions): Promise<Loan[]> {
    const { customerId, createdBy, status, startDate, endDate } = params;
    const sortOrder = params.sortOrder === ESortOrder.ASC ? 'ASC' : 'DESC';
    const sortField = params.sortField || 'createdAt';

    const qb = this.loanRepo.createQueryBuilder('loan');

    if (customerId) qb.andWhere('loan.customer_id = :customerId', { customerId });
    if (createdBy) qb.andWhere('loan.created_by = :createdBy', { createdBy });
    if (status) qb.andWhere('loan.status = :status', { status });
    if (startDate) qb.andWhere('loan.created_at >= :startDate', { startDate });
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      qb.andWhere('loan.created_at <= :endDate', { endDate: endOfDay });
    }

    const loans = await qb.orderBy(`loan.${sortField}`, sortOrder).getMany();
    return plainToInstance(Loan, loans, { excludeExtraneousValues: true });
  }

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    const { startDate, endDate, itemId } = filterOptions;
    const queryParams = [userId, startDate, endDate, itemId ?? null];

    const statsQuery = this.loanRepo.manager.query(
      `
      WITH loan_item_ratio AS (
          SELECT
              li.loan_id,
              SUM(li.amount) AS total_value,
              SUM(
                  CASE 
                      WHEN $4::uuid IS NOT NULL AND li.item_id = $4 THEN li.amount
                      WHEN $4::uuid IS NULL THEN li.amount
                      ELSE 0
                  END
              ) AS matched_value
          FROM loan_items li
          GROUP BY li.loan_id
      ),
      loan_ratio AS (
          SELECT
              loan_id,
              CASE 
                  WHEN total_value > 0 THEN matched_value / total_value
                  ELSE 0
              END AS ratio
          FROM loan_item_ratio
      )
      SELECT
          COUNT(l.id) AS "total",
          COUNT(*) FILTER (WHERE l.status = 'Open') AS "open",
          COUNT(*) FILTER (WHERE l.status = 'Closed') AS "closed",

          ROUND(SUM(l.amount_remaining * COALESCE(r.ratio,0)), 2) AS "amountRemaining",
          ROUND(SUM(l.amount_paid * COALESCE(r.ratio,0)), 2) AS "amountPaid",
          ROUND(SUM(l.interest_remaining * COALESCE(r.ratio,0)), 2) AS "interestRemaining",
          ROUND(SUM(l.interest_paid * COALESCE(r.ratio,0)), 2) AS "interestPaid"

      FROM loans l
      LEFT JOIN loan_ratio r ON r.loan_id = l.id
      
      WHERE l.created_by = $1
      AND l.created_at >= $2
      AND l.created_at <= $3
  `,
      queryParams,
    );

    const customersQuery = this.loanRepo.manager.query(
      `
      SELECT COUNT(DISTINCT id) as count
      FROM customers
      WHERE created_by = $1
      `,
      [userId],
    );

    const itemStatsQuery = this.loanRepo.manager.query(
      `
      SELECT
          COUNT(li.id) AS totalItems,
          SUM(li.net_weight_in_grams) AS totalNetWeight,
          SUM(li.gross_weight_in_grams) AS totalGrossWeight
      FROM loan_items li
      JOIN loans l ON l.id = li.loan_id
      WHERE l.created_by = $1
      AND l.created_at >= $2
      AND l.created_at <= $3
      AND ($4::uuid IS NULL OR li.item_id = $4)
    `,
      queryParams,
    );

    const [stats, customers, itemStats] = await Promise.all([statsQuery, customersQuery, itemStatsQuery]);
    return plainToInstance(LoanStats, {
      total: Number(stats?.[0]?.total ?? 0),
      open: Number(stats?.[0]?.open ?? 0),
      closed: Number(stats?.[0]?.closed ?? 0),
      amountRemaining: Number(stats?.[0]?.amountRemaining ?? 0),
      amountPaid: Number(stats?.[0]?.amountPaid ?? 0),
      interestRemaining: Number(stats?.[0]?.interestRemaining ?? 0),
      interestPaid: Number(stats?.[0]?.interestPaid ?? 0),
      customersCount: Number(customers?.[0]?.count ?? 0),
      totalItems: Number(itemStats?.[0]?.totalitems ?? 0),
      totalNetWeight: Number(itemStats?.[0]?.totalnetweight ?? 0),
      totalGrossWeight: Number(itemStats?.[0]?.totalgrossweight ?? 0),
    });
  }

  async delete(id: string, createdBy: string): Promise<void> {
    await this.loanRepo.delete({ id, createdBy });
  }

  async deleteByCustomerId(customerId: string, createdBy: string): Promise<void> {
    await this.loanRepo.delete({ customerId, createdBy });
  }

  async findOpenLoanIdsPastMaturity(): Promise<{ id: string; createdBy: string }[]> {
    const rows = await this.loanRepo
      .createQueryBuilder('loan')
      .select(['loan.id', 'loan.createdBy'])
      .where('loan.status = :open', { open: ELoanStatus.OPEN })
      .andWhere(
        `(
          (loan.tenure_type = :days AND loan.created_at + (loan.tenure_value * interval '1 day') <= NOW()) OR
          (loan.tenure_type = :months AND loan.created_at + (loan.tenure_value * interval '1 month') <= NOW()) OR
          (loan.tenure_type = :years AND loan.created_at + (loan.tenure_value * interval '1 year') <= NOW())
        )`,
        {
          days: ELoanTenureType.DAYS,
          months: ELoanTenureType.MONTHS,
          years: ELoanTenureType.YEARS,
        },
      )
      .getMany();

    return rows.map((r) => ({ id: r.id, createdBy: r.createdBy }));
  }
}
