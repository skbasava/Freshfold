import {
  classifyHttpStatus,
  classifyThrownError,
  ProviderSendError,
} from "./errors";
import type { FetchLike } from "./types";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

type PostJsonInput = {
  fetcher: FetchLike;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
};

export async function postProviderJson({
  fetcher,
  url,
  headers,
  body,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
}: PostJsonInput): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw classifyThrownError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function readProviderMessageId(
  response: Response,
  extract: (body: unknown) => string | null | undefined,
): Promise<string> {
  if (!response.ok) {
    throw classifyHttpStatus(
      response.status,
      response.headers.get("retry-after"),
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ProviderSendError(
      "terminal",
      "provider_response_invalid",
    );
  }

  const id = extract(parsed);
  if (!id) {
    throw new ProviderSendError(
      "terminal",
      "provider_response_invalid",
    );
  }

  return id;
}
