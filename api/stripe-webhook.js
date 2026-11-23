import crypto from 'crypto';

/**
 * POST /api/stripe-webhook
 * Verifies Stripe-Signature (HMAC-SHA256) and credits verified SaaS lead unlocks
 * or subscription quotas into Supabase `aih_ledger` (never trusting unverified client calls).
 */

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    String(sigHeader)
      .split(',')
      .map((kv) => kv.split('='))
      .filter((pair) => pair.length === 2)
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject replays older than 5 minutes
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function recordVerifiedPaymentInSupabase({ userId, dealId, billingMode, creditsAdded, amountUsd, sessionId }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const getResp = await fetch(`${url}/rest/v1/aih_ledger?user_id=eq.${encodeURIComponent(userId)}&select=payload`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    let payload = { walletCredits: 0, subQuota: 0, leads: [], enquiries: [], contracts: {}, crmContacts: [], crmTasks: [], verifiedPayments: [] };
    if (getResp.ok) {
      const rows = await getResp.json();
      if (Array.isArray(rows) && rows[0]?.payload) {
        payload = { ...payload, ...rows[0].payload };
      }
    }
    payload.verifiedPayments = Array.isArray(payload.verifiedPayments) ? payload.verifiedPayments : [];
    // Idempotency: ignore duplicate Stripe webhook deliveries
    if (payload.verifiedPayments.some((p) => p.sessionId === sessionId)) return true;

    const now = new Date().toISOString();
    payload.verifiedPayments.push({ sessionId, dealId, billingMode, amountUsd, paidAt: now });
    if (billingMode === 'wallet_credit_topup') {
      payload.walletCredits = Number(payload.walletCredits || 0) + Number(creditsAdded || 5);
    } else if (billingMode === 'subscription') {
      payload.subQuota = Number(payload.subQuota || 0) + Number(creditsAdded || 15);
    } else if (dealId) {
      payload.contracts = payload.contracts || {};
      payload.contracts[dealId] = {
        ...(payload.contracts[dealId] || {}),
        dealId,
        unlocked: true,
        paymentVerifiedBy: 'stripe_webhook',
        stripeSessionId: sessionId,
        amountUsd,
        unlockedAt: now
      };
    }

    const putResp = await fetch(`${url}/rest/v1/aih_ledger?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ user_id: userId, payload, updated_at: now })
    });
    return putResp.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!webhookSecret) {
    return res.status(503).json({ ok: false, error: 'STRIPE_WEBHOOK_SECRET is not configured' });
  }
  const rawBody = await readRawBody(req);
  const sig = req.headers['stripe-signature'] || '';
  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    return res.status(400).json({ ok: false, error: 'Invalid Stripe webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON payload' });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data?.object || {};
    if (session.payment_status === 'paid') {
      const meta = session.metadata || {};
      await recordVerifiedPaymentInSupabase({
        userId: String(meta.userId || 'default-partner').slice(0, 80),
        dealId: String(meta.dealId || ''),
        billingMode: String(meta.billingMode || 'pay_per_unlock'),
        creditsAdded: Number(meta.credits || 5),
        amountUsd: Number(session.amount_total || 0) / 100,
        sessionId: String(session.id || '')
      });
    }
  }

  return res.status(200).json({ ok: true, received: true });
}
