import crypto from 'crypto';

function getSecret() {
  return process.env.PORTAL_OWNER_PASSCODE || 'aih-owner-2026e';
}

function signOwnerToken(expMs) {
  const payload = String(expMs);
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyOwnerToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expMs = Number(payload);
  if (!Number.isFinite(expMs) || Date.now() > expMs) return false;
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const token = (req.query && req.query.token) || '';
    return res.status(200).json({ ok: true, verified: verifyOwnerToken(token) });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const passcode = String(body.passcode || '').trim();
    const expected = getSecret();

    const a = Buffer.from(passcode);
    const b = Buffer.from(expected);
    const match = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid Portal Owner passcode.' });
    }

    const expMs = Date.now() + 12 * 60 * 60 * 1000;
    return res.status(200).json({
      ok: true,
      verified: true,
      ownerToken: signOwnerToken(expMs),
      usingDefaultPasscode: !process.env.PORTAL_OWNER_PASSCODE
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
