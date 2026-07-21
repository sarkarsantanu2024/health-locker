# Production launch checklist

Everything that has to be true before HealthLocker holds a real person's health
records. Grouped by what happens if you skip it, not by which service it touches.

---

## 1. Blocking — do not launch without these

### Secrets

| Variable | Why it blocks | How to get it |
| --- | --- | --- |
| `DATABASE_URL` | Nothing runs. Must be the **pooled** Neon host (`-pooler`). | Neon dashboard → Connection string |
| `DIRECT_URL` | `prisma migrate` cannot run through a pooler. | Neon dashboard → Direct connection |
| `AUTH_JWT_SECRET` | Sessions. ≥32 chars, unique per environment. | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | ABHA ids, UPI VPAs, bank accounts and policy numbers are AES-256-GCM columns. **Losing this makes those columns unreadable forever.** | `openssl rand -base64 32` |
| `APP_URL` | UPI deep links, QStash callbacks and the emergency QR all embed it. | Your production domain |
| `CRON_SECRET` | Without it the reminder cron cannot authenticate and **every reminder silently stops**. | `openssl rand -hex 32` |

Set them in Vercel → Settings → Environment Variables, Production scope only.
`src/lib/env.ts` fails fast with a readable list if any required one is missing —
that is deliberate, and a failed deploy here is the system working.

### Separate the database from development

The demo data currently lives in the same Neon database as production would.
Create a Neon **branch** for development before launch, and point `.env.local` at
the branch rather than at `main`. Five minutes, and it is the difference between
a bad `db:demo --reset` costing you a coffee or a customer.

### First Super Admin

```bash
pnpm create-super-admin --username <you>
```

Prints the password **once**. There is no email recovery anywhere in this product
— if the last Super Admin password is lost, the only route back in is a direct
database write. `setUserActive` refuses to suspend the last active Super Admin
for the same reason.

### Merchant payment profile

```bash
pnpm set-merchant-profile
```

Until this exists, `createPaymentRequest` throws `SERVICE_UNAVAILABLE` and
**nobody can pay for anything** — consumer signups included, which means nobody
can be activated either. The UPI VPA, account number and IFSC are encrypted at
rest; only the last four digits are stored in clear.

### Verify the deploy

```bash
curl https://<domain>/api/v1/health          # db.status must be "ok"
curl -X POST https://<domain>/api/jobs/reminders   # must be 401, not a redirect
```

A redirect to `/login` on the second one means `/api/jobs` fell out of
`PUBLIC_PATHS` in `src/middleware.ts`, and reminders will never fire.

---

## 2. Important — launch is possible, but degraded

### Web Push (`VAPID_*`)

```bash
pnpm dlx web-push generate-vapid-keys
```

Without it every push is logged as `SKIPPED / not-configured`. In-app
notifications still work, so nothing is lost — but the product's only interrupt
channel is gone, and medicine reminders become something the patient has to come
looking for.

### Upstash Redis (`UPSTASH_REDIS_REST_*`)

Rate limiting falls back to per-instance memory with a loud warning. On Vercel
that means each lambda has its own counter, so the effective login limit is
"10 per minute **per instance**". The account lockout is database-backed and
still works, so this is a hardening gap rather than an open door.

### Upstash QStash (`QSTASH_*`)

Only needed if you want reminders more often than Vercel Cron's schedule allows,
or fan-out of a large notification batch. The cron path in `vercel.json` covers
the base case on its own.

### Cloudflare R2 (`R2_*`)

Without it, uploaded files (payment screenshots) fall back to storing bytes in
Postgres via `src/lib/storage.ts`. That works and is correct, but Postgres is an
expensive place to keep images and Neon's free tier is small.

---

## 3. Pre-flight verification

```bash
pnpm lint && pnpm typecheck        # clean
pnpm test                          # 129 unit tests, hermetic
pnpm test:integration              # 119 tests against a real database
pnpm build                         # no type or route errors
pnpm start & pnpm smoke            # every page renders for every role
```

`pnpm smoke` is the one that matters most. It walks every navigation destination
plus the non-nav screens for six roles with a real session cookie, and fails on a
render error embedded in the HTML — the class of bug that still returns HTTP 200.

---

## 4. Post-launch, first week

- **Watch the audit trail.** `/admin/audit` filtered to `payment.approved`,
  `user.password_reset` and `patient.record.viewed`. Those three cover money,
  credentials and medical-record access.
- **Watch the reminder job.** Each pass writes a `job:reminders` audit row with
  its counts. A run of zeros where doses exist means the cron secret is wrong.
- **Check `NotificationLog` for `FAILED`.** A cluster of failures against one
  endpoint is an expired subscription the cleanup missed.
- **Confirm the first real payment end to end** before advertising: raise a
  request, pay it yourself, verify it in `/admin/payments`, and check the
  subscription actually activated.

---

## 5. Known gaps, deliberately shipped

These are decisions, not oversights. Each one is safe to launch with.

| Gap | Why it is acceptable | What would close it |
| --- | --- | --- |
| **No AI/OCR pipeline** (Phase 4 skipped) | Every screen it would fill — medicines, reports — is fed by the provider portals instead. The `AiService` interface and mock adapter exist. | A Gemini or Groq key plus the adapter behind `src/lib/ai`. |
| **Apple touch icon is SVG** | iOS ignores SVG for home-screen icons and falls back to a screenshot. Everything else about the PWA works. | A 180×180 PNG at `/apple-touch-icon.png`. |
| **Erasure is a request, not a button** | Medical-records retention outlasts a person's wish to be forgotten, and self-service deletion would destroy a provider's evidence of what it prescribed. | A retention policy per record type, then an admin tool that applies it. |
| **No WhatsApp adapter** | Messages are sent by hand via `wa.me` links, and the `NotificationLog` row is the same shape an adapter would write. | A provider account; the audit trail does not change. |
| **Timeline paginates by cap, not cursor** | 200 rows per source is well beyond a real patient's volume today. | A cursor once anyone has thousands of entries. |
| **Ads beside medical records** | Requested in the Phase 11 brief, deliberately not built: serving a third-party ad next to a diagnosis leaks the diagnosis through targeting. | A first-party, non-targeted placement — a product decision, not a technical one. |

---

## 6. The Android app

HealthLocker ships as a Capacitor shell around the deployed site. **It is not a
static bundle, and cannot be**: every screen is server-rendered behind an auth
guard and every mutation is a server action, so there is nothing to package. The
APK is a WebView pinned to your origin.

What it gives you over a browser tab: a home-screen icon, a native splash
screen, no address bar, the hardware back button wired to in-app history, and a
real package for Play. What it does not give you is offline — health records are
deliberately never cached.

### Build it

```bash
# One-off, if android/ is not present
CAP_SERVER_URL=https://your-domain pnpm android:add

# Every time the shell config or plugins change
CAP_SERVER_URL=https://your-domain pnpm android:sync

# Debug APK -> android/app/build/outputs/apk/debug/app-debug.apk
CAP_SERVER_URL=https://your-domain pnpm android:apk

# Or open in Android Studio to build a signed release
pnpm android:open
```

`CAP_SERVER_URL` has no default on purpose. An APK built against `localhost`
installs fine and then shows a blank screen on a real phone, and nothing about
that failure points at the cause.

### Requirements

- **JDK 21** and the **Android SDK**. Installing Android Studio gets you both.
- `ANDROID_HOME` set, or `android/local.properties` pointing at the SDK.
- For Play: a signed release build (`assembleRelease` with a keystore) and a
  one-off $25 developer account.

### Before you publish

- Point `CAP_SERVER_URL` at production, not at a preview deployment.
- Set the VAPID keys first — push is most of the reason to have an app at all.
- Bump `versionCode` and `versionName` in `android/app/build.gradle`.
- Replace the generated launcher icons in `android/app/src/main/res/mipmap-*`.
  The defaults are Capacitor's placeholder, not the HealthLocker mark.
