# AS Collection: Windows setup and operations

This project is a Next.js 16 App Router application with TypeScript, Prisma 7, and PostgreSQL. Use Node.js 22.12+ or 24.x for Prisma 7, Docker Desktop for local PostgreSQL, and VS Code. The project’s `.nvmrc` selects Node 22.12.0.

## 1. Open the project

Open this folder in VS Code. In the integrated PowerShell terminal, run:

```powershell
node --version
npm --version
npm ci
```

The project includes `package-lock.json`; `npm ci` installs the locked dependency tree.

If registry DNS fails, inspect it with `Resolve-DnsName registry.npmjs.org` and check your Windows network or approved proxy settings. Then run `npm install` again once the registry is reachable. Do not use `npm ci` before the lockfile exists.

## 2. Start PostgreSQL

Start Docker Desktop, then run from the project folder:

```powershell
docker compose up -d db
docker compose ps
```

The local database is PostgreSQL 16 and persists in the `ascollection_data` Docker volume. The local connection string is already in `.env.example`.

## 3. Configure environment variables

```powershell
Copy-Item .env.example .env
notepad .env
```

Before continuing, replace `ADMIN_PASSWORD` with a private password and `AUTH_SECRET` with a random value of 32 or more characters. For example, in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Copy that output into `AUTH_SECRET`. Keep `.env` private; it is ignored by Git. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first seed run. The seed hashes the password with bcrypt when it creates the initial administrator.

## 4. Apply the database schema and initial administrator

```powershell
npx prisma generate
npx prisma migrate deploy
```

On a brand-new database, run `npm run db:seed` once to create the four clothing categories, measurement templates, homepage sections, store settings, and initial admin user. The seed does not create sample products or fake stock. This project already has a migration history; do not create another `init` migration.

## 5. Run the website

```powershell
npm run dev
```

Open <http://localhost:3000>. The admin dashboard is at <http://localhost:3000/admin>.

## 6. Add real products, variants, and images

Sign in to `/admin` using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values used by `npm run db:seed`. In Products, create a product with its real PKR price, SKU, category, colors, sizes, and starting stock per variant (the entered quantity is assigned to each generated color/size combination; adjust individual variants in the catalog list). Then use the image uploader to add JPEG, PNG, or WebP images (maximum 5 MB).

For development without storage credentials, uploads are written to `public/uploads/` and ignored by Git. This filesystem fallback is not persistent on serverless hosts. For persistent uploads, configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`; the server signs uploads and stores the resulting secure URL with the selected product. Do not expose the API secret in a `NEXT_PUBLIC_*` variable.

## 7. Configure custom stitching

In Categories, enable or disable custom stitching and edit that category’s measurement template JSON. A field can be a string, or an object such as:

```json
{"key":"waist","label":"Waist","required":true,"min":18,"max":80,"guide":"Measure around the waist"}
```

Use a list for one garment group, or a grouped object for a set, for example `{"Kurti":[...],"Pajama":[...]}`. In Products, choose whether a product inherits its category setting, enables stitching, or disables it. The global stitching switch is in Settings. Custom-measurement orders enter `NEEDS_REVIEW`; administrators can review the measurement snapshot, add stitching notes, and move it through approval and production statuses before making the garment.

Measurements use inches or centimeters, preserve notes, are validated against the configured required fields and minimum/maximum values on the server, and remain attached to each order line.

## 8. Configure delivery and Cash on Delivery

In admin Settings, set the delivery fee, free-delivery threshold, and COD availability. When COD is switched off, checkout hides/blocks the payment action and the server rejects a COD order. The server recalculates product prices, applicable discounts, shipping, and total immediately before creating an order. Order requests include an idempotency key; stock changes and order creation happen in a database transaction.

Orders are created with `UNPAID` payment status. After collecting cash, update payment status in the admin order review. Cancelling an order returns its quantity to inventory; reopening a cancelled order reserves stock again when available.

## 9. Configure WhatsApp

Set the WhatsApp destination (international country code, digits; no spaces) in admin Settings. After checkout, the customer can choose **Share order in WhatsApp**. The encoded message includes the order reference, customer and delivery details, products, variants, custom measurements, discounts, delivery, total, and COD. The browser opens WhatsApp, and the customer must press **Send**. This fallback does not send messages automatically.

No WhatsApp Business Platform credentials are present. To send automatic business notifications, configure a server-side official Cloud API adapter and webhook verification using Meta credentials stored as server secrets. This project does not currently send automatic WhatsApp messages.

## 10. Promotions and coupons

Create offers in Promotions. Percent and fixed discounts require a coupon code; Buy X Get Y and bundles can be automatic or code-based. Offers support activation, start/end dates, total-use limits, minimum basket amount, and eligible product/category ids.

Examples for the configuration JSON:

```json
{"buyQuantity":2,"rewardQuantity":1,"productIds":["PRODUCT_ID"],"rewardProductIds":["REWARD_PRODUCT_ID"]}
```

```json
{"bundleQuantity":2,"bundlePrice":2500,"categoryIds":["CATEGORY_ID"]}
```

Free shipping can be activated as a code or an automatic promotion. Checkout recalculates eligible discounts and delivery server-side; browser totals are only a preview. Usage limits are checked and incremented with the order transaction.

## 11. Online card payments

Safepay hosted card checkout is wired in sandbox-first mode. Customers are redirected to Safepay to enter card details; this store does not collect or store card numbers. A 5% discount is calculated only when the customer chooses card. COD receives no card discount. The server creates a PKR payment tracker, verifies the payment status and amount with Safepay after return, and accepts only correctly signed webhooks before marking a card order paid.

To enable sandbox checkout:

1. Create a Safepay test account and copy its sandbox API key and secret key from the Safepay dashboard.
2. Open the project `.env` file. Set `APP_URL` to the website URL, keep `SAFEPAY_ENV="sandbox"`, and fill `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`, and `SAFEPAY_WEBHOOK_SECRET`. Never paste these keys in chat or screenshots.
3. In Safepay Developer settings, add a webhook endpoint pointing to `https://YOUR-PUBLIC-DOMAIN/api/payments/webhook`, subscribe to payment events, and copy that endpoint’s shared secret into `SAFEPAY_WEBHOOK_SECRET`. Safepay cannot call a plain `localhost` address; local webhook testing needs a public HTTPS tunnel, or use a deployed HTTPS test site.
4. Restart `npm run dev`. Checkout will enable the card option when the required settings are present. Use the Safepay sandbox test cards from its official [test cards guide](https://safepay-docs.netlify.app/developers/safepay/test-cards/), never a real card for a sandbox test.

For live payments, Safepay requires an approved live merchant account and enabled payment methods. Set `SAFEPAY_ENV="production"`, replace all three keys with live credentials, set `APP_URL` to the real HTTPS website, and register the production webhook. Keep keys in the host’s secret manager in production. The app defaults to sandbox and does not include merchant credentials.

The integration follows Safepay’s [Express Checkout flow](https://safepay-docs.netlify.app/build-your-integration/express-checkout/?platform=web), [webhook HMAC verification](https://safepay-docs.netlify.app/developers/webhooks/verify-hmac-signatures/), and [payment event definitions](https://safepay-docs.netlify.app/developers/webhooks/webhook-types/).

## 12. Deploy

Use a Node.js 22/24 hosting environment, managed PostgreSQL, and Cloudinary (or implement another persistent object-storage adapter). Set `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, and image-provider secrets in the host’s secret manager. Provision the database and run:

```powershell
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

Run `npm run db:seed` once during initial provisioning to create the administrator and default content. Do not rerun seed with an initial admin email if you intend to change that user’s password; the seed creates the password only on first creation. For production, enable HTTPS, database backups, error monitoring, and an appropriate rate limit/WAF for login and checkout endpoints. Keep `.env` out of source control.

## 13. Customer accounts and password resets

Customers can create an account, sign in, and review orders placed while signed in. Checkout does not collect or save unfinished-checkout contact details for follow-up.

To enable password-reset emails, configure `RESEND_API_KEY` and `EMAIL_FROM` as server-side secrets. Verify the sender domain with Resend first, and set `APP_URL` to the public HTTPS website address in production. Until those settings are added, sign-in and account creation work, but password reset reports that email delivery is not configured. Never put the API key in a `NEXT_PUBLIC_*` variable or share it in chat/screenshots. The reset link expires after 60 minutes and is one-time-use.

The customer-account database migration is `20261115000200_customer_accounts_and_abandon_details`. After starting PostgreSQL, apply any pending migrations with `npx prisma migrate deploy`, then restart the app. The migration adds account/order links and consented abandoned-checkout delivery details; it does not delete existing products or orders.

## Checks

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

Prisma formatting and client generation were run after the customer-account schema changes. Typechecking, lint, tests, and the production build were not run. The Docker engine was unavailable when checking local PostgreSQL, so the new migration has not yet been applied. Start Docker Desktop, then run `docker compose up -d db` and `npx prisma migrate deploy` from this project folder.

## Current boundaries

- Keep product catalog, policies, and business contact information current in the admin before accepting orders.
- Safepay code is present, but online payments stay unavailable until merchant credentials and webhook settings are configured.
- The development upload directory is not production-persistent; production upload requires Cloudinary configuration.
- Customer accounts and the account order-history page are implemented. Reset emails require a verified sender domain and configured Resend secrets.
- Account deletion/self-service profile editing, newsletter, and customer-submitted reviews are not implemented.

