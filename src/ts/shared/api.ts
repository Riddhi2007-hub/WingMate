/** Thin wrapper over fetch for the WingMate server (same origin, cookie session, JSON). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function api<T = unknown>(method: Method, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, 'offline', 'Cannot reach the WingMate server. Check your connection, or start the server with npm start.');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; field?: string };
    throw new ApiError(res.status, d.error ?? 'error', d.message ?? 'Something went wrong. Please try again.', d.field);
  }
  return data as T;
}

/** The airline theme folder this page is in (for example "airasia"), sent so emailed links come back to the same theme. */
export const brandFolder = (): string => location.pathname.split('/').filter(Boolean).slice(-2, -1)[0] ?? '';
