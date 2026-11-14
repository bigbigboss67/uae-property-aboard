export default async function handler(req, res) {
  try {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstream = await fetch(`https://www.ai-home.world/api/agents${query}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Home-Global-Portal/1.0'
      }
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream /api/agents failed', message: err.message });
  }
}
