import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { filterAndEnrichAgents } = require('../lib/agent-quality.cjs');

export default async function handler(req, res) {
  try {
    const reqUrl = new URL(req.url, 'http://localhost');
    const requestedSize = Math.max(1, Math.min(100, Number(reqUrl.searchParams.get('page_size')) || 24));
    const upstreamParams = new URLSearchParams(reqUrl.searchParams);
    upstreamParams.set('page_size', String(Math.min(100, requestedSize * 2)));

    const upstream = await fetch(`https://www.ai-home.world/api/agents?${upstreamParams.toString()}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Home-Global-Portal/1.0'
      }
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(upstream.status).send(text);
    }
    const payload = await upstream.json();
    const cleaned = filterAndEnrichAgents(payload.data || []).slice(0, requestedSize);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({ ...payload, data: cleaned });
  } catch (err) {
    return res.status(502).json({ error: 'Upstream /api/agents failed', message: err.message });
  }
}
