import { file } from "bun";
import { watch } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, normalize } from "node:path";

const ROOT = new URL("../static/", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 3000);
const HOSTNAME = process.env.HOST ?? "0.0.0.0";

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const enc = new TextEncoder();

function broadcastReload() {
  const chunk = enc.encode("event: reload\ndata: 1\n\n");
  for (const c of clients) {
    try {
      c.enqueue(chunk);
    } catch {
      clients.delete(c);
    }
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;
watch(ROOT, { recursive: true }, () => {
  if (pending) clearTimeout(pending);
  pending = setTimeout(broadcastReload, 50);
});

const RELOAD_SNIPPET = `<script>(function(){function connect(){var es=new EventSource('/__reload');es.addEventListener('reload',function(){location.reload();});es.onerror=function(){es.close();setTimeout(connect,500);};}connect();})();</script>`;

const server = Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/__reload") {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          clients.add(controller);
          controller.enqueue(enc.encode(": connected\n\n"));
        },
        cancel() {
          for (const c of clients) {
            try { c.enqueue(enc.encode("")); } catch { clients.delete(c); }
          }
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/root/index.html";
    else if (pathname.endsWith("/")) pathname += "index.html";

    const resolved = normalize(join(ROOT, pathname));
    if (!resolved.startsWith(ROOT)) return new Response("Forbidden", { status: 403 });

    const f = file(resolved);
    if (!(await f.exists())) return new Response("Not Found", { status: 404 });

    if (resolved.endsWith(".html")) {
      const html = await f.text();
      const injected = html.includes("</body>")
        ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`)
        : html + RELOAD_SNIPPET;
      return new Response(injected, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    return new Response(f, { headers: { "cache-control": "no-store" } });
  },
});

const lanAddrs = Object.values(networkInterfaces())
  .flat()
  .filter((i): i is NonNullable<typeof i> => !!i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

console.log(`Serving static/ at (auto-reload on):`);
console.log(`  quartiersrat.de  →  http://localhost:${server.port}/root/`);
console.log(`  harthof.quartiersrat.de  →  http://localhost:${server.port}/harthof/`);
for (const addr of lanAddrs) {
  console.log(`  Network: http://${addr}:${server.port}`);
}
