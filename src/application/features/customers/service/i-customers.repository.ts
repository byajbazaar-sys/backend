import { Paged } from '@shared-libs';
import { Customer } from '../domain';
import { CustomersFilterOptions } from '../options';

export const CUSTOMERS_REPOSITORY = 'CUSTOMERS_REPOSITORY';

export interface ICustomersRepository {
  create(createCustomer: Customer): Promise<Customer>;
  findByEmail(email: string): Promise<Customer>;
  findByUserId(userId: string): Promise<Customer>;
  update(id: string, updateDto: Partial<Customer>): Promise<Customer>;
  findById(id: string): Promise<Customer>;
  listCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>>;
  delete(id: string): Promise<void>;
}
