import crypto from 'crypto';

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
      proofId = ''
    } = body;

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
      const proofStatus = paymentMethod === 'bank_upload' ? 'pending_verification' : 'verified';
      const proofHash = crypto
        .createHash('sha256')
        .update(`${dealId}|${billingMode}|${paymentMethod}|${amountUsd}|${txRef}|${receiptName}|${now}`)
        .digest('hex')
        .slice(0, 20)
        .toUpperCase();

      return res.status(200).json({
        ok: true,
        action: 'submit_proof',
        dealId,
        billingMode,
        paymentMethod,
        amountUsd: Number(amountUsd) || 0,
        txRef: txRef || generatedProofId,
        receiptName: receiptName || '',
        proofId: generatedProofId,
        proofHash,
        proofStatus,
        verifiedAt: proofStatus === 'verified' ? now : null
      });
    }

    if (action === 'verify_proof') {
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
