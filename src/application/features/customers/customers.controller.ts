import {
  UseGuards,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  HttpStatus,
  HttpCode,
  Body,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
  Inject,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiResponse,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiParam,
  getSchemaPath,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { USER_STRATEGY, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateCustomerRequestModel,
  CustomerResponseModel,
  CustomersPagedResponseModel,
  DownloadCustomersQueryRequestModel,
  GetCustomerParamsModel,
  ListCustomersQueryRequestModel,
  UpdateCustomerRequestModel,
} from './models';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ICustomerService, CUSTOMER_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { CustomersFilterOptions, CustomersDownloadFilterOptions } from './options';
import { Customer } from './domain';
import { toCSV, toPDF, IPdfColumnConfig } from '@shared-libs';
import { ExportFormat } from '../../shared';

@ApiTags('customers')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(
    @InjectPinoLogger(CustomersController.name) private readonly logger: PinoLogger,
    @Inject(CUSTOMER_SERVICE) private readonly customerService: ICustomerService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: HttpStatus.CREATED, type: CustomerResponseModel })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePhoto', maxCount: 1 },
      { name: 'aadharCard', maxCount: 1 },
      { name: 'panCard', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateCustomerRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      profilePhoto?: Express.Multer.File[];
      aadharCard?: Express.Multer.File[];
      panCard?: Express.Multer.File[];
    },
  ): Promise<CustomerResponseModel> {
    const customerData = plainToInstance(Customer, body, {
      excludeExtraneousValues: true,
    });
    customerData.profilePhoto = files.profilePhoto?.[0];
    customerData.aadharCard = files.aadharCard?.[0];
    customerData.panCard = files.panCard?.[0];
    customerData.createdBy = identity.userId;
    const customer = await this.customerService.create(customerData);
    return plainToInstance(
      CustomerResponseModel,
      {
        ...customer,
        profilePhotoUrl: customer.profilePhotoRef,
        aadhaarCardUrl: customer.aadhaarCardRef,
        panCardUrl: customer.panCardRef,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all customers with pagination, sorting, and search' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a paginated list of customers with optional sorting and search',
    type: CustomersPagedResponseModel,
  })
  @HttpCode(HttpStatus.OK)
  async getCustomers(
    @Query() query: ListCustomersQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<CustomersPagedResponseModel> {
    this.logger.info({ query }, 'getCustomers called');
    const filterOptions = plainToInstance(CustomersFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    return plainToInstance(CustomersPagedResponseModel, await this.customerService.getCustomers(filterOptions), {
      excludeExtraneousValues: true,
    });
  }

  @Get('download')
  @ApiOperation({ summary: 'Download customers list as CSV or PDF' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns file attachment (csv or pdf)',
  })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
  async downloadCustomers(
    @Query() query: DownloadCustomersQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    this.logger.info({ query }, 'downloadCustomers called');
    const filterOptions = plainToInstance(CustomersDownloadFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    const customers = await this.customerService.getCustomersForDownload(filterOptions);
    const items = plainToInstance(CustomerResponseModel, customers, {
      excludeExtraneousValues: true,
    });
    const filename = `customers-${Date.now()}`;
    if (query.format === ExportFormat.CSV) {
      const buffer = Buffer.from(toCSV(items as unknown as Record<string, unknown>[]), 'utf-8');
      return new StreamableFile(buffer, {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${filename}.csv"`,
        length: buffer.length,
      });
    }
    const fmt = {
      truncateId: (v: unknown) => (v ? String(v).slice(0, 8) + '...' : ''),
      formatDate: (v: unknown) =>
        v instanceof Date ? v.toISOString().slice(0, 10) : v ? new Date(String(v)).toISOString().slice(0, 10) : '',
    };
    const columns: IPdfColumnConfig[] = [
      { header: 'ID', key: 'id', width: 55, formatter: fmt.truncateId },
      { header: 'First Name', key: 'firstName', width: 70 },
      { header: 'Last Name', key: 'lastName', width: 70 },
      { header: 'Email', key: 'email', width: 120 },
      { header: 'Phone', key: 'phone', width: 85 },
      { header: 'Location', key: 'location', width: 90 },
      { header: 'Created', key: 'createdAt', width: 75, formatter: fmt.formatDate },
    ];
    const pdf = await toPDF(items as unknown as Record<string, unknown>[], columns, 'Customers');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}.pdf"`,
      length: pdf.length,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: CustomerResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Customer not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param() params: GetCustomerParamsModel, @Identity() identity: IIdentity): Promise<CustomerResponseModel> {
    this.logger.info({ params, identity }, 'getById called');
    const customer = await this.customerService.getById(params.id, identity.userId);
    return plainToInstance(CustomerResponseModel, customer, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'id', description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: CustomerResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Customer not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized to update this customer' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already exists' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePhoto', maxCount: 1 },
      { name: 'aadharCard', maxCount: 1 },
      { name: 'panCard', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetCustomerParamsModel,
    @Body() body: UpdateCustomerRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      profilePhoto?: Express.Multer.File[];
      aadharCard?: Express.Multer.File[];
      panCard?: Express.Multer.File[];
    },
  ): Promise<CustomerResponseModel> {
    this.logger.info({ params, body, identity }, 'update called');
    const customerData = plainToInstance(Customer, body, {
      excludeExtraneousValues: true,
    });
    customerData.profilePhoto = files.profilePhoto?.[0];
    customerData.aadharCard = files.aadharCard?.[0];
    customerData.panCard = files.panCard?.[0];
    customerData.createdBy = identity.userId;
    const customer = await this.customerService.update(params.id, customerData);
    return plainToInstance(
      CustomerResponseModel,
      {
        ...customer,
        profilePhotoUrl: customer.profilePhotoRef,
        aadhaarCardUrl: customer.aadhaarCardRef,
        panCardUrl: customer.panCardRef,
      },
      { excludeExtraneousValues: true },
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ description: 'Customer deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Customer not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized to delete this customer' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param() params: GetCustomerParamsModel, @Identity() identity: IIdentity): Promise<void> {
    this.logger.info({ params, identity }, 'delete called');
    await this.customerService.delete(params.id, identity.userId);
  }
}
