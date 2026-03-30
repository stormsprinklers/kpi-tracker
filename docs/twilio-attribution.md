# Twilio attribution (call tracking + transcripts)

## Per-company subaccounts (billing separation)

Recommended flow:

1. Set **parent** credentials in Vercel (full Twilio account that may create subaccounts):
   - `TWILIO_MASTER_ACCOUNT_SID` + `TWILIO_MASTER_API_KEY_SID` + `TWILIO_MASTER_API_KEY_SECRET`, **or**
   - `TWILIO_MASTER_ACCOUNT_SID` + `TWILIO_MASTER_AUTH_TOKEN`  
   If `TWILIO_MASTER_*` is omitted, the app falls back to `TWILIO_ACCOUNT_SID` + `TWILIO_API_KEY_*` / `TWILIO_AUTH_TOKEN` for provisioning.
2. Set `TWILIO_SUBACCOUNT_CREDENTIALS_ENCRYPTION_KEY` — 32-byte secret (e.g. `openssl rand -base64 32`). Used to encrypt each subaccount’s **Auth Token** and **API key secret** at rest in `web_attribution_install`.
3. An **admin** opens Attribution → Call tracking and clicks **Create Twilio workspace for this company**. The app:
   - Creates a Twilio **subaccount** via `POST /2010-04-01/Accounts.json`
   - Creates a **standard API key** on that subaccount using the **parent API key** scoped to the subaccount (Twilio often omits `auth_token` on create when the parent uses API key auth; we no longer require it for key creation)
   - Resolves an **Auth Token** for webhook signatures from the create/fetch response, or by creating a **secondary auth token** on the subaccount via `accounts.twilio.com` IAM, then encrypts and stores token + API key secret in Neon

Ongoing REST (number search, buy, release, Conversational Intelligence) uses the **stored subaccount API key**. Voice and recording webhooks are validated with the **subaccount Auth Token** from the same row (matched by `AccountSid` in the webhook body).

## Environment variables (summary)

See `.env.example` for all names.

- **`TWILIO_WEBHOOK_BASE_URL`** — Public `https` origin; must match the URL Twilio posts to.
- **`TWILIO_INTELLIGENCE_SERVICE_SID`** — Default `GA…` service; per-org override in Attribution. For subaccounts, create the Intelligence service in the Twilio Console **while acting as that subaccount** (or as appropriate for your Twilio setup).
- **`CRON_SECRET`** — Bearer for the scheduled `GET /api/sync` job (Vercel Cron). That run performs HCP sync **and** polls up to 80 pending Twilio transcripts. Optional: same secret works for manual `GET /api/cron/twilio-transcripts` if you use an external scheduler.

## Legacy mode

If you do **not** create a subaccount for an org, you can still use a single Twilio account via `TWILIO_ACCOUNT_SID` + token or API key (same as before). Webhook validation then uses `TWILIO_AUTH_TOKEN` / `TWILIO_MASTER_AUTH_TOKEN` when `AccountSid` matches that main account.

## Recording and consent

Recording + transcripts may require notice and consent depending on jurisdiction. This is not legal advice.
