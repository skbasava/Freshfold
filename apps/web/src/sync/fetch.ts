export interface FetchRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  credentials?: "same-origin" | "include" | "omit";
}

export type FetchLike = (
  input: string,
  init?: FetchRequestInitLike,
) => Promise<Response>;

export function defaultFetch(): FetchLike {
  return fetch as unknown as FetchLike;
}
