const PROFILE_AUDIT_LOG = globalThis.__AI_HOME_PROFILE_AUDIT || (globalThis.__AI_HOME_PROFILE_AUDIT = []);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      count: PROFILE_AUDIT_LOG.length,
      recent: PROFILE_AUDIT_LOG.slice(-20)
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      clerkUserId = '',
      fullName = '',
      email = '',
      phone = '',
      role = 'overseas_agency',
      company = '',
      country = '',
      city = '',
      licenseRef = '',
      acceptedTerms = false,
      marketingConsent = false,
      marketingChannels = ['email', 'whatsapp'],
      termsVersion = '2026.11-v2.1'
    } = body;

    if (!fullName.trim() || !email.trim()) {
      return res.status(400).json({ ok: false, error: 'Full Name and Email are required.' });
    }
    if (acceptedTerms !== true) {
      return res.status(400).json({
        ok: false,
        error: 'Mandatory acceptance of Terms & Conditions, Privacy Policy, and Co-Brokerage Agreement is required.'
      });
    }

    const ip = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers?.['user-agent'] || 'unknown';
    const now = new Date().toISOString();

    const auditRecord = {
      consentId: `cns-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clerkUserId,
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: String(phone || '').trim(),
      role,
      company: String(company || '').trim(),
      country: String(country || '').trim(),
      city: String(city || '').trim(),
      licenseRef: String(licenseRef || '').trim(),
      acceptedTerms: true,
      termsVersion,
      acceptedTermsAt: now,
      marketingConsent: Boolean(marketingConsent),
      marketingConsentAt: marketingConsent ? now : null,
      marketingChannels: marketingConsent ? marketingChannels : [],
      legalBasis: marketingConsent ? 'GDPR Art. 6(1)(a) & UAE PDPL Art. 4 Explicit Consent' : 'GDPR Art. 6(1)(b) Contract Only (No Marketing)',
      ip,
      userAgent: String(userAgent).slice(0, 160)
    };

    PROFILE_AUDIT_LOG.push(auditRecord);
    if (PROFILE_AUDIT_LOG.length > 500) PROFILE_AUDIT_LOG.shift();

    return res.status(200).json({
      ok: true,
      audit: auditRecord
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
