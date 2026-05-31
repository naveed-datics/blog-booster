This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment setup

1. Copy the env template and add your secrets:

```bash
cp .env.example .env.local
```

2. Fill in the values in `.env.local`. At minimum you need `DATABASE_URL`, `AUTH_SECRET` (or `NEXTAUTH_SECRET`), and `NEXT_PUBLIC_BASE_URL`. See `.env.example` for all supported keys and comments.

3. Run database migrations (in order):

```bash
npm run migrate:auth
npm run migrate
npm run migrate:trend-website
npm run migrate:niche
```

Optional extra migrations (if you use those features):

```bash
node lib/migrations/run-sitemap-migration.mjs
node lib/migrations/run-prompt-template-migration.mjs
node lib/migrations/run-wordpress-posts-migration.mjs
```

4. Start the dev server:

```bash
npm run dev
```

Do not commit `.env.local` — it stays gitignored. Only `.env.example` is tracked in the repo.

### Deploy on Vercel

In your Vercel project **Settings → Environment Variables**, add at minimum:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_BASE_URL` | Recommended | Your production URL, e.g. `https://your-app.vercel.app` |

`AUTH_URL` / `NEXTAUTH_URL` are optional on Vercel — the app infers them from `VERCEL_URL` when unset.

Without `AUTH_SECRET`, login will show: *"There is a problem with the server configuration."*

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
