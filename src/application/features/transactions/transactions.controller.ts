import { UseGuards, Controller, Post, HttpStatus, HttpCode, Body, Inject, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiResponse, ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { USER_STRATEGY, RolesGuard, Identity, IIdentity } from '@shared-libs';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  CreateTransactionRequestModel,
  ListTransactionsQueryRequestModel,
  TransactionResponseModel,
  TransactionsPagedResponseModel,
} from './models';
import { ITransactionService, TRANSACTION_SERVICE } from './service';
import { plainToInstance } from 'class-transformer';
import { Transaction } from './domain';
import { DuesFilterOptions, TransactionsFilterOptions } from './options';
import { Types } from 'mongoose';
import { DuesPagedResponseModel, ListDuesQueryRequestModel } from './models';
import { ETransactionType } from './enums';

@ApiTags('transactions')
@ApiBearerAuth('user')
@UseGuards(ThrottlerGuard, AuthGuard(USER_STRATEGY), RolesGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    @InjectPinoLogger(TransactionsController.name) private readonly logger: PinoLogger,
    @Inject(TRANSACTION_SERVICE) private readonly transactionService: ITransactionService,
  ) {}

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

    if(!transactionData.loanId && !transactionData.dueId) {
      throw new BadRequestException('Loan ID or Due ID is required');
    }

    if(transactionData.transactionType === ETransactionType.DUE_PAYMENT || transactionData.dueId) {
      if(!transactionData.dueId) {
        throw new BadRequestException('Due ID is required for due payment');
      }
      if(transactionData.transactionType !== ETransactionType.DUE_PAYMENT) {
        throw new BadRequestException('Transaction type must be due payment for due ID');
      }
    }

    transactionData._id = new Types.ObjectId();
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
}
