import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DuesSchema, DueDocument, Schemas } from '../schemas';
import { Due, DuesFilterOptions, IDuesRepository, EDueType } from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class DuesRepository implements IDuesRepository {
  constructor(@InjectModel(DuesSchema.name) private dueModel: Model<DueDocument>) {}

  async listDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    try {
      const { loanIds, createdBy, type } = params;
      const { pageNumber, pageSize, skip } = getPaginationValues(params);
      const filter: Record<string, any> = {};

      if (loanIds) {
        filter.loanId = { $in: loanIds.map((id) => new Types.ObjectId(id)) };
      }

      if (createdBy) {
        filter.createdBy = new Types.ObjectId(createdBy);
      }

      if (type && type.length) {
        filter.type = { $in: type };
      }

      const docs = await this.dueModel.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: Schemas.CustomersSchema,
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer',
            pipeline: [
              {
                $lookup: {
                  from: Schemas.TransactionsSchema,
                  let: { customerId: '$_id' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $eq: ['$customerId', '$$customerId'],
                        },
                      },
                    },
                    {
                      $sort: { createdAt: -1 },
                    },
                    {
                      $limit: 1,
                    },
                  ],
                  as: 'transactions',
                },
              },
              {
                $unwind: {
                  path: '$transactions',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $project: {
                  _id: 1,
                  firstName: 1,
                  lastName: 1,
                  transactions: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$customer',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            transaction: '$customer.transactions',
          },
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
      return toPaged(Due, {
        items: docs[0].data,
        page: pageNumber,
        perPage: pageSize,
        totalCount: docs[0].total,
      });
    } catch (err) {
      throw err;
    }
  }

  async create(due: Due): Promise<Due> {
    try {
      const dueDoc = await this.dueModel.create({
        loanId: new Types.ObjectId(due.loanId),
        customerId: new Types.ObjectId(due.customerId),
        dueAmount: due.dueAmount,
        type: due.type,
        dueDate: due.dueDate,
        createdBy: new Types.ObjectId(due.createdBy),
      });
      return plainToInstance(Due, dueDoc, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async bulkCreate(dues: Due[]): Promise<Due[]> {
    try {
      const dueDocs = await this.dueModel.insertMany(
        dues.map((due) => ({
          loanId: new Types.ObjectId(due.loanId),
          customerId: new Types.ObjectId(due.customerId),
          dueAmount: due.dueAmount,
          type: due.type,
          dueDate: due.dueDate,
          createdBy: new Types.ObjectId(due.createdBy),
        })),
      );
      return plainToInstance(Due, dueDocs, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async updatePastDues(): Promise<number> {
    try {
      const currentDate = new Date();
      // Update all dues where dueDate is less than current date and type is not already PAST_DUE
      const result = await this.dueModel.updateMany(
        {
          dueDate: { $lt: currentDate },
          type: { $ne: EDueType.PAST_DUE },
        },
        {
          $set: { type: EDueType.PAST_DUE },
        },
      );

      return result.modifiedCount;
    } catch (err) {
      throw err;
    }
  }
}
