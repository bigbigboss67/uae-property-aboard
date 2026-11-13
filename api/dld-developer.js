export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = `https://www.ai-home.world/api/dld-developer${url.search}`;
    const upstream = await fetch(target, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'AI-Home-Global-Portal/1.0' }
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'Upstream DLD fetch failed', message: err.message });
  }
}
