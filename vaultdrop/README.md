# Vaultdrop 🛡️

A private, ephemeral file vault engineered for shared computers and college computer labs. Upload from your phone, download from the lab — nothing left behind.

## Tech Stack
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Runtime & Package Manager:** [Bun](https://bun.sh)
- **Styling:** Tailwind CSS v4 with Apple WWDC Human Interface Guidelines
- **Database & Storage:** Supabase (PostgreSQL + RLS + S3 Storage Bucket)
- **Deployment:** Vercel (Hobby Tier)

## Quick Start with Bun

### 1. Install Dependencies
```bash
bun install
```

### 2. Start Development Server
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser.

### 3. Production Build
```bash
bun run build
```

## Security & Architecture Features
- **Zero Keystrokes (QR Pairing):** Lab computers display a 2-minute expiring QR code. Scanning with any smartphone camera authenticates the shared computer with zero keyboard interaction.
- **30-Minute Inactivity Seal:** Automatic idle timeout seals and wipes the session if left unattended.
- **Instant Panic Wipe:** Press `Esc 3x` or click the floating red shield to incinerate active sessions in 0ms.
- **24-Hour File Auto-Destruction:** Files expire automatically after 24 hours.
- **30-Day Active Account Lifecycle:** Accounts purge automatically 30 days after last activity to maintain 100% free storage.
- **Database Row-Level Security:** Enforced at the Postgres engine level.
