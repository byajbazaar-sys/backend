import { AsyncLocalStorage } from 'node:async_hooks';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';

const storage = new AsyncLocalStorage<EntityManager>();

/**
 * Carries the active transaction's EntityManager across async boundaries so a
 * service can span several repositories without any of them taking an
 * EntityManager parameter.
 */
export const TransactionalContext = {
  run<T>(manager: EntityManager, work: () => Promise<T>): Promise<T> {
    return storage.run(manager, work);
  },

  getManager(): EntityManager {
    return storage.getStore();
  },

  /**
   * Repositories are singletons, so they must resolve their working repository
   * per call. Using the injected one inside a transaction would write on a
   * different connection and commit independently of it.
   */
  repositoryFor<T extends ObjectLiteral>(target: EntityTarget<T>, fallback: Repository<T>): Repository<T> {
    const manager = storage.getStore();
    return manager ? manager.getRepository(target) : fallback;
  },
};
