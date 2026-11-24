/**
 * Vercel Edge Middleware — Multi-Layered Anti-Scraper Shield for AI Home Global (uae-property-aboard)
 *
 * Protects:
 *  - /data/*.json (5.6 MB abroad-agencies.json & 2.7 MB offplan-registry.json) against direct curl/hotlink scraping
 *  - /api/* endpoints against automated harvesters & abuse (webhooks excluded for Stripe signature verification)
 *  - Honeypot trap paths that auto-ban offending IPs
 */

export const config = {
  matcher: ['/data/:path*', '/api/:path*', '/wp-login.php', '/.env', '/'],
};

const SCRAPER_UA_REGEX =
  /(?:curl\/|wget\/|python-requests|python-urllib|httpx|aiohttp|scrapy|httpclient|go-http-client|libwww-perl|httrack|phantomjs|headlesschrome|puppeteer|playwright|selenium|webdriver|gptbot|chatgpt-user|ccbot|bytespider|claudebot|anthropic-ai|google-extended|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|dataforseobot|amazonbot|meta-externalagent|diffbot|omgili|applebot-extended|perplexitybot|cohere-ai|nikto|sqlmap|masscan|zgrab)/i;

const SEARCH_BOT_REGEX = /(?:googlebot|bingbot|duckduckbot|slurp|applebot)/i;

const HONEYPOT_PATHS = new Set([
  '/api/internal-export',
  '/api/bulk-dump',
  '/data/all-clients.json',
  '/wp-login.php',
  '/.env',
]);

const rateBuckets = new Map();
const bannedIps = new Map();
const BAN_MS = 15 * 60 * 1000;

function getIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function checkRate(key, limit, windowMs, now) {
  const b = rateBuckets.get(key);
  if (!b || now >= b.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    if (rateBuckets.size > 4000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (now >= v.resetAt) rateBuckets.delete(k);
      }
    }
    return { allowed: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

function deny(status, code, message, retryAfter) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noai, noimageai',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
  if (retryAfter) headers['Retry-After'] = String(retryAfter);
  return new Response(JSON.stringify({ ok: false, error: code, message }), { status, headers });
}

export default function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const lowerPath = pathname.toLowerCase();
  const ua = (request.headers.get('user-agent') || '').trim();
  const ip = getIp(request);
  const now = Date.now();

  // Stripe webhook uses cryptographic HMAC verification inside api/stripe-webhook.js
  if (pathname === '/api/stripe-webhook') {
    return;
  }

  // 1. Honeypot traps
  if (HONEYPOT_PATHS.has(lowerPath)) {
    if (ip !== 'unknown') bannedIps.set(ip, now + BAN_MS);
    return deny(403, 'ACCESS_DENIED', 'Automated scraping is prohibited.');
  }

  // 2. Temporary IP ban check
  const banUntil = bannedIps.get(ip);
  if (banUntil && now < banUntil) {
    return deny(403, 'IP_TEMP_BANNED', 'Automated scraping is prohibited.');
  }

  // 3. Scraper / headless / AI crawler User-Agent block
  if (SCRAPER_UA_REGEX.test(ua)) {
    return deny(403, 'SCRAPER_BLOCKED', 'Automated scraping and bot harvesting are prohibited.');
  }

  const isData = pathname.startsWith('/data/');
  const isApi = pathname.startsWith('/api/');

  // 4. Block missing UA and search crawlers on /api/* and /data/*
  if (isData || isApi) {
    if (!ua || ua.length < 8 || SEARCH_BOT_REGEX.test(ua)) {
      return deny(403, 'BOT_BLOCKED', 'Direct automated access to protected data endpoints is prohibited.');
    }
  }

  // 5. Protect bulk JSON datasets (/data/*.json) against direct external scraping/hotlinking
  if (isData && lowerPath.endsWith('.json')) {
    const secFetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
    const referer = request.headers.get('referer') || '';
    let sameOriginReferer = false;
    if (referer) {
      try {
        sameOriginReferer = new URL(referer).host === url.host;
      } catch {
        sameOriginReferer = false;
      }
    }
    const isBrowserSameOrigin = secFetchSite === 'same-origin' || sameOriginReferer;
    if (!isBrowserSameOrigin) {
      return deny(403, 'DIRECT_DATA_SCRAPE_BLOCKED', 'Dataset access is restricted to interactive portal sessions.');
    }
  }

  // 6. Per-IP sliding-window rate limit
  if (isApi || isData) {
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
    const limit = isData ? 30 : isMutation ? 25 : 60;
    const rl = checkRate(`${isData ? 'data' : isMutation ? 'api-mut' : 'api-get'}:${ip}`, limit, 60_000, now);
    if (!rl.allowed) {
      return deny(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', rl.retryAfter);
    }
  }

  return;
}
