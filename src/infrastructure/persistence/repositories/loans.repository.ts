import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanDocument, LoansSchema, Schemas } from '../schemas';
import { plainToInstance } from 'class-transformer';
import {
  ELoanStatus,
  ILoansRepository,
  Loan,
  LoansFilterOptions,
  LoanStats,
  LoanStatsFilterOptions,
} from '../../../application';
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

  async getStats(userId: string, filterOptions: LoanStatsFilterOptions): Promise<LoanStats> {
    try {
      let { startDate, endDate, itemId } = filterOptions;
      const itemIdObjectId = itemId ? new Types.ObjectId(itemId) : null;
      const stats = await this.loanModel.aggregate([
        {
          $match: {
            createdBy: new Types.ObjectId(userId),
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },

        // ✅ FIXED customers lookup
        {
          $lookup: {
            from: 'customers',
            let: { userId: '$createdBy' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$createdBy', '$$userId'] },
                },
              },
              { $count: 'count' },
            ],
            as: 'customersCount',
          },
        },
        {
          $addFields: {
            customersCount: {
              $ifNull: [{ $arrayElemAt: ['$customersCount.count', 0] }, 0],
            },
          },
        },

        // ✅ Loan items lookup with prorating logic
        {
          $lookup: {
            from: Schemas.LoanItemsSchema,
            let: { loanId: '$_id', filterItemId: itemIdObjectId },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$loanId', '$$loanId'] },
                },
              },

              // ✅ Calculate total value & matched value (WEIGHTED)
              {
                $group: {
                  _id: null,

                  // ✅ total monetary value of ALL items in this loan
                  totalItemValue: {
                    $sum: { $ifNull: ['$amount', 0] },
                  },

                  // ✅ total monetary value of FILTERED itemType
                  matchedItemValue: {
                    $sum: {
                      $cond: [{ $eq: ['$itemId', '$$filterItemId'] }, '$amount', 0],
                    },
                  },

                  // optional UI metrics
                  matchedItems: {
                    $sum: {
                      $cond: [{ $eq: ['$itemId', '$$filterItemId'] }, 1, 0],
                    },
                  },

                  totalNetWeight: {
                    $sum: {
                      $cond: [{ $eq: ['$itemId', '$$filterItemId'] }, '$netWeightInGrams', 0],
                    },
                  },

                  totalGrossWeight: {
                    $sum: {
                      $cond: [{ $eq: ['$itemId', '$$filterItemId'] }, '$grossWeightInGrams', 0],
                    },
                  },
                },
              },

              // ✅ Allocation ratio based on VALUE (not count)
              {
                $addFields: {
                  allocationRatio: {
                    $cond: [
                      { $eq: ['$$filterItemId', null] }, // 👈 no filter applied
                      1,
                      {
                        $cond: [
                          { $gt: ['$totalItemValue', 0] },
                          { $divide: ['$matchedItemValue', '$totalItemValue'] },
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            ],
            as: 'loanItemStats',
          },
        },

        // ✅ Only ONE unwind
        {
          $unwind: {
            path: '$loanItemStats',
            preserveNullAndEmptyArrays: true,
          },
        },

        // ✅ Final aggregation
        {
          $group: {
            _id: null,

            amountRemaining: {
              $sum: {
                $round: [
                  {
                    $multiply: ['$amountRemaining', { $ifNull: ['$loanItemStats.allocationRatio', 0] }],
                  },
                  2,
                ],
              },
            },
            amountPaid: {
              $sum: {
                $round: [
                  {
                    $multiply: ['$amountPaid', { $ifNull: ['$loanItemStats.allocationRatio', 0] }],
                  },
                  2,
                ],
              },
            },
            interestRemaining: {
              $sum: {
                $round: [
                  {
                    $multiply: ['$interestRemaining', { $ifNull: ['$loanItemStats.allocationRatio', 0] }],
                  },
                  2,
                ],
              },
            },
            interestPaid: {
              $sum: {
                $round: [
                  {
                    $multiply: ['$interestPaid', { $ifNull: ['$loanItemStats.allocationRatio', 0] }],
                  },
                  2,
                ],
              },
            },

            totalItems: {
              $sum: { $ifNull: ['$loanItemStats.matchedItems', 0] },
            },
            totalNetWeight: {
              $sum: { $ifNull: ['$loanItemStats.totalNetWeight', 0] },
            },
            totalGrossWeight: {
              $sum: { $ifNull: ['$loanItemStats.totalGrossWeight', 0] },
            },
            total: { $sum: 1 },

            customersCount: { $first: '$customersCount' },
            closed: { $sum: { $cond: [{ $eq: ['$status', ELoanStatus.CLOSED] }, 1, 0] } },
            open: { $sum: { $cond: [{ $eq: ['$status', ELoanStatus.OPEN] }, 1, 0] } },
          },
        },
      ]);
      return plainToInstance(LoanStats, stats[0], {
        excludeExtraneousValues: true,
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
