import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Paged, normalizeImageBufferForStorageOrThrow } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { Customer } from '../domain';
import { ICustomerService } from './i-customer.service';
import { ICustomersRepository, CUSTOMERS_REPOSITORY } from './i-customers.repository';
import {
  USERS_FILE_STORAGE,
  IUsersFileStorage,
  FileStorageOptions,
  DUES_REPOSITORY,
  IDuesRepository,
  CACHE_NAMESPACE,
  CACHE_SERVICE,
  DASHBOARD_CACHE_TTL_SECONDS,
  ICacheService,
  queryCacheParts,
} from '../../../shared';
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY } from '../../loans/service/i-loan-items.repository';
import { ILoansRepository, LOANS_REPOSITORY } from '../../loans/service/i-loans.repository';
import { CustomersFilterOptions, CustomersDownloadFilterOptions } from '../options';

@Injectable()
export class CustomerService implements ICustomerService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly customersRepo: ICustomersRepository,
    @Inject(USERS_FILE_STORAGE) private readonly customersFileStorage: IUsersFileStorage,
    @Inject(LOANS_REPOSITORY) private readonly loansRepo: ILoansRepository,
    @Inject(LOAN_ITEMS_REPOSITORY) private readonly loanItemsRepo: ILoanItemsRepository,
    @Inject(DUES_REPOSITORY) private readonly duesRepo: IDuesRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    protected readonly fileStorageOptions: FileStorageOptions,
    @InjectPinoLogger(CustomerService.name) private readonly logger: PinoLogger,
  ) {}

  private async enrichCustomerSignedUrls(customer: Customer): Promise<
    Customer & {
      profilePhotoUrl: string;
      aadhaarCardUrl: string;
      panCardUrl: string;
    }
  > {
    const [profilePhotoUrl, aadhaarCardUrl, panCardUrl] = await Promise.all([
      customer.profilePhotoRef
        ? this.customersFileStorage.getUrlAsync(customer.profilePhotoRef)
        : Promise.resolve(null),
      customer.aadhaarCardRef ? this.customersFileStorage.getUrlAsync(customer.aadhaarCardRef) : Promise.resolve(null),
      customer.panCardRef ? this.customersFileStorage.getUrlAsync(customer.panCardRef) : Promise.resolve(null),
    ]);
    return {
      ...customer,
      profilePhotoUrl,
      aadhaarCardUrl,
      panCardUrl,
    };
  }

  async create(body: Customer): Promise<Customer> {
    try {
      this.logger.info({ createdBy: body.createdBy }, 'Creating new customer');
      const newId = uuidv4();
      if (body.profilePhoto) {
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.profilePhoto.buffer,
          body.profilePhoto.mimetype,
          body.profilePhoto.originalname,
        );
        const proposedRef = `customers/profiles/${newId}.${normalized.fileExtension}`;
        body.profilePhotoRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      if (body.aadharCard) {
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.aadharCard.buffer,
          body.aadharCard.mimetype,
          body.aadharCard.originalname,
        );
        const proposedRef = `customers/documents/aadhar/${newId}.${normalized.fileExtension}`;
        body.aadhaarCardRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      if (body.panCard) {
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.panCard.buffer,
          body.panCard.mimetype,
          body.panCard.originalname,
        );
        const proposedRef = `customers/documents/pan/${newId}.${normalized.fileExtension}`;
        body.panCardRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      const createdCustomer = await this.customersRepo.create(body);
      this.logger.info({ customerId: createdCustomer.id }, 'Customer created successfully');
      await this.invalidateLoanStatsCache(body.createdBy);
      await this.invalidateCustomersCache(body.createdBy);
      return this.enrichCustomerSignedUrls(createdCustomer);
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

      return this.enrichCustomerSignedUrls(customer);
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
      const result = await this.cache.getOrLoadVersioned(
        CACHE_NAMESPACE.CUSTOMERS,
        params.createdBy,
        queryCacheParts('list', {
          name: params.name,
          pageNumber: params.pageNumber,
          pageSize: params.pageSize,
          sortOrder: params.sortOrder,
          sortField: params.sortField,
        }),
        DASHBOARD_CACHE_TTL_SECONDS,
        () => this.customersRepo.listCustomers(params),
      );
      const items = await Promise.all(result.items.map((c) => this.enrichCustomerSignedUrls(c)));
      return { ...result, items };
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

      if (body.removeAadharCard && body.aadharCard) {
        throw new BadRequestException('Cannot remove Aadhaar card and upload a new one in the same request');
      }
      if (body.removePanCard && body.panCard) {
        throw new BadRequestException('Cannot remove PAN card and upload a new one in the same request');
      }

      if (body.removeAadharCard) {
        if (existingCustomer.aadhaarCardRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.aadhaarCardRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete Aadhaar card from storage');
          }
        }
        body.aadhaarCardRef = null;
      }

      if (body.removePanCard) {
        if (existingCustomer.panCardRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.panCardRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete PAN card from storage');
          }
        }
        body.panCardRef = null;
      }

      if (body.profilePhoto) {
        if (existingCustomer.profilePhotoRef) {
          try {
            await this.customersFileStorage.removeAsync(existingCustomer.profilePhotoRef);
          } catch (err) {
            this.logger.warn({ err, customerId: id }, 'Failed to delete old profile photo');
          }
        }
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.profilePhoto.buffer,
          body.profilePhoto.mimetype,
          body.profilePhoto.originalname,
        );
        const proposedRef = `customers/profiles/${id}.${normalized.fileExtension}`;
        body.profilePhotoRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
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
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.aadharCard.buffer,
          body.aadharCard.mimetype,
          body.aadharCard.originalname,
        );
        const proposedRef = `customers/documents/aadhar/${id}.${normalized.fileExtension}`;
        body.aadhaarCardRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
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
        const normalized = await normalizeImageBufferForStorageOrThrow(
          body.panCard.buffer,
          body.panCard.mimetype,
          body.panCard.originalname,
        );
        const proposedRef = `customers/documents/pan/${id}.${normalized.fileExtension}`;
        body.panCardRef = await this.customersFileStorage.writeAsync(
          proposedRef,
          normalized.buffer,
          normalized.mimetype,
        );
      }

      const { profilePhoto, aadharCard, panCard, removeAadharCard, removePanCard, ...dataToUpdate } = body;
      const updatedCustomer = await this.customersRepo.update(id, { ...dataToUpdate } as Customer, body.createdBy);
      if (!updatedCustomer) {
        throw new NotFoundException('Customer not found');
      }

      this.logger.info({ customerId: id }, 'Customer updated successfully');
      await this.invalidateCustomersCache(body.createdBy);
      return this.enrichCustomerSignedUrls(updatedCustomer);
    } catch (err) {
      if (
        err instanceof NotFoundException ||
        err instanceof ConflictException ||
        err instanceof ForbiddenException ||
        err instanceof BadRequestException
      ) {
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
      this.logger.info(
        { customerId: id, deletedLoans: customerLoans.length },
        'Customer and all related data deleted successfully',
      );
      await this.invalidateLoanStatsCache(createdBy);
      await this.invalidateCustomersCache(createdBy);
      await this.invalidateTransactionsCache(createdBy);
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ConflictException || err instanceof ForbiddenException) {
        throw err;
      }
      this.logger.error({ err, customerId: id, createdBy }, 'Error deleting customer');
      throw err;
    }
  }

  private async invalidateLoanStatsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.LOAN_STATS, userId);
  }

  private async invalidateCustomersCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.CUSTOMERS, userId);
  }

  private async invalidateTransactionsCache(userId: string): Promise<void> {
    await this.cache.bumpUserCache(CACHE_NAMESPACE.TRANSACTIONS, userId);
  }
}
