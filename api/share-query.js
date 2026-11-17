import fs from 'fs';
import path from 'path';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  const q = req.query || {};
  const projectId = q.id || '';
  const enqId = q.enq || 'ENQ-000000';

  let found = null;
  if (projectId) {
    try {
      const p = path.join(process.cwd(), 'data', 'offplan-registry.json');
      if (fs.existsSync(p)) {
        const list = JSON.parse(fs.readFileSync(p, 'utf8'));
        found = list.find(x => (x.id || x.propertyid) === projectId) || null;
      }
    } catch {}
  }

  const title = q.project || found?.project_name || found?.buildingname || 'UAE Off-Plan Project';
  const dev = q.dev || found?.developername || 'UAE Developer';
  const loc = q.loc || [found?.areaname, found?.city].filter(Boolean).join(', ') || 'Dubai, UAE';
  const priceAED = Number(q.price || found?.propertyprice || 0);
  const usdPrice = priceAED > 0 ? Math.round(priceAED * 0.2723) : 0;
  const priceLabelAED = priceAED > 0 ? `AED ${priceAED.toLocaleString()}` : 'Price on Request';
  const priceLabelUSD = usdPrice > 0 ? `$${usdPrice.toLocaleString()} USD` : 'Price on Request';
  const unitType = String(q.unit || (Array.isArray(found?.unit_types) && found.unit_types[0]) || found?.propertytype || 'APARTMENT').toUpperCase();
  const beds = q.beds || (found?.bedrooms ? `${found.bedrooms} Beds` : 'Flexible');
  const size = q.size || (found?.sizesqft ? `${Number(found.sizesqft).toLocaleString()} sqft` : 'TBA');
  const handover = q.handover || found?.handoverLabel || found?.deliverydate || 'TBA';
  const statusTag = /202[0-4]/.test(String(handover)) ? 'COMPLETED' : 'OFF-PLAN';
  const imgUrl = q.img || found?.projectimage1url || 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80';
  const role = q.role || 'Direct Buyer';
  const country = q.country || 'International';
  const budget = q.budget || `${unitType.toLowerCase()} (${beds}) · ${priceLabelAED}`;

  const ogTitle = `${title} · ${priceLabelUSD} (${priceLabelAED}) · ${enqId}`;
  const ogDesc = `${dev} · ${loc} · ${beds} · ${size} · Handover ${handover} | Blind Partner Query (${role} · ${country}) — Client PII Protected`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(ogTitle)}</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI Home Global · Blind Partner Query">
  <meta property="og:title" content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(ogDesc)}">
  <meta property="og:image" content="${esc(imgUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(ogTitle)}">
  <meta name="twitter:description" content="${esc(ogDesc)}">
  <meta name="twitter:image" content="${esc(imgUrl)}">
  <style>
    body { margin:0; background:#070A12; color:#F8FAFC; font-family:'Segoe UI',Arial,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; box-sizing:border-box; }
    .card { width:100%; max-width:520px; background:#0E131F; border:1px solid rgba(212,175,55,0.4); border-radius:20px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.75); }
    .hero { position:relative; height:300px; background:#1E293B; overflow:hidden; }
    .hero img { width:100%; height:100%; object-fit:cover; display:block; }
    .scrim { position:absolute; inset:0; background:linear-gradient(to top, rgba(14,19,31,0.96) 0%, rgba(14,19,31,0.25) 55%, transparent 100%); }
    .top-badges { position:absolute; top:16px; left:16px; right:16px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .b-status { background:#059669; color:#FFF; font-size:11px; font-weight:800; padding:6px 12px; border-radius:8px; }
    .b-enq { background:rgba(10,12,19,0.85); color:#FCD34D; border:1px solid rgba(212,175,55,0.55); font-family:monospace; font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; }
    .b-unit { background:rgba(10,12,19,0.85); color:#D4AF37; border:1px solid rgba(212,175,55,0.45); font-size:11px; font-weight:800; padding:6px 12px; border-radius:8px; }
    .hero-bottom { position:absolute; bottom:16px; left:20px; right:20px; display:flex; justify-content:space-between; align-items:flex-end; }
    .price-usd { font-family:Georgia,serif; font-size:30px; font-weight:800; color:#FFF; margin:2px 0; }
    .price-aed { font-family:monospace; font-size:13px; color:#94A3B8; }
    .b-handover { background:rgba(255,255,255,0.14); color:#FFF; font-size:12px; font-weight:700; padding:6px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); }
    .body { padding:22px; }
    .dev { color:#D4AF37; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; }
    .title { font-family:Georgia,serif; font-size:26px; font-weight:800; color:#FFF; margin:4px 0 6px; }
    .loc { color:#94A3B8; font-size:14px; margin-bottom:16px; }
    .specs { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; border-top:1px solid rgba(255,255,255,0.1); padding-top:16px; margin-bottom:18px; }
    .spec-box { background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:12px; }
    .spec-lbl { color:#94A3B8; font-size:11px; display:block; }
    .spec-val { color:#FFF; font-size:15px; font-weight:800; margin-top:3px; display:block; }
    .query-box { background:#111827; border:1px solid rgba(56,189,248,0.4); border-radius:14px; padding:14px; }
    .q-head { color:#38BDF8; font-size:11px; font-weight:800; text-transform:uppercase; margin-bottom:6px; }
    .q-line { color:#E2E8F0; font-size:13px; line-height:1.5; margin:0 0 6px; }
    .q-foot { color:#FCD34D; font-size:11px; font-weight:700; margin:0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="hero">
      <img src="${esc(imgUrl)}" alt="${esc(title)}">
      <div class="scrim"></div>
      <div class="top-badges">
        <div style="display:flex;gap:8px;">
          <span class="b-status">${esc(statusTag)}</span>
          <span class="b-enq">${esc(enqId)}</span>
        </div>
        <span class="b-unit">${esc(unitType)}</span>
      </div>
      <div class="hero-bottom">
        <div>
          <div style="font-size:10px;color:#CBD5E1;font-weight:700;letter-spacing:1px;">STARTING FROM</div>
          <div class="price-usd">${esc(priceLabelUSD)}</div>
          <div class="price-aed">${esc(priceLabelAED)}</div>
        </div>
        <span class="b-handover">${esc(handover)}</span>
      </div>
    </div>
    <div class="body">
      <div class="dev">${esc(dev)} · ${esc(loc)}</div>
      <div class="title">${esc(title)}</div>
      <div class="loc">Location: ${esc(loc)}</div>
      <div class="specs">
        <div class="spec-box"><span class="spec-lbl">Bedrooms</span><span class="spec-val">${esc(beds)}</span></div>
        <div class="spec-box"><span class="spec-lbl">Size</span><span class="spec-val">${esc(size)}</span></div>
        <div class="spec-box"><span class="spec-lbl">Handover</span><span class="spec-val" style="color:#34D399;">${esc(handover)}</span></div>
      </div>
      <div class="query-box">
        <div class="q-head">AI HOME GLOBAL · BLIND PARTNER QUERY (${esc(enqId)})</div>
        <p class="q-line"><strong>Buyer Profile:</strong> ${esc(role)} (${esc(country)}) · <strong>Budget:</strong> ${esc(budget)}</p>
        <p class="q-line" style="color:#94A3B8;font-size:12px;">Requesting unit availability, floor plans &amp; payment plan. (Client PII protected)</p>
        <p class="q-foot">Reply to AI Home Global Desk with availability to lock allocation.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(html);
}
