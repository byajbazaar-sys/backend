import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Customer } from '../domain';
import { ICustomersRepository, CUSTOMERS_REPOSITORY } from './i-customers.repository';
import { ICustomerService } from './i-customer.service';
import { UpdateCustomerRequestModel } from '../models';
import { USERS_FILE_STORAGE, IUsersFileStorage, FileStorageOptions } from '../../../shared';
import { CustomersFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { Types } from 'mongoose';

@Injectable()
export class CustomerService implements ICustomerService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly customersFileStorage: IUsersFileStorage,
    protected readonly fileStorageOptions: FileStorageOptions,
    @InjectPinoLogger(CustomerService.name) private readonly logger: PinoLogger,
  ) {}

  async create(body: Customer): Promise<Customer> {
    try {
      this.logger.info({ createdBy: body.createdBy }, 'Creating new customer');
      body._id = new Types.ObjectId();
      if (body.profilePhoto) {
        const fileExtension = body.profilePhoto.mimetype.split('/')[1];
        body.profilePhotoRef = `customers/profiles/${body._id.toString()}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(
          body.profilePhotoRef,
          body.profilePhoto.buffer,
          body.profilePhoto.mimetype,
        );
      }

      if (body.aadharCard) {
        const fileExtension = body.aadharCard.mimetype.split('/')[1];
        body.aadhaarCardRef = `customers/documents/aadhar/${body._id.toString()}.${fileExtension}`;

        await this.customersFileStorage.writeAsync(
          body.aadhaarCardRef,
          body.aadharCard.buffer,
          body.aadharCard.mimetype,
        );
      }

      if (body.panCard) {
        const fileExtension = body.panCard.mimetype.split('/')[1];
        body.panCardRef = `customers/documents/pan/${body._id.toString()}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(body.panCardRef, body.panCard.buffer, body.panCard.mimetype);
      }

      const createdCustomer = await this.customersRepo.create(body);
      const response = {
        ...createdCustomer,
        profilePhotoRef: body.profilePhoto ? await this.customersFileStorage.getUrlAsync(body.profilePhotoRef) : null,
        aadhaarCardRef: body.aadhaarCardRef ? await this.customersFileStorage.getUrlAsync(body.aadhaarCardRef) : null,
        panCardRef: body.panCardRef ? await this.customersFileStorage.getUrlAsync(body.panCardRef) : null,
      };
      this.logger.info({ customerId: createdCustomer.id }, 'Customer created successfully');
      return response;
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      this.logger.error({ err, createdBy: body.createdBy }, 'Error creating customer');
      throw err;
    }
  }

  async getById(id: string, createdBy: string): Promise<Customer> {
    try {
      this.logger.debug({ customerId: id, createdBy }, 'Getting customer by ID');
      const customer = await this.customersRepo.findById(id, createdBy);
      if (!customer) {
        this.logger.warn({ customerId: id, createdBy }, 'Customer not found');
        throw new NotFoundException('Customer not found');
      }

      return customer;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      }
      this.logger.error({ err, customerId: id, createdBy }, 'Error getting customer by ID');
      throw err;
    }
  }

  async getCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>> {
    try {
      this.logger.debug({ createdBy: params.createdBy }, 'Getting customers');
      const result = await this.customersRepo.listCustomers(params);
      return result;
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting customers');
      throw err;
    }
  }

  async update(id: string, body: Customer): Promise<Customer> {
    try {
      this.logger.info({ customerId: id, createdBy: body.createdBy }, 'Updating customer');
      const existingCustomer = await this.customersRepo.findById(id, body.createdBy);
      if (!existingCustomer) {
        this.logger.warn({ customerId: id, createdBy: body.createdBy }, 'Customer not found for update');
        throw new NotFoundException('Customer not found');
      }

      const updatedCustomer = await this.customersRepo.update(id, body, body.createdBy);
      if (!updatedCustomer) {
        throw new NotFoundException('Customer not found');
      }

      this.logger.info({ customerId: id }, 'Customer updated successfully');
      return updatedCustomer;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, customerId: id }, 'Error updating customer');
      throw err;
    }
  }

  async delete(id: string, createdBy: string): Promise<void> {
    try {
      this.logger.info({ customerId: id, createdBy }, 'Deleting customer');
      const existingCustomer = await this.customersRepo.findById(id, createdBy);
      if (!existingCustomer) {
        this.logger.warn({ customerId: id, createdBy }, 'Customer not found for deletion');
        throw new NotFoundException('Customer not found');
      }
      await this.customersRepo.delete(id, createdBy);
      this.logger.info({ customerId: id }, 'Customer deleted successfully');
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, customerId: id, createdBy }, 'Error deleting customer');
      throw err;
    }
  }
}
