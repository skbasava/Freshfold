export interface LockOptionsLike {
  mode?: "exclusive" | "shared";
  ifAvailable?: boolean;
  signal?: AbortSignal;
}

export interface LockHandleLike {
  name: string;
}

export interface WebLockManagerLike {
  request<T>(
    name: string,
    options: LockOptionsLike,
    callback: (lock: LockHandleLike | null) => Promise<T> | T,
  ): Promise<T>;
}

export interface LockCoordinatorOptions {
  hubId: string;
  manager?: WebLockManagerLike;
}

export interface FeedLeaderResult<T> {
  ran: boolean;
  result?: T;
}

export interface LockCoordinator {
  withOrderLock<T>(
    orderId: string,
    fn: () => Promise<T> | T,
  ): Promise<T>;
  runAsFeedLeader<T>(
    fn: () => Promise<T> | T,
  ): Promise<FeedLeaderResult<T>>;
}

export function createInMemoryLockManager(): WebLockManagerLike {
  const held = new Set<string>();
  const waiters = new Map<string, Array<() => void>>();

  async function acquire(name: string): Promise<void> {
    while (held.has(name)) {
      await new Promise<void>((resolve) => {
        const queue = waiters.get(name) ?? [];
        queue.push(resolve);
        waiters.set(name, queue);
      });
    }
    held.add(name);
  }

  function release(name: string): void {
    held.delete(name);
    const next = waiters.get(name)?.shift();
    next?.();
  }

  return {
    async request(name, options, callback) {
      if (options.ifAvailable && held.has(name)) {
        return callback(null);
      }
      await acquire(name);
      try {
        return await callback({ name });
      } finally {
        release(name);
      }
    },
  };
}

function defaultManager(): WebLockManagerLike | undefined {
  return (
    globalThis as {
      navigator?: { locks?: WebLockManagerLike };
    }
  ).navigator?.locks;
}

export function createLockCoordinator(
  options: LockCoordinatorOptions,
): LockCoordinator {
  const manager = options.manager ?? defaultManager() ?? createInMemoryLockManager();
  const orderLock = (orderId: string): string =>
    `laundry:${options.hubId}:order:${orderId}`;
  const feedLock = `laundry:${options.hubId}:change-feed`;

  return {
    withOrderLock(orderId, fn) {
      return manager.request(
        orderLock(orderId),
        { mode: "exclusive" },
        () => fn(),
      );
    },

    async runAsFeedLeader<T>(
      fn: () => Promise<T> | T,
    ): Promise<FeedLeaderResult<T>> {
      let ran = false;
      let result: T | undefined;
      await manager.request<T | undefined>(
        feedLock,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            return undefined;
          }
          ran = true;
          result = await fn();
          return result;
        },
      );
      return ran ? { ran: true, result } : { ran: false };
    },
  };
}
