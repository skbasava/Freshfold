export interface AccessTokenStore {
  get(): string | null;
  set(token: string | null): void;
}

export function createAccessTokenStore(
  initial: string | null = null,
): AccessTokenStore {
  let token = initial;
  return {
    get: () => token,
    set(next) {
      token = next;
    },
  };
}
