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
  ListLoansQueryRequestModel,
  UpdateLoanRequestModel,
  UpdateLoanStatusRequestModel,
  LoanStatsQueryRequestModel,
  LoanStatsResponseModel,
} from './models';
import { ILoanService, LOAN_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { LoansFilterOptions, LoanStatsFilterOptions } from './options';
import { Loan } from './domain';
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
}
