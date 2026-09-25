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
pnpm dev        # http://localhost:5173 — needs .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm test
```

Database: `supabase/migrations/` (forward-only). Apply with `npx supabase@latest db push` after `supabase link --project-ref <ref>`.
Every row belongs to its owner (row-level security); drawings and mail bodies are never stored, only Drive / Gmail links.

The site: pushing to `main` deploys to GitHub Pages. It needs the repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
