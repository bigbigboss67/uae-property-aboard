export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      channel = 'both',
      campaignId = `cmp-${Date.now()}`,
      baseUrl = 'https://uae-property-aboard.vercel.app',
      subject = 'UAE Off-Plan Co-Brokerage Opportunity',
      messageTemplate = '',
      htmlTemplate = '',
      whatsappTemplate = '',
      recipients = []
    } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided.' });
    }

    const resendKey = process.env.RESEND_API_KEY || '';
    const resendFrom = process.env.RESEND_FROM || 'AI Home Global <onboarding@resend.dev>';
    const waToken = process.env.WHATSAPP_TOKEN || '';
    const waPhoneId = process.env.WHATSAPP_PHONE_ID || '';

    const personalize = (tpl, r, rid) => {
      let out = String(tpl || '')
        .replace(/\{\{name\}\}/g, r.name || 'Partner Agency')
        .replace(/\{\{company\}\}/g, r.company || 'International Realty')
        .replace(/\{\{country\}\}/g, r.country || 'International')
        .replace(/\{\{city\}\}/g, r.city || '');
      // Append per-recipient tracking params (cid & rid) to portal deal links
      out = out.replace(/(\?deal=[^\s"'<]+)/g, (m) =>
        m.includes('cid=') ? m : `${m}&cid=${encodeURIComponent(campaignId)}&rid=${encodeURIComponent(rid)}`
      );
      return out;
    };

    const results = [];
    let emailSent = 0;
    let waSent = 0;

    for (const r of recipients.slice(0, 100)) {
      const rid = String(r.id || r.email || r.phone || r.name || `r-${results.length + 1}`);
      const item = {
        id: rid,
        name: r.name,
        email: r.email || '',
        phone: r.phoneE164 || r.phone || '',
        campaignId,
        emailStatus: 'queued',
        waStatus: 'queued',
        emailMessageId: '',
        waMessageId: '',
        sentAt: new Date().toISOString()
      };

      if ((channel === 'email' || channel === 'both') && r.email) {
        if (resendKey) {
          try {
            const pixel = `<img src="${baseUrl}/api/track?t=open&cid=${encodeURIComponent(campaignId)}&rid=${encodeURIComponent(rid)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;" />`;
            const finalHtml = htmlTemplate ? `${personalize(htmlTemplate, r, rid)}${pixel}` : '';
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: resendFrom,
                to: [r.email],
                subject: personalize(subject, r, rid),
                text: personalize(messageTemplate, r, rid),
                ...(finalHtml ? { html: finalHtml } : {})
              })
            });
            const data = await resp.json().catch(() => ({}));
            item.emailStatus = resp.ok ? 'sent' : `error_${resp.status}`;
            if (resp.ok && data.id) item.emailMessageId = data.id;
            if (!resp.ok && (data.message || data.error)) item.emailError = data.message || data.error;
            if (resp.ok) emailSent++;
          } catch (e) {
            item.emailStatus = 'error_network';
            item.emailError = e.message;
          }
        } else {
          item.emailStatus = 'ready_client_queue';
        }
      } else {
        item.emailStatus = 'no_email';
      }

      const phoneE164 = r.phoneE164 || r.phone || '';
      if ((channel === 'whatsapp' || channel === 'both') && phoneE164) {
        if (waToken && waPhoneId) {
          try {
            const resp = await fetch(`https://graph.facebook.com/v20.0/${waPhoneId}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${waToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phoneE164.replace(/^\+/, ''),
                type: 'text',
                text: { body: personalize(whatsappTemplate || messageTemplate, r, rid) }
              })
            });
            const data = await resp.json().catch(() => ({}));
            item.waStatus = resp.ok ? 'sent' : `error_${resp.status}`;
            if (resp.ok && data.messages?.[0]?.id) item.waMessageId = data.messages[0].id;
            if (!resp.ok && data.error?.message) item.waError = data.error.message;
            if (resp.ok) waSent++;
          } catch (e) {
            item.waStatus = 'error_network';
            item.waError = e.message;
          }
        } else {
          item.waStatus = 'ready_wa_me_queue';
        }
      } else {
        item.waStatus = 'no_phone';
      }

      results.push(item);
    }

    return res.status(200).json({
      ok: true,
      campaignId,
      mode: {
        email: resendKey ? 'live-resend' : 'client-queue',
        whatsapp: (waToken && waPhoneId) ? 'live-whatsapp-cloud' : 'wa-me-queue'
      },
      summary: {
        totalProcessed: results.length,
        emailSent,
        waSent
      },
      results
    });
  } catch (err) {
    return res.status(500).json({ error: 'Broadcast failed', message: err.message });
  }
}
