# MTG AU Tracker — Session Memory

## Deferred decisions
- **Unit testing**: Deferred. Plan is Vitest, co-located `.test.ts` files. Priority order: matching.ts → eBay title parser → DB integration tests. Do not set up yet.

## Architecture decisions
- **AWS deployment target**: Single provider (AWS only, no Vercel)
  - Next.js web → Amplify Hosting
  - Scraper jobs → ECS Fargate Scheduled Tasks (EventBridge triggers)
  - Database → RDS PostgreSQL (t4g.micro)
  - All in one VPC, one region
- **Images**: Never stored. Use Scryfall CDN URLs constructed from `scryfall_id`. No S3, no image pipeline.
- **price_history table**: Partition by month (PostgreSQL native partitioning) from day one — retrofitting is painful. Drop partitions older than 2 years for retention. Add a cron job to the scraper to handle partition drops. Do this when building the price history write path, before data accumulates.
- **Monitoring**: CloudWatch alarm on RDS `FreeStorageSpace` < 20% → SNS email. RDS Performance Insights free tier (7d) for slow query detection.
