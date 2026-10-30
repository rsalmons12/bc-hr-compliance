// Supabase Edge Function: invite-user
// Creates a portal login with a temporary password (or, without a password, emails
// an invite), and assigns the person's company and role.
// BC HR admins can add anyone; managers can add employees to their own company.
//
// Deploy: Supabase -> Edge Functions -> Deploy a new function -> Via Editor,
// name it "invite-user", paste this file, then turn OFF "Verify JWT"
// (this function checks the caller itself).
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// The server key: older projects expose SUPABASE_SERVICE_ROLE_KEY, newer ones
// SUPABASE_SECRET_KEYS (a JSON map). BC_SECRET_KEY can be added by hand as a fallback.
function serverKey(): string | undefined {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys);
      return parsed.default ?? Object.values(parsed)[0] as string;
    } catch {
      // Not JSON; fall through.
    }
  }
  return Deno.env.get('BC_SECRET_KEY');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  try {
    const key = serverKey();
    if (!key) {
      return json({ error: 'The function has no server key. In Supabase: Edge Functions → Secrets, add BC_SECRET_KEY with your secret key.' }, 500);
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Who is asking?
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: 'Please sign in again.' }, 401);
    const { data: me } = await admin.from('profiles').select('role, company_id').eq('id', user.id).single();

    const { email, full_name, company_id, role = 'employee', password, redirect_to } = await req.json();
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return json({ error: 'Please enter a valid email address.' }, 400);
    if (!company_id) return json({ error: 'Choose a company.' }, 400);
    if (!['employee', 'manager'].includes(role)) return json({ error: 'Role must be employee or manager.' }, 400);
    if (password !== undefined && String(password).length < 8) {
      return json({ error: 'The temporary password must be at least 8 characters.' }, 400);
    }

    const allowed = me?.role === 'admin'
      || (me?.role === 'manager' && company_id === me.company_id && role === 'employee');
    if (!allowed) return json({ error: 'You are not allowed to add people to this company.' }, 403);

    // Pre-assign company and role. If they already have a login, the database links them now.
    const { error: inviteRowError } = await admin.from('invites').upsert({
      email: cleanEmail, company_id, role, full_name: full_name || null, invited_by: user.id,
    });
    if (inviteRowError) throw inviteRowError;

    const { error } = password
      ? await admin.auth.admin.createUser({
        email: cleanEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: { full_name: full_name || null, must_change_password: true },
      })
      : await admin.auth.admin.inviteUserByEmail(cleanEmail, {
        redirectTo: redirect_to,
        data: { full_name: full_name || null },
      });
    if (error) {
      if (/already been registered|already exists/i.test(error.message)) {
        return json({ ok: true, existing: true });
      }
      return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500);
  }
});
