/**
 * The one place the app talks to the backend.
 *
 * In development Vite proxies /api to the Express server (see vite.config.ts),
 * so the default base URL works with no configuration. Set VITE_API_BASE_URL
 * when the API lives somewhere else.
 */

const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE_URL = configured && configured.length > 0 ? configured.replace(/\/+$/, "") : "/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Notified when any request comes back 401 — registered by the auth store. */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Could not reach the memory service. Check that the API server is running.",
      0
    );
  }

  if (!response.ok) {
    // 401 means the session is gone (expired, or signed out elsewhere):
    // the auth store re-asks the server and the sign-in screen appears.
    if (response.status === 401) unauthorizedHandler?.();
    let message = `The memory service refused that request (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Not JSON — keep the generic message.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });
}

export function apiDelete(path: string): Promise<void> {
  return request<void>(path, { method: "DELETE" });
}

/** Turns anything thrown by the client above into something worth showing. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}
