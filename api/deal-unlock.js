import crypto from 'crypto';
import { verifyOwnerToken } from './owner-auth.js';

/**
 * POST /api/deal-unlock
 * Hardened SaaS Deal Room unlock endpoint (0% brokerage commission, 0% DLD intervention).
 * - Card unlocks MUST pass a real paid Stripe `stripeSessionId` verified directly with Stripe API.
 * - Bank wire `verify_proof` REQUIRES a valid Portal Owner HMAC token (`ownerToken` or `x-owner-token`).
 */

async function verifyStripeSessionPaid(sessionId) {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey || !sessionId) return { ok: false, reason: 'missing_stripe_key_or_session' };
  try {
    const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    if (!resp.ok) return { ok: false, reason: `stripe_http_${resp.status}` };
    const data = await resp.json();
    return {
      ok: data.payment_status === 'paid',
      amountUsd: Number(data.amount_total || 0) / 100,
      metadata: data.metadata || {}
    };
  } catch {
    return { ok: false, reason: 'stripe_network_error' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      action = 'submit_proof',
      dealId = 'DEAL-UAE-DIRECT',
      party = '',
      signerName = '',
      projectTitle = 'UAE Off-Plan Allocation',
      overseasPct = 55,
      uaePct = 45,
      billingMode = 'pay_per_unlock',
      paymentMethod = 'card',
      amountUsd = 250,
      txRef = '',
      receiptName = '',
      proofId = '',
      stripeSessionId = '',
      ownerToken = ''
    } = body;

    const headerOwnerToken = req.headers['x-owner-token'] || '';
    const isOwner = verifyOwnerToken(ownerToken || headerOwnerToken);
    const now = new Date().toISOString();

    if (action === 'sign') {
      const hashInput = `${dealId}|${projectTitle}|${overseasPct}/${uaePct}|${party}|${signerName}|${now}`;
      const contractHash = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 24).toUpperCase();
      return res.status(200).json({
        ok: true,
        action: 'sign',
        dealId,
        party,
        signerName: signerName || party,
        portalIntervention: false,
        dldIntervention: false,
        portalCommissionPct: 0,
        split: { overseasPct: Number(overseasPct), uaePct: Number(uaePct) },
        contractHash,
        signedAt: now
      });
    }

    if (action === 'submit_proof') {
      const prefix = paymentMethod === 'bank_upload'
        ? 'PAY-WIRE'
        : paymentMethod === 'credit'
          ? 'PAY-CRED'
          : paymentMethod === 'subscription'
            ? 'PAY-SUB'
            : 'PAY-CARD';
      const generatedProofId = `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Hardened: NEVER auto-verify card payments without confirming Stripe payment_status === 'paid'
      let proofStatus = 'pending_verification';
      let verifiedAmountUsd = Number(amountUsd) || 0;
      if (paymentMethod === 'card') {
        if (!stripeSessionId) {
          return res.status(402).json({
            ok: false,
            error: 'Stripe checkout session required. Complete Stripe payment before unlocking.'
          });
        }
        const stripeCheck = await verifyStripeSessionPaid(stripeSessionId);
        if (!stripeCheck.ok) {
          return res.status(402).json({
            ok: false,
            error: 'Stripe payment could not be verified as paid.',
            reason: stripeCheck.reason
          });
        }
        proofStatus = 'verified';
        verifiedAmountUsd = stripeCheck.amountUsd || verifiedAmountUsd;
      } else if ((paymentMethod === 'credit' || paymentMethod === 'subscription') && isOwner) {
        proofStatus = 'verified';
      }

      const proofHash = crypto
        .createHash('sha256')
        .update(`${dealId}|${billingMode}|${paymentMethod}|${verifiedAmountUsd}|${txRef}|${receiptName}|${now}`)
        .digest('hex')
        .slice(0, 20)
        .toUpperCase();

      return res.status(200).json({
        ok: true,
        action: 'submit_proof',
        dealId,
        billingMode,
        paymentMethod,
        amountUsd: verifiedAmountUsd,
        txRef: txRef || generatedProofId,
        receiptName: receiptName || '',
        proofId: generatedProofId,
        proofHash,
        proofStatus,
        unlocked: proofStatus === 'verified',
        verifiedAt: proofStatus === 'verified' ? now : null
      });
    }

    if (action === 'verify_proof') {
      // Hardened: Only authenticated Portal Owner can manually approve bank-wire proofs
      if (!isOwner) {
        return res.status(401).json({
          ok: false,
          error: 'Unauthorized: Portal Owner authentication required to verify payment proofs.'
        });
      }
      return res.status(200).json({
        ok: true,
        action: 'verify_proof',
        dealId,
        proofId: proofId || 'PAY-WIRE-VERIFIED',
        proofStatus: 'verified',
        unlocked: true,
        verifiedAt: now
      });
    }

    return res.status(400).json({ error: `Unsupported action: ${action}` });
  } catch (err) {
    return res.status(500).json({ error: 'Deal unlock failed', message: err.message });
  }
}
