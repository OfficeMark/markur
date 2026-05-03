# M13 verification

Adds automated invitation emails via a Supabase Edge Function backed by Resend. Until M13 the inviter had to copy the `/accept/<token>` link out of the dialog and paste it into their own email client. With M13, the link is sent automatically; the manual copy path is kept as a fallback.

## What shipped in this milestone

- New Edge Function `send-invitation-email` at `supabase/functions/send-invitation-email/index.ts`. POSTs `{ invitation_id }` to Resend after looking up the row under the caller's JWT (so RLS still gates access — no service role used).
- Already deployed to project `drclmnqlurvwqpnnpgzb` via the Supabase MCP. Version 1, ACTIVE, JWT verification on.
- `NewInvitationDialog` now invokes the function as soon as the `pending_invitations` row is committed. The success panel shows one of: "sending", "sent to <email>", "couldn't send — copy and use the link".

## One-time setup you still need to do

The function will return `500 RESEND_API_KEY not configured` until you set the secret. Two manual steps in dashboards:

### 1. Supabase: set the function secret

- Open https://supabase.com/dashboard/project/drclmnqlurvwqpnnpgzb
- Project Settings → Edge Functions → Secrets (or `supabase secrets set RESEND_API_KEY=re_...` from the CLI)
- Add `RESEND_API_KEY` with the Resend key in your possession.
- Save. Edge Function picks it up immediately on the next invocation.

You can optionally also set:
- `INVITE_FROM` — once `mail.markur.ca` is verified in Resend, set this to e.g. `Markur <invitations@mail.markur.ca>`. Until then leave it unset; the function defaults to `Markur <onboarding@resend.dev>`.
- `APP_URL` — once DNS for markur.ca is live, set this to `https://markur.ca`. Otherwise the function falls back to the request's Origin header (which works fine for the Netlify deploy too).
- `REPLY_TO` — defaults to `randy@markur.ca` (your Hostinger inbox). Override only if you set up a shared support inbox later.

### 2. Resend: verify a sending domain

Until a domain is verified, Resend will only deliver mail using `onboarding@resend.dev` and only to your Resend account email. So you can test end-to-end with your own address but you can't invite real users yet.

- Resend dashboard → Domains → Add domain → `mail.markur.ca` (a subdomain is fine and is the normal pattern).
- Resend gives you DKIM + SPF DNS records. Add them on your DNS provider for `markur.ca`.
- Once Resend marks the domain verified, set `INVITE_FROM` in Supabase as above.

## How to verify it works

### Smoke test (after step 1 above)

- Sign in as Randy (whose email is registered with Resend).
- Open a building → Settings → Invite user.
- Fill in **your own email** (the one tied to Resend) as the recipient. Submit.
- The success panel should flip from "Sending the invitation email..." to "Invitation sent to ...". Check your inbox; the email should arrive within seconds with the gold-button branded layout.
- Click the link. It should land on the `/accept/<token>` route. Sign in (or sign up) and the role should grant.

### Failure modes you might hit (and what they mean)

- **"RESEND_API_KEY not configured on the server"** — secret hasn't been set in Supabase yet. Step 1 above.
- **Resend response: "You can only send testing emails to your own email address (...)"** — domain not verified yet. Step 2 above. Recipient must be the email you signed up to Resend with until the domain is verified.
- **Resend response: 422 "from is not a verified domain"** — `INVITE_FROM` is set to a domain that hasn't been verified. Either un-set it (falls back to `onboarding@resend.dev`) or finish domain verification.
- **Function returns 401 / Missing Authorization** — the user's session expired. Re-sign-in.
- **Function returns 404 / Invitation not found or not visible** — RLS denied the lookup. Likely the invitation was created by a different user, or the user lost their grant between insert and call. Shouldn't happen in the normal flow.

The dialog handles all of these gracefully — the invitation row is still created, the link is still shown for manual copy, and the user sees the warning banner explaining what happened.

## Security notes

- The function requires a valid Supabase JWT (`verify_jwt: true`).
- Inside the function we do NOT use the service role — we re-create a Supabase client with the caller's JWT and let RLS gate the lookup. That means a malicious caller can only "send" emails for invitations they themselves can see.
- The Resend API key only lives in Supabase env. Never in the repo, never in the browser bundle, never in logs.

## Push script

`push-m13.ps1` stages the function source, the dialog, and this verification doc, then commits and pushes to `origin/main`. Pure ASCII per the M6 lesson. Netlify auto-deploys the frontend changes. The Edge Function itself is *already* deployed to Supabase via MCP — pushing the repo just keeps the source in sync; it does not redeploy the function.

If you ever need to redeploy the function from CLI: `supabase functions deploy send-invitation-email --project-ref drclmnqlurvwqpnnpgzb`.
