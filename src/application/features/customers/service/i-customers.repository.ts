import { Paged } from '@shared-libs';
import { Customer } from '../domain';
import { CustomersFilterOptions, CustomersDownloadFilterOptions } from '../options';

export const CUSTOMERS_REPOSITORY = 'CUSTOMERS_REPOSITORY';

export interface ICustomersRepository {
  create(createCustomer: Customer): Promise<Customer>;
  findByEmail(email: string): Promise<Customer>;
  update(id: string, updateDto: Customer, createdBy: string): Promise<Customer>;
  findById(id: string, createdBy: string): Promise<Customer>;
  listCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>>;
  listAllCustomers(params: CustomersDownloadFilterOptions): Promise<Customer[]>;
  delete(id: string, createdBy: string): Promise<void>;
}
