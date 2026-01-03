import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerDocument, CustomersSchema } from '../schemas';
import { plainToInstance } from 'class-transformer';
import { ICustomersRepository, Customer, CustomersFilterOptions } from '../../../application';
import { ESortOrder, Paged, toPaged } from '@shared-libs';

@Injectable()
export class CustomersRepository implements ICustomersRepository {
  constructor(@InjectModel(CustomersSchema.name) private customerModel: Model<CustomerDocument>) {}

  async create(createCustomer: Customer): Promise<Customer> {
    try {
      const createdCustomer = await this.customerModel.create(createCustomer);
      return plainToInstance(Customer, createdCustomer.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByEmail(email: string): Promise<Customer> {
    try {
      const customer = await this.customerModel.findOne({ email }).exec();
      if (!customer) {
        return null;
      }
      return plainToInstance(Customer, customer.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<Customer> {
    try {
      const customer = await this.customerModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
      if (!customer) {
        return null;
      }
      return plainToInstance(Customer, customer.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async update(id: string, updateDto: Partial<Customer>): Promise<Customer> {
    try {
      const updatedCustomer = await this.customerModel.findByIdAndUpdate(id, updateDto, { new: true }).lean().exec();
      if (!updatedCustomer) {
        return null;
      }
      return plainToInstance(Customer, updatedCustomer, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async findById(id: string): Promise<Customer> {
    try {
      const customer = await this.customerModel.findById(new Types.ObjectId(id)).exec();
      if (!customer) {
        return null;
      }
      return plainToInstance(Customer, customer.toJSON(), {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      throw err;
    }
  }

  async listCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>> {
    try {
      const { pageNumber, pageSize, sortOrder, sortField, name, userId } = params;
      const skip = (pageNumber - 1) * pageSize;
      const limit = pageSize;
      const sort = sortField ? { [sortField]: sortOrder === 'asc' ? 1 : -1 } : { createdAt: -1 };
      const filter: Record<string, any> = {};

      if (name && name.trim()) {
        const q = name.trim();
        filter.$or = [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
        ];
      }

      const docs = await this.customerModel
        .aggregate([
          {
            $match: userId
              ? {
                  createdBy: new Types.ObjectId(userId),
                }
              : {},
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
        ])
        .exec();

      return toPaged(Customer, {
        items: docs[0].data,
        page: params.pageNumber,
        perPage: params.pageSize,
        totalCount: docs[0].total,
      });
    } catch (err) {
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.customerModel.findByIdAndDelete(new Types.ObjectId(id)).exec();
    } catch (err) {
      throw err;
    }
  }
}
