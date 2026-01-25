import {
  UseGuards,
  Controller,
  Post,
  Get,
  Patch,
  HttpStatus,
  HttpCode,
  Body,
  Param,
  Query,
  Inject,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiResponse,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { USER_STRATEGY, RolesGuard, Identity, IIdentity, ParseFormDataJsonPipe } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateLoanRequestModel,
  LoanResponseModel,
  LoansPagedResponseModel,
  GetLoanParamsModel,
  GetLoanItemParamsModel,
  ListLoansQueryRequestModel,
  UpdateLoanRequestModel,
  UpdateLoanStatusRequestModel,
  UpdateLoanItemRequestModel,
  LoanItemResponseModel,
  LoanStatsQueryRequestModel,
  LoanStatsResponseModel,
} from './models';
import { ILoanService, LOAN_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { LoansFilterOptions, LoanStatsFilterOptions } from './options';
import { Loan, LoanItem } from './domain';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Types } from 'mongoose';

@ApiTags('loans')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('loans')
export class LoansController {
  constructor(
    @InjectPinoLogger(LoansController.name) private readonly logger: PinoLogger,
    @Inject(LOAN_SERVICE) private readonly loanService: ILoanService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new loan' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LoanResponseModel })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'loanItemImages', maxCount: 10 }]))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ParseFormDataJsonPipe()) body: CreateLoanRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      loanItemImages?: Express.Multer.File[];
    },
  ): Promise<LoanResponseModel> {
    const loanData = plainToInstance(Loan, body, {
      excludeExtraneousValues: true,
    });

    loanData._id = new Types.ObjectId();
    let loanAmount: number = 0;

    if (!Array.isArray(loanData.loanItems)) {
      loanData.loanItems = loanData.loanItems ? [loanData.loanItems] : [];
    }

    loanData.loanItems = loanData.loanItems.map((item, index) => {
      loanAmount += item.amount;
      const loanItem: any = {
        ...item,
        _id: new Types.ObjectId(),
        itemId: new Types.ObjectId(item.itemId),
        image: files.loanItemImages?.[index] ?? null,
        loanId: loanData._id.toString(),
        createdBy: identity.userId,
      };
      return loanItem;
    });
    loanData.amountRemaining = loanAmount;
    loanData.createdBy = identity.userId;
    const loan = await this.loanService.create(loanData);
    return plainToInstance(LoanResponseModel, loan, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all loans with pagination, sorting, and search' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a paginated list of loans with optional sorting and filtering (defaults to OPEN loans)',
    type: LoansPagedResponseModel,
  })
  @HttpCode(HttpStatus.OK)
  async getLoans(
    @Query() query: ListLoansQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<LoansPagedResponseModel> {
    this.logger.info({ query }, 'getLoans called');
    const filterOptions = plainToInstance(LoansFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    return plainToInstance(LoansPagedResponseModel, await this.loanService.getLoans(filterOptions), {
      excludeExtraneousValues: true,
    });
  }

  @Get('stats')
  @ApiOkResponse({ description: 'Loan stats fetched successfully', type: LoanStatsResponseModel })
  @HttpCode(HttpStatus.OK)
  async getStats(
    @Query() query: LoanStatsQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<LoanStatsResponseModel> {
    this.logger.info({ identity }, 'getStats called');
    const filterOptions = plainToInstance(LoanStatsFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    return plainToInstance(LoanStatsResponseModel, await this.loanService.getStats(identity.userId, filterOptions), {
      excludeExtraneousValues: true,
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update loan status (Open/Close)' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanResponseModel })
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param() params: GetLoanParamsModel,
    @Body() body: UpdateLoanStatusRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<LoanResponseModel> {
    this.logger.info({ params, body, identity }, 'updateStatus called');
    const loan = await this.loanService.updateStatus(params.id, body.status, identity.userId);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan by ID' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param() params: GetLoanParamsModel, @Identity() identity: IIdentity): Promise<LoanResponseModel> {
    this.logger.info({ params, identity }, 'getById called');
    const loan = await this.loanService.getById(params.id, identity.userId);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update loan' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot update a closed loan' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized to update this loan' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetLoanParamsModel,
    @Body() body: UpdateLoanRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<LoanResponseModel> {
    this.logger.info({ params, body, identity }, 'update called');
    const loanData = plainToInstance(Loan, body, {
      excludeExtraneousValues: true,
    });
    loanData.createdBy = identity.userId;
    const loan = await this.loanService.update(params.id, loanData);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Patch(':loanId/items/:itemId')
  @ApiOperation({
    summary: 'Update loan item',
    description: 'Update loan item details including amount, name, description, weights, rate, and image. Image can be updated by uploading a new file via multipart/form-data.',
  })
  @ApiParam({ name: 'loanId', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiParam({ name: 'itemId', description: 'Loan Item ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanItemResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan or loan item not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Cannot update loan item in a closed loan' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'image', maxCount: 1 }]))
  @HttpCode(HttpStatus.OK)
  async updateLoanItem(
    @Param() params: GetLoanItemParamsModel,
    @Body(new ParseFormDataJsonPipe()) body: UpdateLoanItemRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
    },
  ): Promise<LoanItemResponseModel> {
    this.logger.info({ params, body, identity }, 'updateLoanItem called');
    const loanItemData = plainToInstance(LoanItem, body, {
      excludeExtraneousValues: true,
    });

    // Add image if provided
    if (files.image && files.image.length > 0) {
      loanItemData.image = files.image[0];
    }

    const loanItem = await this.loanService.updateLoanItem(params.loanId, params.itemId, loanItemData, identity.userId);
    return plainToInstance(LoanItemResponseModel, loanItem, { excludeExtraneousValues: true });
  }
}
