# MeowChat - Encrypted Intelligence Chat System

A secret intelligence-grade encrypted chat application with end-to-end encryption, built with React, Next.js, and Socket.IO.

## Features

### Feature 1: Basic AES Encrypted Chat (Current)
- **AES-256 symmetric encryption** - Messages encrypted client-side before transmission
- **Zero-knowledge server** - Server only relays ciphertext, never sees plaintext
- **Real-time messaging** via WebSocket (Socket.IO)
- **Spy-themed UI** with Matrix rain, terminal aesthetics, and classified stamps
- **Key fingerprinting** - Visual verification of encryption keys
- **Ciphertext toggle** - View raw encrypted data
- **Typing indicators** - See when agents are composing messages

### Upcoming Features
- [ ] Public Key Encryption (RSA/ECC)
- [ ] Signal Protocol E2EE (Double Ratchet)
- [ ] Steganography (hide messages in images)
- [ ] Self-Destructing Messages
- [ ] P2P Decentralized Chat (WebRTC)

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14, React 18, Tailwind CSS  |
| Backend    | Node.js, Express, Socket.IO         |
| Encryption | crypto-js (AES-256)                 |
| Fonts      | JetBrains Mono                      |

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install

```bash
# Install all dependencies (root + server + client)
npm run install:all
```

### Run

```bash
# Start both server and client
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Server (port 3001)
cd server && node index.js

# Terminal 2 - Client (port 3000)
cd client && npm run dev
```

### Usage

1. Open **http://localhost:3000** in two browser tabs/windows
2. In both tabs, enter:
   - A unique **codename** (e.g., "Shadow" and "Ghost")
   - The same **channel name** (e.g., "alpha-7")
   - The same **secret key** (e.g., "my-super-secret-key-2024")
3. Click **"Initiate Secure Channel"**
4. Start chatting! Messages are encrypted before leaving your browser.

### How Encryption Works

```
You type: "The package is secure"
        ↓
[AES-256 Encrypt with shared key]
        ↓
Server sees: "U2FsdGVkX1+abc123..."
        ↓
[AES-256 Decrypt with shared key]
        ↓
Other agent sees: "The package is secure"
```

## Project Structure

```
meowchat/
├── server/                 # WebSocket relay server
│   ├── index.js            # Express + Socket.IO server
│   └── package.json
├── client/                 # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.js       # Root layout with fonts
│   │   │   ├── page.js         # Landing page (join form)
│   │   │   ├── globals.css     # Spy-themed styles
│   │   │   └── chat/
│   │   │       └── page.js     # Chat room interface
│   │   ├── components/
│   │   │   └── MatrixRain.jsx  # Matrix rain background
│   │   └── lib/
│   │       ├── encryption.js   # AES encrypt/decrypt
│   │       └── socket.js       # Socket.IO client
│   └── package.json
├── package.json            # Root workspace scripts
└── README.md
```

## Deploy (Vercel + relay server)

The **Next.js app** can live on [Vercel](https://vercel.com). The **Socket.IO relay** must run on a long-lived Node host (Vercel serverless does not support this server). Use [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), or any VPS.

### 1. Deploy the relay (`server/`)

- Start command: `node index.js` (or `npm start` from `server/`)
- Set `PORT` from the platform if required (the server already uses `process.env.PORT`).
- Set **`CLIENT_ORIGINS`** to your real site origins, comma-separated, for example:
  - `https://your-app.vercel.app`
  - Add preview URLs if you need them: `https://your-app-git-branch-user.vercel.app`
- Note the public URL (e.g. `https://meowchat-relay.onrender.com`).

### 2. Deploy the client on Vercel

1. Push the repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New Project** → import the repo.
3. Open **Settings → General → Root Directory** and set it to **`client`** (important: the monorepo root is not the Next.js app).
4. Framework preset should detect **Next.js**. Build command: `npm run build`, install: `npm install` (defaults are fine).
5. Under **Environment Variables**, add:
   - **`NEXT_PUBLIC_SOCKET_URL`** = your relay URL with **no trailing slash**, e.g. `https://meowchat-relay.onrender.com`
6. Deploy. After the first deploy, ensure **`CLIENT_ORIGINS`** on the relay includes your production Vercel URL (`https://<project>.vercel.app`).

### 3. Optional: Vercel CLI

From the repo root:

```bash
cd client
npx vercel
```

Link the project when prompted; still set **`NEXT_PUBLIC_SOCKET_URL`** in the Vercel dashboard (or `vercel env add`).

## Security Notes

- All encryption/decryption happens **client-side only**
- The server **never** has access to plaintext messages or encryption keys
- Session data is stored in `sessionStorage` (cleared when tab closes)
- Key sharing must be done through a separate secure channel
