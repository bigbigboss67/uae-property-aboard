# AI HOME GLOBAL | RERA-Safe B2B SaaS & International Lead Monetization Protocol
> **Single Unified Legal & Revenue Architecture — 0% Buyer Fee · 0% Unlicensed Brokerage Liability · High-Margin Recurring B2B SaaS**

---

## 1. Core Legal Principle (Why This Model Wins in Dubai)
Under **Dubai Law No. 85/2006 (RERA Real Estate Brokerage Regulation)**, only a **UAE RERA-licensed brokerage (ORN holder)** may collect or split UAE real estate brokerage commissions.

Therefore, **AI HOME GLOBAL operates strictly as a Technology & International Marketing SaaS Platform**:
1. **0% Buyer Commission (Always Free for Buyers & Investors):** International buyers pay **$0** to AI Home Global. 100% of property purchase installments wire directly from the buyer to the **Developer's DLD-Regulated Escrow Bank Account**.
2. **0% Brokerage Commission Collection by the Portal:** AI Home Global never holds escrow funds and never acts as an unlicensed broker.
3. **Recurring B2B SaaS Revenue from UAE RERA-Licensed Agencies & Developers:** Verified UAE RERA agencies (with active ORN/BRN) pay flat monthly SaaS subscriptions or pay-per-lead unlock credits via **Stripe (verified via cryptographic `POST /api/stripe-webhook`)** to receive pre-qualified international buyers and overseas agency co-broker introductions.
4. **Overseas Broker Protection (Real-World Anti-Circumvention):**
   - Buyer contact details stay **masked inside the Deal Room** until the receiving UAE RERA agency accepts the introduction and signs an **International Marketing / Referral Introducer Agreement** directly with the overseas agency (or registers the buyer under their RERA ORN in the developer's broker portal).

---

## 2. Monetization Tiers (UAE RERA Agency Partners)

| Tier | Monthly Price | Included Global Leads / Unlocks | Key Platform Benefits |
| :--- | :--- | :--- | :--- |
| **Starter Desk** | **$299 / mo** | 5 Verified Global Leads / mo | Masked Deal Room, EUR/USD/GBP buyer briefs, RERA ORN verified badge |
| **Growth Brokerage** | **$699 / mo** | 15 Verified Global Leads / mo | Priority routing for German/UK/EU buyers, Overseas Broker co-broke network, white-label decks |
| **Master Desk (Enterprise)** | **$1,499 / mo** | Unlimited Qualified Introductions | Dedicated country corridors (DACH, UK, CIS, Asia), API/CRM webhook sync, featured developer slots |
| **Pay-Per-Unlock** | **$150 – $450 / lead** | Single Verified Deal Room Unlock | Verified via Stripe Checkout + Webhook (`api/stripe-webhook.js`) |

---

## 3. Hardened Payment & Security Controls
- **Stripe Webhook Verification (`api/stripe-webhook.js`):** All paid unlocks and credit top-ups are verified via HMAC-SHA256 `Stripe-Signature` with replay protection and idempotency.
- **No Unauthenticated Unlocks (`api/deal-unlock.js`):** Card unlocks verify `payment_status === 'paid'` directly against Stripe; manual wire approvals require a signed Portal Owner HMAC token (`api/owner-auth.js`).
- **Protected Ledger (`api/ledger.js`):** Privileged actions (`topup_credits`, `verify_payment_proof`, `close_deal`, `legal_audit_commission_split`) require Portal Owner authentication.
