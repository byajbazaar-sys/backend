import { DEFAULT_PAGE_NUMBER, DEFAULT_PAGE_SIZE } from 'libs/constants';

import { IPaginationParams } from './i-pagination-params';
import { IPaginationResult } from './i-pagination-result';

export function getPaginationValues(params: IPaginationParams): IPaginationResult {
  const pageNumber = params?.pageNumber && params.pageNumber > 0 ? params.pageNumber : DEFAULT_PAGE_NUMBER;

  const pageSize = params?.pageSize && params.pageSize > 0 ? params.pageSize : DEFAULT_PAGE_SIZE;

  const offset = (pageNumber - 1) * pageSize;
  const skip = offset > 0 ? Math.abs(offset) : 0;

  return { pageNumber, pageSize, skip };
}
