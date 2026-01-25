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
  GetCustomerParamsModel,
  ListCustomersQueryRequestModel,
  UpdateCustomerRequestModel,
} from './models';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ICustomerService, CUSTOMER_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { CustomersFilterOptions } from './options';
import { Customer } from './domain';

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
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetCustomerParamsModel,
    @Body() body: UpdateCustomerRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<CustomerResponseModel> {
    this.logger.info({ params, body, identity }, 'update called');
    const customerData = plainToInstance(Customer, body, {
      excludeExtraneousValues: true,
    });
    customerData.createdBy = identity.userId;
    const customer = await this.customerService.update(params.id, customerData);
    return plainToInstance(CustomerResponseModel, customer, { excludeExtraneousValues: true });
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
