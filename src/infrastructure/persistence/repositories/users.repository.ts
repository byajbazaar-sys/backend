import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument, UsersSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { IUsersRepository, User } from '../../../application';

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
    ]);
    return plainToInstance(User, user[0], {
      excludeExtraneousValues: true,
    });
  }
}
