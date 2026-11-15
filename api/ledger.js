import fs from 'fs';
import path from 'path';

const DEFAULT_LEDGER = {
  walletCredits: 5,
  subQuota: 10,
  leads: [],
  contracts: {}
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
      contracts: parsed.contracts && typeof parsed.contracts === 'object' ? parsed.contracts : {}
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
    } else if (action === 'save_contract' && body.contract?.dealId) {
      ledger.contracts[body.contract.dealId] = {
        ...body.contract,
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
