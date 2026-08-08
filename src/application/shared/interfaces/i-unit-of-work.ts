export const UNIT_OF_WORK = 'IUnitOfWork';

export interface IUnitOfWork {
  /**
   * Runs `work` so that every repository write inside it commits together or
   * not at all. Nesting is safe: an inner call joins the outer transaction
   * instead of opening a second one.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
