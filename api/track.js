const TRACK_STORE = globalThis.__AI_HOME_TRACK_STORE || (globalThis.__AI_HOME_TRACK_STORE = {
  events: [],
  byCampaign: {}
});

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function recordEvent(ev) {
  const entry = {
    type: ev.type || 'visit',
    cid: String(ev.cid || 'default'),
    rid: String(ev.rid || ''),
    channel: String(ev.channel || ''),
    messageId: String(ev.messageId || ''),
    meta: ev.meta || '',
    ts: new Date().toISOString()
  };
  TRACK_STORE.events.push(entry);
  if (TRACK_STORE.events.length > 2000) TRACK_STORE.events.shift();

  if (!TRACK_STORE.byCampaign[entry.cid]) {
    TRACK_STORE.byCampaign[entry.cid] = { opens: {}, clicks: {}, sent: {}, waSent: {} };
  }
  const c = TRACK_STORE.byCampaign[entry.cid];
  const key = entry.rid || 'anon';
  if (entry.type === 'open') c.opens[key] = (c.opens[key] || 0) + 1;
  else if (entry.type === 'click' || entry.type === 'visit') c.clicks[key] = (c.clicks[key] || 0) + 1;
  else if (entry.type === 'email_sent') c.sent[key] = entry.messageId || entry.ts;
  else if (entry.type === 'wa_sent' || entry.type === 'wa_queued') c.waSent[key] = entry.messageId || entry.ts;
  return entry;
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://uae-property-aboard.vercel.app');
  const t = url.searchParams.get('t') || '';
  const cid = url.searchParams.get('cid') || 'default';
  const rid = url.searchParams.get('rid') || '';

  if (req.method === 'GET') {
    if (t === 'open') {
      recordEvent({ type: 'open', cid, rid, channel: 'email' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.end(TRANSPARENT_GIF);
    }

    if (t === 'click') {
      const to = url.searchParams.get('to') || 'https://uae-property-aboard.vercel.app/';
      const ch = url.searchParams.get('ch') || 'email';
      recordEvent({ type: 'click', cid, rid, channel: ch });
      res.statusCode = 302;
      res.setHeader('Location', to);
      return res.end();
    }

    if (t === 'stats') {
      const c = TRACK_STORE.byCampaign[cid] || { opens: {}, clicks: {}, sent: {}, waSent: {} };
      return res.status(200).json({
        ok: true,
        cid,
        opensCount: Object.keys(c.opens).length,
        clicksCount: Object.keys(c.clicks).length,
        emailSentCount: Object.keys(c.sent).length,
        waSentCount: Object.keys(c.waSent).length,
        campaign: c,
        recentEvents: TRACK_STORE.events.filter(e => e.cid === cid).slice(-50)
      });
    }

    return res.status(200).json({ ok: true, totalEvents: TRACK_STORE.events.length });
  }

  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const list = Array.isArray(body.events) ? body.events : [body];
      const recorded = list.map(recordEvent);
      return res.status(200).json({ ok: true, recordedCount: recorded.length, events: recorded });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
