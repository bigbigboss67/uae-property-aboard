# Direct Deal, Payment Proof Gate & Bento Light/Dark Redesign Plan

> **For agentic workers:** Implement task-by-task, test locally in Playwright (Light & Dark mode + Direct Deal + all 3 Payment Proof modes), push to GitHub (`bigbigboss67/uae-property-aboard`), and deploy to Vercel (`https://uae-property-aboard.vercel.app`).

**Goal:** Remove Portal & DLD intervention from property deals, implement the 3-mode Digital Contract & Payment Proof Gate (`api/deal-unlock.js` + `index.html`), and redesign the portal into a Light/Dark Mode Bento Grid matching the user's reference image.

**Architecture:**
- Serverless `POST /api/deal-unlock` handles contract signature hashing and payment-proof verification across `pay_per_unlock`, `wallet_credit`, and `subscription` modes without Portal/DLD involvement.
- `index.html` uses CSS variables (`:root` light Bento palette `#F1F4FA` / `#FFFFFF` / `#135BEC` cobalt blue, and `html.dark` `#090C14` / `#121723` / `#2563EB`) toggled by a persistent `#themeToggleBtn`.

**Tech Stack:** Vanilla HTML/CSS/JS, Tailwind CSS (CDN), Node.js (`http` + `crypto`), Vercel Serverless Functions, Playwright.

---

### Task 1: `api/deal-unlock.js` & Local Route in `server.js`
**Files:**
- Create: `api/deal-unlock.js`
- Modify: `server.js`

- [ ] **Step 1:** Create `api/deal-unlock.js` supporting `POST` actions:
  - `sign`: accepts `{ dealId, party, signerName, projectTitle, overseasPct, uaePct }`, returns deterministic `contractHash` (`SHA-256`) and `signedAt`.
  - `submit_proof`: accepts `{ dealId, billingMode, paymentMethod, amountUsd, txRef, receiptName }`, returns `{ ok: true, proofId, proofStatus: paymentMethod === 'bank_upload' ? 'pending_verification' : 'verified', contractHash }`.
  - `verify_proof`: accepts `{ dealId, proofId }`, returns `{ ok: true, proofId, proofStatus: 'verified', unlocked: true }`.
- [ ] **Step 2:** Add `if (reqUrl.pathname === '/api/deal-unlock')` in `server.js` using the same ESM `import()` adapter as `/api/broadcast`.

### Task 2: Light & Dark Mode Bento Theme System in `index.html`
**Files:**
- Modify: `index.html` (`<head>` CSS variables + `html.light` / `html.dark` overrides + `#themeToggleBtn` in header)

- [ ] **Step 1:** Add Bento CSS variables (`--bg-canvas`, `--bg-card`, `--bg-card-muted`, `--border-card`, `--text-primary`, `--text-secondary`, `--accent-blue: #135BEC`, `--card-shadow`) for Light Mode (default, matching reference `#F1F4FA` + `#FFFFFF`) and Dark Mode (`html.dark` `#090C14` + `#121723`).
- [ ] **Step 2:** Add `#themeToggleBtn` (`togglePortalTheme()`) in the top header saving `localStorage.getItem('aih_theme')` and toggling `html.dark` / `html.light`.

### Task 3: Bento Command Center Hero + Refactored Direct Deal & Payment Proof Modal
**Files:**
- Modify: `index.html`

- [ ] **Step 1:** Add the Bento Overview Grid at the top of the portal (`#bentoCommandGrid`) directly inspired by the uploaded reference image:
  - **Electric Cobalt Blue Route Card (`UAE -> GLOBAL`)**: curved SVG arc, `"Verified"` pill, active project & syndication metrics.
  - **Weekly Deal Flow Bar Card** + **Dark-Contrast Price/ROI Trend SVG Card** (`+8% in 3 months` style).
  - **4/4 Readiness Circular Ring Card** + **Before You Connect Checklist Card** (4 live checks: Project Picked, Contract Signed, Payment Proof Verified, Direct Contact Unlocked).
  - **Monetization Pass Selector Card** (radio cards for `Pay-Per-Unlock`, `Wallet Credits`, `Pro Subscription`) + **Payment Proof Upload Card** (`100%` progress bar) + **Paid / Unlocked Status Card**.
- [ ] **Step 2:** Refactor `#blindContractModal`:
  - Remove `bcSigCardDld`, `4. Sign DLD`, and `15%` Portal closing commission split (`Overseas % + UAE Seller % = 100%`, `0% Portal`).
  - Add 3 Billing Mode tabs (`Pay-Per-Unlock`, `Wallet Credits` with balance + top-up, `Pro Subscription` + `$49` Certificate).
  - Add Payment Proof panel (`Instant Card Pass`, `Upload Wire/Bank Proof` file + `txRef` + `Verify Proof`, `Use Wallet/Plan Credit`).
  - Reveal direct WhatsApp/Email/Phone + **Download Contract & Payment Proof Certificate** only when Contract is signed AND Payment Proof is `verified`.

### Task 4: Verification, Git Push & Vercel Deployment
- [ ] **Step 1:** Run Playwright verification testing: `POST /api/deal-unlock`, Light/Dark theme toggle, Bento cards visible, DLD & 15% Portal split removed, all 3 billing/proof modes working, contact unlock + certificate download, `?deal=` deep-link, and `0` page errors.
- [ ] **Step 2:** Commit, push to `bigbigboss67/uae-property-aboard`, deploy via `vercel --prod --yes`, and verify `/api/deal-unlock` on production.
