import { connect, type Socket } from 'cloudflare:sockets';
import type { SmtpSocket } from '../server/smtp';

function wrap(socket: Socket): SmtpSocket {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  return {
    async read() {
      const { value, done } = await reader.read();
      return done || !value ? null : decoder.decode(value, { stream: true });
    },
    write: (data) => writer.write(encoder.encode(data)),
    async startTls() {
      // free the streams of the plain connection, then switch it to TLS
      reader.releaseLock();
      writer.releaseLock();
      return wrap(socket.startTls());
    },
    close() {
      void socket.close().catch(() => undefined);
    },
  };
}

/** Opens a connection to the mail server (port 465 is TLS from the start; other ports start plain and upgrade with STARTTLS). */
export async function openWorkerSocket(host: string, port: number): Promise<SmtpSocket> {
  return wrap(connect({ hostname: host, port }, { secureTransport: port === 465 ? 'on' : 'starttls', allowHalfOpen: false }));
}
