import http from "node:http";
import net from "node:net";
import { expect, it } from "vitest";
import { thumbnailNetwork } from "./thumbnail-network";

it("allows the selected local work but blocks local administration and metadata destinations", async () => {
  const app = http.createServer((_req, res) => res.end("work"));
  await new Promise<void>(resolve => app.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(app.address() as net.AddressInfo).port}`;
  const proxy = await thumbnailNetwork(new URL(origin + "/p/demo/"));
  async function status(url: string) {
    return new Promise<number>((resolve, reject) => {
      http.get(proxy.url, { path: url }, res => { res.resume(); resolve(res.statusCode!); }).on("error", reject);
    });
  }
  try {
    expect(await status(origin + "/p/demo/?preview=1")).toBe(200);
    expect(await status(origin + "/p/demo/style.css")).toBe(200);
    expect(await status(origin + "/api/admin")).toBe(403);
    expect(await status("http://169.254.169.254/latest/meta-data/")).toBe(403);
    expect(await status("http://100.100.100.200/")).toBe(403);
    expect(await status("http://127.0.0.1:1/")).toBe(403);
  } finally { await proxy.close(); await new Promise<void>(resolve => app.close(() => resolve())); }
});
