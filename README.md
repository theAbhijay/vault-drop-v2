<div align="center">

# 🛡️ Vaultdrop

### **The Ephemeral, Zero-Trace File Vault Engineered for Shared College Labs**

*Upload from your smartphone. Download on the shared lab workstation. Walk away with zero trace left behind.*

<br/>

[![Runtime](https://img.shields.io/badge/Runtime-Bun_v1.4+-black?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/Framework-Next.js_16_(Turbopack)-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![Database](https://img.shields.io/badge/Database-Supabase_PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Design](https://img.shields.io/badge/Design_System-Apple_WWDC_HIG-0071E3?style=for-the-badge&logo=apple&logoColor=white)](https://developer.apple.com/design/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)
[![Author](https://img.shields.io/badge/Crafted_by-Abhijay_Chauhan-014BAA?style=for-the-badge&logo=github&logoColor=white)](https://github.com/theAbhijayChauhan)

<br/>

[**Live Demo**](https://vaultdrop.vercel.app) • [**Architecture & Threat Model**](#-the-threat-model--why-vaultdrop-exists) • [**Security Guarantees**](#-zero-trust-security-architecture) • [**Local Quickstart**](#-quick-start-with-bun) • [**Deploy to Vercel**](#-deployment-guide)

---

</div>

<br/>

## ⚠️ The Threat Model: Why Vaultdrop Exists

Every day, millions of students and researchers log into shared computers in university laboratories, library clusters, and internet cafés. To transfer an assignment, code snippet, or slide deck to a lab terminal, users routinely resort to three deeply flawed workarounds:

| Method | Fatal Vulnerability | Risk Exposure |
| :--- | :--- | :--- |
| **WhatsApp Web / Telegram Web** | Requires scanning a web session that exposes your **entire personal chat history**, contact list, and photos to whoever sits at that machine next. | 🔴 **Catastrophic Privacy Leak** |
| **Google Drive / Gmail** | Synchronizes Google accounts into the shared browser; auto-saves autofill tokens, passwords, and browser history. | 🔴 **Persistent Account Takeover** |
| **USB Flash Drives** | Shared lab PCs are notorious vectors for USB worms, shortcut trojans, and autorun viruses that infect personal drives. | 🔴 **Hardware & Data Malware Infection** |
| **Physical Keyloggers** | Hardware dongles plugged between keyboard and PC port silently log every master password typed into any field. | 🔴 **Credential Interception** |

### 💡 The Solution: Vaultdrop
**Vaultdrop eliminates the attack surface completely.** It is an ephemeral, air-gap-inspired bridge between your personal phone and an untrusted computer:
- **Zero Keystrokes on Shared Hardware**: You never type your password or username on the lab keyboard.
- **Instant Pair & Auto-Vanish**: Open the site on the lab PC $\rightarrow$ scan the 2-minute dynamic QR code using your phone's native camera $\rightarrow$ authorize $\rightarrow$ the lab PC unlocks automatically.
- **Air-Tight Session Quarantine**: 30-minute hard TTL auto-wipe + 2-minute idle alert + instant `Esc 3x` Panic Wipe.
- **Autonomous Ephemeral Storage**: Uploaded files incinerate automatically after 24 hours. Inactive student profiles auto-purge after 30 days.

---

## ⚡ Key Highlights & Core Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            VAULTDROP ARCHITECTURE                           │
│                                                                             │
│  [ Personal Smartphone ] 📱                     [ Shared Lab PC ] 🖥️        │
│       │                                                │                    │
│   (Authenticates securely)                  (Displays 2-Min Expiring QR)    │
│       │                                                │                    │
│       ▼                                                ▼                    │
│  [ approve_pairing_session ] ──────────────► [ Real-Time Channel / Poller ] │
│   PostgreSQL Atomic RPC                          Unlocks instantly!         │
│       │                                                │                    │
│       ▼                                                ▼                    │
│  50MB Isolated Vault                         Download File / Print          │
│  (Zero Credential Leaks)                     Press Esc 3x: 0ms Panic Wipe   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Zero-Keystroke QR Handshake (Option 2 Architecture)
- Generates a cryptographically strong, random pairing session token with a strict **120-second lifespan**.
- Encoded as a direct URL: `https://your-domain/pair?token=<uuid>`.
- **Works with any native camera app** (iOS Camera, Google Lens, Samsung Camera) — no specialized app download required.
- Approving on your phone issues an atomic database transaction (`SELECT ... FOR UPDATE`) that transfers temporary session capability to the lab terminal without ever exposing your user credentials to the lab PC's network or memory.

### 2. Apple WWDC Interaction Physics & Design System
Vaultdrop was engineered from the ground up according to the **Apple Human Interface Guidelines**:
- **Natural Spring Mechanics**: Modal entries, sheet dismissals, and button taps utilize high-tension damping springs (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Subtle Frosted Glassmorphism**: Real-time multi-layered backdrop blurs (`backdrop-blur-md`), border translucency, and natural warm canvas palettes (`#F8F3F0`).
- **High-Readability Typography**: Carefully calibrated font hierarchy scaled up for shared high-resolution monitors and mobile viewports alike.
- **Zero Heavy Sluggishness**: Built with Next.js 16 Partial Prerendering and zero unnecessary bloated client libraries.

### 3. Emergency Panic Wipe (`Esc 3x` or Floating Trigger)
- Sitting in a lab and need to step away abruptly?
- Pressing `Escape` three times in rapid succession ($< 800\text{ms}$) immediately invokes the client-side panic incinerator:
  - Terminates all active Supabase auth sessions.
  - Clears `localStorage`, `sessionStorage`, and all browser memory caches.
  - Redirects to `/login?reason=panic` in $0\text{ms}$.
  - Leaves zero residual traces in the browser history.

### 4. Self-Cleaning Storage & Database Lifecycle
- **50 MB Strict Quota**: Enforced before file write at the PostgreSQL database level (`enforce_storage_quota_trigger`).
- **Zero Orphaned Blobs**: Storage object trigger (`delete_storage_object_trigger`) automatically removes the physical storage file from Supabase S3 when its database metadata row is deleted.
- **24-Hour File Shredder**: Files older than 24 hours are automatically pruned by background cron tasks.
- **30-Day Dormant Account Purge**: Frees up database storage by automatically purging test or inactive accounts whose last active timestamp is older than 30 days.

---

## 🔒 Zero-Trust Security Architecture

```
                                  DEFENSE IN DEPTH
                                
      Level 1: Client Isolation      No tokens saved to shared terminal disk
      Level 2: Network Protection    TLS 1.3 + Supabase Row Level Security (RLS)
      Level 3: Zero-Leak Auth        PostgreSQL RPC: is_username_taken()
      Level 4: Atomic Transactions   approve_pairing_session() with FOR UPDATE
      Level 5: Physical Storage      Supabase S3 Bucket with strict user isolation
```

### 🛡️ Why Vaultdrop is Mathematically & Architecturally Safer

1. **Zero-Leak Username Enumeration**:
   Standard systems expose user emails or reveal user existence via distinct error messages. Vaultdrop implements a PostgreSQL security-definer function `is_username_taken` that checks uniqueness without exposing user IDs, creation dates, or metadata.

2. **Tamper-Proof Storage Quotas**:
   Client-side scripts cannot bypass the 50 MB storage limit. A Postgres `BEFORE INSERT` trigger calculates the current aggregate byte count directly inside the database transaction:
   ```sql
   IF (v_current_bytes + NEW.size_bytes) > (v_cap_mb * 1024 * 1024) THEN
     RAISE EXCEPTION 'Storage quota exceeded (Max: % MB)', v_cap_mb;
   END IF;
   ```

3. **Protection Against Lab PC Cache Poisoning**:
   File previews open in isolated modal sandboxes with sandbox iframe headers (`sandbox="allow-scripts allow-same-origin"`). Sensitive files are never cached into the persistent OS filesystem.

---

## 🚀 Quick Start with Bun

Vaultdrop is powered by **Bun** — the ultra-fast JavaScript runtime, bundler, and package manager.

### Prerequisites
- [Bun](https://bun.sh) v1.0.0 or higher installed:
  ```bash
  # Windows (PowerShell)
  powershell -c "irm bun.sh/install.ps1 | iex"

  # macOS / Linux
  curl -fsSL https://bun.sh/install | bash
  ```
- A free [Supabase](https://supabase.com) account.

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/theAbhijayChauhan/Vaultdrop.git
cd Vaultdrop/vaultdrop
```

### Step 2: Install Dependencies
```bash
bun install
```
*(On Windows / OneDrive, `bunfig.toml` is pre-configured with `backend = "copyfile"` to guarantee 100% stable NTFS compatibility).*

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Run the Supabase SQL Schema
1. Open your **Supabase Dashboard** $\rightarrow$ Navigate to **SQL Editor**.
2. Copy the entire contents of [`supabase_schema.sql`](./supabase_schema.sql).
3. Click **Run**.
4. That's it! All tables (`profiles`, `files`, `pairing_sessions`), security policies (RLS), atomic triggers, and storage bucket definitions (`vault_files`) are automatically provisioned.

### Step 5: Start the Development Server
```bash
bun run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📦 Deployment Guide

### Deploying to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push your repository to GitHub.
2. Import the project into **[Vercel](https://vercel.com)**:
   - **Framework Preset**: Next.js
   - **Root Directory**: `vaultdrop`
   - **Build Command**: `bun run build` (or Next.js default)
   - **Install Command**: `bun install`
3. Add your Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (Set to your production Vercel URL, e.g. `https://vaultdrop.vercel.app`)
4. Click **Deploy**. Your zero-trace vault is live!

---

## ⏰ Supabase Inactivity Keep-Alive Action

Supabase free-tier projects pause after 7 days of inactivity. To ensure your instance never sleeps:

This repository includes a scheduled GitHub Action in [`.github/workflows/supabase-keep-alive.yml`](.github/workflows/supabase-keep-alive.yml):
- Executes automatically **every 6 days at midnight UTC** (`0 0 */6 * *`).
- Pings your Supabase REST health endpoint using repository secrets (`SUPABASE_URL` and `SUPABASE_ANON_KEY`).
- Keeps your database hot, responsive, and 100% awake for whenever you need it.

---

## 🛠️ Project Structure

```
Vault Drop/
├── .github/
│   └── workflows/
│       └── supabase-keep-alive.yml     # Auto-ping cron job to keep Supabase awake
├── supabase_schema.sql                 # Production-grade PostgreSQL schema & triggers
├── README.md                           # Main documentation & security whitepaper
└── vaultdrop/
    ├── bunfig.toml                     # Bun configuration (NTFS copyfile engine)
    ├── package.json                    # Project dependencies & scripts
    ├── tsconfig.json                   # TypeScript configuration
    └── src/
        ├── app/
        │   ├── page.tsx                # Main Vault Dashboard & Telemetry
        │   ├── login/
        │   │   └── page.tsx            # Login with QR Handshake & Threat Model UI
        │   ├── pair/
        │   │   └── page.tsx            # Mobile QR Approval Terminal
        │   ├── icon.svg                # Custom SVG Vault Shield brand icon
        │   └── layout.tsx              # Root HTML Shell & Typography
        ├── components/
        │   ├── DropZone.tsx            # Drag & drop file upload with progress bar
        │   ├── FileRow.tsx             # Interactive file list item with inline actions
        │   ├── FilePreviewModal.tsx    # Sandboxed file preview modal (Images, PDF, Code)
        │   ├── BulkActionBar.tsx       # Multi-select bulk download & delete bar
        │   ├── QRLoginCard.tsx         # Auto-refreshing 2-min QR pairing component
        │   ├── StorageMeter.tsx        # Dynamic 50MB storage quota gauge
        │   ├── PanicButton.tsx         # Instant Esc-3x panic wipe controller
        │   ├── IdleWarningBanner.tsx   # 2-minute slide-up session expiry warning
        │   └── OpenSourceLink.tsx      # Global responsive GitHub repository link
        ├── hooks/
        │   └── useSessionTimer.ts      # 30-min idle session timer with auto-logout
        └── lib/
            ├── supabase.ts             # Supabase client instantiation
            ├── auth-helpers.ts         # User auth, registration & profile management
            ├── file-helpers.ts         # S3 uploads, deletions & JSZip archive download
            ├── pair-helpers.ts         # Cryptographic QR token generation & RPC locks
            └── types.ts                # TypeScript interface definitions
```

---

## 👨‍💻 Author & Open Source

Crafted with obsessive attention to privacy, design, and developer experience by:

### **Abhijay Chauhan**
- **GitHub**: [@theAbhijayChauhan](https://github.com/theAbhijayChauhan)
- **Project Repository**: [Vaultdrop on GitHub](https://github.com/theAbhijayChauhan)

Feel free to star ⭐ the repository if this project helped you stay secure in shared lab environments!

---

## 📄 License

This project is open-source and released under the **[MIT License](LICENSE)**. You are free to inspect, modify, fork, and self-host this application for educational and personal use.
