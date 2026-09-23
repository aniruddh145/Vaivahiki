# Samaj Vivah – community matrimony platform

Built for **Dashora Nagar Brahman Samaj**. It's bilingual (हिन्दी + English) and can take more languages and communities later. Almost everything is configured from the admin panel.

---

## What's included

### For members
| Area | Features |
|---|---|
| Login | Mobile number **and/or** email + password, or **OTP login**. Optional mobile verification by OTP (switch on in admin). |
| Language | Language dropdown in the header. Hindi and English are included, and admins can add Gujarati, Marathi, Sindhi and others without code changes. |
| Biodata | Full biodata with 55+ fields in 6 sections (personal, horoscope/kundli, education & career, family, partner preferences, about). Up to 6 photos. Any number of **family contact numbers** (father, mother, brother…), each with a WhatsApp flag. One account can manage several biodatas (e.g. a parent with two children). Print / save as PDF. |
| Search | Filters are generated from every "filterable" field (age, height range, marital status, manglik, rashi, education, income, city, state, diet…). There are also *with photo*, *photo-verified* and name/ID search. Search defaults to the opposite gender. Gotra can be excluded by typing `-Kashyap`. |
| Shortlisting | **Bookmarks** and **Wishlist** (two separate lists) |
| Interest / notify | Send an interest with a message. The other side accepts or declines and gets in-app notifications. Optionally **charged in credits** after N free per day. |
| Contact unlock | Contact numbers and PREMIUM fields stay locked until the member spends credits (cost is configurable, 0 = free). An accepted interest can reveal contacts to both sides for free (configurable). |
| Credits | Buy packages (e.g. 5 credits for ₹500). Includes wallet, full credit history, payment history, downloadable **GST invoice / receipt**, and a list of unlocked profiles. |
| Success stories 💍 | When a match is made, the family marks the biodata as married and shares **ceremony photos** (up to 10) with the couple's names, date, city and message. If the partner's profile is tagged, **their family confirms first**. Members see the stories on the wall, **congratulate** 🎉 and **comment** (the couple is notified). Couples choose members-only or public (the home page shows the latest). |
| Trust & safety | Report a profile (fake, already married, asking for money, misbehaviour…). Members can leave star-rating feedback only after they have actually interacted with the profile. **Selfie photo verification** gives a verified badge (can be switched on or off). A mobile-verified badge is shown too. |

### For the admin (everything from the browser)
| Page | What you can do |
|---|---|
| Dashboard | Pending approvals, open reports, selfies to verify, revenue this month and this FY, credits sold and used |
| Profiles & approvals | Approve or reject (with a reason) or hide profiles. Approve or remove individual photos, **feature** a profile for 7/30/90 days (paid-listing upsell), give the verified badge, delete |
| Photo verification | Selfie shown next to profile photos. Approve or reject with a note |
| Reports & spam | Dismiss, hide the profile, or suspend the account. Edit the list of report reasons (bilingual) |
| Feedback | Hide abusive feedback |
| Stories & comments | Moderation queue for stories and comments. **Automatic spam checks** hide anything suspicious and show the reason: your own blocked-word list (Hindi & English, catches tricks like "p a y t m"), phone numbers, links, emails and "WhatsApp me"-type messages, plus an optional **AI meaning check** (Anthropic Claude or OpenAI) that understands Hindi/English/Hinglish and can also check photos. Items reported by N members are hidden automatically, and repeat offenders lose commenting. Choose whether stories auto-publish or need your approval. |
| Users & credits | Search users. **Add or remove credits** (e.g. cash paid at the Samaj office), refunds, suspend/ban, make someone a moderator or admin, reset passwords, mark mobile as verified |
| Payments, GST & audit | Date-range reports: gross, taxable value, CGST/SGST/IGST, month-wise table, credit movement. **CSV downloads**: transactions, GST invoice register, credit ledger, activity log. Mark orders as refunded |
| Credit packages | Create, edit or disable packages (name/description in each language, credits, price, "popular" badge) |
| Biodata fields | **Field builder**: add, edit or disable fields and sections. Available types are text, paragraph, number, dropdown, multi-choice, date, time, yes/no and height. Each field has labels, options and help text in every language, required / filterable / show-on-card switches, visibility (public / members / premium / private), and can be limited to certain communities |
| Communities | Add Sindhi, Rajput, Brahman, etc. Each has its own profile-ID series (DNB1001, SIN1001…) and can be switched on when ready (3 are pre-created but inactive) |
| Languages & text | Add languages and edit **every piece of website text** in each language (untranslated text falls back to English) |
| Settings | 50+ switches, including: OTP provider & keys, mandatory mobile verification, approval required, max profiles per account, minimum ages, guests can browse, blur photos for guests, selfie verification on/required, credit costs for unlock / interest / bookmark, free interests per day, signup bonus credits, GST on/off, rate, inclusive/exclusive pricing, seller GSTIN/PAN/address, SAC code, invoice prefix, payment gateway & keys, announcement banner |
| Activity log | Every admin action, payment, credit change and contact unlock, with who did it and when |

---

## Put it online (no technical team needed)

There are two supported options, and the same code works on both.

| | **Vercel** (easiest clicks) | **Railway** (cheapest when charging fees) |
|---|---|---|
| Cost while testing | Free (Hobby plan) | about US$5 a month |
| Cost once you charge members | US$20 a month (Vercel Pro; Hobby is non-commercial only) plus storage | about US$5–10 a month |
| Database | Neon Postgres, added from inside Vercel | Railway Postgres |
| Photos | Vercel Blob, added from inside Vercel | Volume mounted at `/data` |

### Option A – Vercel
1. Put this folder in a **private GitHub repository** (GitHub Desktop → Add local repository → Publish, tick *Private*).
2. Sign in at **vercel.com** with GitHub → **Add New → Project** → import the repository → **Deploy**. The first deploy fails because there is no database yet. That's expected.
3. Project → **Storage → Create Database → Neon (Postgres)** → connect it to the project. This adds `DATABASE_URL` automatically.
4. Project → **Storage → Create → Blob** → connect it. This adds `BLOB_READ_WRITE_TOKEN`, which the app uses for photos.
5. Project → **Settings → Environment Variables**, add:
   - `SESSION_SECRET` → 40+ random letters and numbers
   - `ADMIN_MOBILE` → e.g. `+9198XXXXXXXX`, and `ADMIN_PASSWORD`
   - `SEED_DEMO` → `1` (test site only: adds 16 sample profiles, password `demo123`)
6. **Deployments → ⋯ → Redeploy.** Every deploy creates or updates the tables automatically and, the first time, the default fields, packages and admin account.
7. Open the `.vercel.app` link and log in as admin. You can connect your own domain later under Settings → Domains.

### Option B – Railway
1. Put the code on GitHub as above.
2. On Railway choose **New Project → Deploy from GitHub repo** and pick the repository. Railway finds the `Dockerfile` automatically.
3. In the same project choose **New → Database → PostgreSQL**.
4. Open the web service → **Variables** and add:
   - `DATABASE_URL` → "Add reference" → Postgres → `DATABASE_URL`
   - `SESSION_SECRET`, `ADMIN_MOBILE`, `ADMIN_PASSWORD` (and `SEED_DEMO=1` for a test site)
   - `UPLOAD_DIR` → `/data/uploads`
5. Web service → **Settings → Volumes → Add volume**, mount path `/data`. This keeps photos safe between deploys.
6. Web service → **Settings → Networking → Generate domain**.
7. Setup is automatic on first start.

### Moving from test to launch
Delete the database and create a new one (Vercel: Storage → Neon; Railway: Postgres), remove `SEED_DEMO`, and redeploy. The site starts clean with only your admin account.

### Before launch checklist
- [ ] Admin → Settings → General: site name, support phone/WhatsApp
- [ ] Admin → Settings → Billing & GST: legal name, address, GSTIN (if registered), SAC code (confirm with your CA), invoice prefix
- [ ] Admin → Settings → Payments: switch the gateway from `test` to `razorpay`, enter the Key ID, Key Secret and Webhook Secret. In the Razorpay dashboard add a webhook to `https://<your-domain>/api/webhooks/razorpay` for events `payment.captured` and `order.paid`.
- [ ] Admin → Settings → Login & OTP: choose an SMS provider (MSG91 / 2Factor / Twilio) and enter its keys, then switch on "Verify mobile with OTP" if you want it.
- [ ] Change the admin password (My Account → Account settings)
- [ ] Review the biodata fields and add your Samaj's gotra list as a dropdown if you prefer
- [ ] Admin → Settings → Success stories: auto-publish or approve every story
- [ ] Admin → Settings → Spam & moderation: review the blocked words. Optionally choose `anthropic` or `openai` and paste an API key to switch on the AI meaning check (usually a few hundred rupees a month or less at community scale; OpenAI's moderation check is free)

---

## Mobile apps (Android / iOS)

The site is already a **PWA**: members can use "Add to Home screen" from Chrome or Safari and it opens like an app. For Play Store / App Store listings, wrap the live site with **Capacitor** (the same codebase, no second app to maintain):

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap init "Samaj Vivah" org.dashorasamaj.vivah --web-dir=public
# in capacitor.config.ts set: server: { url: "https://<your-domain>" }
npx cap add android && npx cap open android   # build the APK/AAB in Android Studio
```

---

## Monetisation built in (and ideas for later)
**Built in now:**
- Credit packs, e.g. 5 contacts for ₹500 or 12 for ₹1,000
- Pay-per-interest after a daily free quota
- Paid bookmarks (optional)
- **Featured profiles** that sort to the top of search; sell these at the Samaj office and apply them from Admin → Profiles
- Signup bonus credits to get people started
- Offline cash payments recorded through admin credit adjustments with a note

**Ideas for a next phase:**
- Monthly memberships
- "Profile boost" bought directly by members
- Horoscope-matching reports
- Sponsored banners for Samaj events or businesses
- Paid "assisted matchmaking" by committee members

---

## For developers

- **Stack:** Next.js 15 (App Router, server actions), PostgreSQL, Drizzle ORM, Tailwind CSS 4. No paid services are required.
- **Photos:** photos are resized in the browser before upload (max 1600px JPEG, ~200–400 KB) to save mobile data and stay under upload limits. With Vercel Blob, photos get long unguessable URLs.
- **Moderation code:** `src/lib/moderation.ts` holds the word and pattern filter and the pluggable AI provider. If the AI provider is unreachable, content is allowed and the free filters still apply.
- **Code layout:** `src/db/schema.ts` holds the data model and `src/db/seed.ts` the default fields. Settings are in `src/lib/settings.ts` (the admin Settings page is generated from this list), UI text in `src/lib/i18n/{en,hi}.ts`, payment gateways and GST in `src/lib/billing.ts`, OTP providers in `src/lib/otp.ts`, and file storage in `src/lib/storage.ts`.
- **Add a payment gateway:** implement the `PaymentGateway` interface in `billing.ts`, register it in `GATEWAYS`, and add its name to `payments.gateway` options in `settings.ts`.
- **Local dev:** copy `.env.example` to `.env`, then run `npm install`, `npm run db:push`, `SEED_DEMO=1 npm run db:seed` (adds 16 demo profiles with password `demo123`) and `npm run dev`.
- **Search:** filtering on dynamic fields happens in memory after an indexed SQL pre-filter (status/gender/community/age). That is fine up to tens of thousands of profiles. Move it to JSONB GIN indexes if the platform grows beyond that.
