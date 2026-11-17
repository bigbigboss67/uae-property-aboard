async function sendResendEmail({ apiKey, from, to, subject, html, attachments }) {
  if (!apiKey || !to) return { sent: false, reason: apiKey ? 'missing_recipient' : 'RESEND_API_KEY_not_set' };
  const payload = { from, to: Array.isArray(to) ? to : [to], subject, html };
  if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
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
      cardImageBase64 = '',
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
      const imgUrl = enquiry.imageUrl || 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=900&q=80';
      const priceText = Number(enquiry.priceAED) > 0 ? `AED ${Number(enquiry.priceAED).toLocaleString()}` : 'Price on Request';
      const listingUrl = enquiry.listingUrl || `https://www.ai-home.world/off-plan/${encodeURIComponent(enquiry.projectId || '')}`;
      subject = `[Blind Property Query ${enquiry.enqId}] ${enquiry.projectName} · ${enquiry.location || 'UAE'}`;
      html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0B0F19;color:#F8FAFC;border:1px solid #D4AF37;border-radius:16px;overflow:hidden;">
          <div style="padding:16px 20px;background:linear-gradient(90deg,#111827,#0B0F19);border-bottom:1px solid rgba(255,255,255,0.1);">
            <span style="display:inline-block;background:rgba(212,175,55,0.18);color:#FCD34D;border:1px solid rgba(212,175,55,0.45);font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:1px;">AI Home Global · Blind Partner Query</span>
            <span style="float:right;font-family:monospace;color:#38BDF8;font-size:12px;font-weight:700;">${enquiry.enqId}</span>
          </div>
          <img src="${imgUrl}" alt="${enquiry.projectName}" style="width:100%;height:240px;object-fit:cover;display:block;">
          <div style="padding:20px;">
            <div style="font-size:11px;font-weight:700;color:#D4AF37;text-transform:uppercase;letter-spacing:0.8px;">${enquiry.developer || 'UAE Developer'} · ${enquiry.location || 'UAE'}${enquiry.dldVerified ? ' · ✓ DLD Verified' : ''}</div>
            <h2 style="margin:4px 0 12px;font-size:22px;color:#FFFFFF;">${enquiry.projectName}</h2>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
              <tr>
                <td style="padding:10px;background:#131A2A;border:1px solid rgba(255,255,255,0.08);border-radius:8px;width:33%;">
                  <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;">Starting Price</div>
                  <div style="font-size:14px;font-weight:800;color:#FCD34D;margin-top:2px;">${priceText}</div>
                </td>
                <td style="width:8px;"></td>
                <td style="padding:10px;background:#131A2A;border:1px solid rgba(255,255,255,0.08);border-radius:8px;width:33%;">
                  <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;">Specs</div>
                  <div style="font-size:13px;font-weight:700;color:#FFFFFF;margin-top:2px;">${enquiry.beds || 'Flexible'} · ${enquiry.sizeSqft || 'TBA'}</div>
                </td>
                <td style="width:8px;"></td>
                <td style="padding:10px;background:#131A2A;border:1px solid rgba(255,255,255,0.08);border-radius:8px;width:33%;">
                  <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;">Handover</div>
                  <div style="font-size:13px;font-weight:700;color:#34D399;margin-top:2px;">${enquiry.handover || 'TBA'}</div>
                </td>
              </tr>
            </table>
            <div style="padding:14px;background:#111827;border:1px solid rgba(56,189,248,0.3);border-radius:10px;margin-bottom:16px;">
              <div style="font-size:11px;font-weight:700;color:#38BDF8;text-transform:uppercase;margin-bottom:6px;">Masked Client Request (${enquiry.enqId})</div>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#E2E8F0;">
                <strong>Buyer Profile:</strong> ${enquiry.senderRole || 'Direct Buyer'} (${enquiry.country || 'International'})<br>
                <strong>Requested Unit / Budget:</strong> ${enquiry.budget || 'Flexible'}<br>
                <strong>Query:</strong> ${enquiry.message || 'Requesting availability, payment plan, and floor plans.'}
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#94A3B8;">🔒 Client name, phone, and email are protected by AI Home Global. Reply to the Portal Desk with availability to proceed.</p>
            </div>
            <a href="${listingUrl}" style="display:inline-block;padding:11px 20px;background:#D4AF37;color:#0A0C13;font-weight:800;font-size:13px;text-decoration:none;border-radius:10px;">View Property Dossier &amp; Listing →</a>
          </div>
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

    const attachments = (event === 'enquiry_forwarded' && cardImageBase64 && enquiry?.enqId)
      ? [{ filename: `AI-Home-Global-${enquiry.enqId}.png`, content: cardImageBase64.replace(/^data:image\/png;base64,/, '') }]
      : [];
    const result = await sendResendEmail({ apiKey, from, to, subject, html, attachments });
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
