# Direct Deal, Digital Contract & Payment Proof Gate — Design Spec

**Date:** 2026-11-14  
**Project:** AI Home Global (`uae-property-aboard`)  
**Status:** Approved for Planning

---

## 1. Goal & Principles

Remove **Portal intervention** and **DLD intervention** from the property transaction itself while giving the portal **three unified monetization paths** whenever overseas agencies/buyers and local UAE sellers connect—backed by a **Direct Digital Contract** and verifiable **Payment Proof**.

### Core Principles
1. **Zero Portal / DLD Deal Intervention:** Neither the Portal nor DLD is a signing party in the property deal, and the Portal takes **0% of property closing commissions** (`100%` of the gross developer commission is split directly between Overseas Agent and UAE Seller/Agency, e.g., `55% / 45%`).
2. **Portal Monetizes the Connection, Not the Closing:** The Portal sells verified access, digital contracting, payment-proof verification, and broadcast reach upfront.
3. **All 3 Billing Options Active Together:** A single **Deal Pass & Payment Proof Gate** supports:
   - **Option 1 — Pay-Per-Unlock ("Smart Deal Pass"):** Tiered upfront unlock fee (`$150–$500` by property price for UAE Seller; optional `$99` Verification Pass for Overseas Agent/Buyer, or `$0` when Seller-sponsored).
   - **Option 2 — Pre-Paid Seller Wallet Credits:** Sellers pre-fund credit packs (e.g., `$1,000` for `5` unlocks) for 1-click lead unlocks.
   - **Option 3 — Monthly SaaS Subscription + Add-Ons:** Pro Agency (`$199/mo`) and UAE Seller (`$499/mo`) plans with included monthly unlocks + Mass Broadcast quota, plus optional **$49 Timestamped Contract & Payment Proof Certificate**.

---

## 2. Architecture & Data Flow

### 2.1 Direct Deal Lifecycle (4 Steps)
1. **Blind Inquiry Created:** Overseas Agent or Buyer selects a UAE off-plan property and submits an inquiry. Direct contact details (`email`, `phone`, `whatsapp`) remain masked (`[LOCKED UNTIL CONTRACT + PAYMENT PROOF]`).
2. **Direct Digital Contract Signed:** Connecting parties (`Buyer/Overseas Agent` ↔ `UAE Seller`) review the commission split (`Overseas % + UAE % = 100%` of gross commission, `0% Portal`), 180-day non-circumvention clause, and sign digitally. Each signature records signer name, timestamp, and a deterministic SHA-256 contract hash.
3. **Payment Proof Verified (3 Accepted Methods):**
   - **Instant Card / Pay Link:** Simulates/records gateway checkout and issues an immediate `PAY-CARD-...` Proof ID (`verified`).
   - **Upload Payment Proof:** Party attaches a wire/bank/crypto receipt file (image/PDF metadata + base64/filename preview) and enters a transaction reference number -> logged as `pending_verification` -> `verified` once confirmed.
   - **Wallet Credit / Subscription Quota:** Deducts `1` credit or `1` monthly plan unlock and issues `PAY-CRED-...` or `PAY-SUB-...` (`verified`).
4. **Contact Unlock & Proof Certificate:** When `contractSigned === true` AND `paymentProofStatus === 'verified'`, direct WhatsApp, Email, and Phone reveal immediately, and either party can download/print the **Timestamped Digital Contract & Payment Proof Certificate**.

---

## 3. Components & Interfaces

### 3.1 Backend API: `api/deal-unlock.js` (+ local route in `server.js`)
- **`POST /api/deal-unlock`**
  - **Actions:**
    - `sign`: Records digital signatures (`overseas` / `buyer` / `uae_seller`), computes/returns `contractHash` (SHA-256).
    - `submit_proof`: Validates & records `billingMode` (`pay_per_unlock` | `wallet_credit` | `subscription`), `paymentMethod` (`card` | `bank_upload` | `credit` | `subscription`), `amountUsd`, `txRef`, and optional receipt filename/preview; returns `proofId` and `proofStatus` (`verified` or `pending_verification`).
    - `verify_proof`: Marks a `pending_verification` uploaded proof as `verified` and returns `unlocked: true` if contract is also signed.
  - **Persistence:** Stateless-safe JSON response for Vercel serverless (with client-side `localStorage` ledger `aih_deal_vault` for browser persistence across reloads).

### 3.2 Frontend UI: Refactor `#blindContractModal` in `index.html`
- **Remove:**
  - `bcSigCardDld` and `4. Sign DLD` button (DLD intervention removed).
  - `15%` Portal commission split display (`bcPortalPctDisplay`, `bcPortalAED`).
  - Old `Lock 1 ($350)` / `Lock 2 ($500)` portal-escrow wording.
- **Add:**
  - **2-Party / 3-Party Direct Contract Header** (`0% Portal Commission · No DLD Intervention`).
  - **Commission Split Inputs:** `Overseas %` + `UAE Seller %` totaling `100%` of gross commission.
  - **Billing Mode Selector (All 3 Options):**
    - `Pay-Per-Unlock ($150–$500 Tiered)`
    - `Pre-Paid Wallet Credits (Balance tracker + Top-Up +5 Credits)`
    - `Pro Subscription ($199/$499 Monthly Quota + $49 Certificate Add-On)`
  - **Payment Proof Panel:**
    - Tabs/buttons for `Instant Card Pass`, `Upload Bank/Wire Proof` (file input + transaction ref + Verify Proof button), and `Use Wallet / Plan Credit`.
    - Live **Payment Proof Status Badge** (`unpaid` / `pending_verification` / `verified`).
  - **Unlocked Direct Contact Card + Proof Certificate Export:**
    - Reveals UAE Seller & Overseas Agent direct WhatsApp/Email/Phone only when both **Contract** and **Payment Proof** are complete.
    - **Download Contract & Payment Proof Certificate** button generating a verifiable HTML/text certificate with contract hash, signatures, and Payment Proof ID.

---

## 4. Verification Plan

1. **Local Server & API Test:** Verify `POST http://127.0.0.1:3000/api/deal-unlock` returns `200 OK` for `sign`, `submit_proof`, and `verify_proof`.
2. **End-to-End Playwright Test:**
   - Open `#blindContractModal` (including via `?deal=` deep-link).
   - Confirm DLD card/button and 15% Portal split are gone.
   - Sign as Buyer/Overseas Agent + UAE Seller (`0% Portal`).
   - Test all 3 monetization modes (`Pay-Per-Unlock` card, `Upload Payment Proof` + verify, `Wallet Credit` deduction).
   - Confirm direct contact info stays locked until both contract & payment proof are verified, then unlocks and generates the Proof Certificate with `0` page errors.
3. **Production Verification:** Deploy to `https://uae-property-aboard.vercel.app` and verify `POST /api/deal-unlock` returns `200 OK`.
