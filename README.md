# RHAGF — website and admin

The whole of rhagfnig.org.ng (Regy & Henry Amazing Grace Foundation) in one
Next.js app: the public site in the old WordPress theme's exact design, its own
admin at `/admin/`, and a Postgres database (Neon in production). Uploaded files
go to Amazon S3 and email goes through Amazon SES, using one AWS access key.

| Part | Where |
|---|---|
| Public pages (Oxpins theme + Elementor markup) | `lib/theme/` (templates and renderer), `app/(site)/` |
| Theme stylesheets, scripts, fonts | `public/legacy/wp-content/…`, `public/legacy/wp-includes/…` |
| This site's additions to the theme | `public/legacy/rhagf.js`, `public/legacy/rhagf.css` |
| Saved copies of the live pages the templates come from | `theme-source/pages/` |
| Events, campaigns, donations, gallery, volunteers, comments | `lib/charity.ts`, `app/admin/(panel)/charity-actions.ts` |
| Articles, categories, authors (from the StephenLegal admin) | `lib/data.ts`, `app/admin/(panel)/` |
| Forms and email | `lib/forms.ts`, `lib/deliver.ts`, `lib/mail.ts`, `app/api/` |
| Database tables | `db/schema.sql` |
| WordPress imports | `scripts/import-wordpress.ts` (articles), `scripts/import-extras.ts` (the rest) |

## Run it locally

```bash
cp .env.example .env.local      # the defaults work for local development
npm install
npm run db:local                # local Postgres on port 5434; leave it running
npm run db:migrate              # create the tables
npm run import:wordpress        # articles, categories, tags and their pictures
npm run import:extras           # events, campaigns, gallery, volunteers, layout pictures
npm run dev -- --port 3700      # http://localhost:3700, admin at /admin/
```

The first visit to `/admin/` asks for `ADMIN_SETUP_TOKEN` from `.env.local` and
creates the first administrator, or run
`npm run admin:create -- --email=you@example.com --name="Your Name"`.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## How the pages keep the old design

`npm run theme:build` turns the saved pages in `theme-source/pages/` into
`lib/theme/templates.json`. Everything that changes is cut out and replaced by a
slot: the campaign cards, events, news, gallery and team lists, the donation and
receipt boxes, and the article, event and campaign on their own pages.
`lib/theme/render.ts` fills each slot from the database in the theme's own card
markup. The theme's scripts run as on WordPress; `public/legacy/rhagf.js` stands
in for the small part of Elementor's script they need, and sends the forms here.

Every page uses the home page's full header (menu, contacts) and footer. On the
live site, inner pages had a header whose menu button opened an empty panel.

## The admin

| Screen | What it does |
|---|---|
| Donations | Every pledge. Mark it received when the transfer arrives (adds it to the campaign total, optionally thanks the donor by email); cancel; notes; record a donation made another way |
| Campaigns | Title, text, goal, amount raised before this site, suggested amounts, open/closed/draft |
| Events | Title, date, short and full time/place, category, map, picture, optional button |
| News articles | Write, edit, schedule and preview articles (visual editor, SEO and readability checks) |
| Gallery / Volunteers | Pictures and people, with captions, links and order |
| Media | Upload images and PDFs (stored in S3) |
| Messages | Contact and volunteer forms: status, notes, CSV export |
| Comments | Approve, unapprove, spam or delete comments left on campaign pages |
| Settings | Contact details, social links, donation instructions and bank details, form messages, alert address, Google tag |

## Donations

Donations are by bank transfer, as on the old site (GiveWP's offline gateway).
A donor picks an amount on a campaign page or on Donate Now and gives their
name and email. The pledge is saved as *awaiting payment*, the donor is emailed
the payment instructions with a reference (`RHAGF-XXXXXX`) and sees a receipt,
and the foundation gets an alert. Once the money arrives, *Mark received* in
Admin → Donations adds it to the campaign's progress bar.

## Putting it online (Vercel)

1. **Database:** the Neon connection string as `DATABASE_URL`.
2. **Files and email:** an S3 bucket allowing public reads of `uploads/*` (uploads
   go through the server, so no CORS rule is needed), and the domain `rhagfnig.org.ng`
   verified in SES (DKIM) in the same region. One IAM key with S3 put/delete on
   the bucket and `ses:SendEmail`: `S3_REGION`, `S3_ACCESS_KEY_ID`,
   `S3_SECRET_ACCESS_KEY`, `S3_MEDIA_BUCKET`.
3. **Other settings:** `NEXT_PUBLIC_SITE_URL` (the Vercel address until launch),
   `ADMIN_SETUP_TOKEN` (remove after the first sign-in).
4. With the production `DATABASE_URL` and AWS settings in `.env.local`, run
   `npm run db:migrate`, `npm run import:wordpress` and `npm run import:extras`.
   These read rhagfnig.org.ng and change nothing there.

Any address other than rhagfnig.org.ng is kept out of search engines (robots.txt
and `X-Robots-Tag: noindex`).

**Launch** (only with the owner's go-ahead): run both imports once more, set
`NEXT_PUBLIC_SITE_URL=https://rhagfnig.org.ng`, add the domain in Vercel and
point its DNS at Vercel. Keep the WordPress hosting until the new site has run
smoothly for a while.

## Security note about the old site

The live WordPress site is infected: event descriptions and the donation pages
carry injected JavaScript (`var f=String;eval(f.fromCharCode(…))`, loading
`statistic.scriptsplatform.com`). None of it is copied: the importers drop every
inline script, and `theme-source/` was cleaned. The WordPress install itself
needs cleaning or retiring.

## Addresses kept from the old site

`/<article>/`, `/about/`, `/events/`, `/event/<slug>/`, `/news/`, `/gallery/`,
`/volunteers/`, `/become-volunteer/`, `/donation/`, `/donations/<slug>/`,
`/donate-now/`, `/faq/`, `/contact/`, `/donation-confirmation/`,
`/donation-failed/`, `/category/<slug>/`, `/author/<slug>/`, `/YYYY/MM/`,
`/page/N/` (home page news), `/feed/`. Redirects: `/?s=` → `/search/`, the theme's
demo pages (home-03, carousels, sample pages…) → the real page, Rank Math
sitemaps → `/sitemap.xml`, `/wp-admin/` → the admin, `/wp-content/uploads/…` →
each file's new address.
