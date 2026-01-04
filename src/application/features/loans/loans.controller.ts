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
import { USER_STRATEGY, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateLoanRequestModel,
  LoanResponseModel,
  LoansPagedResponseModel,
  GetLoanParamsModel,
  ListLoansQueryRequestModel,
  UpdateLoanRequestModel,
} from './models';
import { ILoanService, LOAN_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { LoansFilterOptions } from './options';
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
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new loan' })
  @ApiResponse({ status: HttpStatus.CREATED, type: LoanResponseModel })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'loanItemImages', maxCount: 10 }]))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateLoanRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      loanItemImages?: Express.Multer.File[];
    },
  ): Promise<LoanResponseModel> {
    if (typeof body.loanItems === 'string') {
      body.loanItems = JSON.parse(body.loanItems);
    }

    const loanData = plainToInstance(Loan, body, {
      excludeExtraneousValues: true,
    });

    loanData._id = new Types.ObjectId();

    loanData.loanItems =
      loanData.loanItems.map((item, index) => ({
        ...item,
        _id: new Types.ObjectId(),
        image: files.loanItemImages[index],
        loanId: loanData._id.toString(),
      })) ?? [];
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
    description: 'Returns a paginated list of loans with optional sorting and filtering',
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

  @Get(':id')
  @ApiOperation({ summary: 'Get loan by ID' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param() params: GetLoanParamsModel): Promise<LoanResponseModel> {
    this.logger.info({ params }, 'getById called');
    const loan = await this.loanService.getById(params.id);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update loan' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized to update this loan' })
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: GetLoanParamsModel,
    @Body() body: UpdateLoanRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<LoanResponseModel> {
    this.logger.info({ params, body, identity }, 'update called');
    const loan = await this.loanService.update(params.id, body, identity.userId);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete loan by ID' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: '507f1f77bcf86cd799439011' })
  @ApiOkResponse({ description: 'Loan deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not authorized to delete this loan' })
  @HttpCode(HttpStatus.OK)
  async delete(@Param() params: GetLoanParamsModel, @Identity() identity: IIdentity): Promise<void> {
    this.logger.info({ params, identity }, 'delete called');
    await this.loanService.delete(params.id, identity.userId);
  }
}
