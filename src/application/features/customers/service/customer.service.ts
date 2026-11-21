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
import { FACE_SEARCH_SERVICE, IFaceSearchService } from './i-face-search.service';
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
import { ILoanItemsRepository, LOAN_ITEMS_REPOSITORY, ILoansRepository, LOANS_REPOSITORY } from '../../loans';
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
    @Inject(FACE_SEARCH_SERVICE) private readonly faceSearchService: IFaceSearchService,
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
      // The face embedding is the slowest step: start it as soon as the photo is read, so it runs while the files
      // are stored and the customer is saved. Only the quick vector write waits for the customer's id.
      const profile = body.profilePhoto ? await this.normalizeUpload(body.profilePhoto) : null;
      const embedding: Promise<number[] | null> = profile
        ? this.startFaceEmbedding(profile.buffer)
        : Promise.resolve(null);

      // The three files are independent: store them at the same time.
      const [profileRef, aadhaarRef, panRef] = await Promise.all([
        profile ? this.storeNormalized(profile, `customers/profiles/${newId}`) : null,
        body.aadharCard ? this.storeUpload(body.aadharCard, `customers/documents/aadhar/${newId}`) : null,
        body.panCard ? this.storeUpload(body.panCard, `customers/documents/pan/${newId}`) : null,
      ]);
      if (profileRef) body.profilePhotoRef = profileRef;
      if (aadhaarRef) body.aadhaarCardRef = aadhaarRef;
      if (panRef) body.panCardRef = panRef;

      const createdCustomer = await this.customersRepo.create(body);
      this.logger.info({ customerId: createdCustomer.id }, 'Customer created successfully');
      await Promise.all([
        this.invalidateLoanStatsCache(body.createdBy),
        this.invalidateCustomersCache(body.createdBy),
        createdCustomer.profilePhotoRef
          ? this.indexFace(body.createdBy, createdCustomer.id, profile?.buffer, embedding, 'create')
          : null,
      ]);
      return this.enrichCustomerSignedUrls(createdCustomer);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      this.logger.error({ err, createdBy: body.createdBy }, 'Error creating customer');
      throw err;
    }
  }

  private normalizeUpload(file: Express.Multer.File) {
    return normalizeImageBufferForStorageOrThrow(file.buffer, file.mimetype, file.originalname);
  }

  private storeNormalized(
    normalized: Awaited<ReturnType<typeof normalizeImageBufferForStorageOrThrow>>,
    refWithoutExtension: string,
  ): Promise<string> {
    return this.customersFileStorage.writeAsync(
      `${refWithoutExtension}.${normalized.fileExtension}`,
      normalized.buffer,
      normalized.mimetype,
    );
  }

  private async storeUpload(file: Express.Multer.File, refWithoutExtension: string): Promise<string> {
    return this.storeNormalized(await this.normalizeUpload(file), refWithoutExtension);
  }

  /** Never rejects: a failed embedding only means indexing falls back to computing it again. */
  private startFaceEmbedding(buffer: Buffer): Promise<number[] | null> {
    return this.faceSearchService.embedForIndex(buffer).catch((err: unknown) => {
      this.logger.warn({ err }, 'Face embedding failed; indexing will retry it');
      return null;
    });
  }

  /** Face search is best effort: a failure is logged, never fails the save. */
  private async indexFace(
    userId: string,
    customerId: string,
    buffer: Buffer | undefined,
    embedding: Promise<number[] | null>,
    after: 'create' | 'update',
  ): Promise<void> {
    try {
      const vector = await embedding;
      await this.faceSearchService.indexCustomer(userId, customerId, buffer, vector ?? undefined);
    } catch (err) {
      this.logger.warn({ customerId, err }, `Face index after ${after} failed`);
    }
  }

  /** Deletes a stored file; a failure is logged (the record is still updated). */
  private async removeStored(ref: string | null | undefined, customerId: string, what: string): Promise<void> {
    if (!ref) return;
    try {
      await this.customersFileStorage.removeAsync(ref);
    } catch (err) {
      this.logger.warn({ err, customerId }, `Failed to delete ${what} from storage`);
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

      // Start the face embedding early (see create), then handle the three files at the same time. Within each
      // file the old copy is removed before the new one is written: both can have the same key.
      const profile = body.profilePhoto ? await this.normalizeUpload(body.profilePhoto) : null;
      const embedding: Promise<number[] | null> = profile
        ? this.startFaceEmbedding(profile.buffer)
        : Promise.resolve(null);
      const profilePhotoBuffer = profile?.buffer;

      await Promise.all([
        (async () => {
          if (!profile) return;
          await this.removeStored(existingCustomer.profilePhotoRef, id, 'old profile photo');
          body.profilePhotoRef = await this.storeNormalized(profile, `customers/profiles/${id}`);
        })(),
        (async () => {
          if (body.removeAadharCard) {
            await this.removeStored(existingCustomer.aadhaarCardRef, id, 'Aadhaar card');
            body.aadhaarCardRef = null;
          } else if (body.aadharCard) {
            await this.removeStored(existingCustomer.aadhaarCardRef, id, 'old aadhaar card');
            body.aadhaarCardRef = await this.storeUpload(body.aadharCard, `customers/documents/aadhar/${id}`);
          }
        })(),
        (async () => {
          if (body.removePanCard) {
            await this.removeStored(existingCustomer.panCardRef, id, 'PAN card');
            body.panCardRef = null;
          } else if (body.panCard) {
            await this.removeStored(existingCustomer.panCardRef, id, 'old pan card');
            body.panCardRef = await this.storeUpload(body.panCard, `customers/documents/pan/${id}`);
          }
        })(),
      ]);

      const { profilePhoto, aadharCard, panCard, removeAadharCard, removePanCard, ...dataToUpdate } = body;
      const updatedCustomer = await this.customersRepo.update(id, { ...dataToUpdate } as Customer, body.createdBy);
      if (!updatedCustomer) {
        throw new NotFoundException('Customer not found');
      }

      this.logger.info({ customerId: id }, 'Customer updated successfully');
      await Promise.all([
        this.invalidateCustomersCache(body.createdBy),
        body.profilePhoto && updatedCustomer.profilePhotoRef
          ? this.indexFace(body.createdBy, id, profilePhotoBuffer, embedding, 'update')
          : null,
      ]);
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
      try {
        await this.faceSearchService.removeCustomer(createdBy, id);
      } catch (err) {
        this.logger.warn({ customerId: id, err }, 'Face vector remove after delete failed');
      }
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
