/**
 * Shared API client for the NightWise FastAPI backend.
 *
 * Base URL is read from the VITE_API_URL environment variable.
 * Falls back to http://localhost:8000 for local development.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`API error ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/**
 * Typed JSON request helper.
 * Throws ApiError for non-2xx responses.
 * Throws the native TypeError for network failures.
 */
export async function apiRequest<TResponse>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  customHeaders?: Record<string, string>,
): Promise<TResponse> {
  const url = `${BASE_URL}${path}`;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(customHeaders || {}),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(url, init);

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { detail?: string | Array<{ msg?: string }> };
      if (typeof json.detail === "string") {
        detail = json.detail;
      } else if (Array.isArray(json.detail)) {
        detail = json.detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ");
      }
    } catch {
      // ignore parse failure — keep statusText
    }
    throw new ApiError(res.status, detail);
  }

  // 204 No Content — return undefined cast to TResponse
  if (res.status === 204) return undefined as TResponse;

  return res.json() as Promise<TResponse>;
}
