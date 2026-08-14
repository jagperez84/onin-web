# ONIN — Cloudflare Pages

This project is a React + Vite SPA. Do not open `index.html` directly from the filesystem.

## Build settings

- Framework preset: Vite
- Build command: `npm run build:cloudflare`
- Output directory: `dist`
- Node: 20 or newer

## Environment variables

Configure these in Cloudflare Pages → Settings → Environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ONIN_API_URL`

Never put a Supabase `service_role` key in a `VITE_*` variable.

## SPA routing

`public/_redirects` makes routes such as `/ventas/clientes/123` resolve to `index.html`, allowing React Router to handle them client-side.

## Git deployment

Connect this repository to Cloudflare Pages and use the build settings above. Cloudflare installs dependencies, runs the build and publishes `dist/`.
