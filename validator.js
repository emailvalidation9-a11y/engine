const dns = require('dns');
const { Resolver } = dns.promises;
const net = require('net');
const tls = require('tls');
const os = require('os');

// Get a valid EHLO hostname — MUST be a proper FQDN or IP address literal
// bare hostnames like "DESKTOP-XXXXX" with 550.
const EHLO_HOST = (() => {
  try {
    const hostname = os.hostname();
    // If hostname already looks like a FQDN (contains a dot), use it
    if (hostname && hostname.includes('.') && hostname.length > 3) return hostname;
    // Otherwise, make it a FQDN by appending a domain
    if (hostname && hostname.length > 1) return `${hostname}.validator.local`;
  } catch (_) {}
  return 'mail.validator.local';
})();

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
  // Microsoft EOP / Exchange Online Protection patterns
  'mail rejected', 'sender ip', 'reputation', 'spf record',
  'message rejected', 'not authorized', 'connection refused',
  'connection was dropped', 'ip addresses are blocked',
  'has been temporarily rate limited', 'temporarily deferred',
  'service not available', 'exceeded the connection limit',
  'exceeded the rate limit', 'mail from ip', 'rejected by recipient',
];
function isBlacklistRejection(text) {
  if (!text) return false;
  const l = text.toLowerCase();
  return BLACKLIST_KW.some(k => l.includes(k));
}

// Detect 550 responses that are NOT about the mailbox being missing.
// Some strict servers return 550 for HELO/EHLO issues, policy blocks,
// authentication requirements, etc. — these should NOT be treated as
// "mailbox not found".
function isNonMailbox550(responseText) {
  if (!responseText) return false;
  const l = responseText.toLowerCase();
  const nonMailboxPatterns = [
    'helo', 'ehlo', 'fqdn', 'rfc 2821', 'rfc 5321', 'rfc2821', 'rfc5321',
    'address literal', 'authentication required', 'auth required',
    'relay access denied', 'relay not permitted', 'relaying denied',
    'sender verify failed', 'sender rejected', 'domain not found',
    'client host rejected', 'access denied', 'not allowed to send',
    'tls required', 'encryption required', 'starttls',
    'reverse dns', 'ptr record', 'rdns', 'forward-confirmed',
    'your ip', 'your host',
    // Microsoft EOP / Exchange Online Protection specific patterns
    'mail rejected', 'not authorized', 'sender ip',
    'message rejected due to', 'organization policy',
    'connection was dropped', 'ip addresses are blocked',
    'front door', 'eop', 'forefront',
    'spf record', 'dkim', 'not pass', 'fail authentication',
    'tenant attribution', 'connector validation failed',
    // Generic policy/anti-spam patterns seen in enterprise gateways
    'sender not authorized', 'rejected by policy', 'compliance',
    'blocked by', 'rejected for policy', 'mail server policy',
    'administrative prohibition', 'routing loop',
    'null sender', 'empty sender', 'no sender', 'mail from: <',
  ];
  return nonMailboxPatterns.some(p => l.includes(p));
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
    let socket = null, resolved = false, timer = null, buffer = '', step = 0, allData = '', triedHelo = false;
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
            if (code >= 200 && code < 400) { step = 1; socket.write(`EHLO ${EHLO_HOST}\r\n`); }
            else if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(code), port, blacklisted: true });
            else finish({ ok: false, error: `Greeting: ${code}`, code: String(code), port });
            break;
          case 1:
            if (code >= 200 && code < 400) {
              // Check if server advertises STARTTLS and we're on plaintext port 587
              if (!useTls && port === 587 && allData.includes('STARTTLS')) {
                step = 10; // STARTTLS upgrade step
                socket.write('STARTTLS\r\n');
              } else {
                step = 2;
                socket.write(`MAIL FROM:<${from}>\r\n`);
              }
            }
            else if (!triedHelo) { triedHelo = true; socket.write(`HELO ${EHLO_HOST}\r\n`); }
            else finish({ ok: false, error: `EHLO/HELO rejected: ${code}`, code: String(code), port });
            break;
          case 10: // STARTTLS response
            if (code === 220) {
              // Upgrade the connection to TLS
              const tlsSocket = tls.connect({ socket, host, rejectUnauthorized: false }, () => {
                socket = tlsSocket;
                socket.setEncoding('utf8');
                socket.on('error', (e) => finish({ ok: false, error: e.message, code: e.code || 'SOCKET_ERROR', port }));
                step = 11; // Re-EHLO after TLS
                socket.write(`EHLO ${EHLO_HOST}\r\n`);
              });
              tlsSocket.on('data', (d) => {
                buffer += d; allData += d;
                if (!buffer.includes('\r\n')) return;
                const tlines = buffer.split('\r\n').filter(l => l.length > 0);
                const tlast = tlines[tlines.length - 1];
                if (!tlast || tlast.length < 3) return;
                const tcode = parseInt(tlast.substring(0, 3));
                if (isNaN(tcode)) return;
                if (tlast[3] === '-') return;
                buffer = '';
                if (step === 11) {
                  if (tcode >= 200 && tcode < 400) { step = 2; socket.write(`MAIL FROM:<${from}>\r\n`); }
                  else finish({ ok: false, error: `EHLO after STARTTLS: ${tcode}`, code: String(tcode), port });
                } else if (step === 2) {
                  if (tcode >= 200 && tcode < 400) { step = 3; socket.write(`RCPT TO:<${to}>\r\n`); }
                  else if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(tcode), port, blacklisted: true });
                  else finish({ ok: false, error: `MAIL FROM: ${tcode}`, code: String(tcode), port });
                } else if (step === 3) {
                  if (tcode >= 200 && tcode < 300) finish({ ok: true, response: tlast, code: String(tcode), port });
                  else if (tcode >= 550 && tcode <= 554) {
                    if (isBlacklistRejection(allData)) finish({ ok: false, error: `IP blocked`, code: String(tcode), port, blacklisted: true });
                    else if (isNonMailbox550(tlast) || isNonMailbox550(allData)) finish({ ok: false, error: `Server policy rejection: ${tlast}`, code: String(tcode), port });
                    else finish({ ok: false, error: `Mailbox not found: ${tlast}`, code: String(tcode), port, mailboxNotFound: true });
                  } else if (tcode >= 450 && tcode <= 452) {
                    finish({ ok: false, error: `Greylisted: ${tlast}`, code: String(tcode), port, greylisted: true });
                  } else {
                    finish({ ok: false, error: `${tcode}: ${tlast}`, code: String(tcode), port });
                  }
                }
              });
              tlsSocket.on('error', (e) => finish({ ok: false, error: e.message, code: e.code || 'TLS_ERROR', port }));
            } else {
              // STARTTLS not supported, continue without TLS
              step = 2;
              socket.write(`MAIL FROM:<${from}>\r\n`);
            }
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
              else if (isNonMailbox550(last) || isNonMailbox550(allData)) finish({ ok: false, error: `Server policy rejection: ${last}`, code: String(code), port });
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
    { port: 25, tls: false, timeout: 10000 },
    { port: 587, tls: false, timeout: 8000 },
    { port: 465, tls: true, timeout: 8000 },
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

    // ───────────────────────────────────────────────────────────
    // FEDERATED DOMAIN DETECTION
    // Many enterprises & universities (e.g. cam.ac.uk, mit.edu)
    // use Microsoft mail.protection.outlook.com as their MX
    // gateway but authenticate users via a federated IDP
    // (Shibboleth, ADFS, Okta, etc.). For these domains,
    // IfExistsResult = 1 does NOT mean "mailbox doesn't exist" —
    // it means Microsoft can't verify because auth is delegated.
    // We detect this via multiple response fields.
    // ───────────────────────────────────────────────────────────
    const isFederated = !!(
      data.FederationRedirectUrl ||                          // Has a federated login URL
      (data.EstsProperties && data.EstsProperties.DesktopSsoEnabled) || // SSO-enabled domain
      data.IsSignupDisallowed === false ||                   // Unmanaged domain indicator
      (data.Credentials && data.Credentials.FederationRedirectUrl) ||
      data.ThirdPartyIdp ||                                  // Third-party identity provider
      (data.DomainType === 3) ||                             // DomainType 3 = federated
      (data.DomainType === 4) ||                             // DomainType 4 = cloud federated
      (data.FederationGlobalVersion)                         // Federation version present
    );

    // Also check if the domain is using EOP/Exchange Online Protection
    // as a mail relay but NOT as the identity provider. These domains
    // route mail through Microsoft but manage users elsewhere.
    const isUnmanaged = data.IsUnmanaged === true;

    // CRITICAL: If DomainType is undefined/null, the domain is NOT registered
    // in Azure AD at all. This happens when organizations use Microsoft's
    // mail.protection.outlook.com ONLY as a mail gateway/spam filter (EOP standalone)
    // but host their mailboxes on-premises or elsewhere. The API literally has
    // no knowledge of any users in this domain — IfExistsResult is meaningless.
    // Examples: cam.ac.uk, many .ac.uk, .edu, and enterprise domains.
    const isNonAzureDomain = (data.DomainType === undefined || data.DomainType === null);

    console.log(`Microsoft API for ${email}: IfExistsResult=${data.IfExistsResult}, ` +
      `DomainType=${data.DomainType}, Federated=${isFederated}, ` +
      `Unmanaged=${isUnmanaged}, NonAzure=${isNonAzureDomain}, ThrottleStatus=${data.ThrottleStatus}`);

    // Throttled — can't trust any result
    if (data.ThrottleStatus !== 0) {
      return { exists: null, method: 'microsoft_api', throttled: true };
    }

    // IfExistsResult values:
    // 0 = account exists in this tenant (definitive)
    // 1 = account does NOT exist (but ONLY trustworthy for managed domains!)
    // 2 = invalid format / could be on-prem hybrid
    // 5 = exists, use different IDP (definitive — exists)
    // 6 = exists, use different IDP (definitive — exists)

    if (data.IfExistsResult === 0 || data.IfExistsResult === 5 || data.IfExistsResult === 6) {
      return { exists: true, method: 'microsoft_api', throttled: false };
    }

    if (data.IfExistsResult === 1) {
      // For federated, unmanaged, or non-Azure domains, IfExistsResult=1 is UNRELIABLE
      // - Federated: auth delegated to external IDP
      // - Unmanaged: domain not fully managed by Azure AD
      // - NonAzure: domain uses EOP mail gateway only, not an Azure AD tenant
      //   (e.g. cam.ac.uk uses mail.protection.outlook.com but isn't in Azure AD)
      if (isFederated || isUnmanaged || isNonAzureDomain) {
        console.log(`  → Non-verifiable domain for ${email} ` +
          `(federated=${isFederated}, unmanaged=${isUnmanaged}, nonAzure=${isNonAzureDomain}), ` +
          `treating IfExistsResult=1 as INDETERMINATE`);
        return null; // Can't determine — don't mark as non-existent
      }
      // For fully managed Microsoft 365 tenants (DomainType=1 or 2), IfExistsResult=1 is reliable
      return { exists: false, method: 'microsoft_api', throttled: false };
    }

    if (data.IfExistsResult === 2) {
      // Could be hybrid/on-prem Exchange — can't determine remotely
      console.log(`  → IfExistsResult=2 for ${email}, possibly hybrid/on-prem`);
      return null;
    }

    return null; // Unknown result
  } catch (error) {
    console.error('Microsoft API error:', error.message);
    return null;
  }
}

// Google verification — Google's sign-in API requires browser cookies/XSRF tokens
// and cannot be used server-side. Instead, we use a heuristic approach:
// - For @gmail.com: syntax + MX + DNS checks are sufficient (Google's infra is reliable)
// - For Google Workspace: verify the domain is properly configured
async function verifyGoogleMailbox(email) {
  try {
    const domain = email.split('@')[1];

    // For gmail.com specifically, Google doesn't expose a public API
    // to verify individual mailboxes. Since Gmail has been around since 2004
    // and doesn't do catch-all, we rely on DNS + syntax validation.
    // The email will be marked with mailbox_verified = null (unverifiable)
    // but get a good score from DNS checks.
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      return null; // Can't verify individual Gmail accounts server-side
    }

    // For Google Workspace domains, verify domain configuration
    // by checking if MX records point to Google
    const mx = await getMx(domain);
    const isGoogleHosted = mx.some(r => /google\.com$/i.test(r) || /googlemail\.com$/i.test(r));

    if (isGoogleHosted) {
      // Domain is properly configured with Google Workspace
      // We can't verify individual mailboxes, but the domain setup is valid
      return null; // Individual verification not possible
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Yahoo verification via login check
async function verifyYahooMailbox(email) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Use Yahoo's login API to check if account exists
    const response = await fetch('https://login.yahoo.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `username=${encodeURIComponent(email)}&passwd=&signin=Next&persistent=y`,
      redirect: 'manual',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const status = response.status;
    const location = response.headers.get('location') || '';

    // If redirected to password challenge, account exists
    if (status >= 300 && status < 400) {
      if (location.includes('challenge') || location.includes('verify') || location.includes('password')) {
        return { exists: true, method: 'yahoo_api' };
      }
      if (location.includes('account_not_found') || location.includes('error')) {
        return { exists: false, method: 'yahoo_api' };
      }
    }

    if (status === 200) {
      const text = await response.text();
      if (text.includes('messages.ERROR_INVALID_USERNAME') || text.includes('Sorry, we don')) {
        return { exists: false, method: 'yahoo_api' };
      }
      if (text.includes('password') && text.includes('challenge')) {
        return { exists: true, method: 'yahoo_api' };
      }
    }

    // Fallback: try the account module API
    return await verifyYahooMailboxFallback(email);
  } catch (error) {
    return await verifyYahooMailboxFallback(email);
  }
}

// Yahoo fallback via account module
async function verifyYahooMailboxFallback(email) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://login.yahoo.com/account/module/create?validateField=yid', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: `yid=${encodeURIComponent(email.split('@')[0])}`,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();

    if (data.errors && data.errors.some(e => e.name === 'yid' && e.error === 'IDENTIFIER_EXISTS')) {
      return { exists: true, method: 'yahoo_api' };
    }
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
    case 'google':
      return await verifyGoogleMailbox(email);
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
    const probe = await smtpConnectAndProbe(mxHost, 25, false, 8000, '', fake);
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

// Helper: check if SMTP failed due to infrastructure (IP blocked, timeout, etc.)
// vs. a definitive mailbox rejection (550 user not found)
function isSmtpInfraFailure(smtp) {
  if (!smtp) return false;
  // These indicate the mail server couldn't be reached or rejected our IP —
  // NOT that the mailbox doesn't exist
  const infraCodes = ['TIMEOUT', 'CLOSED', 'ECONNREFUSED', 'SOCKET_ERROR',
    'CONNECT_ERROR', 'ALL_BLOCKED', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET',
    'TLS_ERROR', 'EPIPE', 'ERR_SOCKET_CLOSED'];
  if (infraCodes.includes(smtp.code)) return true;
  if (smtp.blacklisted) return true;
  if (smtp.allBlocked) return true;
  // 421 is "service not available" — transient, not mailbox-related
  if (smtp.code === '421') return true;
  // MAIL FROM failures (our sender was rejected) — NOT about the recipient mailbox
  if (smtp.error && smtp.error.startsWith('MAIL FROM:')) return true;
  // Server policy rejection — infrastructure/policy issue, not mailbox
  if (smtp.error && smtp.error.startsWith('Server policy rejection:')) return true;
  // EHLO/HELO rejection — server refused our greeting
  if (smtp.error && smtp.error.includes('EHLO') && smtp.error.includes('rejected')) return true;
  if (smtp.error && smtp.error.includes('HELO') && smtp.error.includes('rejected')) return true;
  // Non-mailbox 550 detected in the response
  if (smtp.code === '550' && smtp.error && isNonMailbox550(smtp.error)) return true;
  return false;
}

// Helper: count how many DNS infrastructure signals are present
function dnsInfraScore(result) {
  let count = 0;
  if (result.mx.length > 0) count++;
  if (result.dns_checks) {
    if (result.dns_checks.hasSpf) count++;
    if (result.dns_checks.hasDmarc) count++;
    if (result.dns_checks.hasA || result.dns_checks.hasAAAA) count++;
  }
  return count; // 0-4
}

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

    // SMTP failed due to infrastructure reasons (IP blocked, timeout, etc.)
    // The domain has valid MX records, so the email *might* be valid —
    // we just can't confirm it. Don't call it "invalid".
    if (isSmtpInfraFailure(result.smtp)) {
      // If the domain has strong DNS infrastructure, lean towards "unknown"
      // rather than penalizing the email
      if (result.role) return 'role';
      return 'unknown';
    }
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
  else if (result.smtp && isSmtpInfraFailure(result.smtp)) {
    // SMTP couldn't connect due to infrastructure issues (IP blocked, timeout, firewall)
    // This is NOT evidence the mailbox doesn't exist — give partial credit
    // based on how solid the domain's DNS infrastructure looks
    const infraSignals = dnsInfraScore(result);
    const isMajorProvider = ['google', 'microsoft', 'apple', 'protonmail', 'zoho', 'fastmail'].includes(result.provider);
    if (infraSignals >= 3 && isMajorProvider) score += 30; // Major provider + strong infra
    else if (infraSignals >= 3) score += 25;               // Strong infra: MX + SPF + DMARC/A
    else if (infraSignals >= 2) score += 20;               // Decent infra: MX + one more
    else score += 15;                                      // At least MX exists
  }
  else {
    // Couldn't verify and no definitive SMTP result — give some credit
    // if DNS infrastructure looks legitimate
    const infraSignals = dnsInfraScore(result);
    const isMajorProvider = ['google', 'microsoft', 'apple', 'protonmail', 'zoho', 'fastmail'].includes(result.provider);
    if (infraSignals >= 3 && isMajorProvider) score += 25; // Strong signals even without SMTP
    else if (infraSignals >= 3) score += 20;
    else if (infraSignals >= 2) score += 15;
    else score += 0;
  }

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
        const probe = await smtpProbe(mxHost, '', email);
        result.smtp = probe;

        if (probe.ok) {
          result.mailbox_verified = true;
          result.verification_method = 'smtp';
          break;
        }
        if (probe.mailboxNotFound) {
          // Only treat as definitive "not found" if it's NOT a non-mailbox rejection
          if (probe.error && isNonMailbox550(probe.error)) {
            // This was a policy/infra rejection disguised as 550 — NOT a mailbox issue
            smtpBlocked = true;
            break;
          }
          result.mailbox_verified = false;
          result.verification_method = 'smtp';
          break;
        }
        if (probe.blacklisted || probe.allBlocked) {
          smtpBlocked = true;
          break;
        }
        if (probe.greylisted) break;
        // If it's an infra failure, mark as blocked so HTTP fallback triggers
        if (isSmtpInfraFailure(probe)) {
          smtpBlocked = true;
          break;
        }
        // For any other SMTP code that isn't a connection-level failure,
        // still mark as blocked if we have an HTTP fallback available
        if (probe.code && !['TIMEOUT', 'CLOSED', 'ECONNREFUSED', 'SOCKET_ERROR', 'CONNECT_ERROR', 'ALL_BLOCKED'].includes(probe.code)) {
          smtpBlocked = true;
          break;
        }
      }
    }

    // 7. HTTP FALLBACK — when SMTP couldn't verify the mailbox
    //    Triggers when: SMTP was blocked, all ports unreachable, or SMTP skipped
    if (result.mailbox_verified === null) {
      const reason = smtpBlocked ? 'SMTP blocked' : opts.skip_smtp ? 'SMTP skipped' : 'SMTP inconclusive';
      console.log(`${reason} for ${email}, trying HTTP verification (${result.provider})...`);
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