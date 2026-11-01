# WhatsApp Integration Status

Last updated: 1 November 2026

## Current setup

ATSFY currently uses the WhatsApp Business mobile app. The integration is being prepared for an eligible WhatsApp Business Platform Coexistence onboarding so the existing mobile-app workflow can be retained where Meta/provider eligibility permits.

**Important:** WhatsApp Platform credentials and onboarding are not yet configured. Live WhatsApp sending and inbound webhook delivery have not been verified. The feature is therefore not production-active.

## Implemented in this branch

- Optional, separate WhatsApp-update consent on the public enquiry form. It does not block lead submission.
- Server-side storage of WhatsApp consent and consent timestamp on leads.
- Database table for WhatsApp message events, with RLS enabled, administrator read policy, and server-side service-role access.
- Admin CRM lead details show WhatsApp consent and latest inbound-message timestamp.
- Admin-only send endpoint for free-form WhatsApp replies, gated by the latest inbound message being within the 24-hour customer-service window.
- Meta webhook endpoint with X-Hub-Signature-256 validation, webhook subscription verification, inbound event deduplication, lead matching/creation, inbound activity logging, and last-inbound timestamp updates.
- Server-side environment variable configuration documented below.

## Supabase migration

Migration file: supabase/migrations/20261101000000_whatsapp_coexistence.sql

The migration was applied to the dedicated ATSFY Sales Agent Supabase project. It adds the WhatsApp consent and inbound timestamp fields to public.leads and creates public.whatsapp_message_events.

## Required environment variables

Configure these only after the official Meta/Coexistence onboarding is completed. Keep all secrets server-side in Vercel; never expose them to browser code.

- WHATSAPP_API_VERSION — Meta Graph API version.
- WHATSAPP_PHONE_NUMBER_ID — API phone-number ID.
- WHATSAPP_ACCESS_TOKEN — server-side token with required messaging permissions.
- WHATSAPP_VERIFY_TOKEN — private webhook verification token.
- WHATSAPP_APP_SECRET — Meta app secret used for webhook signature validation.
- SUPABASE_SERVICE_ROLE_KEY — server-side key used by the signed webhook handler; never expose it to the client.

## Onboarding and activation checklist

- [ ] Confirm the existing WhatsApp Business number and account are eligible for Coexistence.
- [ ] Complete official Meta or supported provider onboarding while preserving mobile-app access.
- [ ] Configure the server-side WhatsApp environment variables in Vercel Preview.
- [ ] Subscribe the Meta app to the messages webhook field at /api/whatsapp/webhook.
- [ ] Verify inbound webhook signature and delivery using a real test message.
- [ ] Verify lead matching and activity logging for both new and existing contacts.
- [ ] Verify an admin can send a reply during the 24-hour customer-service window.
- [ ] Create and obtain approval for message templates before any business-initiated message outside the 24-hour window.
- [ ] Test message delivery/status callbacks and operational failure handling.
- [ ] Review privacy notice, consent wording, opt-out handling, and retention policy before enabling campaigns.

## Not implemented / not live yet

- Automated customer acknowledgements or outbound campaigns.
- Automated internal lead alerts.
- Automated qualification and follow-up sequences.
- Quote/proposal generation and PDF delivery through WhatsApp.
- Delivery/read status webhook processing and full message-status dashboard.
- Production activation.

## Safety boundaries

- Do not send proactive WhatsApp messages without valid consent and applicable approved templates.
- Free-form replies are restricted to the 24-hour customer-service window following the customer's latest message.
- Do not treat the API response as proof that a message was delivered; delivery status requires webhook confirmation.
- Keep the existing WhatsApp Business mobile app and production Sales Agent untouched until onboarding and end-to-end tests are complete.
- This feature branch is a preview implementation. Do not merge to main or deploy to Production without explicit approval.