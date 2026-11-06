import http from "node:http";
import net from "node:net";
import { lookup } from "node:dns/promises";

function publicIPv4(address: string): boolean {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2))))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}

// Chromium uses this temporary proxy so uploaded scripts cannot reach other local services.
// The work's own HTTP path is allowed; external assets must resolve to public IPv4 addresses.
export async function thumbnailNetwork(target: URL): Promise<{ url: string; close: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const track = (socket: net.Socket) => { sockets.add(socket); socket.on("error", () => socket.destroy()); socket.once("close", () => sockets.delete(socket)); return socket; };
  async function address(url: URL): Promise<string> {
    if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Blocked destination");
    const own = url.origin === target.origin;
    if (own && url.protocol === "http:" && !url.pathname.startsWith(target.pathname)) throw new Error("Blocked application path");
    const entries = await lookup(url.hostname, { all: true, family: 4 });
    if (!entries.length || (!own && entries.some(entry => !publicIPv4(entry.address)))) throw new Error("Blocked private destination");
    return entries[0].address;
  }
  const proxy = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? ""), ip = await address(url);
      if (url.protocol !== "http:") throw new Error("Unsupported proxy request");
      const outgoing = http.request({ hostname: ip, port: url.port || 80, path: url.pathname + url.search,
        method: req.method, headers: { ...req.headers, host: url.host }, agent: false, timeout: 3000 }, response => {
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
      });
      outgoing.on("socket", track);
      outgoing.on("timeout", () => outgoing.destroy());
      outgoing.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on("aborted", () => outgoing.destroy()); req.on("error", () => outgoing.destroy());
      res.on("close", () => outgoing.destroy()); req.pipe(outgoing);
    })().catch(() => { res.writeHead(403); res.end(); });
  });
  proxy.on("connection", track);
  proxy.on("connect", (req, socket, head) => {
    void (async () => {
      const url = new URL(`https://${req.url}/`);
      // Private HTTPS origins cannot be safely restricted to a work path inside a TLS tunnel.
      const entries = await lookup(url.hostname, { all: true, family: 4 });
      if (Number(url.port || 443) !== 443 || !entries.length || entries.some(entry => !publicIPv4(entry.address))) throw new Error("Blocked tunnel");
      const upstream = track(net.connect({ host: entries[0].address, port: 443 }));
      upstream.setTimeout(3000, () => upstream.destroy());
      upstream.once("error", () => socket.destroy());
      upstream.once("connect", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head); upstream.pipe(socket); socket.pipe(upstream);
      });
      socket.once("close", () => upstream.destroy());
    })().catch(() => { socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  });
  proxy.on("upgrade", (_req, socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(0, "127.0.0.1", resolve); });
  const port = (proxy.address() as net.AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  } };
}
