import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanItemDocument, LoanItemsSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ILoanItemsRepository, LoanItem } from '../../../application';

@Injectable()
export class LoanItemsRepository implements ILoanItemsRepository {
  constructor(@InjectModel(LoanItemsSchema.name) private loanItemModel: Model<LoanItemDocument>) {}

  async create(createLoanItem: LoanItem): Promise<LoanItem> {
    try {
      const createdLoanItem = await this.loanItemModel.create(createLoanItem);
      return plainToInstance(LoanItem, createdLoanItem.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async bulkInsert(createLoanItems: LoanItem[]): Promise<LoanItem[]> {
    try {
      if (!createLoanItems || createLoanItems.length === 0) {
        return [];
      }
      const createdLoanItems = await this.loanItemModel.insertMany(createLoanItems);
      return plainToInstance(LoanItem, createdLoanItems, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByLoanId(loanId: string): Promise<LoanItem[]> {
    try {
      const loanItems = await this.loanItemModel.find({ loanId: new Types.ObjectId(loanId) }).exec();
      return plainToInstance(LoanItem, loanItems, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async deleteByLoanId(loanId: string): Promise<void> {
    try {
      await this.loanItemModel.deleteMany({ loanId: new Types.ObjectId(loanId) }).exec();
    } catch (err) {
      throw err;
    }
  }
}
