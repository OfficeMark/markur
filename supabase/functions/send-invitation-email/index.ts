// supabase/functions/send-invitation-email/index.ts
//
// M13 — sends an invitation email via Resend.
//
// Caller sends: { invitation_id: string }
// Function does:
//   1. Validates the caller's JWT.
//   2. Looks up the pending_invitations row using the caller's JWT (RLS
//      still applies — the inviter can read rows they created).
//   3. Looks up the building name (best-effort; blank if scope isn't a building).
//   4. Sends an email via Resend.
//
// Required secrets (set in Supabase dashboard or `supabase secrets set`):
//   - RESEND_API_KEY     — server-only Resend key
//   - INVITE_FROM        — optional, e.g. "Markur <invitations@mail.markur.ca>".
//                          Default: "Markur <onboarding@resend.dev>" (Resend's
//                          sandbox sender — only delivers to your verified
//                          Resend account email until you verify a domain).
//   - APP_URL            — optional, e.g. "https://markur.ca". Default: derived
//                          from request Origin header. Needed for the link in
//                          the email to point to the right environment.
//   - REPLY_TO           — optional, e.g. "randy@markur.ca". Default:
//                          "randy@markur.ca". Sets Reply-To on the outgoing
//                          email so when recipients hit Reply, the message
//                          lands in Randy's real inbox instead of Resend's
//                          sandbox or the unverified app domain.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin',
  building_admin: 'Building admin',
  auditor: 'Auditor',
  tenant_rep: 'Facilities',
};

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  scope_type: 'building' | 'floor' | 'tenant';
  scope_id: string | null;
  token: string;
  expires_at: string | null;
  invited_by: string;
};

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: 'RESEND_API_KEY not configured on the server' },
      500
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ ok: false, error: 'Supabase env not configured' }, 500);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'Missing Authorization' }, 401);
  }

  let payload: { invitation_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  const invitationId = payload.invitation_id;
  if (!invitationId || typeof invitationId !== 'string') {
    return jsonResponse({ ok: false, error: 'invitation_id required' }, 400);
  }

  // Use the caller's JWT so RLS applies — inviter can read rows they created.
  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });

  const { data: invRow, error: invErr } = await sb
    .from('pending_invitations')
    .select('id, email, role, scope_type, scope_id, token, expires_at, invited_by')
    .eq('id', invitationId)
    .maybeSingle();
  if (invErr) {
    return jsonResponse({ ok: false, error: `Lookup failed: ${invErr.message}` }, 403);
  }
  if (!invRow) {
    return jsonResponse({ ok: false, error: 'Invitation not found or not visible' }, 404);
  }
  const inv = invRow as InvitationRow;

  // Best-effort building name — we walk through scope to a building.
  let buildingName: string | null = null;
  if (inv.scope_type === 'building' && inv.scope_id) {
    const { data: b } = await sb
      .from('buildings')
      .select('name')
      .eq('id', inv.scope_id)
      .maybeSingle();
    buildingName = (b?.name as string | undefined) ?? null;
  } else if (inv.scope_type === 'floor' && inv.scope_id) {
    const { data: f } = await sb
      .from('floors')
      .select('label, building:buildings(name)')
      .eq('id', inv.scope_id)
      .maybeSingle();
    const fb = (f as { building?: { name?: string } } | null)?.building;
    buildingName = fb?.name ?? null;
  } else if (inv.scope_type === 'tenant' && inv.scope_id) {
    const { data: t } = await sb
      .from('tenants')
      .select('name, building:buildings(name)')
      .eq('id', inv.scope_id)
      .maybeSingle();
    const tb = (t as { building?: { name?: string } } | null)?.building;
    buildingName = tb?.name ?? null;
  }

  // Inviter display name (best-effort; falls back to "A Markur admin").
  let inviterName = 'A Markur admin';
  const { data: inviterProfile } = await sb
    .from('profiles')
    .select('full_name, email')
    .eq('id', inv.invited_by)
    .maybeSingle();
  if (inviterProfile) {
    const p = inviterProfile as { full_name?: string | null; email?: string | null };
    inviterName = p.full_name?.trim() || p.email || inviterName;
  }

  const appUrl =
    Deno.env.get('APP_URL') ??
    req.headers.get('Origin') ??
    'https://waymarks-rebuild.netlify.app';
  const acceptUrl = `${appUrl.replace(/\/$/, '')}/accept/${inv.token}`;

  const fromAddress =
    Deno.env.get('INVITE_FROM') ?? 'Markur <onboarding@resend.dev>';

  // Reply-To routes recipient replies to a monitored inbox. Default to
  // Randy's Hostinger address so replies land somewhere a human reads.
  const replyToAddress = Deno.env.get('REPLY_TO') ?? 'randy@markur.ca';

  const roleLabel = ROLE_LABEL[inv.role] ?? inv.role;
  const subject = buildingName
    ? `You're invited to ${buildingName} on Markur`
    : `You're invited to Markur`;

  const expiresLine = inv.expires_at
    ? `<p style="margin:0 0 16px;color:#5f5e5a;font-size:13px;">This invitation expires on ${formatDate(inv.expires_at)}.</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f1e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2c2c2a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e8;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#5f5e5a;">Markur, by Officemark</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#1f2938;">${escapeHtml(inviterName)} invited you${buildingName ? ' to ' + escapeHtml(buildingName) : ''}</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.55;">You've been added as <strong>${escapeHtml(roleLabel)}</strong>${buildingName ? ' on ' + escapeHtml(buildingName) : ''} in Markur, a building signage passport. Click the button below to accept the invitation and sign in.</p>
        </td></tr>
        <tr><td align="center" style="padding:8px 32px 24px;">
          <a href="${acceptUrl}" style="display:inline-block;background:#ed7e2c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Accept invitation</a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <p style="margin:0 0 8px;font-size:12px;color:#5f5e5a;">Or paste this link into your browser:</p>
          <p style="margin:0 0 16px;font-size:12px;word-break:break-all;"><a href="${acceptUrl}" style="color:#1f2938;">${acceptUrl}</a></p>
          ${expiresLine}
          <p style="margin:0;font-size:11px;color:#878780;">If you weren't expecting this, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${inviterName} invited you${buildingName ? ' to ' + buildingName : ''} as ${roleLabel} on Markur.\n\nAccept the invitation:\n${acceptUrl}\n${
    inv.expires_at ? `\nThis invitation expires on ${formatDate(inv.expires_at)}.\n` : ''
  }\nIf you weren't expecting this, ignore this email.`;

  const resendBody = {
    from: fromAddress,
    to: [inv.email],
    reply_to: replyToAddress,
    subject,
    html,
    text,
    tags: [{ name: 'type', value: 'invitation' }],
  };

  let resendRes: Response;
  try {
    resendRes = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: `Resend request failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      502
    );
  }

  const resendJson = await resendRes.json().catch(() => ({}));
  if (!resendRes.ok) {
    return jsonResponse(
      {
        ok: false,
        status: resendRes.status,
        error: (resendJson as { message?: string }).message ?? 'Resend rejected the request',
        resend: resendJson,
      },
      resendRes.status
    );
  }

  return jsonResponse({
    ok: true,
    id: (resendJson as { id?: string }).id ?? null,
    to: inv.email,
    invitation_id: inv.id,
  });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
