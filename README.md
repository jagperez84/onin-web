# ONIN Web

ONIN is a modern enterprise web application built from a clean React + TypeScript + Vite foundation with Supabase.

## Current scope

The repository currently contains the foundation and the first functional vertical slice: **Clientes**.

Implemented:
- Enterprise responsive shell and navigation
- Supabase authentication
- Core repository layer
- Customer listing and search
- Customer creation and update
- Addresses CRUD
- Contacts CRUD
- CIF/NIF, email and phone validation
- Cloudflare Pages SPA configuration

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

For Cloudflare Pages:

```bash
npm run build:cloudflare
```

Output: `dist/`

## Environment

Copy `.env.example` to `.env` for local development and configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ONIN_API_URL`

Never commit `.env` or a Supabase `service_role` key.
