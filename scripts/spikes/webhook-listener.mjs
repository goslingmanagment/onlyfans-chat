// Phase-0 webhook smoke test listener (PLAN item 4). Read-only spike infrastructure:
// receives OFAPI webhook deliveries via a cloudflared quick tunnel, verifies the
// HMAC-SHA256 signature against the raw body, and journals every delivery to
// tmp/webhooks/ (gitignored — raw payloads carry fan PII; fixtures are anonymized
// separately before any commit).
//
// Access protection: unguessable token path + HMAC signature verification.
// Usage: node webhook-listener.mjs  (env: HOOK_TOKEN, SIGNING_SECRET, PORT)
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.HOOK_TOKEN;
const SECRET = process.env.SIGNING_SECRET;
if (!TOKEN || !SECRET) {
  console.error('HOOK_TOKEN and SIGNING_SECRET are required');
  process.exit(1);
}

const outDir = join(process.cwd(), 'tmp', 'webhooks');
mkdirSync(outDir, { recursive: true });
let seq = 0;

const server = createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== `/hook/${TOKEN}`) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    const raw = Buffer.concat(chunks);
    const computed = createHmac('sha256', SECRET).update(raw).digest('hex');
    let signatureHeader = null;
    let hmacValid = false;
    for (const [name, value] of Object.entries(req.headers)) {
      const v = Array.isArray(value) ? value[0] : value;
      if (typeof v === 'string' && v.length === computed.length) {
        try {
          if (timingSafeEqual(Buffer.from(v), Buffer.from(computed))) {
            signatureHeader = name;
            hmacValid = true;
            break;
          }
        } catch {
          /* length mismatch race — ignore */
        }
      }
    }
    let body = null;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      /* keep raw only */
    }
    const event = body?.event ?? 'unknown';
    seq += 1;
    const file = join(outDir, `${String(seq).padStart(4, '0')}-${event.replaceAll('.', '_')}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          receivedAt: new Date().toISOString(),
          hmacValid,
          signatureHeader,
          headers: req.headers,
          body,
          raw: body ? undefined : raw.toString('utf8'),
        },
        null,
        2,
      ),
    );
    console.log(`${new Date().toISOString()} ${event} hmac=${hmacValid ? 'ok' : 'MISSING/BAD'} -> ${file}`);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`listening on 127.0.0.1:${PORT} path /hook/${TOKEN.slice(0, 6)}…`);
});
