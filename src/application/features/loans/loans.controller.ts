import {
  BadRequestException,
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
  StreamableFile,
  Header,
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
  DownloadLoansQueryRequestModel,
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
  UploadLoanVoucherSignaturesRequestModel,
} from './models';
import { ILoanService, LOAN_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { LoansFilterOptions, LoansDownloadFilterOptions, LoanStatsFilterOptions } from './options';
import { toCSV, toPDF, IPdfColumnConfig } from '@shared-libs';
import { ExportFormat } from '../../shared';
import { Loan, LoanItem } from './domain';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { v4 as uuidv4 } from 'uuid';

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

    console.log("files=>", files);
    const loanData = plainToInstance(Loan, body, {
      excludeExtraneousValues: true,
    });

    const loanId = uuidv4();
    loanData.id = loanId;
    let loanAmount: number = 0;

    if (!Array.isArray(loanData.loanItems)) {
      loanData.loanItems = loanData.loanItems ? [loanData.loanItems] : [];
    }

    loanData.loanItems = loanData.loanItems.map((item, index) => {
      loanAmount += item.amount;
      const itemId = item.itemId ?? (item as { item_id?: string }).item_id;
      if (!itemId) {
        throw new BadRequestException('Each loan item must have an itemId referencing an existing item');
      }
      const loanItem: LoanItem & { id?: string } = {
        ...item,
        id: uuidv4(),
        itemId,
        image: files.loanItemImages?.[index] ?? null,
        loanId,
        createdBy: identity.userId,
      };
      return loanItem;
    });
    loanData.amountRemaining = loanAmount;
    loanData.createdBy = identity.userId;
    const loan = await this.loanService.create(loanData);
    console.log("loan=>", loan);
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

  @Get('download')
  @ApiOperation({ summary: 'Download loans list as CSV or PDF' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns file attachment (csv or pdf)',
  })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
  async downloadLoans(
    @Query() query: DownloadLoansQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    this.logger.info({ query }, 'downloadLoans called');
    const filterOptions = plainToInstance(LoansDownloadFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    const loans = await this.loanService.getLoansForDownload(filterOptions);
    const items = plainToInstance(LoanResponseModel, loans, {
      excludeExtraneousValues: true,
    });
    const filename = `loans-${Date.now()}`;
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
      formatNum: (v: unknown) => (v != null ? Number(v).toFixed(2) : ''),
    };
    const columns: IPdfColumnConfig[] = [
      { header: 'ID', key: 'id', width: 55, formatter: fmt.truncateId },
      { header: 'Customer ID', key: 'customerId', width: 55, formatter: fmt.truncateId },
      { header: 'Status', key: 'status', width: 45 },
      { header: 'Amt Remain', key: 'amountRemaining', width: 65, formatter: fmt.formatNum },
      { header: 'Amt Paid', key: 'amountPaid', width: 65, formatter: fmt.formatNum },
      { header: 'Int Remain', key: 'interestRemaining', width: 65, formatter: fmt.formatNum },
      { header: 'Int Paid', key: 'interestPaid', width: 65, formatter: fmt.formatNum },
      { header: 'Created', key: 'createdAt', width: 75, formatter: fmt.formatDate },
    ];
    const pdf = await toPDF(items as unknown as Record<string, unknown>[], columns, 'Loans');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}.pdf"`,
      length: pdf.length,
    });
  }

  @Patch('items/:itemId')
  @ApiOperation({
    summary: 'Update loan item',
    description:
      'Update loan item details including amount, name, weights, rate, and image. Image can be replaced via multipart upload, or removed by setting removeImage to true (multipart field or JSON).',
  })
  @ApiParam({ name: 'itemId', description: 'Loan Item ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
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
    console.log("files=>", files);
    if (files.image && files.image.length > 0) {
      loanItemData.image = files.image[0];
    }

    const loanItem = await this.loanService.updateLoanItem(params.itemId, loanItemData, identity.userId);
    return plainToInstance(LoanItemResponseModel, loanItem, { excludeExtraneousValues: true });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update loan status (Open/Close)' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
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

  @Delete(':id')
  @ApiOperation({ summary: 'Delete loan by ID' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Loan deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param() params: GetLoanParamsModel, @Identity() identity: IIdentity): Promise<void> {
    this.logger.info({ params, identity }, 'delete called');
    await this.loanService.delete(params.id, identity.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan by ID' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @HttpCode(HttpStatus.OK)
  async getById(@Param() params: GetLoanParamsModel, @Identity() identity: IIdentity): Promise<LoanResponseModel> {
    this.logger.info({ params, identity }, 'getById called');
    const loan = await this.loanService.getById(params.id, identity.userId);
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Patch(':id/voucher-signatures')
  @ApiOperation({
    summary: 'Upload borrower signature and fingerprint for loan voucher',
    description: 'Stores signature (required) and optional fingerprint images in S3 and links them to the loan.',
  })
  @ApiParam({ name: 'id', description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: LoanResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Loan not found' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'signature', maxCount: 1 },
      { name: 'fingerprint', maxCount: 1 },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async uploadVoucherSignatures(
    @Param() params: GetLoanParamsModel,
    @Body() body: UploadLoanVoucherSignaturesRequestModel,
    @Identity() identity: IIdentity,
    @UploadedFiles()
    files: {
      signature?: Express.Multer.File[];
      fingerprint?: Express.Multer.File[];
    },
  ): Promise<LoanResponseModel> {
    this.logger.info({ params, identity }, 'uploadVoucherSignatures called');
    const loan = await this.loanService.uploadVoucherSignatures(
      params.id,
      identity.userId,
      body.signerName,
      files.signature?.[0],
      files.fingerprint?.[0],
      body.removeFingerprint === 'true' || body.removeFingerprint === '1',
    );
    return plainToInstance(LoanResponseModel, loan, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update loan' })
  @ApiParam({ name: 'id', description: 'Loan ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
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
}
