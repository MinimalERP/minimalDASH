# minimalDASH

A browser control room for Micro Components. Each customer job keeps its drawings (in Google Drive), its mail history and the status of every vendor in one place. AI reads the mails you pick.

Built on the same stack as [minimalERP](https://github.com/MinimalERP/minimalERP): Vite + Preact + TypeScript, Supabase and GitHub Pages.

Order of work:
1. Mail → job card
2. Vendor follow-up board
3. Vendor directory

Customer mails and drawings are never committed to this repository.

## Working on it

```
pnpm install
pnpm dev        # http://localhost:5173 — needs .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (minimalERP's project)
pnpm test
```

**The database is minimalERP's.** The jobs live next to the books, so a job can link Sales Orders and Purchase Orders directly, and one
sign-in (your minimalERP account) opens both apps. The tables (`dash_jobs`, `dash_parts`, `dash_events`), their permissions
(`dash.view`, `dash.edit`) and the one way to change them (`dash_apply`, called by the `dash` Edge Function) are in the minimalERP repo:
`supabase/migrations/20261009000100_dash.sql` and `supabase/functions/dash/`. This app reads through row-level security and changes
through that function.

Drawings and files are never stored in the database, only their Google Drive links.

The site: pushing to `main` deploys to GitHub Pages. It needs the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(minimalERP's project), and `UPLOAD_URL` for file uploads (the Gmail add-on's web app).
