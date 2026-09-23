import { createHash, randomUUID } from 'node:crypto';

const env = process.env;
const hash = value => createHash('sha256').update(value).digest('hex');
const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const phoneNumber = value => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
};

async function supabase(table, { method = 'GET', query = '', body, single = false } = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(single ? { Accept: 'application/vnd.pgrst.object+json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error(`Supabase ${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function verifyTurnstile(token, ip) {
  const params = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || '' });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: params });
  return response.ok && (await response.json()).success === true;
}

async function syncLead(capture) {
  const company = Number(env.NORTHWAY_COMPANY_ID);
  const phone = capture.phone;
  // Match only inside the NorthWay tenant. Preserve existing sales data.
  const existing = await supabase('lead', {
    query: `?select=id,name,email,notes,interest,bant_budget,source,phone,whatsapp&company_id=eq.${company}&or=(phone.eq.${phone},whatsapp.eq.${phone})&order=created_at.desc&limit=1`
  });
  const lead = existing[0];
  const details = [
    'Captação pelo site NorthWay',
    capture.segment && `Segmento: ${capture.segment}`,
    capture.revenue_range && `Faturamento mensal: ${capture.revenue_range}`,
    capture.instagram && `Instagram: ${capture.instagram}`
  ].filter(Boolean).join(' | ');
  const payload = lead ? {
    email: lead.email || capture.email || null,
    interest: lead.interest || capture.segment || null,
    bant_budget: lead.bant_budget || capture.revenue_range || null,
    notes: lead.notes?.includes('Captação pelo site NorthWay') ? lead.notes : [lead.notes, details].filter(Boolean).join('\n').slice(0, 5000)
  } : {
    name: capture.name,
    phone, whatsapp: phone,
    email: capture.email || null,
    company_id: company,
    source: 'Site NorthWay',
    interest: capture.segment || null,
    bant_budget: capture.revenue_range || null,
    notes: details,
    ...(env.NORTHWAY_PIPELINE_ID ? { pipeline_id: Number(env.NORTHWAY_PIPELINE_ID) } : {}),
    ...(env.NORTHWAY_STAGE_ID ? { pipeline_stage_id: Number(env.NORTHWAY_STAGE_ID) } : {})
  };
  const rows = await supabase('lead', {
    method: lead ? 'PATCH' : 'POST',
    query: lead ? `?id=eq.${lead.id}` : '',
    body: payload
  });
  return rows[0]?.id || lead?.id;
}

async function notifyWhatsapp(capture) {
  if (!env.N8N_CAPTURE_WEBHOOK_URL || !capture.contact_consent || capture.whatsapp_notified_at) return false;
  const response = await fetch(env.N8N_CAPTURE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Capture-Token': env.N8N_CAPTURE_WEBHOOK_TOKEN || '' },
    body: JSON.stringify({ event: 'site_lead_created', capture_id: capture.id, lead_id: capture.lead_id,
      name: capture.name, phone: capture.phone, consent: true })
  });
  if (!response.ok) throw new Error(`n8n: ${response.status}`);
  await supabase('site_capture', { method: 'PATCH', query: `?id=eq.${capture.id}`,
    body: { whatsapp_notified_at: new Date().toISOString() } });
  return true;
}

async function sendEmail(capture) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM || !capture.email || capture.email_sent_at) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `site-capture-${capture.id}` },
    body: JSON.stringify({ from: env.RESEND_FROM, to: [capture.email],
      subject: 'Recebemos seu contato | NorthWay',
      text: `Olá, ${capture.name}! Recebemos seus dados. Nossa equipe vai conversar com você sobre o contexto da sua empresa.\n\nNorthWay` })
  });
  if (!response.ok) throw new Error(`Resend: ${response.status}`);
  await supabase('site_capture', { method: 'PATCH', query: `?id=eq.${capture.id}`,
    body: { email_sent_at: new Date().toISOString() } });
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ siteKey: env.TURNSTILE_SITE_KEY || null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NORTHWAY_COMPANY_ID ||
      !env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) {
    return res.status(503).json({ error: 'Captação ainda não configurada' });
  }
  const data = req.body || {};
  if (data.website) return res.status(400).json({ error: 'Requisição inválida' }); // honeypot
  try {
    if (data.step === 'name') {
      const name = clean(data.name, 100);
      if (name.length < 2 || !(await verifyTurnstile(clean(data.turnstile, 2000), req.headers['x-forwarded-for']?.split(',')[0]))) {
        return res.status(400).json({ error: 'Confira o nome e a verificação de segurança' });
      }
      const id = randomUUID();
      const token = randomUUID();
      await supabase('site_capture', { method: 'POST', body: {
        id, token_hash: hash(token), name
      } });
      return res.status(200).json({ id, token });
    }
    if (!/^[0-9a-f-]{36}$/i.test(data.id || '') || !/^[0-9a-f-]{36}$/i.test(data.token || '')) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }
    const rows = await supabase('site_capture', { query: `?id=eq.${data.id}&token_hash=eq.${hash(data.token)}&select=*` });
    let capture = rows[0];
    if (!capture) return res.status(401).json({ error: 'Sessão inválida' });
    let changes;
    switch (data.step) {
      case 'phone': {
        const phone = phoneNumber(data.phone);
        if (!phone || data.contact_consent !== true) return res.status(400).json({ error: 'Informe um WhatsApp válido e autorize o contato' });
        changes = { phone, contact_consent: true }; break;
      }
      case 'segment':
        if (!capture.phone) return res.status(409).json({ error: 'Informe o WhatsApp primeiro' });
        changes = { segment: clean(data.segment, 100) }; break;
      case 'revenue':
        changes = { revenue_range: clean(data.revenue_range, 80) }; break;
      case 'instagram':
        changes = { instagram: clean(data.instagram, 120).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '@') }; break;
      case 'email': {
        const email = clean(data.email, 120).toLowerCase();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido' });
        changes = { email: email || null }; break;
      }
      case 'complete':
        if (!capture.phone || !capture.segment) return res.status(409).json({ error: 'Contato incompleto' });
        changes = { completed_at: capture.completed_at || new Date().toISOString() }; break;
      default: return res.status(400).json({ error: 'Etapa inválida' });
    }
    [capture] = await supabase('site_capture', { method: 'PATCH', query: `?id=eq.${capture.id}`,
      body: { ...changes, updated_at: new Date().toISOString() } });
    if (capture.phone) {
      const leadId = await syncLead(capture);
      if (leadId && leadId !== capture.lead_id) {
        [capture] = await supabase('site_capture', { method: 'PATCH', query: `?id=eq.${capture.id}`,
          body: { lead_id: leadId } });
      }
    }
    const warnings = [];
    if (capture.phone && !capture.whatsapp_notified_at) {
      try { await notifyWhatsapp(capture); } catch (error) { console.error(error); warnings.push('whatsapp'); }
    }
    if (capture.email && !capture.email_sent_at) {
      try { await sendEmail(capture); } catch (error) { console.error(error); warnings.push('email'); }
    }
    return res.status(200).json({ saved: true, lead_id: capture.lead_id, warnings });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Não foi possível salvar agora. Tente novamente.' });
  }
}
