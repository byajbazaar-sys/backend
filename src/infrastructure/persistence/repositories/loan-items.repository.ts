import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanItemDocument, LoanItemsSchema, Schemas } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ILoanItemsRepository, LoanItem, LoanStats, LoanStatsFilterOptions } from '../../../application';

@Injectable()
export class LoanItemsRepository implements ILoanItemsRepository {
  constructor(@InjectModel(LoanItemsSchema.name) private loanItemModel: Model<LoanItemDocument>) { }

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

  async findById(id: string, loanId: string): Promise<LoanItem> {
    try {
      const loanItem = await this.loanItemModel
        .findOne({ _id: new Types.ObjectId(id), loanId: new Types.ObjectId(loanId) })
        .lean()
        .exec();
      if (!loanItem) {
        return null;
      }
      return plainToInstance(LoanItem, loanItem, {
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

  async update(id: string, loanId: string, updateData: Partial<LoanItem>): Promise<LoanItem> {
    try {
      delete updateData._id;
      delete updateData.id;
      delete updateData.loanId;
      const updatedLoanItem = await this.loanItemModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), loanId: new Types.ObjectId(loanId) },
          updateData,
          { new: true },
        )
        .lean()
        .exec();
      if (!updatedLoanItem) {
        return null;
      }
      return plainToInstance(LoanItem, updatedLoanItem, {
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
