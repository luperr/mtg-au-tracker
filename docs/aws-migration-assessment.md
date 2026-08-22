# AWS migration — assessment and decision

**Date:** 2026-08-22
**Decision:** deferred on cost. Not blocked technically.

---

## Why it came up

Proxmox has been the constraint on several fronts — a 228s card detail page on a *correctly
indexed* query, `computeMarketStats()` paused after one run was measured 5h42m in, host IO
pressure at 96%. Moving to AWS looked like the next logical step.

## What was actually costed

The intended architecture, in `ap-southeast-2` (Sydney):

- **Scraper** — EventBridge Scheduler → `ecs:RunTask`, one Fargate task per job. The standalone
  entrypoints already exist (`stores/run-all.ts`, `scryfall/bulk-import.ts`,
  `ebay/ebay-import.ts`), so `node-cron` and `index.ts` would simply retire. Pays for ~5h/day
  instead of 24. The 1.5–4h CrystalCommerce sweep rules out Lambda; Fargate has no task-duration
  cap, so it fits.
- **Web** — always-on Fargate service, `cloudflared` as a sidecar. Keeps zero inbound ports and
  avoids an ALB.
- **Database** — RDS PostgreSQL, migrating the full ~20GB / ~84M-row `price_history` with its
  monthly partitions.

| Item | Est. $/mo |
|---|---|
| RDS `db.t4g.medium`, Single-AZ | ~$60 |
| RDS gp3 storage, 50GB + backups | ~$7 |
| Web Fargate, 0.5 vCPU / 1GB, 24/7 | ~$22 (~$43 at 1 vCPU) |
| Scraper — store scrape, 2 vCPU / 8GB × ~4h/day | ~$17 |
| Scraper — Scryfall import, 1 vCPU / 8GB × 15min/day | ~$0.70 |
| Scraper — eBay import, 0.5 vCPU / 1GB × 45min/day | ~$0.70 |
| Public IPv4 × 2 | ~$7 |
| ECR + CloudWatch Logs + egress | ~$10 |
| EventBridge Scheduler | ~$0 (free tier) |
| **Total** | **~$125/mo**, ~$95 with a 1-yr RDS reservation |

**Treat these as ±25%.** They're list prices recalled as of ~mid-2026, not a quote. The two most
likely to be understated are CloudWatch Logs (the CrystalCommerce scrape logs ~3,500 pages a
night) and the web task size. Realistic range: $100–160/mo.

The shape is more reliable than the numbers: **RDS is over half the bill and doesn't tune away.**

## Cheaper rungs, if revisited

| Option | Est. $/mo | Trade |
|---|---|---|
| Lightsail 4GB / 2 vCPU / 80GB | ~$24 flat | Existing compose runs nearly unchanged; thin Terraform, ports poorly to a real VPC later |
| Single EC2 `t4g.medium` + EBS gp3 | ~$45 (~$35 reserved) | Real VPC/SG/IAM/EBS Terraform, still one box, self-managed Postgres (which we already do) |
| Fargate + RDS as above | ~$125 | The architecture worth having, at a price the project can't carry |

## Traps worth keeping

- **NAT Gateway is ~$43/mo and completely avoidable.** Almost every Terraform VPC example
  provisions one. With the Cloudflare tunnel, nothing takes inbound — web dials out, scrapers
  dial out — so tasks belong in public subnets with public IPs and zero-ingress security groups.
- **`db.t4g` is burstable and a 4-hour scrape is not a bursty workload.** Sustained bulk inserts
  can drain CPU credits mid-run. Alarm on `CPUCreditBalance`, or size to `db.m7g.large`.
- **The Playwright image is ~2GB+** and every scheduled task cold-pulls it. Immaterial in cost,
  but "did the job start?" alerting needs a generous threshold.
- **Market stats would *complete* on gp3 rather than crawl — and you'd pay the IOPS.** Making
  those passes incremental (as `refreshSetCardDaily()` already is) is worth more than faster
  disks.
- **Fargate Spot is off the table for the scrape jobs** despite the ~70% discount: store scrapes
  clear a store's prices before inserting, so an interrupted task leaves that store empty until
  the next day. (eBay is safe — it swaps per card inside a transaction.)

## When it happens: repo layout

**Terraform goes in `infra/terraform/` in this repo**, not a separate one.

The deciding argument is atomic PRs. A change that adds an env var has to touch
`apps/scraper/src/lib/config.ts`, both compose files, `.env.example`, and — on AWS — a task
definition and an SSM parameter. Splitting those across repos guarantees drift, and this repo has
already demonstrated the failure mode: `.env.example` went missing entirely while three documents
kept telling people to copy it, and `EBAY_RECENT_MONTHS` / `EBAY_HIGH_VALUE_USD` sat in both
compose files and the CLAUDE.md env table while being read by no code at all.

The counter-argument — privilege separation between app and infra changes — is real, but with a
single maintainer it buys nothing, while the coordination tax is paid on every change.

Practicalities: `paths:` filters on the workflows so app-only PRs skip `terraform plan`; a
dedicated OIDC role for plan/apply; `IMAGE_REGISTRY` in `docker-compose.prod.yml` is already the
GHCR→ECR lever.

## The cheaper answer to the actual problem

Every performance story above traces to one cause: `lpool` is a ZFS mirror of USB-attached
**spinning** disks at ~40 IOPS. CLAUDE.md rules out the internal NVMe *on this hardware* — which
is a different claim from ruling out a USB-attached **SSD**, the same port at roughly 100× the
random-read performance, for a one-off ~$100–150 and nothing per month.

That is the first thing to try. Revisit AWS when there's revenue, or when something other than
disk latency is the binding constraint.
