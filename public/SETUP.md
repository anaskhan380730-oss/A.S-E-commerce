# AS Collection: Windows setup and operations

This project is a Next.js 16 App Router application with TypeScript, Prisma 7, and PostgreSQL. Use Node.js 22.12+ or 24.x for Prisma 7, Docker Desktop for local PostgreSQL, and VS Code. The project’s `.nvmrc` selects Node 22.12.0.

## 1. Open the project

Open this folder in VS Code. In the integrated PowerShell terminal, run:

```powershell
node --version
npm --version
npm install
```

`npm install` creates `package-lock.json`. Commit that file after the first successful install; future installs can use `npm ci` to reproduce the locked dependency tree. No lockfile is included yet because the build environment could not resolve the npm registry.

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

## 4. Create the database schema and initial administrator

```powershell
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
```

The seed creates the four clothing categories, measurement templates, homepage sections, store settings, and the initial admin user. It does not create sample products or fake stock. The first migration is generated locally from `prisma/schema.prisma`; after reviewing it, commit `prisma/migrations/` so other environments can use the same schema history.

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

Card payments are deliberately unavailable. Checkout supports Cash on Delivery only; it does not simulate a card charge or mark an order paid from a return page. The adapter contract is in `lib/payments/provider.ts`; it defines checkout-session creation and signed webhook verification, with no provider wired. To activate cards, choose a gateway available for the merchant’s country and account, implement that contract using the gateway’s official API/SDK, verify signed provider webhooks, make webhook processing idempotent, and only then allow the payment method in checkout. Keep API secrets in the hosting secret manager. No gateway credentials or merchant account were supplied, so there is no configured card provider or callback URL to document as active.

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

## Checks

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

The current workspace has no `node_modules`, package lockfile, Prisma migration, or Docker executable. `npm install` previously failed with `ENOTFOUND registry.npmjs.org`; the current DNS diagnostic returns “Access is denied,” and no npm proxy is configured. Therefore package installation, Prisma validation/generation/migrations, Vitest, ESLint, TypeScript typechecking, and the Next production build could not run here. Node’s built-in TypeScript syntax check passed for 27 `.ts` files, the package and tsconfig JSON parsed, and nine direct pricing, offer, delivery, and measurement assertions passed. Run the dependency-based commands above locally after installing dependencies and starting PostgreSQL.

## Current boundaries

- The supplied store has no real catalog data, photography, policies, or business contact information. Add actual product data in admin before taking orders.
- COD and manual payment-status administration work. There is no card gateway or automatic WhatsApp Business API integration.
- The development upload directory is not production-persistent; production upload requires Cloudinary configuration.
- Customer login, newsletter, review submission/moderation, and a return-policy editor are not implemented.

