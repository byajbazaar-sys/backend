import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoanItemEntity } from '../entities/loan-item.entity';
import { plainToInstance } from 'class-transformer';
import { ILoanItemsRepository, LoanItem } from '../../../application';

@Injectable()
export class LoanItemsRepository implements ILoanItemsRepository {
  constructor(@InjectRepository(LoanItemEntity) private loanItemRepo: Repository<LoanItemEntity>) {}

  async create(createLoanItem: LoanItem): Promise<LoanItem> {
    const entity = this.loanItemRepo.create(createLoanItem);
    const created = await this.loanItemRepo.save(entity);
    return plainToInstance(LoanItem, created, { excludeExtraneousValues: true });
  }

  async bulkInsert(createLoanItems: LoanItem[]): Promise<LoanItem[]> {
    if (!createLoanItems?.length) return [];
    const entities = this.loanItemRepo.create(createLoanItems);
    const created = await this.loanItemRepo.save(entities);
    return plainToInstance(LoanItem, created, { excludeExtraneousValues: true });
  }

  async findById(id: string, loanId: string): Promise<LoanItem> {
    const loanItem = await this.loanItemRepo.findOne({ where: { id, loanId } });
    if (!loanItem) return null;
    return plainToInstance(LoanItem, loanItem, { excludeExtraneousValues: true });
  }

  async findByLoanId(loanId: string): Promise<LoanItem[]> {
    const loanItems = await this.loanItemRepo.find({ where: { loanId }, order: { createdAt: 'ASC' } });
    return plainToInstance(LoanItem, loanItems, { excludeExtraneousValues: true });
  }

  async update(id: string, loanId: string, updateData: Partial<LoanItem>): Promise<LoanItem> {
    const { id: _omitId, loanId: _omitLoanId, ...rest } = updateData as LoanItem & { id?: string; loanId?: string };
    await this.loanItemRepo.update({ id, loanId }, rest as Partial<LoanItemEntity>);
    const updated = await this.loanItemRepo.findOne({ where: { id, loanId } });
    if (!updated) return null;
    return plainToInstance(LoanItem, updated, { excludeExtraneousValues: true });
  }

  async deleteByLoanId(loanId: string): Promise<void> {
    await this.loanItemRepo.delete({ loanId });
  }
}
