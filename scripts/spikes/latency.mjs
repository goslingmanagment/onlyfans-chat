// Phase-0 latency spike (PLAN item 3). STRICTLY READ-ONLY: GET requests only.
// Measures p50/p95 for list-chats, list-messages(100), user-details over ~200 calls,
// records credit burn, and answers the live shape questions:
//   - is lastReplyAt present on chats?
//   - any pinned/priority flag source on the chat object?
//   - are thumbs.onlyfans.com / public.onlyfans.com fetchable directly?
//   - does a historical tip message carry an amount field?
// All raw logs go to tmp/ (gitignored — PII rule).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.ONLYFANSAPI_API_KEY;
if (!KEY) throw new Error('ONLYFANSAPI_API_KEY required');
const BASE = 'https://app.onlyfansapi.com/api';
const outDir = join(process.cwd(), 'tmp');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function timedGet(path) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const text = await res.text();
  const ms = performance.now() - t0;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return {
    path,
    ms: Math.round(ms),
    status: res.status,
    creditsUsed: res.headers.get('x-ofapi-credits-used'),
    balance: res.headers.get('x-ofapi-credits-balance'),
    json,
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(samples) {
  const ok = samples.filter((s) => s.status === 200).map((s) => s.ms).sort((a, b) => a - b);
  return {
    calls: samples.length,
    ok: ok.length,
    errors: samples.filter((s) => s.status !== 200).map((s) => ({ status: s.status, path: s.path })),
    p50: percentile(ok, 50),
    p95: percentile(ok, 95),
    min: ok[0] ?? null,
    max: ok[ok.length - 1] ?? null,
    mean: ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null,
  };
}

const report = { startedAt: new Date().toISOString() };

// --- 0. accounts (coexistence evidence + account id) ---
const accounts = await timedGet('/accounts');
const acct = (Array.isArray(accounts.json) ? accounts.json : accounts.json?.data ?? []).find(
  (a) => a.is_authenticated,
);
if (!acct) throw new Error('no authenticated account');
report.account = {
  id: acct.id,
  username: acct.onlyfans_username,
  is_authenticated: acct.is_authenticated,
  authentication_progress: acct.authentication_progress,
};
console.log(`account: ${acct.id} (${acct.onlyfans_username}) auth=${acct.is_authenticated}`);
const A = acct.id;

report.balanceStart = null;

// --- 1. shape probe: one chats page, keep sanitized copy ---
const probe = await timedGet(`/${A}/chats?limit=50&order=recent`);
report.balanceStart = Number(probe.balance);
const chats = probe.json?.data ?? [];
writeFileSync(join(outDir, 'probe-chats.json'), JSON.stringify(probe.json, null, 2));
const chatKeys = chats[0] ? Object.keys(chats[0]) : [];
report.shapes = {
  chatCount: chats.length,
  chatObjectKeys: chatKeys,
  lastReplyAtPresent: chats.some((c) => c.lastReplyAt != null),
  lastReplyAtValues: chats.slice(0, 5).map((c) => c.lastReplyAt ?? null),
  pinnedFlagCandidates: chats[0]
    ? Object.fromEntries(
        Object.entries(chats[0]).filter(([k]) => /pin|priorit|list/i.test(k)),
      )
    : {},
  fanListsStatesSample: chats.find((c) => c.fan?.listsStates?.length)?.fan?.listsStates ?? null,
  canSendMessageSample: chats.slice(0, 5).map((c) => c.canSendMessage),
};

// pick busiest chats for message fetches
const chatIds = chats
  .filter((c) => c.lastMessage)
  .map((c) => c.fan?.id ?? c.withUser?.id)
  .filter(Boolean);
if (chatIds.length === 0) throw new Error('no chats with messages found');
const fanUsernames = chats
  .map((c) => c.fan?.username ?? c.withUser?.username)
  .filter(Boolean)
  .slice(0, 10);

// --- 2. timed loops (~200 calls total) ---
const N_CHATS = 70;
const N_MSGS = 70;
const N_USERS = 60;

const listChatSamples = [];
for (let i = 0; i < N_CHATS; i++) {
  listChatSamples.push(await timedGet(`/${A}/chats?limit=50&order=recent`));
  await sleep(120);
}
console.log('list-chats done');

const msgSamples = [];
for (let i = 0; i < N_MSGS; i++) {
  const id = chatIds[i % chatIds.length];
  msgSamples.push(await timedGet(`/${A}/chats/${id}/messages?limit=100&order=desc`));
  await sleep(120);
}
console.log('list-messages done');

const userSamples = [];
for (let i = 0; i < N_USERS; i++) {
  const u = fanUsernames[i % fanUsernames.length];
  userSamples.push(await timedGet(`/${A}/users/${encodeURIComponent(u)}`));
  await sleep(120);
}
console.log('user-details done');

report.latency = {
  'list-chats(50)': stats(listChatSamples),
  'list-messages(100)': stats(msgSamples),
  'user-details': stats(userSamples),
};
const lastBalance = [...userSamples].reverse().find((s) => s.balance)?.balance;
report.balanceEnd = Number(lastBalance);
report.creditsBurned = report.balanceStart - report.balanceEnd;

// keep one sanitized-ish sample of each for shape work (tmp only, PII ok there)
writeFileSync(join(outDir, 'probe-messages.json'), JSON.stringify(msgSamples.at(-1)?.json, null, 2));
writeFileSync(join(outDir, 'probe-user.json'), JSON.stringify(userSamples.at(-1)?.json, null, 2));

// --- 3. media host probe ---
const mediaUrls = [];
for (const c of chats) {
  const av = c.fan?.avatar ?? c.withUser?.avatar;
  if (av) mediaUrls.push(av);
  const thumbs = c.fan?.avatarThumbs ?? c.withUser?.avatarThumbs;
  if (thumbs) mediaUrls.push(...Object.values(thumbs));
}
const hostProbe = [];
const seenHosts = new Set();
for (const url of mediaUrls) {
  let host;
  try {
    host = new URL(url).host;
  } catch {
    continue;
  }
  if (seenHosts.has(host)) continue;
  seenHosts.add(host);
  try {
    const t0 = performance.now();
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    hostProbe.push({
      host,
      status: res.status,
      contentType: res.headers.get('content-type'),
      bytes: (await res.arrayBuffer()).byteLength,
      ms: Math.round(performance.now() - t0),
    });
  } catch (e) {
    hostProbe.push({ host, error: String(e) });
  }
}
report.mediaHosts = hostProbe;

// --- 4. tip message hunt ---
// strategy A: transactions of type tips → find chat tips; strategy B: scan fetched messages for isTip
const tipScan = msgSamples
  .flatMap((s) => s.json?.data?.list ?? s.json?.data ?? [])
  .filter((m) => m && typeof m === 'object');
const tipMessage = tipScan.find((m) => m.isTip === true) ?? null;
const tx = await timedGet(`/${A}/transactions?type=tips&limit=20`);
const tipTransactions = tx.json?.data ?? null;
if (!tipMessage && Array.isArray(tipTransactions)) {
  report.tipNote = 'no isTip message in scanned tails; see transactions probe';
}
writeFileSync(join(outDir, 'probe-tip-message.json'), JSON.stringify({ tipMessage, tipTransactions }, null, 2));
report.tip = {
  foundTipMessage: Boolean(tipMessage),
  tipMessageKeys: tipMessage ? Object.keys(tipMessage) : null,
  tipTransactionCount: Array.isArray(tipTransactions) ? tipTransactions.length : null,
};

report.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, 'latency-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.latency, null, 2));
console.log(`credits burned: ${report.creditsBurned} (start ${report.balanceStart} → end ${report.balanceEnd})`);
console.log('DONE');
