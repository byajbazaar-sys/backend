import { usersSchema, UsersSchema } from './users.schema';
import { SeedsSchema, seedsSchema } from './seeds.schema';
import { customersSchema, CustomersSchema } from './customers.schema';
import { loansSchema, LoansSchema } from './loans.schema';
import { loanItemsSchema, LoanItemsSchema } from './loan-items.schema';
import { transactionsSchema, TransactionsSchema } from './transactions.schema';
import { duesSchema, DuesSchema } from './dues.schema';

export * from './users.schema';
export * from './seeds.schema';
export * from './customers.schema';
export * from './loans.schema';
export * from './loan-items.schema';
export * from './schemas';
export * from './transactions.schema';
export * from './dues.schema';

export default [
  {
    name: UsersSchema.name,
    schema: usersSchema,
  },
  {
    name: SeedsSchema.name,
    schema: seedsSchema,
  },
  {
    name: CustomersSchema.name,
    schema: customersSchema,
  },
  {
    name: LoansSchema.name,
    schema: loansSchema,
  },
  {
    name: LoanItemsSchema.name,
    schema: loanItemsSchema,
  },
  {
    name: TransactionsSchema.name,
    schema: transactionsSchema,
  },
  {
    name: DuesSchema.name,
    schema: duesSchema,
  }
];
