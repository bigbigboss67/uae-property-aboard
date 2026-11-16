async function sendResendEmail({ apiKey, from, to, subject, html }) {
  if (!apiKey || !to) return { sent: false, reason: apiKey ? 'missing_recipient' : 'RESEND_API_KEY_not_set' };
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html })
  });
  const data = await resp.json().catch(() => ({}));
  return { sent: resp.ok, status: resp.status, id: data.id || null, error: resp.ok ? null : (data.message || 'Resend error') };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const {
      event = '',
      dealId = '',
      projectId = '',
      projectName = 'UAE Off-Plan Project',
      party = '',
      signerName = '',
      recipientEmail = '',
      enquiry = null,
      origin = 'https://uae-property-aboard.vercel.app'
    } = body;

    const apiKey = process.env.RESEND_API_KEY || '';
    const from = process.env.RESEND_FROM || 'AI Home Global <onboarding@resend.dev>';
    const adminEmail = process.env.PORTAL_ADMIN_EMAIL || '';

    let to = recipientEmail || adminEmail;
    let subject = 'AI Home Global Notification';
    let html = '';

    if (event === 'party_signed') {
      const dealUrl = `${origin}/?deal=${encodeURIComponent(projectId || dealId)}`;
      subject = `[AI Home Global] ${signerName || party} signed Deal ${dealId} (${projectName})`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#0f172a;">Digital Signature Recorded</h2>
          <p style="color:#334155;"><strong>${signerName || party}</strong> (${party}) has digitally signed <strong>${projectName}</strong> (${dealId}).</p>
          <p style="color:#475569;font-size:13px;">Direct WhatsApp, Email, and Phone remain masked until both parties sign and Step 3 SaaS Unlock is verified.</p>
          <a href="${dealUrl}" style="display:inline-block;margin-top:12px;padding:10px 18px;background:#D4AF37;color:#000;font-weight:bold;text-decoration:none;border-radius:8px;">Open Masked Deal Room</a>
        </div>`;
    } else if (event === 'deal_unlocked') {
      subject = `[AI Home Global] Deal ${dealId} Unlocked · ${projectName}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #10b981;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#065f46;">Deal Room Unlocked</h2>
          <p style="color:#334155;">Payment proof is verified for <strong>${projectName}</strong> (${dealId}). Direct contacts are now unmasked inside your Deal Room.</p>
        </div>`;
    } else if (event === 'enquiry_submitted' && enquiry) {
      to = adminEmail || recipientEmail;
      subject = `[New Enquiry ${enquiry.enqId}] ${enquiry.projectName} (${enquiry.country})`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #0ea5e9;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#0f172a;">New Overseas Portal Enquiry</h2>
          <p><strong>Ref:</strong> ${enquiry.enqId}<br>
             <strong>Project:</strong> ${enquiry.projectName} (${enquiry.developer})<br>
             <strong>From:</strong> ${enquiry.fullName} (${enquiry.senderRole})<br>
             <strong>Country:</strong> ${enquiry.country}<br>
             <strong>Contact:</strong> ${enquiry.contact}<br>
             <strong>Budget:</strong> ${enquiry.budget}<br>
             <strong>Message:</strong> ${enquiry.message || '—'}</p>
          <p style="color:#475569;font-size:12px;">Open Partner Portal &rarr; Portal Enquiry Inbox to forward to the Developer or UAE RERA Partner.</p>
        </div>`;
    } else if (event === 'enquiry_forwarded' && enquiry) {
      to = recipientEmail || adminEmail;
      subject = `[Forwarded Enquiry ${enquiry.enqId}] ${enquiry.projectName} → ${enquiry.forwardedTo || 'Developer / UAE RERA Partner'}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #10b981;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#065f46;">Portal Enquiry Forwarded</h2>
          <p><strong>Ref:</strong> ${enquiry.enqId}<br>
             <strong>Project:</strong> ${enquiry.projectName} (${enquiry.developer})<br>
             <strong>Location:</strong> ${enquiry.location || 'UAE'}<br>
             <strong>Client:</strong> ${enquiry.fullName} (${enquiry.senderRole || 'Buyer'} · ${enquiry.country})<br>
             <strong>Phone / WhatsApp:</strong> ${enquiry.phone || enquiry.contact || '—'}<br>
             <strong>Email:</strong> ${enquiry.email || '—'}<br>
             <strong>Budget / Unit:</strong> ${enquiry.budget || 'Flexible'}<br>
             <strong>Message:</strong> ${enquiry.message || '—'}<br>
             <strong>Forwarded To:</strong> ${enquiry.forwardedTo || 'Developer / Licensed UAE Partner'}</p>
        </div>`;
    } else if (event === 'deal_closed') {
      subject = `[AI Home Global] Deal ${dealId} CLOSED · ${projectName}`;
      html = `
        <div style="font-family:Arial,sans-serif;max-width:560px;padding:20px;border:1px solid #D4AF37;border-radius:12px;">
          <h2 style="margin:0 0 8px;color:#0f172a;">Deal Closed (EOI / SPA Recorded)</h2>
          <p style="color:#334155;">Deal <strong>${dealId}</strong> for <strong>${projectName}</strong> has been marked <strong>DEAL_CLOSED</strong> in the AI Home Global ledger.</p>
        </div>`;
    } else {
      return res.status(400).json({ ok: false, error: 'Unsupported notify event' });
    }

    const result = await sendResendEmail({ apiKey, from, to, subject, html });
    return res.status(200).json({
      ok: true,
      channel: 'resend_email',
      emailConfigured: Boolean(apiKey),
      from,
      to: to || null,
      timestamp: new Date().toISOString(),
      ...result,
      subject
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
