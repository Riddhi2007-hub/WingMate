// Stands in for Cloudflare's "cloudflare:sockets" when the Worker is run in Node for testing.
import net from 'node:net';
import tls from 'node:tls';

function wrap(socket, host) {
  const readable = new ReadableStream({
    start(controller) {
      socket.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk)));
      socket.on('end', () => { try { controller.close(); } catch {} });
      socket.on('error', (error) => { try { controller.error(error); } catch {} });
    },
  });
  const writable = new WritableStream({
    write: (chunk) => new Promise((resolve, reject) => socket.write(chunk, (e) => (e ? reject(e) : resolve()))),
    close: () => { socket.end(); },
  });
  return {
    readable,
    writable,
    startTls() {
      socket.removeAllListeners('data'); // the plain stream is finished; the TLS handshake reads from the raw socket
      const secure = tls.connect({ socket, rejectUnauthorized: false, ...(net.isIP(host) ? {} : { servername: host }) });
      return wrap(secure, host);
    },
    close: async () => { socket.destroy(); },
  };
}

export function connect(address, options = {}) {
  const { hostname, port } = address;
  const socket = options.secureTransport === 'on' ? tls.connect({ host: hostname, port, rejectUnauthorized: false }) : net.connect({ host: hostname, port });
  return wrap(socket, hostname);
}
