/**
 * Agent quality, actuality, anti-spam, and image enrichment helper.
 * Shared by server.js (CJS) and api/agents.js (Vercel ESM).
 */

const SPAM_NAME_RE = /\b(test|demo|admin|noreply|no-reply|spam|fake|null|undefined|unknown|sample|bot|asdf|qwerty|xxx|placeholder|anonymous)\b/i;
const VALID_NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,58}[\p{L}\p{M}.]$/u;

const STALE_OR_DISPOSABLE_DOMAINS = new Set([
  'aol.com', 'aim.com', 'juno.com', 'earthlink.net', 'compuserve.com',
  'netscape.net', 'prodigy.net', 'bellsouth.net', 'mailinator.com',
  'guerrillamail.com', 'tempmail.com', '10minutemail.com', 'example.com',
  'test.com', 'yopmail.com', 'trashmail.com'
]);

const FREE_WEBMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'me.com', 'msn.com', 'ymail.com', 'protonmail.com'
]);

function toTitleCase(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\p{L}+/gu, (w) => {
      if (w.length <= 2 && /^[A-Z]+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
}

function getEmailDomain(email) {
  const m = String(email || '').trim().toLowerCase().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  return m ? m[1] : '';
}

function isValidHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url.trim());
}

function isHighQualityAgent(ag) {
  if (!ag || typeof ag !== 'object') return false;
  if (ag.is_active === false || ag.is_active === 0) return false;

  const rawName = String(ag.name || ag.aname || '').trim();
  if (!rawName || rawName.length < 3) return false;
  if (SPAM_NAME_RE.test(rawName)) return false;
  if (/^\d+$/.test(rawName)) return false;
  if (!VALID_NAME_RE.test(rawName)) return false;

  const email = String(ag.email || '').trim().toLowerCase();
  const phone = String(ag.phone || ag.mobile || ag.office_tel || '').replace(/\D/g, '');
  if (!email && phone.length < 7) return false;

  if (email) {
    if (/^(noreply|no-reply|donotreply|do-not-reply|test|spam|bounce|postmaster)@/i.test(email)) {
      return false;
    }
    const domain = getEmailDomain(email);
    if (!domain || STALE_OR_DISPOSABLE_DOMAINS.has(domain)) return false;
  }

  // Reject stale unverified personal-webmail dumps that lack agency, registration, and photo
  const domain = getEmailDomain(email);
  const hasAgency = Boolean(ag.aname && String(ag.aname).trim());
  const hasReg = Boolean(ag.registration_number && String(ag.registration_number).trim());
  const hasPhoto = isValidHttpUrl(ag.photo_link || ag.avatar || ag.image);
  const hasCorpEmail = Boolean(domain && !FREE_WEBMAIL_DOMAINS.has(domain));

  if (!hasAgency && !hasReg && !hasPhoto && !hasCorpEmail) {
    return false;
  }

  return true;
}

const FEMALE_FIRST_NAMES = new Set([
  'vilma', 'amparo', 'yanet', 'maria', 'mary', 'sarah', 'sara', 'elena', 'anna', 'lisa',
  'laura', 'emma', 'olivia', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'emily',
  'jessica', 'ashley', 'amanda', 'jennifer', 'michelle', 'nicole', 'stephanie', 'rebecca',
  'rachel', 'patricia', 'linda', 'barbara', 'elizabeth', 'susan', 'karen', 'nancy', 'diana',
  'diane', 'irene', 'vanessa', 'claire', 'julia', 'hannah', 'victoria', 'natalie', 'catherine',
  'katherine', 'fatima', 'aisha', 'layla', 'nadia', 'yasmin', 'zainab', 'noor', 'hana',
  'sofia', 'lucia', 'paula', 'carmen', 'rosa', 'ana', 'monica', 'andrea', 'veronica',
  'christina', 'helen', 'alice', 'grace', 'chloe', 'zoe', 'maya', 'alina', 'olga', 'irina'
]);

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function enrichAgent(ag) {
  const cleanName = toTitleCase(ag.name || ag.aname || 'Real Estate Advisor');
  const email = String(ag.email || '').trim();
  const domain = getEmailDomain(email);
  const hasCorpDomain = Boolean(domain && !FREE_WEBMAIL_DOMAINS.has(domain));

  const upstreamPhoto = [ag.photo_link, ag.avatar, ag.image, ag.profile_image, ag.picture]
    .find(isValidHttpUrl) || null;

  return {
    ...ag,
    name: cleanName,
    aname: ag.aname ? toTitleCase(ag.aname) : (hasCorpDomain ? domain.split('.')[0].toUpperCase() : null),
    photo_link: upstreamPhoto,
    agency_logo: null,
    verified_broker: Boolean(ag.registration_number || ag.aname || hasCorpDomain)
  };
}

function filterAndEnrichAgents(rows) {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const clean = [];
  for (const ag of rows) {
    if (!isHighQualityAgent(ag)) continue;
    const dedupKey = `${toTitleCase(ag.name || ag.aname || '').toLowerCase()}|${String(ag.country || '').trim().toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    clean.push(enrichAgent(ag));
  }
  clean.sort((a, b) => {
    const score = (x) =>
      (x.photo_link ? 10 : 0) +
      (x.registration_number ? 4 : 0) +
      (x.aname ? 2 : 0) +
      (x.verified_broker ? 1 : 0);
    return score(b) - score(a);
  });
  return clean;
}

module.exports = { filterAndEnrichAgents, isHighQualityAgent, enrichAgent };
