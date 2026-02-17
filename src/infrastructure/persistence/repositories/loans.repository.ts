import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoanDocument, LoansSchema, Schemas } from '../schemas';
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
import { ESortOrder, getPaginationValues, Paged, toPaged } from '@shared-libs';

@Injectable()
export class LoansRepository implements ILoansRepository {
  constructor(@InjectModel(LoansSchema.name) private loanModel: Model<LoanDocument>) { }

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

  async update(id: string, updateDto: Loan): Promise<Loan> {
    try {
      delete updateDto._id;
      delete updateDto.id;

      const updatedLoan = await this.loanModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(updateDto.createdBy) },
          updateDto,
          { new: true },
        )
        .lean()
        .exec();

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

  async findById(id: string, createdBy: string): Promise<Loan> {
    try {
      const loan = await this.loanModel.findOne({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(createdBy) }).exec();
      return plainToInstance(Loan, loan, {
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

  async listLoans(params: LoansFilterOptions): Promise<LoanExtended> {
    try {
      const { customerId, createdBy, status } = params;
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
      // Add status filter if provided
      if (status) {
        filter.status = status;
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

            totals: [
              {
                $group: {
                  _id: null,
                  totalAmountRemaining: { $sum: '$totalAmountRemaining' },
                  totalAmountPaid: { $sum: '$totalAmountPaid' },
                  totalInterestRemaining: { $sum: '$totalInterestRemaining' },
                  totalInterestPaid: { $sum: '$totalInterestPaid' },
                },
              },
            ],
          },
        },

        {
          $project: {
            data: 1,
            total: { $ifNull: [{ $arrayElemAt: ['$totalCount.total', 0] }, 0] },

            totalAmountRemaining: {
              $ifNull: [{ $arrayElemAt: ['$totals.totalAmountRemaining', 0] }, 0],
            },
            totalAmountPaid: {
              $ifNull: [{ $arrayElemAt: ['$totals.totalAmountPaid', 0] }, 0],
            },
            totalInterestRemaining: {
              $ifNull: [{ $arrayElemAt: ['$totals.totalInterestRemaining', 0] }, 0],
            },
            totalInterestPaid: {
              $ifNull: [{ $arrayElemAt: ['$totals.totalInterestPaid', 0] }, 0],
            },
          },
        },
      ]);
      const data = toPaged(Loan, {
        items: docs[0].data,
        page: pageNumber,
        perPage: pageSize,
        totalCount: docs[0].total,
      });
      return plainToInstance(LoanExtended, {
        ...data,
        totalAmountRemaining: docs[0].totalAmountRemaining,
        totalAmountPaid: docs[0].totalAmountPaid,
        totalInterestPaid: docs[0].totalInterestPaid,
        totalInterestRemaining: docs[0].totalInterestRemaining,
      }, {
        excludeExtraneousValues: true,
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
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$$filterItemId', null] },
                            { $eq: ['$itemId', '$$filterItemId'] }
                          ]
                        },
                        1,
                        0,
                      ],
                    },
                  },

                  totalNetWeight: {
                    $sum: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$$filterItemId', null] },
                            { $eq: ['$itemId', '$$filterItemId'] }
                          ]
                        },
                        '$netWeightInGrams',
                        0,
                      ],
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

  async delete(id: string, createdBy: string): Promise<void> {
    try {
      await this.loanModel.findOneAndDelete({ _id: new Types.ObjectId(id), createdBy: new Types.ObjectId(createdBy) }).exec();
    } catch (err) {
      throw err;
    }
  }

  async deleteByCustomerId(customerId: string, createdBy: string): Promise<void> {
    try {
      await this.loanModel.deleteMany({ customerId: new Types.ObjectId(customerId), createdBy: new Types.ObjectId(createdBy) }).exec();
    } catch (err) {
      throw err;
    }
  }
}
