# Keeping medication reminders on time (for free)

## The constraint

`/api/jobs/reminders` is the scheduled pass that materialises doses, sends what
is due, and expires what was missed. It has no always-on worker behind it — it
only runs when something calls it.

On Vercel's **Hobby (free) tier a cron may run at most once per day.** A sub-daily
schedule in `vercel.json` does not merely get ignored — it makes **every
deployment fail validation before it is created**, with nothing shown in the
Deployments list. That is a silent, whole-day outage of the deploy pipeline, and
it has already happened once (the schedule was `0,30 * * * *`, every 30 minutes).

So `vercel.json` keeps a **once-daily** cron as a floor, and nothing sub-daily
ever goes there while the project is on Hobby.

## Restoring the 30-minute cadence without paying

The route accepts two callers (see `authenticateJob`): Vercel Cron with a
`CRON_SECRET` bearer, and QStash with a signature. Any external scheduler that
can send the bearer works — so the real cadence comes from outside Vercel.

`CRON_SECRET` is already an environment variable on the project. Pick one:

### Option A — GitHub Actions (no extra service)

Add `CRON_SECRET` as a repository secret (Settings → Secrets and variables →
Actions), then commit `.github/workflows/reminders.yml`:

```yaml
name: reminders
on:
  schedule:
    - cron: "0,30 * * * *" # every 30 min (GitHub may delay under load; fine here)
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST "https://health-locker-chi.vercel.app/api/jobs/reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Free, and versioned with the code. GitHub throttles scheduled workflows on busy
accounts, so a fire can land a few minutes late — acceptable for reminders,
which are already batched.

### Option B — a hosted cron (cron-job.org, EasyCron, …)

Point it at the same URL with an `Authorization: Bearer <CRON_SECRET>` header on
whatever interval you like. More reliable timing than Actions; one more service
to hold the secret.

## When you move to Pro

Delete the external scheduler and put the real cadence back in `vercel.json`:

```json
"crons": [{ "path": "/api/jobs/reminders", "schedule": "0,30 * * * *" }]
```

Pro lifts the once-a-day limit, so the sub-daily schedule validates and deploys.
