# Aethermorph Worker — Setup Guide

This is a tiny Cloudflare Worker that lets your browser-based Aethermorph app
generate AI images. It runs on Cloudflare's free tier (10,000 generations/day).

## One-time setup (~5 minutes)

### 1. Sign up for Cloudflare (free, no credit card)
Go to https://dash.cloudflare.com/sign-up — verify your email.

### 2. Open the Workers section
After signing in, in the left sidebar look for **Compute (Workers)** or
**Workers & Pages**. Tap that.

### 3. Create a Worker
- Tap **"Create"** or **"Create Worker"**
- Give it a name like `aethermorph` (this becomes part of your URL)
- Tap **"Deploy"** to create it (you'll edit it next)

### 4. Edit the Worker code
- Tap **"Edit code"** on the Worker you just created
- Delete everything in the editor
- Paste the entire contents of `aethermorph-worker.js`
- Tap **"Deploy"** at the top right

### 5. Add the AI binding (this is what gives the Worker access to image generation)
- Go back to your Worker's overview page (← arrow at top)
- Tap **"Settings"** tab
- Tap **"Bindings"** in the left sub-menu
- Tap **"Add binding"** → **"Workers AI"**
- For "Variable name", type exactly: **`AI`** (capital letters, no quotes)
- Tap **"Deploy"** to save

### 6. Copy your Worker URL
- Back on the Worker overview, you'll see the URL near the top
- It looks like: `https://aethermorph.YOUR-USERNAME.workers.dev`
- Copy it

### 7. Paste into Aethermorph
- Open Aethermorph
- Paste the URL into the "Worker URL" field
- Tap **Save**, then **Test** to verify

You're done. From here on, every animation render uses your Worker, which calls
Cloudflare's AI on your behalf within your free 10,000 neurons/day quota.

## Troubleshooting

**"AI binding missing"** when you test
→ You skipped step 5. Add the binding with variable name `AI`.

**"Test failed: 401" or "403"**
→ Your Worker URL is wrong, or the Worker hasn't been deployed yet.

**Test works but renders fail later**
→ You may have hit your daily quota (10,000 neurons resets at 00:00 UTC).
