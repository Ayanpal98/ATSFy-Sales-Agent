# ATSFy Sales Agent

ATSFy's AI-assisted sales and lead-management workspace. Public sales conversations are powered by Google Gemini; private CRM data is stored in a dedicated Supabase project; Vercel hosts the application and server-side APIs.

## Public assistant
- Qualifies enquiries for websites, e-commerce, mobile apps, AI chatbots and business automation.
- Responds in English, Hindi and Bengali.
- Uses indicative pricing only; all scope, price and delivery commitments require ATSFy confirmation.
- Offers a consent-based enquiry form and a manual WhatsApp hand-off.
- Does not send automated outbound messages.

## Private sales workspace

Open `/admin.html` and sign in with an administrator account.

- **Overview:** pipeline totals, stage distribution, recent leads and pending follow-ups.
- **Lead pipeline:** search and filter prospects, review contact and requirement details, update stages, set next follow-up dates and maintain internal notes.
- **Activity timeline:** log notes, calls, email discussions, WhatsApp discussions and meetings.
- **Follow-up planner:** create dated tasks with internal briefs or draft messages; tasks require an administrator's explicit approval.
- **Proposal desk:** create INR proposal drafts with scope and indicative price ranges; review and approve or reject them.
- **Approval boundary:** approving a task or proposal records an internal decision only. It does not send a message, issue a quote, or create a customer commitment.

## Backend

- Dedicated Supabase project: `atsfy-sales-agent` (Mumbai region).
- Tables: `leads`, `conversations`, `lead_activities`, `followup_tasks`, `proposals`, `agent_insights`, and `agent_runs`.
- Row-level security is enabled. Authenticated access is restricted to users whose trusted `app_metadata.role` is `admin`.
- Public lead intake runs server-side with the Supabase service key. The service key must never be exposed in browser code.
- Admin reads and updates use the signed-in user's JWT and RLS.
- `POST /api/admin/workspace` creates activities, follow-up tasks and proposal drafts; `GET` loads the workspace; `PATCH` updates approved CRM fields.
- The SQL migrations in `supabase/migrations` document the schema and hardening.

## Required Vercel environment variables

- `GEMINI_API_KEY` — server-side Gemini key. Use a newly rotated key; never reuse an exposed key.
- `SUPABASE_URL` — dedicated project URL.
- `SUPABASE_ANON_KEY` — publishable/anon key used with authenticated admin JWTs.
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, used for public lead intake. Never use this in frontend code.

Keep Supabase variables scoped to the feature branch Preview environment until the application has passed review. Do not commit secrets or paste them into chat.

## Production readiness gates

Before enabling the new CRM in Production:
1. Configure a distributed abuse-control layer (for example, Cloudflare Turnstile plus server-side verification, or suitable Vercel Firewall rate limits) for public chat and lead intake.
2. Confirm the administrator has a verified Supabase Auth account and trusted `app_metadata.role = admin`.
3. Test lead intake, workspace login, lead updates, activities, follow-up creation/approval, proposal drafts and RLS in Preview.
4. Review privacy/retention language before storing conversation transcripts or other personal data.
5. Keep outbound email, WhatsApp, calling and automated follow-ups disabled until separately approved and integrated.
6. Review the feature branch and explicitly approve any merge or Production deployment.

## Deployment

The connected Vercel project creates Preview deployments from feature branches. Changes pushed to `main` deploy to Production; do not merge this feature branch without explicit approval.

## Local development

Use Vercel CLI (`vercel dev`) after securely configuring the required environment variables locally.
