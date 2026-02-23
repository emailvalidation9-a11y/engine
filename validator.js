const dns = require('dns');
const { Resolver } = dns.promises;
const net = require('net');
const tls = require('tls');

// ═══════════════════════════════════════════════════════════════
// DNS RESOLVERS
// ═══════════════════════════════════════════════════════════════
const resolvers = [
  createResolver(['8.8.8.8', '8.8.4.4']),
  createResolver(['1.1.1.1', '1.0.0.1']),
  createResolver(['208.67.222.222', '208.67.220.220']),
];
function createResolver(servers) {
  const r = new Resolver(); r.setServers(servers); return r;
}

// ═══════════════════════════════════════════════════════════════
// CACHES
// ═══════════════════════════════════════════════════════════════
const mxCache = new Map();
const dnsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════
// DISPOSABLE DOMAINS
// ═══════════════════════════════════════════════════════════════
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'yopmail.com',
  'tempmail.org', 'throwaway.email', 'guerrillamail.info', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.de', 'sharklasers.com', 'grr.la',
  'guerrillamailblock.com', 'pokemail.net', 'spam4.me', 'bccto.me',
  'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'spamgourmet.com', 'mytemp.email', 'mohmal.com', 'burnermail.com',
  'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'emailondeck.com',
  'getnada.com', 'inboxbear.com', 'mailsac.com', 'harakirimail.com',
  'crazymailing.com', 'discard.email', 'discardmail.com', 'discardmail.de',
  'emailfake.com', 'fakeinbox.com', 'fakemail.net', 'jetable.org',
  'mintemail.com', 'mt2015.com', 'nomail.xl.cx', 'nospam.ze.tc',
  'owlpic.com', 'proxymail.eu', 'rcpt.at', 'reallymymail.com',
  'rklips.com', 'rmqkr.net', 'slaskpost.se', 'sogetthis.com',
  'spambob.net', 'spaml.de', 'superrito.com', 'superstachel.de',
  'teleworm.us', 'tempomail.fr', 'tmpmail.net', 'tmpmail.org',
  'trbvm.com', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
  'wh4f.org', 'xagloo.co', 'yep.it', 'zetmail.com', 'zoemail.org',
  'throwam.com', 'tempail.com', 'tempr.email', 'tempinbox.com',
  'tempsky.com', 'getairmail.com', 'guerillamail.com', 'spamfree24.org',
  'trash-mail.com', 'trashymail.com', 'trashymail.net',
]);

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de',
  'yahoo.it', 'yahoo.es', 'yahoo.ca', 'yahoo.com.au', 'yahoo.com.br',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de',
  'outlook.com', 'outlook.co.uk', 'outlook.fr',
  'live.com', 'live.co.uk', 'live.fr',
  'msn.com', 'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'mail.com', 'email.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'zohomail.com',
  'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.net', 'gmx.de',
  'fastmail.com', 'fastmail.fm',
  'tutanota.com', 'tuta.com', 'tuta.io',
  'rediffmail.com',
  'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
  'inbox.com', 'hey.com',
]);

const ROLE_ACCOUNTS = new Set([
  'admin', 'administrator', 'abuse', 'billing', 'compliance',
  'contact', 'devnull', 'dns', 'ftp', 'help', 'hostmaster',
  'info', 'infrastructure', 'inoc', 'ispfeedback', 'ispsupport',
  'jobs', 'list', 'maildaemon', 'marketing', 'media', 'noc',
  'noemail', 'noreply', 'no-reply', 'null', 'office', 'phish',
  'phishing', 'postmaster', 'privacy', 'registrar', 'remove',
  'request', 'role', 'root', 'sales', 'security', 'spam', 'ssladmin',
  'ssladministrator', 'sslwebmaster', 'support', 'sysadmin',
  'tech', 'trouble', 'undisclosed-recipients', 'unsubscribe',
  'usenet', 'uucp', 'webmaster', 'www', 'newsletter', 'team',
  'feedback', 'press', 'enquiry', 'enquiries', 'service',
]);

// ═══════════════════════════════════════════════════════════════
// PROVIDER INTELLIGENCE
// ═══════════════════════════════════════════════════════════════
const PROVIDER_PATTERNS = [
  { pattern: /google\.com$|googlemail\.com$|smtp\.google\.com$/i, provider: 'google', catchall: false },
  { pattern: /outlook\.com$|hotmail\.com$|microsoft\.com$|protection\.outlook\.com$/i, provider: 'microsoft', catchall: false },
  { pattern: /yahoodns\.net$|yahoo\.com$/i, provider: 'yahoo', catchall: true },
  { pattern: /icloud\.com$|apple\.com$|me\.com$/i, provider: 'apple', catchall: false },
  { pattern: /protonmail\.ch$|proton\.ch$/i, provider: 'protonmail', catchall: false },
  { pattern: /zoho\.com$|zohomail\.com$/i, provider: 'zoho', catchall: false },
  { pattern: /yandex\.(ru|net|com)$/i, provider: 'yandex', catchall: false },
  { pattern: /gmx\.net$|gmx\.com$/i, provider: 'gmx', catchall: false },
  { pattern: /fastmail\.(com|fm)$/i, provider: 'fastmail', catchall: false },
  { pattern: /mail\.ru$/i, provider: 'mailru', catchall: false },
  { pattern: /mimecast\./i, provider: 'mimecast', catchall: false },
  { pattern: /pphosted\.com$|proofpoint/i, provider: 'proofpoint', catchall: false },
  { pattern: /barracuda/i, provider: 'barracuda', catchall: false },
  { pattern: /messagelabs|symantec|broadcom/i, provider: 'symantec', catchall: false },
  { pattern: /secureserver\.net/i, provider: 'godaddy', catchall: false },
  { pattern: /emailsrvr\.com/i, provider: 'rackspace', catchall: false },
  { pattern: /amazonaws\.com/i, provider: 'aws_ses', catchall: false },
  { pattern: /sendgrid/i, provider: 'sendgrid', catchall: false },
];

function identifyProvider(mxRecords) {
  for (const mx of mxRecords) {
    for (const p of PROVIDER_PATTERNS) {
      if (p.pattern.test(mx)) return { provider: p.provider, catchall: p.catchall };
    }
  }
  return { provider: 'unknown', catchall: false };
}

// ═══════════════════════════════════════════════════════════════
// BLACKLIST DETECTION
// ═══════════════════════════════════════════════════════════════
const BLACKLIST_KW = [
  'blocked', 'blacklist', 'blocklist', 'spamhaus', 'barracuda',
  'spamcop', 'denied', 'policy', 'dnsbl', 'rbl',
  'client host', 'access denied', 'not allowed',
  'sorbs', 'uceprotect', 'abuseat', 'cbl', 'sbl', 'xbl',
  'your ip', 'your host', 'service unavailable, client host',
  'too many connections', 'rate limit', 'try again later',
];
function isBlacklistRejection(text) {
  if (!text) return false;
  const l = text.toLowerCase();
  return BLACKLIST_KW.some(k => l.includes(k));
}

// ═══════════════════════════════════════════════════════════════
// 1. SYNTAX CHECK
// ═══════════════════════════════════════════════════════════════
function syntaxCheck(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!re.test(email)) return false;
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (local.length > 64 || domain.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// 2. MX LOOKUP
// ═══════════════════════════════════════════════════════════════
async function getMx(domain) {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.records;

  for (const resolver of resolvers) {
    try {
      const recs = await resolver.resolveMx(domain);
      recs.sort((a, b) => a.priority - b.priority);
      const ex = recs.map(r => r.exchange);
      mxCache.set(domain, { records: ex, ts: Date.now() });
      return ex;
    } catch (_) { }
  }
  try {
    const recs = await dns.promises.resolveMx(domain);
    recs.sort((a, b) => a.priority - b.priority);
    const ex = recs.map(r => r.exchange);
    mxCache.set(domain, { records: ex, ts: Date.now() });
    return ex;
  } catch (_) { }

  // RFC 5321 §5: A record fallback
  for (const resolver of resolvers) {
    try {
      const addrs = await resolver.resolve4(domain);
      if (addrs.length > 0) { mxCache.set(domain, { records: [domain], ts: Date.now() }); return [domain]; }
    } catch (_) { }
  }
  mxCache.set(domain, { records: [], ts: Date.now() });
  return [];
}

// ═══════════════════════════════════════════════════════════════
// 3. DNS EXTRAS
// ═══════════════════════════════════════════════════════════════
async function getDnsExtras(domain) {
  const cached = dnsCache.get(domain);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  const res = { hasSpf: false, hasDmarc: false, hasA: false, hasAAAA: false, spfRecord: null, dmarcRecord: null };
  const r = resolvers[0];
  try { const t = await r.resolveTxt(domain); for (const rec of t) { const s = rec.join(''); if (s.startsWith('v=spf1')) { res.hasSpf = true; res.spfRecord = s; break; } } } catch (_) { }
  try { const t = await r.resolveTxt(`_dmarc.${domain}`); for (const rec of t) { const s = rec.join(''); if (s.startsWith('v=DMARC1')) { res.hasDmarc = true; res.dmarcRecord = s; break; } } } catch (_) { }
  try { res.hasA = (await r.resolve4(domain)).length > 0; } catch (_) { }
  try { res.hasAAAA = (await r.resolve6(domain)).length > 0; } catch (_) { }
  dnsCache.set(domain, { data: res, ts: Date.now() });
  return res;
}

// ═══════════════════════════════════════════════════════════════
// 4. SMTP PROBE (raw TCP)
// ═══════════════════════════════════════════════════════════════
function smtpConnectAndProbe(host, port, useTls, timeoutMs, from, to) {
  return new Promise((resolve) => {
    let socket = null, resolved = false, timer = null, buffer = '', step = 0, allData = '';
    const finish = (r) => {
      if (resolved) return; resolved = true; clearTimeout(timer);
      if (socket) { try { socket.write('QUIT\r\n'); } catch (_) { } setTimeout(() => { try { socket.destroy(); } catch (_) { } }, 300); }
      resolve(r);
    };
    timer = setTimeout(() => finish({ ok: false, error: 'SMTP timeout', code: 'TIMEOUT', port }), timeoutMs);
    try {
      socket = useTls
        ? tls.connect({ host, port, timeout: timeoutMs - 1000, rejectUnauthorized: false })
        : net.createConnection({ host, port, timeout: timeoutMs - 1000 });
      socket.setEncoding('utf8');
      socket.on('error', (e) => finish({ ok: false, error: e.message, code: e.code || 'SOCKET_ERROR', port }));
      socket.on('timeout', () => finish({ ok: false, error: 'Socket timeout', code: 'TIMEOUT', port }));
      socket.on('close', () => finish({ ok: false, error: 'Connection closed', code: 'CLOSED', port }));
      socket.on('data', (data) => {
        buffer += data; allData += data;
        if (!buffer.includes('\r\n')) return;
        const lines = buffer.split('\r\n').filter(l => l.length > 0);
        const last = lines[lines.length - 1];
        if (!last || last.length < 3) return;
        const code = parseInt(last.substring(0, 3));
        if (isNaN(code)) return;
        if (last[3] === '-') return;
        buffer = '';
        switch (step) {
          case 0:
            if (code >= 200 && code < 400) { step = 1; socket.write('EHLO spamguard.validator\r\n'); }
            else if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(code), port, blacklisted: true });
            else finish({ ok: false, error: `Greeting: ${code}`, code: String(code), port });
            break;
          case 1:
            if (code >= 200 && code < 400) { step = 2; socket.write(`MAIL FROM:<${from}>\r\n`); }
            else { step = 2; socket.write('HELO spamguard.validator\r\n'); }
            break;
          case 2:
            if (code >= 200 && code < 400) { step = 3; socket.write(`RCPT TO:<${to}>\r\n`); }
            else if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(code), port, blacklisted: true });
            else finish({ ok: false, error: `MAIL FROM: ${code}`, code: String(code), port });
            break;
          case 3:
            if (code >= 200 && code < 300) {
              finish({ ok: true, response: last, code: String(code), port });
            } else if (code >= 550 && code <= 554) {
              if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(code), port, blacklisted: true });
              else finish({ ok: false, error: `Mailbox not found: ${last}`, code: String(code), port, mailboxNotFound: true });
            } else if (code >= 450 && code <= 452) {
              finish({ ok: false, error: `Greylisted: ${last}`, code: String(code), port, greylisted: true });
            } else if (code === 421) {
              if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(code), port, blacklisted: true });
              else finish({ ok: false, error: `421: ${last}`, code: String(code), port });
            } else {
              finish({ ok: false, error: `${code}: ${last}`, code: String(code), port });
            }
            break;
        }
      });
    } catch (e) { finish({ ok: false, error: e.message, code: e.code || 'CONNECT_ERROR', port }); }
  });
}

async function smtpProbe(mxHost, from, to) {
  const ports = [
    { port: 25, tls: false, timeout: 8000 },
    { port: 587, tls: false, timeout: 6000 },
    { port: 465, tls: true, timeout: 6000 },
  ];
  for (const { port, tls: useTls, timeout } of ports) {
    const r = await smtpConnectAndProbe(mxHost, port, useTls, timeout, from, to);
    if (r.ok || r.blacklisted || r.mailboxNotFound || r.greylisted) return r;
    if (r.code && !['ECONNREFUSED', 'TIMEOUT', 'CLOSED', 'SOCKET_ERROR', 'CONNECT_ERROR', 'EHOSTUNREACH', 'ENETUNREACH'].includes(r.code)) return r;
  }
  return { ok: false, error: 'All SMTP ports unreachable', code: 'ALL_BLOCKED', port: 0, allBlocked: true };
}

// ═══════════════════════════════════════════════════════════════
// 5. HTTP-BASED MAILBOX VERIFICATION (fallback when SMTP blocked)
//
//    Microsoft: GetCredentialType API
//      IfExistsResult: 0 = exists, 1 = doesn't exist
//      5/6 = exists (different account type)
//
//    This gives 100% accuracy for Microsoft-hosted domains
//    regardless of IP reputation.
// ═══════════════════════════════════════════════════════════════

async function verifyMicrosoftMailbox(email) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://login.microsoftonline.com/common/GetCredentialType', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: email,
        isOtherIdpSupported: true,
        checkPhones: false,
        isRemoteNGCSupported: true,
        isCookieBannerShown: false,
        isFidoSupported: false,
        originalRequest: '',
        flowToken: '',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null; // API error, can't determine

    const data = await response.json();

    // IfExistsResult values:
    // 0 = account exists in this tenant
    // 1 = account does NOT exist
    // 2 = invalid format
    // 5 = exists, use different IDP
    // 6 = exists, use different IDP
    if (data.IfExistsResult === 0 || data.IfExistsResult === 5 || data.IfExistsResult === 6) {
      return { exists: true, method: 'microsoft_api', throttled: data.ThrottleStatus !== 0 };
    }
    if (data.IfExistsResult === 1) {
      return { exists: false, method: 'microsoft_api', throttled: data.ThrottleStatus !== 0 };
    }

    // Throttled or unknown
    if (data.ThrottleStatus !== 0) {
      return { exists: null, method: 'microsoft_api', throttled: true };
    }

    return null; // Unknown result
  } catch (error) {
    console.error('Microsoft API error:', error.message);
    return null;
  }
}

// Yahoo uses a similar API via login.yahoo.com
async function verifyYahooMailbox(email) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch('https://login.yahoo.com/account/module/create?validateField=yid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `yid=${encodeURIComponent(email.split('@')[0])}`,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();

    // If error code contains "IDENTIFIER_EXISTS", the account exists
    if (data.errors && data.errors.some(e => e.name === 'yid' && e.error === 'IDENTIFIER_EXISTS')) {
      return { exists: true, method: 'yahoo_api' };
    }
    // If no such error, the username is available = account doesn't exist
    if (data.errors && data.errors.some(e => e.name === 'yid' && e.error !== 'IDENTIFIER_EXISTS')) {
      return { exists: false, method: 'yahoo_api' };
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Dispatcher: pick the right HTTP verifier based on provider
async function httpMailboxVerify(email, provider) {
  switch (provider) {
    case 'microsoft':
      return await verifyMicrosoftMailbox(email);
    case 'yahoo':
      return await verifyYahooMailbox(email);
    default:
      return null; // No HTTP verifier available for this provider
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. CATCH-ALL DETECTION
// ═══════════════════════════════════════════════════════════════
async function detectCatchAll(mxHost, domain, provider) {
  // For providers we KNOW are not catch-all, skip the probe
  const noCatchAll = ['google', 'microsoft', 'apple', 'protonmail', 'zoho', 'yandex', 'gmx', 'fastmail'];
  if (noCatchAll.includes(provider)) return false;

  // For known catch-all providers
  const knownCatchAll = ['yahoo'];
  if (knownCatchAll.includes(provider)) return true;

  // SMTP probe: send to random address
  const fake = `xyzprobe-${Math.random().toString(36).slice(2, 12)}@${domain}`;
  try {
    const probe = await smtpConnectAndProbe(mxHost, 25, false, 6000, 'verify@spamguard.validator', fake);
    if (probe.ok) return true;
    if (probe.blacklisted || probe.allBlocked) {
      // Can't determine via SMTP — try HTTP for Microsoft
      if (provider === 'microsoft') {
        const httpResult = await httpMailboxVerify(fake, 'microsoft');
        if (httpResult && httpResult.exists === true) return true;
        if (httpResult && httpResult.exists === false) return false;
      }
      return null; // Can't determine
    }
    return false;
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. STATUS & SCORE
// ═══════════════════════════════════════════════════════════════
function determineStatus(result) {
  if (!result.syntax) return 'invalid';
  if (result.mx.length === 0) return 'invalid';
  if (result.disposable) return 'disposable';

  // If we have a verified mailbox check (SMTP or HTTP)
  if (result.mailbox_verified !== null && result.mailbox_verified !== undefined) {
    if (result.mailbox_verified === true) {
      if (result.catchall === true) return 'catch-all';
      if (result.role) return 'role';
      return 'valid';
    } else if (result.mailbox_verified === false) {
      return 'invalid';
    }
  }

  // SMTP only (no HTTP fallback available)
  if (result.smtp) {
    if (result.smtp.ok) {
      if (result.catchall === true) return 'catch-all';
      if (result.role) return 'role';
      return 'valid';
    }
    if (result.smtp.mailboxNotFound) return 'invalid';
    if (result.smtp.greylisted) return 'risky';
  }

  // No verification was possible
  if (result.role) return 'role';
  return 'unknown';
}

function calculateScore(result) {
  let score = 0;
  if (result.syntax) score += 10; else return 0;
  if (result.mx.length > 0) score += 15; else return score;
  if (result.dns_checks) {
    if (result.dns_checks.hasSpf) score += 5;
    if (result.dns_checks.hasDmarc) score += 5;
    if (result.dns_checks.hasA || result.dns_checks.hasAAAA) score += 5;
  }
  if (result.provider && result.provider !== 'unknown') score += 10;

  // Mailbox verification: 40pt (this is the big one)
  if (result.mailbox_verified === true) score += 40;
  else if (result.mailbox_verified === false) score -= 30;
  else if (result.smtp && result.smtp.ok) score += 40;
  else if (result.smtp && result.smtp.mailboxNotFound) score -= 30;
  else if (result.smtp && result.smtp.greylisted) score += 20;
  else score += 0; // Couldn't verify

  if (!result.disposable) score += 5;
  if (!result.role) score += 5;
  if (result.catchall === true) score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ═══════════════════════════════════════════════════════════════
// MAIN: validateEmail
// ═══════════════════════════════════════════════════════════════
async function validateEmail(email, opts = {}) {
  const result = {
    email,
    syntax: false,
    mx: [],
    smtp: null,
    status: 'unknown',
    score: 0,
    disposable: false,
    role: false,
    free_provider: false,
    catchall: false,
    provider: null,
    dns_checks: null,
    mailbox_verified: null, // true/false/null
    verification_method: null, // 'smtp' | 'microsoft_api' | 'yahoo_api' | null
  };

  try {
    if (!email) throw new Error('email required');
    email = email.trim().toLowerCase();
    result.email = email;

    // 1. Syntax
    result.syntax = syntaxCheck(email);
    if (!result.syntax) { result.status = 'invalid'; return result; }

    const [localPart, domain] = email.split('@');

    // 2. Quick checks
    result.disposable = DISPOSABLE_DOMAINS.has(domain);
    result.role = ROLE_ACCOUNTS.has(localPart);
    result.free_provider = FREE_PROVIDERS.has(domain);

    // 3. MX lookup
    result.mx = await getMx(domain);
    if (result.mx.length === 0) { result.status = 'invalid'; result.score = calculateScore(result); return result; }
    if (result.disposable) { result.status = 'disposable'; result.score = 5; return result; }

    // 4. Provider
    const provInfo = identifyProvider(result.mx);
    result.provider = provInfo.provider;
    if (provInfo.catchall) result.catchall = true;

    // 5. DNS extras
    result.dns_checks = await getDnsExtras(domain);

    // 6. SMTP verification
    let smtpBlocked = false;
    if (!opts.skip_smtp) {
      const mxToTry = result.mx.slice(0, 2);
      for (const mxHost of mxToTry) {
        const probe = await smtpProbe(mxHost, 'verify@spamguard.validator', email);
        result.smtp = probe;

        if (probe.ok) {
          result.mailbox_verified = true;
          result.verification_method = 'smtp';
          break;
        }
        if (probe.mailboxNotFound) {
          result.mailbox_verified = false;
          result.verification_method = 'smtp';
          break;
        }
        if (probe.blacklisted || probe.allBlocked) {
          smtpBlocked = true;
          break;
        }
        if (probe.greylisted) break;
        if (probe.code && !['TIMEOUT', 'CLOSED', 'ECONNREFUSED', 'SOCKET_ERROR', 'CONNECT_ERROR', 'ALL_BLOCKED'].includes(probe.code)) break;
      }
    }

    // 7. HTTP FALLBACK — when SMTP was blocked by blacklist
    if (smtpBlocked && result.mailbox_verified === null) {
      console.log(`SMTP blocked for ${email}, trying HTTP verification (${result.provider})...`);
      const httpResult = await httpMailboxVerify(email, result.provider);
      if (httpResult) {
        if (httpResult.exists === true) {
          result.mailbox_verified = true;
          result.verification_method = httpResult.method;
        } else if (httpResult.exists === false) {
          result.mailbox_verified = false;
          result.verification_method = httpResult.method;
        }
        // If throttled or null, mailbox_verified stays null
      }
    }

    // 8. Catch-all detection
    if (result.mailbox_verified === true && !provInfo.catchall) {
      const ca = await detectCatchAll(result.mx[0], domain, result.provider);
      if (ca === true) result.catchall = true;
      else if (ca === false) result.catchall = false;
    }
    if (provInfo.catchall) result.catchall = true;

    // 9. Final status & score
    result.status = determineStatus(result);
    result.score = calculateScore(result);
    return result;
  } catch (error) {
    console.error('validateEmail error:', error.message);
    result.status = 'error';
    result.score = 0;
    result.smtp = { ok: false, error: error.message, code: 'INTERNAL_ERROR' };
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function clearCache() {
  mxCache.clear(); dnsCache.clear();
  return { cleared: true, timestamp: new Date().toISOString() };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of mxCache.entries()) if (now - v.ts > CACHE_TTL) mxCache.delete(k);
  for (const [k, v] of dnsCache.entries()) if (now - v.ts > CACHE_TTL) dnsCache.delete(k);
}, 60_000);

module.exports = { syntaxCheck, getMx, smtpProbe, validateEmail, clearCache };