import { usersSchema, UsersSchema } from './users.schema';
import { SeedsSchema, seedsSchema } from './seeds.schema';
import { customersSchema, CustomersSchema } from './customers.schema';

export * from './users.schema';
export * from './seeds.schema';
export * from './customers.schema';
export * from './schemas';

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
];
