# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Environments (Dev vs Prod)

This app uses Vite “modes” to load environment variables:

- Local dev (`npm run dev`) loads `.env` + `.env.development`
- Production build (`npm run build`) loads `.env` + `.env.production`

Environment templates:

- Copy `.env.example` → `.env` and fill in values (or set them in your host like Vercel).

### Local multi-tenancy options

**Option A (recommended for dev): Path-based tenants**

- Open: `http://localhost:8080/t/<tenantSlug>` (example: `http://localhost:8080/t/aem`)
- Controlled by `VITE_TENANT_ROUTING="path"` in `.env.development`

**Option B: Subdomain tenants on localhost**

Browsers allow `*.localhost` to resolve to `127.0.0.1`, so you can use:

- Open: `http://<tenantSlug>.localhost:8080` (example: `http://aem.localhost:8080`)
- Set `VITE_TENANT_ROUTING="subdomain"` in `.env.development`

### Supabase Auth redirect allow-list (for local dev)

If you’re using hosted Supabase during local dev, add these to your Supabase Auth redirect allow-list:

- `http://localhost:8080/**`
- `http://*.localhost:8080/**`

This is required for password reset / email link redirects when testing locally.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Ionic (Capacitor) for Android builds

## Android app (Capacitor)

This repo is set up to package the existing web app as an Android app using Capacitor.

Prereqs:

- Android Studio + Android SDK installed
- Java 17 (recommended for recent Android Gradle tooling)

Commands:

```sh
# Build web + sync into native projects
npm run cap:sync

# One-time: create the Android native project
npm run cap:add:android

# Open Android Studio
npm run cap:open:android
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Docker / Cloud Run builds (important)

This project is a Vite SPA. Vite embeds `VITE_*` environment variables at **build time**.

The Docker build intentionally ignores `.env` / `.env.*` (see `.dockerignore`), so if you build the container without supplying `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at build time, auth/sign-in will fail at runtime.

Example:

```sh
docker build \
  --build-arg VITE_SUPABASE_URL="https://<project-ref>.supabase.co" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key>" \
  --build-arg VITE_PROD_DOMAIN="myco-op.co.za" \
  --build-arg VITE_TENANT_DOMAIN="myco-op.co.za" \
  --build-arg VITE_TENANT_ROUTING="subdomain" \
  -t mycoopam .
```
