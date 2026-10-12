import type { Server } from "node:http";
import { isIP } from "node:net";
export function validProxyRange(value: string) {
  const [address, prefix, extra] = value.split("/");
  const version = isIP(address);
  if (!version || extra !== undefined) return false;
  if (prefix === undefined) return true;
  return (
    /^\d+$/.test(prefix) &&
    Number(prefix) > 0 &&
    Number(prefix) <= (version === 4 ? 32 : 128)
  );
}
export function configureHttpServer(server: Server) {
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 100;
  server.setTimeout(90_000);
}
