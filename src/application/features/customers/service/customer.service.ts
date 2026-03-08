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
import { USERS_FILE_STORAGE, IUsersFileStorage, FileStorageOptions, DUES_REPOSITORY, IDuesRepository } from '../../../shared';
import { CustomersFilterOptions, CustomersDownloadFilterOptions } from '../options';
import { Paged } from '@shared-libs';
import { v4 as uuidv4 } from 'uuid';
import { ILoansRepository, LOANS_REPOSITORY } from '../../loans/service/i-loans.repository';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from '../../loans/service/i-loan-items.repository';

@Injectable()
export class CustomerService implements ICustomerService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly customersFileStorage: IUsersFileStorage,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    protected readonly fileStorageOptions: FileStorageOptions,
    @InjectPinoLogger(CustomerService.name) private readonly logger: PinoLogger,
  ) { }

  async create(body: Customer): Promise<Customer> {
    try {
      this.logger.info({ createdBy: body.createdBy }, 'Creating new customer');
      const newId = uuidv4();
      if (body.profilePhoto) {
        const fileExtension = body.profilePhoto.mimetype.split('/')[1];
        body.profilePhotoRef = `customers/profiles/${newId}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(
          body.profilePhotoRef,
          body.profilePhoto.buffer,
          body.profilePhoto.mimetype,
        );
      }

      if (body.aadharCard) {
        const fileExtension = body.aadharCard.mimetype.split('/')[1];
        body.aadhaarCardRef = `customers/documents/aadhar/${newId}.${fileExtension}`;

        await this.customersFileStorage.writeAsync(
          body.aadhaarCardRef,
          body.aadharCard.buffer,
          body.aadharCard.mimetype,
        );
      }

      if (body.panCard) {
        const fileExtension = body.panCard.mimetype.split('/')[1];
        body.panCardRef = `customers/documents/pan/${newId}.${fileExtension}`;
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

      const response = {
        ...customer,
        profilePhotoUrl: customer.profilePhotoRef ? await this.customersFileStorage.getUrlAsync(customer.profilePhotoRef) : null,
        aadhaarCardUrl: customer.aadhaarCardRef ? await this.customersFileStorage.getUrlAsync(customer.aadhaarCardRef) : null,
        panCardUrl: customer.panCardRef ? await this.customersFileStorage.getUrlAsync(customer.panCardRef) : null,
      };

      return response;
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

  async getCustomersForDownload(params: CustomersDownloadFilterOptions): Promise<Customer[]> {
    try {
      this.logger.debug({ createdBy: params.createdBy }, 'Getting customers for download');
      return this.customersRepo.listAllCustomers(params);
    } catch (err) {
      this.logger.error({ err, params }, 'Error getting customers for download');
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

      if (body.profilePhoto) {
        if (existingCustomer.profilePhotoRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.profilePhotoRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete old profile photo');
          }
        }
        const fileExtension = body.profilePhoto.mimetype.split('/')[1];
        body.profilePhotoRef = `customers/profiles/${id}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(
          body.profilePhotoRef,
          body.profilePhoto.buffer,
          body.profilePhoto.mimetype,
        );
      }

      if (body.aadharCard) {
        if (existingCustomer.aadhaarCardRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.aadhaarCardRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete old aadhaar card');
          }
        }
        const fileExtension = body.aadharCard.mimetype.split('/')[1];
        body.aadhaarCardRef = `customers/documents/aadhar/${id}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(
          body.aadhaarCardRef,
          body.aadharCard.buffer,
          body.aadharCard.mimetype,
        );
      }

      if (body.panCard) {
        if (existingCustomer.panCardRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.panCardRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete old pan card');
          }
        }
        const fileExtension = body.panCard.mimetype.split('/')[1];
        body.panCardRef = `customers/documents/pan/${id}.${fileExtension}`;
        await this.customersFileStorage.writeAsync(body.panCardRef, body.panCard.buffer, body.panCard.mimetype);
      }

      const { profilePhoto, aadharCard, panCard, ...dataToUpdate } = body;
      const updatedCustomer = await this.customersRepo.update(id, { ...dataToUpdate } as Customer, body.createdBy);
      if (!updatedCustomer) {
        throw new NotFoundException('Customer not found');
      }

      const response = {
        ...updatedCustomer,
        profilePhotoUrl: updatedCustomer.profilePhotoRef
          ? await this.customersFileStorage.getUrlAsync(updatedCustomer.profilePhotoRef)
          : null,
        aadhaarCardUrl: updatedCustomer.aadhaarCardRef
          ? await this.customersFileStorage.getUrlAsync(updatedCustomer.aadhaarCardRef)
          : null,
        panCardUrl: updatedCustomer.panCardRef
          ? await this.customersFileStorage.getUrlAsync(updatedCustomer.panCardRef)
          : null,
      };

      this.logger.info({ customerId: id }, 'Customer updated successfully');
      return response;
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

      // Find all loans linked to this customer
      const customerLoans = await this.loansRepo.findByCustomerId(id);
      this.logger.info({ customerId: id, loanCount: customerLoans.length }, 'Found loans linked to customer');

      // Delete all related data for each loan
      for (const loan of customerLoans) {
        const loanId = loan.id;
        if (!loanId) {
          this.logger.warn({ loan }, 'Loan missing ID, skipping');
          continue;
        }

        this.logger.debug({ loanId, customerId: id }, 'Deleting loan items and dues for loan');

        // Delete all loan items for this loan
        try {
          await this.loanItemsRepo.deleteByLoanId(loanId);
          this.logger.debug({ loanId }, 'Loan items deleted successfully');
        } catch (err) {
          this.logger.error({ err, loanId }, 'Error deleting loan items');
          // Continue with deletion even if loan items deletion fails
        }

        // Delete all dues for this loan (including PAID, UPCOMING_DUE, and PAST_DUE)
        try {
          await this.duesRepo.deleteByLoanId(loanId);
          this.logger.debug({ loanId }, 'Dues deleted successfully');
        } catch (err) {
          this.logger.error({ err, loanId }, 'Error deleting dues');
          // Continue with deletion even if dues deletion fails
        }
      }

      // Delete all loans linked to this customer
      if (customerLoans.length > 0) {
        try {
          await this.loansRepo.deleteByCustomerId(id, createdBy);
          this.logger.info({ customerId: id, loanCount: customerLoans.length }, 'Loans deleted successfully');
        } catch (err) {
          this.logger.error({ err, customerId: id }, 'Error deleting loans');
          throw err;
        }
      }

      // Finally, delete the customer
      await this.customersRepo.delete(id, createdBy);
      this.logger.info({ customerId: id, deletedLoans: customerLoans.length }, 'Customer and all related data deleted successfully');
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, customerId: id, createdBy }, 'Error deleting customer');
      throw err;
    }
  }
}
