import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DuesSchema, DueDocument, Schemas } from '../schemas';
import { Due, DuesFilterOptions, IDuesRepository, EDueType } from '../../../application';
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class DuesRepository implements IDuesRepository {
  constructor(@InjectModel(DuesSchema.name) private dueModel: Model<DueDocument>) { }

  async listDues(params: DuesFilterOptions): Promise<Paged<Due>> {
    try {
      const { loanIds, createdBy, type, customerName } = params;
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
                        $expr: { $eq: ['$customerId', '$$customerId'] },
                      },
                    },
                    { $sort: { createdAt: -1 } },
                    { $limit: 1 },
                  ],
                  as: 'latestTransaction',
                },
              },
              {
                $unwind: {
                  path: '$latestTransaction',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $project: {
                  _id: 1,
                  firstName: 1,
                  lastName: 1,
                  latestTransaction: 1,
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
        ...(customerName
          ? [
            {
              $match: {
                $or: [
                  { 'customer.firstName': { $regex: customerName, $options: 'i' } },
                  { 'customer.lastName': { $regex: customerName, $options: 'i' } },
                ],
              },
            },
          ]
          : []),

        {
          $addFields: {
            latestTransaction: '$customer.latestTransaction',
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
          principalAmount: due.principalAmount,
          interestAmount: due.interestAmount,
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
          type: { $eq: EDueType.UPCOMING_DUE },
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

  async findById(id: string, createdBy: string): Promise<Due> {
    try {
      const due = await this.dueModel.findOne({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(createdBy) }).exec();
      return plainToInstance(Due, due, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByIdWithDetails(id: string, createdBy: string): Promise<Due> {
    try {
      const filter = {
        _id: new Types.ObjectId(id),
        createdBy: new Types.ObjectId(createdBy),
      };

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
                    { $match: { $expr: { $eq: ['$customerId', '$$customerId'] } } },
                    { $sort: { createdAt: -1 } },
                    { $limit: 1 },
                  ],
                  as: 'latestTransaction',
                },
              },
              {
                $unwind: { path: '$latestTransaction', preserveNullAndEmptyArrays: true },
              },
              {
                $project: {
                  _id: 1,
                  firstName: 1,
                  lastName: 1,
                  latestTransaction: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: '$customer', preserveNullAndEmptyArrays: true },
        },
        {
          $addFields: {
            latestTransaction: '$customer.latestTransaction',
          },
        },
        { $limit: 1 },
      ]);

      if (!docs || docs.length === 0) {
        return null;
      }

      return plainToInstance(Due, docs[0], {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, due: Due): Promise<Due> {
    try {
      delete due._id;
      const updatedDue = await this.dueModel.findByIdAndUpdate(new Types.ObjectId(id), due, { new: true }).exec();
      return plainToInstance(Due, updatedDue, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async deleteByLoanId(loanId: string, types?: EDueType[]): Promise<void> {
    try {
      const filter: Record<string, any> = {
        loanId: new Types.ObjectId(loanId),
      };

      // If types are specified, only delete dues with those types (e.g., only UPCOMING_DUE and PAST_DUE, not PAID)
      if (types && types.length > 0) {
        filter.type = { $in: types };
      }

      await this.dueModel.deleteMany(filter).exec();
    } catch (err) {
      throw err;
    }
  }

  async findByLoanIdAndType(loanId: string, types: EDueType[]): Promise<Due[]> {
    try {
      const dues = await this.dueModel
        .find({
          loanId: new Types.ObjectId(loanId),
          type: { $in: types },
        })
        .sort({ dueDate: 1 })
        .lean()
        .exec();

      return plainToInstance(Due, dues, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }
}
