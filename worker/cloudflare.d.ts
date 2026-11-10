// The small part of Cloudflare's runtime types this project uses (so no extra package is needed to type-check).
interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface ScheduledController {
  scheduledTime: number;
  cron: string;
}
declare module 'cloudflare:sockets' {
  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    startTls(): Socket;
    close(): Promise<void>;
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean }): Socket;
}
