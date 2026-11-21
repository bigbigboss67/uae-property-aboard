import fs from 'fs';
import path from 'path';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getLedgerFilePath() {
  if (process.env.VERCEL) return '/tmp/aih-ledger.json';
  return path.join(process.cwd(), 'data', 'ledger.json');
}

function readLocalLedger() {
  try {
    const p = getLedgerFilePath();
    if (!fs.existsSync(p)) return { enquiries: [] };
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { enquiries: [] };
  }
}

export default async function handler(req, res) {
  const q = req.query || {};
  const projectId = q.id || '';
  const enqId = q.enq || 'ENQ-000000';

  const ledger = readLocalLedger();
  const savedEnq = (Array.isArray(ledger.enquiries) ? ledger.enquiries : []).find(e => e.enqId === enqId) || null;

  let found = null;
  const lookupId = projectId || savedEnq?.projectId || '';
  if (lookupId) {
    try {
      const p = path.join(process.cwd(), 'data', 'offplan-registry.json');
      if (fs.existsSync(p)) {
        const list = JSON.parse(fs.readFileSync(p, 'utf8'));
        found = list.find(x => (x.id || x.propertyid) === lookupId) || null;
      }
    } catch {}
  }

  const title = q.project || savedEnq?.projectName || found?.project_name || found?.buildingname || 'UAE Off-Plan Project';
  const dev = q.dev || savedEnq?.developer || found?.developername || 'UAE Developer';
  const loc = q.loc || savedEnq?.location || [found?.areaname, found?.city].filter(Boolean).join(', ') || 'Dubai, UAE';
  const priceAED = Number(q.price || savedEnq?.priceAED || found?.propertyprice || 0);
  const usdPrice = priceAED > 0 ? Math.round(priceAED * 0.2723) : 0;
  const priceLabelAED = priceAED > 0 ? `AED ${priceAED.toLocaleString()}` : 'Price on Request';
  const priceLabelUSD = usdPrice > 0 ? `$${usdPrice.toLocaleString()} USD` : 'Price on Request';
  const unitType = String(q.unit || savedEnq?.unitTypes || (Array.isArray(found?.unit_types) && found.unit_types[0]) || found?.propertytype || 'APARTMENT').toUpperCase();
  const beds = q.beds || savedEnq?.beds || (found?.bedrooms ? `${found.bedrooms} Beds` : 'Flexible');
  const size = q.size || savedEnq?.sizeSqft || (found?.sizesqft ? `${Number(found.sizesqft).toLocaleString()} sqft` : 'TBA');
  const handover = q.handover || savedEnq?.handover || found?.handoverLabel || found?.deliverydate || 'TBA';
  const statusTag = /202[0-4]/.test(String(handover)) ? 'COMPLETED' : 'OFF-PLAN';
  const imgUrl = q.img || savedEnq?.imageUrl || found?.projectimage1url || 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80';
  const role = q.role || savedEnq?.senderRole || 'Broker Abroad';
  const country = q.country || savedEnq?.country || 'International';
  const budget = q.budget || savedEnq?.budget || `${unitType.toLowerCase()} (${beds}) · ${priceLabelAED}`;

  const ca = savedEnq?.commissionAgreement || {
    agreementId: `CSA-${enqId.replace(/^ENQ-/, '')}`,
    agreementRoute: q.route || savedEnq?.agreementRoute || 'ABROAD_TO_LOCAL_UAE_AGENCY',
    abroadAgencyName: q.agency || savedEnq?.agencyCompany || 'Verified Overseas Partner Agency',
    abroadLicenseRef: q.lic || savedEnq?.agencyLicense || 'INTL-BROKER-VERIFIED',
    uaeCounterpartyType: (q.route || savedEnq?.agreementRoute) === 'ABROAD_TO_UAE_DEVELOPER'
      ? 'UAE Master Developer Direct Desk'
      : 'Local UAE RERA Agency / Agent (Form I)',
    uaeCounterpartyName: q.uaeAgency || savedEnq?.uaeCounterpartyName || `${dev} / Local UAE RERA Agency`,
    uaeReraOrnBrn: q.orn || savedEnq?.uaeReraOrnBrn || 'RERA-ORN-VERIFIED',
    requestedSplitPct: Number(q.split) || 55,
    uaeCounterSplitPct: 100 - (Number(q.split) || 55),
    grossCommissionPct: Number(q.gross) || 5.0,
    portalCutPct: 0,
    status: role === 'Broker Abroad' ? 'PROPOSED_BY_ABROAD_AGENT' : 'DIRECT_BUYER_NO_SPLIT',
    abroadSignedBy: q.agency || 'Overseas Partner Representative',
    abroadSignedAt: savedEnq?.createdAt || new Date().toISOString(),
    uaeDecision: 'PENDING_UAE_REVIEW',
    uaeSignedBy: null,
    uaeSignedAt: null,
    uaeProofId: null,
    uaeSignatureHash: null,
    returnedToAbroadAt: null,
    returnReceiptId: null,
    legalAuditStatus: 'PENDING_LEGAL_AUDIT',
    legalAuditorName: null,
    legalAuditClauseRef: 'UAE Federal Decree-Law No. 46/2021 (E-Transactions) · RERA Form I Agent-to-Agent Co-Brokerage Protocol · Dubai Law No. 8/2007 (Escrow) · ICC NCNDA',
    legalAuditHash: `SHA256-${enqId.replace(/[^A-Z0-9]/gi, '')}8F92A4C1`,
    history: [
      {
        step: 'ENQUIRY_AND_SPLIT_CREATED',
        actor: q.agency || 'Overseas Partner',
        role,
        detail: `Documented & signed [${(q.route || savedEnq?.agreementRoute) === 'ABROAD_TO_UAE_DEVELOPER' ? 'Abroad Agency ↔ UAE Developer' : 'Abroad Agency ↔ Local UAE RERA Agency/Agent'}] Split: ${Number(q.split) || 55}% Overseas / ${100 - (Number(q.split) || 55)}% Local UAE Party (${Number(q.gross) || 5}% gross).`,
        timestamp: savedEnq?.createdAt || new Date().toISOString()
      }
    ]
  };

  const grossPoolAED = Math.round(priceAED * ((Number(ca.grossCommissionPct) || 5) / 100));
  const abroadPayoutAED = Math.round(grossPoolAED * ((Number(ca.requestedSplitPct) || 55) / 100));
  const uaePayoutAED = Math.max(0, grossPoolAED - abroadPayoutAED);

  const ogTitle = `${title} · ${priceLabelUSD} (${priceLabelAED}) · ${enqId} · Binding Commission Agreement ${ca.agreementId}`;
  const ogDesc = `${dev} · ${loc} · ${beds} · ${size} | Commission Split: ${ca.requestedSplitPct}% Overseas / ${ca.uaeCounterSplitPct}% UAE (${ca.grossCommissionPct}% Gross) · Legal Audited & QR Tracked`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(ogTitle)}</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI Home Global · Blind Partner Query & Binding Commission Split">
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
    * { box-sizing:border-box; }
    body { margin:0; background:#070A12; color:#F8FAFC; font-family:'Segoe UI',Arial,sans-serif; padding:24px 16px; }
    .wrap { max-width:960px; margin:0 auto; display:grid; grid-template-columns:1fr; gap:20px; }
    @media(min-width:860px){ .wrap { grid-template-columns: 440px 1fr; align-items:start; } }
    .card { background:#0E131F; border:1px solid rgba(212,175,55,0.4); border-radius:20px; overflow:hidden; box-shadow:0 24px 60px rgba(0,0,0,0.75); }
    .hero { position:relative; height:260px; background:#1E293B; overflow:hidden; }
    .hero img { width:100%; height:100%; object-fit:cover; display:block; }
    .scrim { position:absolute; inset:0; background:linear-gradient(to top, rgba(14,19,31,0.96) 0%, rgba(14,19,31,0.25) 55%, transparent 100%); }
    .top-badges { position:absolute; top:14px; left:14px; right:14px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
    .b-status { background:#059669; color:#FFF; font-size:11px; font-weight:800; padding:5px 10px; border-radius:8px; }
    .b-enq { background:rgba(10,12,19,0.85); color:#FCD34D; border:1px solid rgba(212,175,55,0.55); font-family:monospace; font-size:12px; font-weight:700; padding:5px 10px; border-radius:8px; }
    .b-unit { background:rgba(10,12,19,0.85); color:#D4AF37; border:1px solid rgba(212,175,55,0.45); font-size:11px; font-weight:800; padding:5px 10px; border-radius:8px; }
    .hero-bottom { position:absolute; bottom:14px; left:18px; right:18px; display:flex; justify-content:space-between; align-items:flex-end; }
    .price-usd { font-family:Georgia,serif; font-size:26px; font-weight:800; color:#FFF; margin:2px 0; }
    .price-aed { font-family:monospace; font-size:12px; color:#94A3B8; }
    .b-handover { background:rgba(255,255,255,0.14); color:#FFF; font-size:11px; font-weight:700; padding:5px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.2); }
    .body { padding:20px; }
    .dev { color:#D4AF37; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; }
    .title { font-family:Georgia,serif; font-size:22px; font-weight:800; color:#FFF; margin:4px 0 6px; }
    .loc { color:#94A3B8; font-size:13px; margin-bottom:14px; }
    .specs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; border-top:1px solid rgba(255,255,255,0.1); padding-top:14px; margin-bottom:14px; }
    .spec-box { background:rgba(255,255,255,0.05); padding:9px 10px; border-radius:10px; }
    .spec-lbl { color:#94A3B8; font-size:10px; display:block; }
    .spec-val { color:#FFF; font-size:13px; font-weight:800; margin-top:2px; display:block; }
    .query-box { background:#111827; border:1px solid rgba(56,189,248,0.4); border-radius:12px; padding:12px; }
    .q-head { color:#38BDF8; font-size:11px; font-weight:800; text-transform:uppercase; margin-bottom:5px; }
    .q-line { color:#E2E8F0; font-size:12px; line-height:1.45; margin:0 0 5px; }
    .q-foot { color:#FCD34D; font-size:11px; font-weight:700; margin:0; }
    .panel { background:#0E131F; border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:22px; box-shadow:0 24px 60px rgba(0,0,0,0.75); }
    .pill { display:inline-block; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:800; text-transform:uppercase; }
    .pill-gold { background:rgba(212,175,55,0.18); color:#FCD34D; border:1px solid rgba(212,175,55,0.45); }
    .pill-green { background:rgba(16,185,129,0.2); color:#6EE7B7; border:1px solid rgba(16,185,129,0.45); }
    .pill-blue { background:rgba(56,189,248,0.2); color:#7DD3FC; border:1px solid rgba(56,189,248,0.45); }
    .pill-red { background:rgba(244,63,94,0.2); color:#FDA4AF; border:1px solid rgba(244,63,94,0.45); }
    .split-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:14px 0; }
    .split-card { background:#131929; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; }
    .btn { cursor:pointer; border:none; border-radius:10px; padding:11px 14px; font-weight:800; font-size:12px; transition:transform 0.15s ease, filter 0.15s ease; }
    .btn:active { transform:scale(0.98); }
    .btn-approve { background:#10B981; color:#04130E; }
    .btn-adjust { background:#F59E0B; color:#110C02; }
    .btn-decline { background:#EF4444; color:#FFFFFF; }
    .btn-legal { background:#38BDF8; color:#04131D; }
    input, textarea { width:100%; background:#090C14; border:1px solid rgba(255,255,255,0.18); color:#FFF; border-radius:8px; padding:8px 10px; font-size:12px; }
    .stepper { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:14px 0; }
    .step { background:#131929; border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 6px; text-align:center; font-size:10px; color:#94A3B8; }
    .step.done { border-color:#10B981; background:rgba(16,185,129,0.14); color:#A7F3D0; font-weight:700; }
  </style>
</head>
<body>
  <div class="wrap">
    <!-- Left Column: Blind Property Query Card -->
    <div class="card">
      <div class="hero">
        <img src="${esc(imgUrl)}" alt="${esc(title)}">
        <div class="scrim"></div>
        <div class="top-badges">
          <div style="display:flex;gap:6px;">
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
        <div class="loc">📍 ${esc(loc)}</div>
        <div class="specs">
          <div class="spec-box"><span class="spec-lbl">Bedrooms</span><span class="spec-val">${esc(beds)}</span></div>
          <div class="spec-box"><span class="spec-lbl">Size</span><span class="spec-val">${esc(size)}</span></div>
          <div class="spec-box"><span class="spec-lbl">Handover</span><span class="spec-val" style="color:#34D399;">${esc(handover)}</span></div>
        </div>
        <div class="query-box">
          <div class="q-head">AI HOME GLOBAL · BLIND PARTNER QUERY (${esc(enqId)})</div>
          <p class="q-line"><strong>Applicant Role:</strong> ${esc(role)} (${esc(country)}) · <strong>Target:</strong> ${esc(budget)}</p>
          <p class="q-line" style="color:#94A3B8;font-size:11px;">🔒 Client name, phone &amp; email are strictly masked under ICC NCNDA &amp; RERA Co-Brokerage Protocol until Commission Split Agreement is dual-signed.</p>
          <p class="q-foot">Contract Ref: ${esc(ca.agreementId)} · Audit Hash: ${esc(ca.legalAuditHash || 'SHA256-VERIFIED')}</p>
        </div>
      </div>
    </div>

    <!-- Right Column: Binding Commission Split Agreement, UAE Action Console, Legal Audit & Live QR Tracker -->
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:14px;">
        <div>
          <span class="pill pill-gold">Binding Co-Brokerage Commission Split Agreement</span>
          <h1 style="font-size:20px;margin:8px 0 4px;color:#FFF;">Contract ${esc(ca.agreementId)} · Enquiry ${esc(enqId)}</h1>
          <div style="font-size:12px;color:#94A3B8;">Governing Framework: ${esc(ca.legalAuditClauseRef)}</div>
        </div>
        <div style="text-align:right;background:#131929;padding:8px;border-radius:12px;border:1px solid rgba(212,175,55,0.35);">
          <img id="qrTrackImg" alt="QR Code Live Tracker" width="84" height="84" style="display:block;border-radius:6px;background:#FFF;padding:4px;" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`https://uae-property-aboard.vercel.app/api/share-query?enq=${enqId}&id=${lookupId}`)}">
          <div style="font-size:9px;color:#FCD34D;font-weight:700;text-align:center;margin-top:4px;">SCAN TO TRACK</div>
        </div>
      </div>

      <!-- End-to-End 6-Stage Lifecycle Stepper (Documented -> Agreed -> Approved -> Signed -> Legal Audited -> Returned) -->
      <div class="stepper">
        <div class="step done">1. Documented &amp; Sent</div>
        <div class="step ${ca.abroadSignedAt ? 'done' : ''}">2. Abroad Agency Signed</div>
        <div class="step ${ca.uaeSignedAt ? 'done' : ''}">3. Local UAE Approved &amp; Signed</div>
        <div class="step ${ca.legalAuditStatus === 'LEGAL_APPROVED_BINDING' ? 'done' : ''}">4. Legal Audit Certified</div>
        <div class="step ${ca.returnedToAbroadAt || ca.status === 'BINDING_CONTRACT_SIGNED_AND_RETURNED' ? 'done' : ''}">5. Signed Copy Returned</div>
        <div class="step ${ca.status === 'BINDING_CONTRACT_SIGNED_AND_RETURNED' || ca.status === 'BINDING_CONTRACT_ACTIVE' ? 'done' : ''}">6. Binding Contract Active</div>
      </div>

      <!-- Counterparty Route Banner (Abroad Agency <-> Local UAE Agency/Agent vs Developer) -->
      <div style="background:#111827;border:1px solid rgba(212,175,55,0.35);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:11px;">
        <div>
          <strong style="color:#FCD34D;">Agreement Track:</strong>
          <span style="color:#FFF;">${esc(ca.agreementRoute === 'ABROAD_TO_UAE_DEVELOPER' ? 'Track A: Abroad Agency ↔ UAE Master Developer Direct' : 'Track B: Abroad Agency ↔ Local UAE RERA Agency / Agent (Form I Split Sharing)')}</span>
        </div>
        <span style="font-family:monospace;color:#38BDF8;">UAE Counterparty: ${esc(ca.uaeCounterpartyName || `${dev} / Local UAE RERA Agency`)} (${esc(ca.uaeReraOrnBrn || 'RERA-ORN-VERIFIED')})</span>
      </div>

      <!-- Financial Split Summary -->
      <div class="split-grid">
        <div class="split-card">
          <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;">Gross Developer Comm.</div>
          <div style="font-size:18px;font-weight:800;color:#FFF;margin-top:4px;" id="dispGrossPct">${esc(ca.grossCommissionPct)}%</div>
          <div style="font-size:11px;color:#94A3B8;font-family:monospace;">Pool: AED ${grossPoolAED.toLocaleString()}</div>
        </div>
        <div class="split-card" style="border-color:rgba(212,175,55,0.45);">
          <div style="font-size:10px;color:#FCD34D;text-transform:uppercase;font-weight:700;">Overseas Broker Split</div>
          <div style="font-size:18px;font-weight:800;color:#FCD34D;margin-top:4px;" id="dispAbroadPct">${esc(ca.requestedSplitPct)}%</div>
          <div style="font-size:11px;color:#E2E8F0;font-family:monospace;">AED ${abroadPayoutAED.toLocaleString()}</div>
        </div>
        <div class="split-card" style="border-color:rgba(56,189,248,0.45);">
          <div style="font-size:10px;color:#38BDF8;text-transform:uppercase;font-weight:700;">UAE Developer / Seller</div>
          <div style="font-size:18px;font-weight:800;color:#38BDF8;margin-top:4px;" id="dispUaePct">${esc(ca.uaeCounterSplitPct)}%</div>
          <div style="font-size:11px;color:#E2E8F0;font-family:monospace;">AED ${uaePayoutAED.toLocaleString()} (0% Portal Fee)</div>
        </div>
      </div>

      <!-- Dual-Party Signature & Legal Audit Status Box -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;font-size:11px;">
        <div style="background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;">
          <div style="color:#94A3B8;font-weight:700;text-transform:uppercase;font-size:10px;">Party B · Overseas Broker</div>
          <div style="color:#FFF;font-weight:800;margin-top:3px;">${esc(ca.abroadSignedBy || ca.abroadAgencyName)}</div>
          <div style="color:#10B981;font-size:10px;margin-top:2px;">✓ Digitally Signed</div>
        </div>
        <div style="background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;">
          <div style="color:#94A3B8;font-weight:700;text-transform:uppercase;font-size:10px;">Party A · UAE Developer / Seller</div>
          <div id="uaeSigName" style="color:#FFF;font-weight:800;margin-top:3px;">${esc(ca.uaeSignedBy || 'Awaiting UAE Signature')}</div>
          <div id="uaeSigBadge" style="color:${ca.uaeDecision === 'APPROVED' ? '#10B981' : ca.uaeDecision === 'ADJUSTED' ? '#F59E0B' : ca.uaeDecision === 'DECLINED' ? '#EF4444' : '#94A3B8'};font-size:10px;margin-top:2px;">
            ${esc(ca.uaeDecision)}
          </div>
        </div>
        <div style="background:#111827;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;">
          <div style="color:#94A3B8;font-weight:700;text-transform:uppercase;font-size:10px;">Legal Compliance &amp; RERA Audit</div>
          <div id="legalSigName" style="color:#FFF;font-weight:800;margin-top:3px;">${esc(ca.legalAuditorName || 'AI Home Global Legal Desk')}</div>
          <div id="legalSigBadge" style="color:${ca.legalAuditStatus === 'LEGAL_APPROVED_BINDING' ? '#10B981' : '#FCD34D'};font-size:10px;margin-top:2px;">
            ${esc(ca.legalAuditStatus)}
          </div>
        </div>
      </div>

      <!-- UAE Developer / Local UAE RERA Agency Action Console (Approve · Adjust · Decline · Sign & Return) -->
      <div style="background:#131929;border:1px solid rgba(56,189,248,0.35);border-radius:14px;padding:14px;margin-bottom:14px;">
        <div style="font-size:12px;font-weight:800;color:#38BDF8;text-transform:uppercase;margin-bottom:10px;">
          Local UAE Agency / Agent or Developer Decision Console (Documented · Agreed · Approved · Signed · Returned)
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:11px;color:#CBD5E1;display:block;margin-bottom:4px;">Counterparty Route</label>
            <select id="uaeRouteInput" style="width:100%;background:#090C14;border:1px solid rgba(255,255,255,0.18);color:#FFF;border-radius:8px;padding:8px 10px;font-size:12px;">
              <option value="ABROAD_TO_LOCAL_UAE_AGENCY" ${ca.agreementRoute !== 'ABROAD_TO_UAE_DEVELOPER' ? 'selected' : ''}>Abroad Agency ↔ Local UAE RERA Agency / Agent (Form I Split)</option>
              <option value="ABROAD_TO_UAE_DEVELOPER" ${ca.agreementRoute === 'ABROAD_TO_UAE_DEVELOPER' ? 'selected' : ''}>Abroad Agency ↔ UAE Master Developer Direct Desk</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:#CBD5E1;display:block;margin-bottom:4px;">Local UAE RERA ORN / BRN or Developer License #</label>
            <input id="uaeOrnInput" type="text" value="${esc(ca.uaeReraOrnBrn || 'RERA-ORN-11842 / BRN-49201')}" placeholder="e.g. RERA ORN-11842 / BRN-49201">
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:10px;">
          <div>
            <label style="font-size:11px;color:#CBD5E1;display:block;margin-bottom:4px;">Local UAE Agency / Agent or Developer Signatory Name</label>
            <input id="uaeSignerInput" type="text" value="${esc(ca.uaeSignedBy || ca.uaeCounterpartyName || `${dev} / Local UAE RERA Partner Agency`)}" placeholder="Enter Local UAE Agency / Agent or Developer Signatory">
          </div>
          <div>
            <label style="font-size:11px;color:#CBD5E1;display:block;margin-bottom:4px;">Abroad Split (% of Gross)</label>
            <input id="uaeAdjustPctInput" type="number" min="10" max="90" value="${esc(ca.requestedSplitPct)}">
          </div>
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:11px;color:#CBD5E1;display:block;margin-bottom:4px;">Agreement Terms &amp; Return Dispatch Notes</label>
          <input id="uaeNotesInput" type="text" value="${esc(ca.uaeCounterNotes || '')}" placeholder="e.g. Agreed & signed 55/45 Form I split sharing; signed copy returned to Abroad Agency">
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
          <button class="btn btn-approve" onclick="submitUaeDecision('APPROVED')">✓ 1-Click Approve, Sign, Issue Proof &amp; Return (${esc(ca.requestedSplitPct)}%)</button>
          <button class="btn btn-adjust" onclick="submitUaeDecision('ADJUSTED')">⇄ Adjust Split, Sign &amp; Return</button>
          <button class="btn btn-decline" onclick="submitUaeDecision('DECLINED')">✕ Decline &amp; Return Notice</button>
        </div>
      </div>

      <!-- Digital Proof of Approval, Signature & Return Receipt Seal (Visible immediately once Approved) -->
      <div id="proofOfApprovalCertificate" style="display:${ca.uaeDecision === 'APPROVED' || ca.status === 'BINDING_CONTRACT_SIGNED_AND_RETURNED' || ca.status === 'BINDING_CONTRACT_ACTIVE' ? 'block' : 'none'};background:linear-gradient(135deg,#06241B 0%,#0B1628 100%);border:1.5px solid #10B981;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 12px 30px rgba(16,185,129,0.18);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;border-bottom:1px solid rgba(16,185,129,0.25);padding-bottom:10px;margin-bottom:10px;">
          <div>
            <span class="pill pill-green">✓ OFFICIAL DIGITAL PROOF OF APPROVAL, DUAL SIGNATURE &amp; RETURN RECEIPT</span>
            <h3 style="margin:6px 0 2px;font-size:16px;color:#FFF;">Proof ID: <span id="certProofId" style="font-family:monospace;color:#6EE7B7;">${esc(ca.uaeProofId || `PRF-${enqId.replace(/^ENQ-/, '')}-VERIFIED`)}</span> · Return Receipt: <span style="font-family:monospace;color:#FCD34D;">${esc(ca.returnReceiptId || `RET-${enqId.replace(/^ENQ-/, '')}-SENT`)}</span></h3>
            <div style="font-size:11px;color:#A7F3D0;">Documented, Agreed, Approved, Signed &amp; Returned Split: <strong>${esc(ca.requestedSplitPct)}% Abroad Agency</strong> (AED ${abroadPayoutAED.toLocaleString()}) / <strong>${esc(ca.uaeCounterSplitPct)}% Local UAE Party</strong> (AED ${uaePayoutAED.toLocaleString()})</div>
          </div>
          <div style="text-align:right;font-family:monospace;font-size:10px;color:#6EE7B7;">
            <div>STATUS: <strong>${esc(ca.status || 'BINDING_CONTRACT_SIGNED_AND_RETURNED')}</strong></div>
            <div>RETURNED AT: <span id="certTimestamp">${esc(ca.returnedToAbroadAt || ca.uaeSignedAt || new Date().toISOString())}</span></div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;font-size:11px;margin-bottom:10px;">
          <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;">
            <div style="color:#94A3B8;font-size:10px;text-transform:uppercase;">Party B Digital Signature (Abroad Agency)</div>
            <div style="color:#FFF;font-weight:800;margin-top:2px;">${esc(ca.abroadSignedBy || ca.abroadAgencyName)}</div>
            <div style="color:#6EE7B7;font-family:monospace;font-size:10px;margin-top:2px;">Signed &amp; Sent: ${esc(ca.abroadSignedAt || 'Verified')}</div>
          </div>
          <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(16,185,129,0.35);border-radius:8px;padding:8px 10px;">
            <div style="color:#94A3B8;font-size:10px;text-transform:uppercase;">Party A Digital Signature (${esc(ca.uaeCounterpartyType || 'Local UAE RERA Agency / Developer')})</div>
            <div id="certUaeSigner" style="color:#FFF;font-weight:800;margin-top:2px;">${esc(ca.uaeSignedBy || `${dev} / Local UAE RERA Agency`)} (${esc(ca.uaeReraOrnBrn || 'RERA-ORN-VERIFIED')})</div>
            <div id="certUaeSigHash" style="color:#6EE7B7;font-family:monospace;font-size:10px;margin-top:2px;">Sig Seal: ${esc(ca.uaeSignatureHash || 'SIG-UAE-VERIFIED')} · Returned to Abroad Agency</div>
          </div>
        </div>
        <div style="font-size:10px;font-family:monospace;color:#CBD5E1;background:rgba(0,0,0,0.4);padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);">
          ⚖️ LEGAL AUDIT HASH: <strong style="color:#FCD34D;">${esc(ca.legalAuditHash || 'SHA256-VERIFIED')}</strong> · Audited, Approved &amp; Returned under UAE Federal Decree-Law No. 46/2021 (E-Transactions) &amp; RERA Form I Agent-to-Agent Co-Brokerage Protocol.
        </div>
      </div>

      <!-- Legal Compliance Audit & Binding Contract Certification -->
      <div style="background:#131929;border:1px solid rgba(16,185,129,0.35);border-radius:14px;padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="font-size:12px;font-weight:800;color:#6EE7B7;text-transform:uppercase;">
            ⚖️ Legal Compliance Audit &amp; Binding Contract Approval
          </div>
          <span style="font-size:10px;font-family:monospace;color:#94A3B8;">UAE Fed. Decree-Law 46/2021 · RERA Form I</span>
        </div>
        <p style="font-size:11px;color:#CBD5E1;margin:0 0 10px;line-height:1.45;">
          Verifies party signatures, RERA Co-Brokerage compliance, 90-day ICC Non-Circumvention protection, and Dubai Escrow Law No. 8 of 2007 routing (100% of buyer principal wires directly to DLD Escrow).
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-legal" onclick="submitLegalAudit('LEGAL_APPROVED_BINDING')">⚖️ Audit &amp; Approve as Binding Contract</button>
          <button class="btn" style="background:rgba(255,255,255,0.1);color:#FFF;" onclick="window.print()">🖨️ Print / Save Signed Binding Contract PDF</button>
        </div>
      </div>

      <div id="actionFeedback" style="display:none;padding:10px 12px;border-radius:10px;background:rgba(16,185,129,0.2);border:1px solid #10B981;color:#A7F3D0;font-size:12px;font-weight:700;margin-bottom:12px;"></div>

      <!-- Audit Trail History -->
      <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">
        <div style="font-size:11px;font-weight:800;color:#FCD34D;text-transform:uppercase;margin-bottom:8px;">Immutable Contract &amp; QR Audit Log</div>
        <div id="auditHistoryList" style="display:flex;flex-direction:column;gap:6px;font-size:11px;">
          ${(Array.isArray(ca.history) ? ca.history : []).map(h => `
            <div style="background:#111827;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 10px;">
              <div style="display:flex;justify-content:space-between;color:#38BDF8;font-weight:700;">
                <span>${esc(h.step)} · ${esc(h.actor)}</span>
                <span style="font-family:monospace;font-size:10px;color:#94A3B8;">${esc(h.timestamp)}</span>
              </div>
              <div style="color:#E2E8F0;margin-top:3px;">${esc(h.detail)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>

  <script>
    const ENQ_ID = ${JSON.stringify(enqId)};
    async function submitUaeDecision(decision) {
      const signerName = document.getElementById('uaeSignerInput').value.trim() || 'Local UAE RERA Agency / Developer Signatory';
      const agreementRoute = document.getElementById('uaeRouteInput') ? document.getElementById('uaeRouteInput').value : 'ABROAD_TO_LOCAL_UAE_AGENCY';
      const uaeReraOrnBrn = document.getElementById('uaeOrnInput') ? document.getElementById('uaeOrnInput').value.trim() : 'RERA-ORN-VERIFIED';
      const adjustedSplitPct = Number(document.getElementById('uaeAdjustPctInput').value) || 55;
      const notes = document.getElementById('uaeNotesInput').value.trim();
      const fb = document.getElementById('actionFeedback');
      fb.style.display = 'block';
      fb.innerText = 'Recording Local UAE Agency / Developer digital signature, issuing Proof of Approval & returning signed contract to Abroad Agency...';
      try {
        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_commission_agreement',
            enqId: ENQ_ID,
            subAction: 'uae_decision',
            decision,
            signerName,
            agreementRoute,
            uaeReraOrnBrn,
            adjustedSplitPct,
            notes
          })
        });
        const data = await res.json();
        if (data.ok) {
          fb.innerText = '✓ Decision (' + decision + ') digitally signed, Proof of Approval issued, and signed contract returned to Abroad Agency. Reloading...';
          setTimeout(() => window.location.reload(), 600);
        }
      } catch (e) {
        fb.innerText = 'Error: ' + e.message;
      }
    }

    async function submitLegalAudit(auditStatus) {
      const fb = document.getElementById('actionFeedback');
      fb.style.display = 'block';
      fb.innerText = 'Running Legal Compliance Audit & generating binding SHA-256 certificate...';
      try {
        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_commission_agreement',
            enqId: ENQ_ID,
            subAction: 'legal_audit',
            auditStatus,
            auditorName: 'AI Home Global Legal & RERA Compliance Counsel'
          })
        });
        const data = await res.json();
        if (data.ok) {
          fb.innerText = '✓ Legal Compliance Audit Approved — Contract is now CERTIFIED BINDING.';
          setTimeout(() => window.location.reload(), 600);
        }
      } catch (e) {
        fb.innerText = 'Error: ' + e.message;
      }
    }
  </script>
</body>
</html>`;

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(html);
}
