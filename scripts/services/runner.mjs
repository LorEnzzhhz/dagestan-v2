import { readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";

const [, , blobPath, defaultPortArg, label] = process.argv;
if (!blobPath || !defaultPortArg) {
  console.error("usage: runner.mjs <blob.cjs.src> <defaultPort> [label]");
  process.exit(2);
}
const DEFAULT_PORT = parseInt(defaultPortArg, 10);
const NAME = label || blobPath.split("/").pop();

let src = readFileSync(blobPath, "utf8");

const listenRe = /\.listen\(\s*(\d+)\s*,\s*['"]0\.0\.0\.0['"]/g;
const ports = [];
let m;
while ((m = listenRe.exec(src)) !== null) ports.push(parseInt(m[1], 10));

const env = { ...process.env, DAGESTAN_NAME: NAME };
src = src.replace(listenRe, (full, port) => {
  const p = parseInt(port, 10);
  return `.listen(process.env['PORT_${p}'] || ${p}, '0.0.0.0'`;
});

const CONTROL = parseInt(process.env.CONTROL || (ports[0] + 1000), 10);
const postlude = `\nconsole.log('[${NAME}] listen ports: [${ports.join(", ")}]  control=${CONTROL}');\n`;

const dir = mkdtempSync(join(tmpdir(), "dag-svc-"));
const tmp = join(dir, "service.cjs");
writeFileSync(tmp, src + postlude);

// Copy the shared/ folder next to the tmp service so relative require works
try {
  cpSync(join(process.cwd(), "scripts", "services", "shared"), join(dir, "shared"), { recursive: true });
} catch (e) {
  console.error(`[${NAME}] warn: could not copy shared/ -> ${e.message}`);
}

const ctrl = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, name: NAME, ports, control: CONTROL }));
  }
  if (req.method === "POST" && req.url === "/shutdown") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, action: "shutdown" }));
    setTimeout(() => { try { child.kill("SIGTERM"); } catch {} setTimeout(() => process.exit(0), 200); }, 50);
    return;
  }
  if (req.method === "POST" && req.url === "/restart") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, action: "restart" }));
    setTimeout(() => { try { child.kill("SIGTERM"); } catch {} }, 50);
    return;
  }
  res.writeHead(404); res.end("not found");
});

ctrl.on("error", (e) => {
  if (e.code === "EADDRINUSE") { console.error(`[${NAME}] control port ${CONTROL} in use — exiting`); process.exit(11); }
});
ctrl.listen(CONTROL, "127.0.0.1", () => { console.log(`[${NAME}] control up on 127.0.0.1:${CONTROL}`); });

let child;
let respawned = false;
function spawnChild() {
  child = spawn(process.execPath, [tmp], { env, stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code, signal) => {
    if (!respawned) { respawned = true; console.log(`[${NAME}] child exited code=${code} signal=${signal} — respawning`); setTimeout(spawnChild, 250); return; }
    console.log(`[${NAME}] child exited code=${code} signal=${signal} — giving up`);
    process.exit(code ?? 0);
  });
}
spawnChild();
process.on("SIGTERM", () => { try { child.kill("SIGTERM"); } catch {} });
process.on("SIGINT",  () => { try { child.kill("SIGINT");  } catch {} });
