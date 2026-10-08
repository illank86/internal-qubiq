# QUBIQ Internal

The QUBIQ team's internal app: sales, licensing, content, newsletters and
system administration — everything staff do that is not the public website.

goqubiq.com stays the commercial site and the customers' self-service
(sign-up, bug reports, licence requests, invoices, claim links and PDF
links). This app replaces the website's `/admin`, one area at a time.

## How it works

- **React SPA** — Vite, React 19, React Router, TanStack Query, Tailwind 4,
  with the website's design tokens.
- **Same Supabase project as the website.** Only the publishable key ships
  here; every read and write is checked by row-level security and the
  permission checks inside the database functions, exactly as in `/admin`.
  Never add a service-role or secret key to this app.
- **Staff only, no sign-up.** Staff are invited from Users & roles (the
  `invite-user` edge function); customers register on the website. A
  customer who signs in here is told the app is for the team and signed out.
  Access needs an internal account with the `admin.access` permission.
- **Emails** are sent by the `notify-staff` edge function from database
  triggers, whichever app made the change.

## Develop

```bash
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm install
npm run dev                  # http://localhost:5180
npm run build                # type-check and build to dist/
```

## Migration plan

| Phase | Area | Status |
|---|---|---|
| 0 | Foundation: app shell, staff sign-in, invite and reset links, permissions, dashboard | done |
| 1 | Website cache refresh on data changes (website endpoint + database trigger); server-action logic into RPCs | next |
| 2 | Content and blog (generic tables and forms, media library, rich text) | |
| 3 | Sales: quote requests, leads, quotations, invoices, editions, Sales settings | |
| 4 | Licensing and community: licence queue, bug triage, integrators | |
| 5 | Newsletters, subscribers, users and roles, activity and email logs, downloads | |
| 6 | Cut-over: redirect `/admin`, remove admin code from the website | |

Screens not built yet show a placeholder linking to the same screen on the
website's `/admin` — both apps use one database, so either works meanwhile.

## Deploying

1. Host the static build (`dist/`) — `vercel.json` (Vercel) and
   `public/_redirects` (Netlify, Cloudflare Pages) send every path to
   `index.html`.
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
   `VITE_SITE_URL` in the host's environment.
3. In Supabase → Authentication → URL configuration, add
   `https://<this app's domain>/set-password` to the redirect URLs.
4. Point staff emails here: in the `invite-user` edge function set
   `redirectTo` to `https://<this app's domain>/set-password`, and in the
   invite (and, for staff, recovery) email templates link to
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` (or
   `type=recovery`). The website's own links keep using `{{ .SiteURL }}`.
