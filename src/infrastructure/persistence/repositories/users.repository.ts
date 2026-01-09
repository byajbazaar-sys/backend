import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument, UsersSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ELoanItemType, IUsersRepository, User } from '../../../application';

@Injectable()
export class UsersRepository implements IUsersRepository {
  constructor(@InjectModel(UsersSchema.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: Partial<User>): Promise<User> {
    try {
      const createdUser = await this.userModel.create(createUserDto);
      return plainToInstance(User, createdUser, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      console.error('Error creating user:', err);
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User> {
    try {
      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        return null;
      }
      return plainToInstance(User, user.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByEmailVerificationToken(token: string): Promise<User> {
    try {
      const user = await this.userModel.findOne({ resetPasswordToken: token }).exec();
      if (!user) {
        return null;
      }
      return plainToInstance(User, user.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, updateDto: Partial<User>): Promise<User> {
    try {
      const updatedUser = await this.userModel.findByIdAndUpdate({ id }, updateDto).lean().exec();
      return plainToInstance(User, updatedUser, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async getUsers(ids?: string[]): Promise<User[]> {
    try {
      const users = await this.userModel.find(ids?.length ? { _id: { $in: ids } } : {}).exec();
      return plainToInstance(User, users, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.aggregate([
      {
        $match: {
          _id: new Types.ObjectId(id),
        },
      },
      {
        $lookup: {
          from: 'customers',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$createdBy', '$$userId'] },
              },
            },
            {
              $count: 'count',
            },
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
      {
        $lookup: {
          from: 'loans',
          let: { userId: '$_id'},
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$createdBy', '$$userId'] }],
                },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                closed: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0],
                  },
                },
                open: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'Open'] }, 1, 0],
                  },
                },
                interestRemaining: {
                  $sum: '$interestRemaining',
                },
                interestPaid: {
                  $sum: '$interestPaid',
                },
                amountRemaining: {
                  $sum: '$amountRemaining',
                },
                amountPaid: {
                  $sum: '$amountPaid',
                },
              },
            },
          ],
          as: 'loanStats',
        },
      },
      {
        $unwind: {
          path: '$loanStats',
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);
    console.log(user[0]);
    return plainToInstance(User, user[0], {
      excludeExtraneousValues: true,
    });
  }
}
