import { Paged } from '@shared-libs';

import { Customer } from '../domain';
import { CustomersFilterOptions, CustomersDownloadFilterOptions } from '../options';

export const CUSTOMER_SERVICE = 'ICustomerService';

export interface ICustomerService {
  create(data: Customer): Promise<Customer>;
  getById(id: string, createdBy: string): Promise<Customer>;
  getCustomers(params: CustomersFilterOptions): Promise<Paged<Customer>>;
  getCustomersForDownload(params: CustomersDownloadFilterOptions): Promise<Customer[]>;
  update(id: string, body: Customer): Promise<Customer>;
  delete(id: string, createdBy: string): Promise<void>;
}
