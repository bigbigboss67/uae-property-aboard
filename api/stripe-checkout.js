export default async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';

  if (req.method === 'GET') {
    const sessionId = (req.query && req.query.session_id) || '';
    if (!sessionId) {
      return res.status(200).json({ ok: true, stripeConfigured: Boolean(secretKey) });
    }
    if (!secretKey) {
      return res.status(400).json({ ok: false, error: 'STRIPE_SECRET_KEY not configured' });
    }
    try {
      const resp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${secretKey}` }
      });
      const data = await resp.json();
      if (!resp.ok) {
        return res.status(resp.status).json({ ok: false, error: data?.error?.message || 'Stripe verify failed' });
      }
      return res.status(200).json({
        ok: true,
        stripeConfigured: true,
        paid: data.payment_status === 'paid',
        paymentStatus: data.payment_status,
        amountUsd: (Number(data.amount_total || 0) / 100),
        metadata: data.metadata || {}
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      amountUsd = 250,
      dealId = 'DEAL-UAE',
      projectTitle = 'UAE Off-Plan Deal Unlock',
      billingMode = 'pay_per_unlock',
      tierLabel = 'SaaS Deal Room Access',
      userEmail = '',
      origin = 'https://uae-property-aboard.vercel.app'
    } = body;

    const cleanUsd = Math.max(10, Math.round(Number(amountUsd) || 250));
    const description = billingMode === 'wallet_credit_topup'
      ? 'AI Home Global · +5 SaaS Deal Room Unlock Credits'
      : `AI Home Global · ${tierLabel} (0% Brokerage) · ${projectTitle}`;

    if (!secretKey) {
      return res.status(200).json({
        ok: true,
        stripeConfigured: false,
        amountUsd: cleanUsd,
        description,
        message: 'Stripe live key (STRIPE_SECRET_KEY) not set in environment. Running in signed proof mode.'
      });
    }

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', `${origin}/?stripe_session_id={CHECKOUT_SESSION_ID}&deal=${encodeURIComponent(dealId)}`);
    params.append('cancel_url', `${origin}/?stripe_cancelled=1`);
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][product_data][name]', description);
    params.append('line_items[0][price_data][unit_amount]', String(cleanUsd * 100));
    params.append('line_items[0][quantity]', '1');
    params.append('metadata[dealId]', String(dealId));
    params.append('metadata[billingMode]', String(billingMode));
    params.append('metadata[portalFeeType]', String(portalFeeType));
    if (userEmail) params.append('customer_email', String(userEmail));

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    const session = await resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: session?.error?.message || 'Stripe session failed' });
    }

    return res.status(200).json({
      ok: true,
      stripeConfigured: true,
      sessionId: session.id,
      checkoutUrl: session.url,
      amountUsd: cleanUsd
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
