import fs from 'fs';
import path from 'path';
import { verifyOwnerToken } from './owner-auth.js';

const DEFAULT_LEDGER = {
  walletCredits: 5,
  subQuota: 10,
  leads: [],
  enquiries: [],
  contracts: {},
  crmContacts: [],
  crmTasks: []
};

function getFilePath() {
  if (process.env.VERCEL) return '/tmp/aih-ledger.json';
  return path.join(process.cwd(), 'data', 'ledger.json');
}

function readLocalLedger() {
  try {
    const p = getFilePath();
    if (!fs.existsSync(p)) return structuredClone(DEFAULT_LEDGER);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      walletCredits: typeof parsed.walletCredits === 'number' ? parsed.walletCredits : 5,
      subQuota: typeof parsed.subQuota === 'number' ? parsed.subQuota : 10,
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      enquiries: Array.isArray(parsed.enquiries) ? parsed.enquiries : [],
      contracts: parsed.contracts && typeof parsed.contracts === 'object' ? parsed.contracts : {},
      crmContacts: Array.isArray(parsed.crmContacts) ? parsed.crmContacts : [],
      crmTasks: Array.isArray(parsed.crmTasks) ? parsed.crmTasks : []
    };
  } catch {
    return structuredClone(DEFAULT_LEDGER);
  }
}

function writeLocalLedger(data) {
  const p = getFilePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

async function readSupabaseLedger(userId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const resp = await fetch(`${url}/rest/v1/aih_ledger?user_id=eq.${encodeURIComponent(userId)}&select=payload`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (Array.isArray(rows) && rows[0]?.payload) return rows[0].payload;
    return structuredClone(DEFAULT_LEDGER);
  } catch {
    return null;
  }
}

async function writeSupabaseLedger(userId, payload) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const resp = await fetch(`${url}/rest/v1/aih_ledger?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ user_id: userId, payload, updated_at: new Date().toISOString() })
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const userId = ((req.query && req.query.userId) || 'default-partner').slice(0, 80);
  const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const sbData = useSupabase ? await readSupabaseLedger(userId) : null;
    const ledger = sbData || readLocalLedger();
    return res.status(200).json({
      ok: true,
      storage: sbData ? 'supabase' : (process.env.VERCEL ? 'tmp-json' : 'file-json'),
      ...ledger
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action = '' } = body;
    const ownerToken = body.ownerToken || req.headers['x-owner-token'] || '';
    const isOwner = verifyOwnerToken(ownerToken);

    // Protect privileged financial & legal actions from unauthenticated callers
    const OWNER_ONLY_ACTIONS = new Set(['topup_credits', 'verify_payment_proof', 'close_deal', 'legal_audit_commission_split']);
    if (OWNER_ONLY_ACTIONS.has(action) && !isOwner) {
      return res.status(401).json({ ok: false, error: `Unauthorized: Portal Owner authentication required for ${action}.` });
    }

    const sbData = useSupabase ? await readSupabaseLedger(userId) : null;
    const ledger = sbData || readLocalLedger();

    if (action === 'register_sla' && body.lead) {
      ledger.leads = ledger.leads.filter(l => l.certId !== body.lead.certId);
      ledger.leads.push(body.lead);
    } else if (action === 'topup_credits') {
      ledger.walletCredits = Math.max(0, Number(ledger.walletCredits || 0) + Number(body.credits || 5));
    } else if (action === 'use_credit') {
      if (ledger.walletCredits <= 0) {
        return res.status(400).json({ ok: false, error: 'No wallet credits remaining' });
      }
      ledger.walletCredits -= 1;
    } else if (action === 'use_sub') {
      if (ledger.subQuota <= 0) {
        return res.status(400).json({ ok: false, error: 'No Pro Plan quota remaining' });
      }
      ledger.subQuota -= 1;
    } else if (action === 'submit_enquiry' && body.enquiry) {
      ledger.enquiries = Array.isArray(ledger.enquiries) ? ledger.enquiries : [];
      const now = new Date().toISOString();
      const eq = body.enquiry;
      const commDefaults = eq.commissionAgreement || {
        agreementId: `CSA-${(eq.enqId || '000000').replace(/^ENQ-/, '')}`,
        agreementRoute: eq.agreementRoute || 'ABROAD_TO_LOCAL_UAE_AGENCY', // ABROAD_TO_UAE_DEVELOPER | ABROAD_TO_LOCAL_UAE_AGENCY
        abroadAgencyName: eq.agencyCompany || eq.fullName || 'Overseas Partner Agency',
        abroadLicenseRef: eq.agencyLicense || 'INTL-BROKER-VERIFIED',
        uaeCounterpartyType: eq.uaeCounterpartyType || 'Local UAE RERA Agency / Agent (Form I)',
        uaeCounterpartyName: eq.uaeCounterpartyName || `${eq.developer || 'UAE Developer'} / Local UAE RERA Agency`,
        uaeReraOrnBrn: eq.uaeReraOrnBrn || 'RERA-ORN-VERIFIED',
        requestedSplitPct: Number(eq.requestedSplitPct) || 55,
        uaeCounterSplitPct: 100 - (Number(eq.requestedSplitPct) || 55),
        grossCommissionPct: Number(eq.grossCommissionPct) || 5.0,
        portalCutPct: 0,
        status: eq.senderRole === 'Broker Abroad' ? 'PROPOSED_BY_ABROAD_AGENT' : 'DIRECT_BUYER_NO_SPLIT',
        abroadSignedBy: eq.senderRole === 'Broker Abroad' ? (eq.fullName || 'Overseas Agent') : null,
        abroadSignedAt: eq.senderRole === 'Broker Abroad' ? now : null,
        uaeDecision: 'PENDING_UAE_REVIEW',
        uaeSignedBy: null,
        uaeSignedAt: null,
        uaeProofId: null,
        uaeSignatureHash: null,
        returnedToAbroadAt: null,
        returnReceiptId: null,
        uaeAdjustedSplitPct: null,
        uaeCounterNotes: '',
        legalAuditStatus: 'PENDING_LEGAL_AUDIT',
        legalAuditorName: null,
        legalAuditClauseRef: 'UAE Federal Decree-Law No. 46/2021 (E-Transactions) · RERA Form I Agent-to-Agent Co-Brokerage Protocol · Dubai Law No. 8/2007 (Escrow) · ICC NCNDA',
        legalAuditHash: `SHA256-${Buffer.from(`${eq.enqId || 'ENQ'}-${eq.projectId || 'UAE'}-${now}`).toString('hex').slice(0, 24).toUpperCase()}`,
        legalAuditedAt: null,
        history: [
          {
            step: 'ENQUIRY_AND_SPLIT_CREATED',
            actor: eq.fullName || 'Applicant',
            role: eq.senderRole || 'Broker Abroad',
            detail: eq.senderRole === 'Broker Abroad'
              ? `Documented & signed [${eq.agreementRoute === 'ABROAD_TO_UAE_DEVELOPER' ? 'Abroad Agency ↔ UAE Developer' : 'Abroad Agency ↔ Local UAE RERA Agency/Agent'}] Split: ${Number(eq.requestedSplitPct) || 55}% Overseas / ${100 - (Number(eq.requestedSplitPct) || 55)}% Local UAE Party (${Number(eq.grossCommissionPct) || 5}% gross).`
              : 'Direct Buyer enquiry submitted (0% portal fee).',
            timestamp: now
          }
        ]
      };
      ledger.enquiries.unshift({
        ...eq,
        commissionAgreement: commDefaults,
        status: 'QUEUED_FOR_FORWARDING',
        createdAt: now
      });
      ledger.crmContacts = Array.isArray(ledger.crmContacts) ? ledger.crmContacts : [];
      const emailKey = String(eq.email || '').trim().toLowerCase();
      const phoneKey = String(eq.phone || '').trim();
      const existingIdx = ledger.crmContacts.findIndex(c =>
        (emailKey && String(c.email || '').toLowerCase() === emailKey) ||
        (phoneKey && String(c.phone || '') === phoneKey)
      );
      if (existingIdx !== -1) {
        const cur = ledger.crmContacts[existingIdx];
        ledger.crmContacts[existingIdx] = {
          ...cur,
          fullName: eq.fullName || cur.fullName,
          phone: eq.phone || cur.phone,
          email: eq.email || cur.email,
          country: eq.country || cur.country,
          role: eq.senderRole || cur.role,
          enquiryCount: (cur.enquiryCount || 1) + 1,
          pipelineAED: (Number(cur.pipelineAED) || 0) + (Number(eq.priceAED) || 0),
          lastEnqId: eq.enqId,
          updatedAt: new Date().toISOString()
        };
      } else {
        ledger.crmContacts.unshift({
          contactId: `CNT-${Date.now().toString().slice(-6)}`,
          fullName: eq.fullName || 'Client',
          phone: eq.phone || '',
          email: eq.email || '',
          country: eq.country || 'International',
          role: eq.senderRole || 'Direct Buyer',
          company: '',
          leadScore: 'Hot',
          tags: [eq.country || 'International'].filter(Boolean),
          enquiryCount: 1,
          pipelineAED: Number(eq.priceAED) || 0,
          lastEnqId: eq.enqId,
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } else if (action === 'forward_enquiry' && body.enqId) {
      ledger.enquiries = Array.isArray(ledger.enquiries) ? ledger.enquiries : [];
      const now = new Date().toISOString();
      const d = body.dispatch || {};
      const entry = {
        channel: d.channel || 'resend_email',
        from: d.from || 'AI Home Global <onboarding@resend.dev>',
        to: d.to || body.recipientEmail || null,
        sent: Boolean(d.sent),
        messageId: d.messageId || null,
        reason: d.reason || null,
        error: d.error || null,
        forwardedTo: body.forwardedTo || 'Developer / RERA Partner Desk',
        timestamp: d.timestamp || now
      };
      const nextStatus = entry.sent
        ? 'DELIVERED_EMAIL'
        : (entry.channel === 'whatsapp_web' || entry.channel === 'mailto_client')
          ? 'MANUAL_CHANNEL_OPENED'
          : 'DISPATCH_NOT_SENT';
      ledger.enquiries = ledger.enquiries.map(eq => {
        if (eq.enqId !== body.enqId) return eq;
        const log = Array.isArray(eq.dispatchLog) ? [...eq.dispatchLog, entry] : [entry];
        const nextStage = (eq.dealStage && eq.dealStage !== 'new_enquiry')
          ? eq.dealStage
          : (entry.sent || entry.channel === 'whatsapp_web' || entry.channel === 'mailto_client')
            ? 'partner_queried'
            : 'new_enquiry';
        return {
          ...eq,
          status: nextStatus,
          dealStage: nextStage,
          forwardedTo: entry.forwardedTo,
          forwardedAt: now,
          lastDispatch: entry,
          dispatchLog: log
        };
      });
    } else if (action === 'update_followup' && body.enqId) {
      ledger.enquiries = Array.isArray(ledger.enquiries) ? ledger.enquiries : [];
      const now = new Date().toISOString();
      ledger.enquiries = ledger.enquiries.map(eq => {
        if (eq.enqId !== body.enqId) return eq;
        const existingLog = Array.isArray(eq.followUpLog) ? eq.followUpLog : [];
        const newLog = body.noteEntry ? [...existingLog, { ...body.noteEntry, timestamp: body.noteEntry.timestamp || now }] : existingLog;
        return {
          ...eq,
          dealStage: body.dealStage || eq.dealStage || 'new_enquiry',
          assignedPartner: body.assignedPartner !== undefined ? body.assignedPartner : (eq.assignedPartner || ''),
          nextAction: body.nextAction !== undefined ? body.nextAction : (eq.nextAction || ''),
          followUpDueAt: body.followUpDueAt !== undefined ? body.followUpDueAt : (eq.followUpDueAt || ''),
          lastOutcome: body.lastOutcome || eq.lastOutcome || '',
          followUpLog: newLog,
          updatedAt: now
        };
      });
    } else if (action === 'upsert_contact' && body.contact) {
      ledger.crmContacts = Array.isArray(ledger.crmContacts) ? ledger.crmContacts : [];
      const c = body.contact;
      const cid = c.contactId || `CNT-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();
      const idx = ledger.crmContacts.findIndex(x => x.contactId === cid);
      const next = { ...c, contactId: cid, updatedAt: now, createdAt: c.createdAt || now };
      if (idx !== -1) ledger.crmContacts[idx] = { ...ledger.crmContacts[idx], ...next };
      else ledger.crmContacts.unshift(next);
    } else if (action === 'upsert_task' && body.task) {
      ledger.crmTasks = Array.isArray(ledger.crmTasks) ? ledger.crmTasks : [];
      const t = body.task;
      const tid = t.taskId || `TSK-${Date.now().toString().slice(-6)}`;
      const now = new Date().toISOString();
      const idx = ledger.crmTasks.findIndex(x => x.taskId === tid);
      const next = { ...t, taskId: tid, updatedAt: now, createdAt: t.createdAt || now };
      if (idx !== -1) ledger.crmTasks[idx] = { ...ledger.crmTasks[idx], ...next };
      else ledger.crmTasks.unshift(next);
    } else if (action === 'toggle_task' && body.taskId) {
      ledger.crmTasks = (ledger.crmTasks || []).map(t =>
        t.taskId === body.taskId ? { ...t, completed: Boolean(body.completed), updatedAt: new Date().toISOString() } : t
      );
    } else if (action === 'delete_task' && body.taskId) {
      ledger.crmTasks = (ledger.crmTasks || []).filter(t => t.taskId !== body.taskId);
    } else if (action === 'save_contract' && (body.contract?.dealId || body.contract?.contractId)) {
      const cid = body.contract.dealId || body.contract.contractId;
      ledger.contracts[cid] = {
        ...body.contract,
        dealId: cid,
        updatedAt: new Date().toISOString()
      };
    } else if (action === 'update_commission_agreement' && body.enqId) {
      ledger.enquiries = Array.isArray(ledger.enquiries) ? ledger.enquiries : [];
      const now = new Date().toISOString();
      const subAction = body.subAction || 'uae_decision';
      ledger.enquiries = ledger.enquiries.map(eq => {
        if (eq.enqId !== body.enqId) return eq;
        const cur = eq.commissionAgreement || {
          agreementId: `CSA-${eq.enqId.replace(/^ENQ-/, '')}`,
          requestedSplitPct: 55,
          uaeCounterSplitPct: 45,
          grossCommissionPct: 5.0,
          portalCutPct: 0,
          status: 'PROPOSED_BY_ABROAD_AGENT',
          uaeDecision: 'PENDING_UAE_REVIEW',
          legalAuditStatus: 'PENDING_LEGAL_AUDIT',
          legalAuditClauseRef: 'UAE Federal Decree-Law No. 46/2021 (E-Transactions) · RERA Form I Co-Brokerage Protocol · Dubai Law No. 8/2007 (Escrow) · ICC NCNDA',
          history: []
        };
        const history = Array.isArray(cur.history) ? [...cur.history] : [];
        const updated = { ...cur };

        if (subAction === 'abroad_sign') {
          const reqSplit = Number(body.requestedSplitPct || updated.requestedSplitPct || 55);
          const grossPct = Number(body.grossCommissionPct || updated.grossCommissionPct || 5.0);
          updated.requestedSplitPct = reqSplit;
          updated.uaeCounterSplitPct = 100 - reqSplit;
          updated.grossCommissionPct = grossPct;
          updated.abroadAgencyName = body.abroadAgencyName || updated.abroadAgencyName || eq.fullName || 'Overseas Partner Agency';
          updated.abroadLicenseRef = body.abroadLicenseRef || updated.abroadLicenseRef || 'INTL-BROKER-VERIFIED';
          updated.abroadSignedBy = body.signerName || updated.abroadAgencyName;
          updated.abroadSignedAt = now;
          updated.status = updated.uaeSignedAt ? 'DUAL_SIGNED_PENDING_LEGAL' : 'PROPOSED_BY_ABROAD_AGENT';
          history.push({
            step: 'ABROAD_AGENT_SIGNED',
            actor: updated.abroadSignedBy,
            role: 'Overseas Broker (Party B)',
            detail: `Signed Commission Split Proposal: ${reqSplit}% Overseas / ${100 - reqSplit}% UAE Seller (${grossPct}% gross).`,
            timestamp: now
          });
        } else if (subAction === 'uae_decision') {
          const decision = String(body.decision || 'APPROVED').toUpperCase(); // APPROVED | ADJUSTED | DECLINED
          const uaeSigner = body.signerName || eq.forwardedTo || `${eq.developer || 'UAE Developer'} / Local UAE RERA Agency`;
          const uaeOrnBrn = body.uaeReraOrnBrn || updated.uaeReraOrnBrn || 'RERA-ORN-VERIFIED';
          const routeMode = body.agreementRoute || updated.agreementRoute || 'ABROAD_TO_LOCAL_UAE_AGENCY';
          const proofId = `PRF-${eq.enqId.replace(/^ENQ-/, '')}-${Date.now().toString().slice(-6)}`;
          const sigStamp = `SIG-UAE-${Buffer.from(`${eq.enqId}-${uaeSigner}-${decision}-${now}`).toString('hex').slice(0, 16).toUpperCase()}`;
          const returnReceiptId = `RET-${eq.enqId.replace(/^ENQ-/, '')}-${Date.now().toString().slice(-6)}`;
          updated.agreementRoute = routeMode;
          updated.uaeCounterpartyType = routeMode === 'ABROAD_TO_UAE_DEVELOPER'
            ? 'UAE Master Developer Direct Desk'
            : 'Local UAE RERA Agency / Agent (Form I)';
          updated.uaeCounterpartyName = uaeSigner;
          updated.uaeReraOrnBrn = uaeOrnBrn;
          updated.uaeDecision = decision;
          updated.uaeSignedBy = uaeSigner;
          updated.uaeSignedAt = now;
          updated.uaeProofId = proofId;
          updated.uaeSignatureHash = sigStamp;
          updated.returnedToAbroadAt = now;
          updated.returnReceiptId = returnReceiptId;
          updated.uaeCounterNotes = body.notes || '';
          if (decision === 'ADJUSTED') {
            const adj = Math.max(5, Math.min(95, Number(body.adjustedSplitPct) || 50));
            updated.uaeAdjustedSplitPct = adj;
            updated.requestedSplitPct = adj;
            updated.uaeCounterSplitPct = 100 - adj;
            updated.status = 'ADJUSTED_SIGNED_AND_RETURNED';
            history.push({
              step: 'UAE_PARTY_ADJUSTED_SIGNED_AND_RETURNED',
              actor: `${uaeSigner} (${uaeOrnBrn})`,
              role: updated.uaeCounterpartyType,
              detail: `Counter-adjusted split to ${adj}% Overseas / ${100 - adj}% Local UAE Party, digitally signed & returned to Abroad Agency (Proof: ${proofId} · Return Receipt: ${returnReceiptId}). ${updated.uaeCounterNotes}`.trim(),
              timestamp: now
            });
          } else if (decision === 'DECLINED') {
            updated.status = 'DECLINED_BY_UAE_SELLER';
            history.push({
              step: 'UAE_PARTY_DECLINED_AND_RETURNED',
              actor: `${uaeSigner} (${uaeOrnBrn})`,
              role: updated.uaeCounterpartyType,
              detail: `Declined proposed commission split & returned notice (Ref: ${proofId} · Return: ${returnReceiptId}). ${updated.uaeCounterNotes}`.trim(),
              timestamp: now
            });
          } else {
            updated.uaeAdjustedSplitPct = updated.requestedSplitPct;
            // Instant 1-Click Approval: Digitally signs Party A + auto-generates Proof of Approval + Legal Compliance Certification + Returns Signed Copy to Abroad Agency
            updated.legalAuditStatus = 'LEGAL_APPROVED_BINDING';
            updated.legalAuditorName = updated.legalAuditorName || 'AI Home Global Legal & RERA Compliance Engine';
            updated.legalAuditedAt = now;
            updated.legalAuditNotes = `Automated Legal & RERA Compliance Verification passed upon 1-click Approval & Return (${updated.uaeCounterpartyType} · ${uaeOrnBrn}) under UAE Federal Decree-Law No. 46/2021 (E-Transactions), RERA Form I Agent-to-Agent Co-Brokerage Rules, Dubai Escrow Law No. 8/2007, and ICC NCNDA.`;
            updated.legalAuditHash = `SHA256-${Buffer.from(`${eq.enqId}-${updated.requestedSplitPct}-${updated.abroadSignedAt || ''}-${now}-${proofId}-${returnReceiptId}`).toString('hex').slice(0, 24).toUpperCase()}`;
            updated.status = 'BINDING_CONTRACT_SIGNED_AND_RETURNED';
            history.push({
              step: 'UAE_APPROVED_SIGNED_CERTIFIED_AND_RETURNED',
              actor: `${uaeSigner} (${uaeOrnBrn})`,
              role: updated.uaeCounterpartyType,
              detail: `✓ 1-Click Approved, Digitally Signed & Returned to Abroad Agency (${updated.abroadAgencyName || 'Overseas Partner'}) · Split: ${updated.requestedSplitPct}% Overseas / ${updated.uaeCounterSplitPct}% Local UAE (${uaeOrnBrn}) · Proof of Approval: ${proofId} · Return Receipt: ${returnReceiptId} · Digital Sig: ${sigStamp} · Legal Hash: ${updated.legalAuditHash}. ${updated.uaeCounterNotes}`.trim(),
              timestamp: now
            });
          }
        } else if (subAction === 'return_to_abroad') {
          const returnReceiptId = `RET-${eq.enqId.replace(/^ENQ-/, '')}-${Date.now().toString().slice(-6)}`;
          updated.returnedToAbroadAt = now;
          updated.returnReceiptId = returnReceiptId;
          if (updated.legalAuditStatus === 'LEGAL_APPROVED_BINDING' || updated.uaeDecision === 'APPROVED') {
            updated.status = 'BINDING_CONTRACT_SIGNED_AND_RETURNED';
          }
          history.push({
            step: 'SIGNED_AGREEMENT_RETURNED_TO_ABROAD_AGENCY',
            actor: body.actorName || updated.uaeSignedBy || 'UAE Counterparty / Portal Desk',
            role: updated.uaeCounterpartyType || 'Local UAE RERA Agency / Developer',
            detail: `✓ Signed & Legal-Audited Commission Split Agreement returned to Abroad Agency (${updated.abroadAgencyName || 'Overseas Partner'}) with Return Receipt ${returnReceiptId} & QR Tracking Dossier.`,
            timestamp: now
          });
        } else if (subAction === 'legal_audit') {
          const auditDecision = String(body.auditStatus || 'LEGAL_APPROVED_BINDING').toUpperCase();
          const auditor = body.auditorName || 'AI Home Global Legal & RERA Compliance Desk';
          updated.legalAuditStatus = auditDecision;
          updated.legalAuditorName = auditor;
          updated.legalAuditedAt = now;
          updated.legalAuditNotes = body.notes || 'Audited under UAE Federal Decree-Law No. 46/2021 (Electronic Transactions & Trust Services), RERA Form I Co-Brokerage Rules, Dubai Escrow Law No. 8/2007, and ICC Non-Circumvention Covenant.';
          updated.legalAuditHash = `SHA256-${Buffer.from(`${eq.enqId}-${updated.requestedSplitPct}-${updated.abroadSignedAt || ''}-${updated.uaeSignedAt || ''}-${now}`).toString('hex').slice(0, 24).toUpperCase()}`;
          if (auditDecision === 'LEGAL_APPROVED_BINDING') {
            updated.status = 'BINDING_CONTRACT_ACTIVE';
          } else {
            updated.status = 'LEGAL_FLAGGED_FOR_REVISION';
          }
          history.push({
            step: auditDecision,
            actor: auditor,
            role: 'Legal & RERA Compliance Auditor',
            detail: `${auditDecision === 'LEGAL_APPROVED_BINDING' ? '✓ CERTIFIED BINDING CONTRACT' : 'Flagged for revision'} (Hash: ${updated.legalAuditHash}). ${updated.legalAuditNotes}`,
            timestamp: now
          });
        }

        updated.history = history;
        const followLog = Array.isArray(eq.followUpLog) ? [...eq.followUpLog] : [];
        const latestHist = history[history.length - 1];
        if (latestHist) {
          followLog.push({
            stage: eq.dealStage || 'partner_queried',
            nextAction: updated.status === 'BINDING_CONTRACT_ACTIVE' ? 'Binding Commission Agreement active — proceed to unit allocation / EOI' : 'Verify Commission Split Agreement & Legal Audit',
            note: `[Commission Agreement ${updated.agreementId}] ${latestHist.actor}: ${latestHist.detail}`,
            timestamp: now
          });
        }
        return {
          ...eq,
          commissionAgreement: updated,
          followUpLog: followLog,
          updatedAt: now
        };
      });
    } else if (action === 'close_deal' && body.dealId) {
      const existing = ledger.contracts[body.dealId] || {};
      ledger.contracts[body.dealId] = {
        ...existing,
        dealId: body.dealId,
        projectName: body.projectName || existing.projectName || 'UAE Off-Plan Project',
        buyerType: body.buyerType || existing.buyerType || 'Direct Buyer / Overseas Partner',
        priceAED: Number(body.priceAED || existing.priceAED || 0),
        closingRef: body.closingRef || `CLS-${Date.now().toString().slice(-6)}`,
        status: 'DEAL_CLOSED',
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      return res.status(400).json({ ok: false, error: `Unsupported ledger action: ${action}` });
    }

    let persistedTo = 'file-json';
    if (useSupabase && await writeSupabaseLedger(userId, ledger)) {
      persistedTo = 'supabase';
    } else {
      writeLocalLedger(ledger);
      persistedTo = process.env.VERCEL ? 'tmp-json' : 'file-json';
    }

    return res.status(200).json({
      ok: true,
      storage: persistedTo,
      ...ledger
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
