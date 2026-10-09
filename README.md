# Heartline (working name: change it in `index.html`, `package.json` and `server.js`)

## Folder structure
```
heartline/
├── server.js         Express + Socket.IO: auth, pairing, chat, Stripe
├── schema.sql        PostgreSQL tables and indexes
├── package.json
├── .env              you create this (see below)
└── public/
    ├── index.html    hero page + login + pairing + chat
    ├── style.css     palette, dark mode, responsive layout
    └── app.js        floating hearts, typing effect, auth, chat
```

## Run locally
1. Install Node 20+ and PostgreSQL. Create a database: `createdb heartline`
2. `psql heartline -f schema.sql`
3. Create `.env`:
   ```
   DATABASE_URL=postgres://localhost/heartline
   JWT_SECRET=<long random string>
   BASE_URL=http://localhost:3000
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
   Stripe keys are optional until you test Premium.
4. `npm install && npm run dev`, then open http://localhost:3000
5. Test chat with two accounts: sign up in a normal window and a private window, create a code in one, join with it in the other.
6. Stripe webhook: `stripe listen --forward-to localhost:3000/api/billing/webhook`

## Deploy (Render or Railway)
1. Push to a private Git repo (add `.env` and `node_modules` to `.gitignore`).
2. Create a PostgreSQL instance on the host, run `schema.sql` against it.
3. Create a Node web service: build `npm install`, start `npm start`.
4. Set the environment variables above, plus `NODE_ENV=production` and `BASE_URL=https://your-domain`.
5. Add your domain; the host issues the SSL certificate.
6. In Stripe, add a webhook to `https://your-domain/api/billing/webhook` for `checkout.session.completed` and `customer.subscription.deleted`.

## Testing and launch checklist
- [ ] Sign up, log in, wrong password, duplicate email
- [ ] Pair two accounts; a third account cannot join a full code
- [ ] Messages arrive in real time and survive a refresh
- [ ] Premium checkout works with Stripe test card 4242 4242 4242 4242
- [ ] Chrome, Firefox, Safari, Edge; small phone, large phone, tablet, desktop
- [ ] Lighthouse 90+ for speed and accessibility
- [ ] HTTPS only; `secure` cookie active (`NODE_ENV=production`)
- [ ] Login rate limit returns 429 after 10 tries
- [ ] Daily database backups on; error monitoring and analytics added
- [ ] Privacy Policy and Terms written; "delete my account" button wired to `DELETE /api/me`

## Not built yet
Love Notes, Memory Gallery, Anniversaries, Shared Playlist, Settings, email verification and password reset, contact and newsletter forms, emoji picker and stickers, mobile bottom tab bar, testimonials and pricing sections, sitemap.xml and robots.txt, image uploads. The tables for most of these already exist in `schema.sql`.
