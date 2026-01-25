import { Paged } from '@shared-libs';
import { Customer } from '../domain';
import { CreateCustomerRequestModel, UpdateCustomerRequestModel } from '../models';
import { CustomersFilterOptions } from '../options';

export const CUSTOMER_SERVICE = 'ICustomerService';

export interface ICustomerService {
  create(data: Customer): Promise<Customer>;
  getById(id: string, createdBy: string): Promise<Customer>;
  getCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>>;
  update(id: string, body: Customer): Promise<Customer>;
  delete(id: string, createdBy: string): Promise<void>;
}
