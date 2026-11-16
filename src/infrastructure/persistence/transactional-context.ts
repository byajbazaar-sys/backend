import { AsyncLocalStorage } from 'node:async_hooks';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

/** The active transaction and the work queued to run once it commits. */
interface TransactionScope {
  manager: EntityManager;
  afterCommit: (() => Promise<void>)[];
}

const storage = new AsyncLocalStorage<TransactionScope>();

/**
 * Carries the active transaction's EntityManager across async boundaries so a
 * service can span several repositories without any of them taking an
 * EntityManager parameter.
 */
export const TransactionalContext = {
  run<T>(manager: EntityManager, work: () => Promise<T>, afterCommit: (() => Promise<void>)[] = []): Promise<T> {
    return storage.run({ manager, afterCommit }, work);
  },

  getManager(): EntityManager | undefined {
    return storage.getStore()?.manager;
  },

  /**
   * Runs `callback` once the active transaction has committed (never if it rolls back), or right away when
   * there is no transaction. Used for side effects that live outside the main database, like the logs database.
   */
  async afterCommit(callback: () => Promise<void>): Promise<void> {
    const scope = storage.getStore();
    if (scope) {
      scope.afterCommit.push(callback);
      return;
    }
    await callback();
  },

  /**
   * Repositories are singletons, so they must resolve their working repository
   * per call. Using the injected one inside a transaction would write on a
   * different connection and commit independently of it.
   */
  repositoryFor<T extends ObjectLiteral>(target: EntityTarget<T>, fallback: Repository<T>): Repository<T> {
    const manager = storage.getStore()?.manager;
    return manager ? manager.getRepository(target) : fallback;
  },
};
