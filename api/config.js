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
    clerkFrontendApi
  });
}
