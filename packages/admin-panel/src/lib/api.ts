export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(status: number, error: string, field?: string) {
    super(error);
    this.status = status;
    this.field = field;
  }
}

let token: string | null = sessionStorage.getItem("admin_token");

export function setAuthToken(t: string | null) {
  token = t;
  if (t) sessionStorage.setItem("admin_token", t);
  else sessionStorage.removeItem("admin_token");
}

export function getAuthToken(): string | null { return token; }

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null as T;
  let data: unknown = null;
  try {
    const clone = res.clone();
    const text = await clone.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    // fallback: try reading original body
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      // body unavailable
    }
  }
  if (!res.ok) {
    const d = data as Record<string, unknown> | null;
    throw new ApiError(res.status, (d && (d.error as string)) || res.statusText, (d && (d.field as string)) || undefined);
  }
  return data as T;
}

export const api = {
  get:  <T>(p: string)            => send<T>("GET", p),
  post: <T>(p: string, body?: unknown) => send<T>("POST", p, body ?? {}),
  patch:<T>(p: string, body?: unknown) => send<T>("PATCH", p, body ?? {}),
  put:  <T>(p: string, body?: unknown) => send<T>("PUT", p, body ?? {}),
  del:  <T>(p: string)            => send<T>("DELETE", p),
};
