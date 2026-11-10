import net from 'node:net';
import tls from 'node:tls';
import type { SmtpSocket } from '../smtp';

function wrap(socket: net.Socket, host: string): SmtpSocket {
  const queue: Array<string | null> = [];
  let waiter: ((value: string | null) => void) | null = null;
  let failure: Error | null = null;
  const push = (value: string | null): void => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(value);
    } else queue.push(value);
  };
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => push(chunk));
  socket.on('end', () => push(null));
  socket.on('close', () => push(null));
  socket.on('error', (error) => {
    failure = error;
    push(null);
  });
  return {
    read: () => {
      if (queue.length) return Promise.resolve(queue.shift() ?? null);
      if (failure) return Promise.reject(failure);
      return new Promise((resolve) => {
        waiter = resolve;
      });
    },
    write: (data) =>
      new Promise((resolve, reject) => {
        socket.write(data, (error) => (error ? reject(error) : resolve()));
      }),
    startTls: () =>
      new Promise((resolve, reject) => {
        const secure = tls.connect({ socket, servername: host });
        secure.once('secureConnect', () => resolve(wrap(secure, host)));
        secure.once('error', reject);
      }),
    close: () => socket.destroy(),
  };
}

/** Opens a connection to the mail server (port 465 is TLS from the start; other ports start plain and may upgrade). */
export function openNodeSocket(host: string, port: number): Promise<SmtpSocket> {
  return new Promise((resolve, reject) => {
    const socket: net.Socket = port === 465 ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    socket.once('error', reject);
    socket.once(port === 465 ? 'secureConnect' : 'connect', () => {
      socket.removeListener('error', reject);
      resolve(wrap(socket, host));
    });
  });
}
