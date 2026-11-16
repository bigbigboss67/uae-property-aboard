export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const clerkPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    '';
  const clerkFrontendApi =
    process.env.CLERK_FRONTEND_API ||
    process.env.NEXT_PUBLIC_CLERK_FRONTEND_API ||
    '';

  return res.status(200).json({
    ok: true,
    clerkConfigured: Boolean(clerkPublishableKey),
    clerkPublishableKey,
    clerkFrontendApi,
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    resendFrom: process.env.RESEND_FROM || 'AI Home Global <onboarding@resend.dev>',
    adminEmailConfigured: Boolean(process.env.PORTAL_ADMIN_EMAIL),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    ownerPasscodeCustom: Boolean(process.env.PORTAL_OWNER_PASSCODE)
  });
}
