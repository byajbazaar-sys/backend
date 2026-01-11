import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Schemas, TransactionDocument, TransactionsSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ETransactionType, ITransactionsRepository, Transaction, TransactionsFilterOptions } from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class TransactionsRepository implements ITransactionsRepository {
  constructor(@InjectModel(TransactionsSchema.name) private transactionModel: Model<TransactionDocument>) {}

  async create(createTransaction: Partial<Transaction>): Promise<Transaction> {
    try {
      const createdTransaction = await this.transactionModel.create(createTransaction);
      return plainToInstance(Transaction, createdTransaction.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string): Promise<Transaction> {
    try {
      const transaction = await this.transactionModel.findById(new Types.ObjectId(id)).exec();
      if (!transaction) {
        return null;
      }
      return plainToInstance(Transaction, transaction.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, updateDto: Partial<Transaction>): Promise<Transaction> {
    try {
      const updatedTransaction = await this.transactionModel
        .findByIdAndUpdate(id, updateDto, { new: true })
        .lean()
        .exec();
      if (!updatedTransaction) {
        return null;
      }
      return plainToInstance(Transaction, updatedTransaction, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async listTransactions(params: TransactionsFilterOptions): Promise<Paged<Transaction>> {
    try {
      const { loanId, createdBy } = params;
      const { pageNumber, pageSize, skip } = getPaginationValues(params);
      const filter: Record<string, any> = {};

      // Add loanId filter if provided
      if (loanId) {
        filter.loanId = new Types.ObjectId(loanId);
      }
      // Add createdBy filter if provided
      if (createdBy) {
        filter.createdBy = new Types.ObjectId(createdBy);
      }

      const docs = await this.transactionModel.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: Schemas.CustomersSchema,
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  firstName: 1,
                  lastName: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: '$customer',
        },
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
      return toPaged(Transaction, {
        items: docs[0].data,
        page: pageNumber,
        perPage: pageSize,
        totalCount: docs[0].total,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByLoanIdAndTransactionType(loanId: string, transactionType: ETransactionType): Promise<Transaction[]> {
    try {
      const transactions = await this.transactionModel.aggregate([
        {
          $match: {
            loanId: new Types.ObjectId(loanId),
            transactionType: transactionType,
          },
        },
        {
          $lookup: {
            from: Schemas.CustomersSchema,
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
            pipeline: [
              {
                $project: {
                  _id: 1,
                  firstName: 1,
                  lastName: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: '$customer',
        },
      ]);
      return plainToInstance(Transaction, transactions, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.transactionModel.findByIdAndDelete(new Types.ObjectId(id)).exec();
    } catch (err) {
      throw err;
    }
  }
}
