export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      channel = 'both',
      subject = 'UAE Off-Plan Co-Brokerage Opportunity',
      messageTemplate = '',
      whatsappTemplate = '',
      recipients = []
    } = body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided.' });
    }

    const resendKey = process.env.RESEND_API_KEY || '';
    const resendFrom = process.env.RESEND_FROM || 'AI Home Global <deals@ai-home.world>';
    const waToken = process.env.WHATSAPP_TOKEN || '';
    const waPhoneId = process.env.WHATSAPP_PHONE_ID || '';

    const personalize = (tpl, r) =>
      String(tpl || '')
        .replace(/\{\{name\}\}/g, r.name || 'Partner Agency')
        .replace(/\{\{company\}\}/g, r.company || 'International Realty')
        .replace(/\{\{country\}\}/g, r.country || 'International')
        .replace(/\{\{city\}\}/g, r.city || '');

    const results = [];
    let emailSent = 0;
    let waSent = 0;

    for (const r of recipients.slice(0, 100)) {
      const item = { id: r.id || r.email || r.phone, name: r.name, emailStatus: 'queued', waStatus: 'queued' };

      if ((channel === 'email' || channel === 'both') && r.email) {
        if (resendKey) {
          try {
            const resp = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: resendFrom,
                to: [r.email],
                subject: personalize(subject, r),
                text: personalize(messageTemplate, r)
              })
            });
            item.emailStatus = resp.ok ? 'sent' : `error_${resp.status}`;
            if (resp.ok) emailSent++;
          } catch (e) {
            item.emailStatus = 'error_network';
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
                text: { body: personalize(whatsappTemplate || messageTemplate, r) }
              })
            });
            item.waStatus = resp.ok ? 'sent' : `error_${resp.status}`;
            if (resp.ok) waSent++;
          } catch (e) {
            item.waStatus = 'error_network';
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
