# ATSFy Sales Agent

A lightweight ATSFy sales assistant powered by Google Gemini and deployed on Vercel.

## Public features
- Sales qualification for websites, apps, e-commerce, chatbots and automation
- English, Hindi and Bengali responses
- Indicative pricing only; final quotes remain subject to ATSFy confirmation
- Draft quote and WhatsApp handoff

## Phase 1 CRM foundation (feature branch)
- Consent-based public lead intake at `POST /api/leads`
- Internal administrator dashboard at `/admin.html`
- Supabase Auth-backed admin sign-in and RLS-protected lead reads/stage updates
- Reviewed SQL migration for leads, conversations, activities, follow-up tasks, proposals, agent insights and run history

No outbound messages are sent. Follow-up tasks and learning insights are groundwork for later phases and human approval.

## Required Vercel environment variables
Existing: `GEMINI_API_KEY`

After creating a dedicated Supabase project for this application:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never expose in browser code)

Do not reuse another application's Supabase project. Do not commit secrets.

## Supabase setup (not applied to any database)
1. Create a dedicated project for ATSFy Sales Agent.
2. Review and apply `supabase/migrations/202610310001_sales_crm.sql`.
3. Disable public sign-ups and provision an administrator account.
4. Set the administrator's `app_metadata.role` to `admin` through a trusted admin workflow.
5. Add the Supabase variables to Vercel Preview first.
6. Test lead intake, login, RLS and stage updates in Preview before promoting to Production.

## Deployment
Changes pushed to `main` deploy to Production; feature branches create Preview deployments.

## Local development
Use Vercel CLI (`vercel dev`) after setting the required environment variables locally.
