# ATSFy Sales Agent

A lightweight ATSFy sales assistant powered by the Google Gemini Developer API and deployed on Vercel.

## Features
- Sales qualification for websites, apps, e-commerce, chatbots and automation
- English, Hindi and Bengali responses
- Indicative pricing only; final quotes remain subject to ATSFy confirmation
- Draft quote and lead-summary actions
- WhatsApp handoff to ATSFy
- Server-side Gemini API integration; no API key in browser code

## Deploy
1. Import this repository into Vercel.
2. Add `GEMINI_API_KEY` in Vercel → Project Settings → Environment Variables for Production, Preview and Development.
3. Redeploy after adding the variable.

Use a newly generated Google AI Studio key. Never commit `.env` or API keys.

## Local development
Use Vercel CLI (`vercel dev`) after setting `GEMINI_API_KEY` in your local environment.
