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

El enrutamiento SPA se gestiona automáticamente en Cloudflare mediante `wrangler.jsonc`:

```jsonc
"assets": {
  "directory": "./dist",
  "not_found_handling": "single-page-application"
}
```

> **Importante:** No incluir un archivo `_redirects` con reglas del tipo `/* /index.html` o `/* /index.html 200`, ya que el nuevo validador de Cloudflare Workers Assets detecta un bucle infinito (código de error `100324`). La propiedad `not_found_handling: "single-page-application"` ya se encarga de resolver todas las rutas del cliente a `index.html` de forma nativa.

## Git deployment

Connect this repository to Cloudflare Pages and use the build settings above. Cloudflare installs dependencies, runs the build and publishes `dist/`.
