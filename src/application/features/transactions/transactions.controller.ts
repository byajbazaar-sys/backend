import { UseGuards, Controller, Post, HttpStatus, HttpCode, Body, Inject, Get, Param, Query, BadRequestException, StreamableFile, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags, ApiOperation, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserAuthGuard, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateTransactionRequestModel,
  DownloadTransactionsQueryRequestModel,
  ListTransactionsQueryRequestModel,
  TransactionResponseModel,
  TransactionsPagedResponseModel,
  DuesPagedResponseModel,
  DueResponseModel,
  GetDueParamsModel,
  ListDuesQueryRequestModel,
} from './models';
import { ITransactionService, TRANSACTION_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { Transaction } from './domain';
import { DuesFilterOptions, TransactionsFilterOptions, TransactionsDownloadFilterOptions } from './options';
import { toCSV, toPDF, IPdfColumnConfig } from '@shared-libs';
import { ExportFormat } from '../../shared';
import { ETransactionType } from './enums';

@ApiTags('transactions')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, UserAuthGuard, RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    @InjectPinoLogger(TransactionsController.name) private readonly logger: PinoLogger,
    @Inject(TRANSACTION_SERVICE) private readonly transactionService: ITransactionService,
  ) { }

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: HttpStatus.CREATED, type: TransactionResponseModel })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateTransactionRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<TransactionResponseModel> {
    this.logger.info({ body, identity }, 'create called');
    const transactionData = plainToInstance(Transaction, body, {
      excludeExtraneousValues: true,
    });

    if (!transactionData.loanId && !transactionData.dueId) {
      throw new BadRequestException('Loan ID or Due ID is required');
    }

    if (transactionData.transactionType === ETransactionType.DUE_PAYMENT || transactionData.dueId) {
      if (!transactionData.dueId) {
        throw new BadRequestException('Due ID is required for due payment');
      }
      if (transactionData.transactionType !== ETransactionType.DUE_PAYMENT) {
        throw new BadRequestException('Transaction type must be due payment for due ID');
      }
    }

    transactionData.createdBy = identity.userId;
    const transaction = await this.transactionService.create(transactionData);
    return plainToInstance(TransactionResponseModel, transaction, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all transactions with pagination, sorting, and filtering' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a paginated list of transactions with optional sorting and filtering',
    type: TransactionsPagedResponseModel,
  })
  @HttpCode(HttpStatus.OK)
  async getTransactions(
    @Query() query: ListTransactionsQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<TransactionsPagedResponseModel> {
    this.logger.info({ query }, 'getTransactions called');
    const filterOptions = plainToInstance(TransactionsFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    return plainToInstance(
      TransactionsPagedResponseModel,
      await this.transactionService.getTransactions(filterOptions),
      {
        excludeExtraneousValues: true,
      },
    );
  }

  @Get('download')
  @ApiOperation({ summary: 'Download transactions list as CSV or PDF' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns file attachment (csv or pdf)',
  })
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')
  async downloadTransactions(
    @Query() query: DownloadTransactionsQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<StreamableFile> {
    this.logger.info({ query }, 'downloadTransactions called');
    const filterOptions = plainToInstance(TransactionsDownloadFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    const transactions = await this.transactionService.getTransactionsForDownload(filterOptions);
    const items = plainToInstance(TransactionResponseModel, transactions, {
      excludeExtraneousValues: true,
    });
    const filename = `transactions-${Date.now()}`;
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
      customer: (v: unknown) =>
        v ? `${(v as { firstName?: string })?.firstName ?? ''} ${(v as { lastName?: string })?.lastName ?? ''}`.trim() : '',
    };
    const columns: IPdfColumnConfig[] = [
      { header: 'ID', key: 'id', width: 55, formatter: fmt.truncateId },
      { header: 'Loan ID', key: 'loanId', width: 55, formatter: fmt.truncateId },
      { header: 'Amount', key: 'amount', width: 60, formatter: fmt.formatNum },
      { header: 'Type', key: 'transactionType', width: 55 },
      { header: 'Paid In', key: 'paidIn', width: 50 },
      { header: 'Date', key: 'createdAt', width: 75, formatter: fmt.formatDate },
      { header: 'Customer', key: 'customer', width: 100, formatter: fmt.customer },
    ];
    const pdf = await toPDF(items as unknown as Record<string, unknown>[], columns, 'Transactions');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}.pdf"`,
      length: pdf.length,
    });
  }

  @Get('dues')
  @ApiOperation({ summary: 'Get upcoming and past dues with pagination' })
  @ApiOkResponse({ type: DuesPagedResponseModel })
  @HttpCode(HttpStatus.OK)
  async getDues(
    @Query() query: ListDuesQueryRequestModel,
    @Identity() identity: IIdentity,
  ): Promise<DuesPagedResponseModel> {
    this.logger.info({ query }, 'getDues called');
    const filterOptions = plainToInstance(DuesFilterOptions, query, {
      excludeExtraneousValues: true,
    });
    filterOptions.createdBy = identity.userId;
    return plainToInstance(DuesPagedResponseModel, await this.transactionService.getDues(filterOptions), {
      excludeExtraneousValues: true,
    });
  }

  @Get('dues/:id')
  @ApiOperation({ summary: 'Get due details by ID' })
  @ApiParam({ name: 'id', description: 'Due ID', example: 'c6cdd6bc-2339-4424-8134-7cbc1f26c327' })
  @ApiOkResponse({ type: DueResponseModel })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Due not found' })
  @HttpCode(HttpStatus.OK)
  async getDueById(
    @Param() params: GetDueParamsModel,
    @Identity() identity: IIdentity,
  ): Promise<DueResponseModel> {
    this.logger.info({ params, identity }, 'getDueById called');
    const due = await this.transactionService.getDueById(params.id, identity.userId);
    return plainToInstance(DueResponseModel, due, {
      excludeExtraneousValues: true,
    });
  }
}
