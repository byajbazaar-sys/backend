import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanDocument, LoansSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ILoansRepository, Loan, LoansFilterOptions } from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class LoansRepository implements ILoansRepository {
  constructor(@InjectModel(LoansSchema.name) private loanModel: Model<LoanDocument>) {}

  async create(createLoan: Loan): Promise<Loan> {
    try {
      const createdLoan = await this.loanModel.create(createLoan);
      return plainToInstance(Loan, createdLoan.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByCustomerId(customerId: string): Promise<Loan[]> {
    try {
      const loans = await this.loanModel.find({ customerId: new Types.ObjectId(customerId) }).exec();
      return plainToInstance(Loan, loans, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, updateDto: Partial<Loan>): Promise<Loan> {
    try {
      const updatedLoan = await this.loanModel.findByIdAndUpdate(id, updateDto, { new: true }).lean().exec();
      if (!updatedLoan) {
        return null;
      }
      return plainToInstance(Loan, updatedLoan, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string): Promise<Loan> {
    try {
      const loan = await this.loanModel.findById(new Types.ObjectId(id)).exec();
      if (!loan) {
        return null;
      }
      return plainToInstance(Loan, loan.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByIds(ids: string[]): Promise<Loan[]> {
    try {
      const objectIds = ids.map((id) => new Types.ObjectId(id));
      const loans = await this.loanModel.find({ _id: { $in: objectIds } }).exec();
      return plainToInstance(Loan, loans, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByCreatedBy(createdBy: string): Promise<Loan[]> {
    try {
      const loans = await this.loanModel.find({ createdBy: new Types.ObjectId(createdBy) }).exec();
      return plainToInstance(Loan, loans, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async listLoans(params: LoansFilterOptions): Promise<Paged<Loan>> {
    try {
      const { customerId, createdBy } = params;
      const { pageNumber, pageSize, skip } = getPaginationValues(params);
      const filter: Record<string, any> = {};

      // Add customerId filter if provided
      if (customerId) {
        filter.customerId = new Types.ObjectId(customerId);
      }
      // Add createdBy filter if provided
      if (createdBy) {
        filter.createdBy = new Types.ObjectId(createdBy);
      }

      const docs = await this.loanModel.aggregate([
        { $match: filter },
        {
          $facet: {
            data: [
              {
                $sort: {
                  [params.sortField]: params.sortOrder === ESortOrder.ASC ? 1 : -1,
                },
              },
              { $skip: skip },
              { $limit: +pageSize },
            ],
            totalCount: [{ $count: 'total' }],
          },
        },
        {
          $project: {
            data: 1,
            total: { $ifNull: [{ $arrayElemAt: ['$totalCount.total', 0] }, 0] },
          },
        },
      ]);
      return toPaged(Loan, {
        items: docs[0].data,
        page: pageNumber,
        perPage: pageSize,
        totalCount: docs[0].total,
      });
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.loanModel.findByIdAndDelete(new Types.ObjectId(id)).exec();
    } catch (err) {
      throw err;
    }
  }
}
