# AI Home Global — Business Model & Phase Roadmap

## Stage 1 (Active Default): Free "Upon Request" + Portal Owner Gatekeeper
- **Primary User Action**: `Request to Buy / Enquire (Free · 0% Fee)` (`openEnquiryModal()` -> `ENQ-XXXXXX`).
- **Why**:
  - UAE off-plan buyers expect **0% buyer commission** (developers pay brokerage commission directly).
  - Zero friction to capture real demand from Direct Buyers and Overseas Agencies before charging upfront fees.
  - All `ENQ-XXXXXX` requests land in the strictly gated **Portal Owner Inbox** (`?owner=1`, passcode via `PORTAL_OWNER_PASSCODE`) so the Portal Owner vets and forwards qualified leads (`FORWARDED_TO_PARTNER`) to UAE Developers / RERA Partners.

## Phase 2 (Preserved & Ready in Codebase): Verified Partner Co-Broke Deal Room (SaaS) & RERA Form I
The full Phase 2 infrastructure remains live and intact in the codebase for verified partner-to-partner co-broking or UAE broker lead unlocks:
1. **Flat SaaS Deal Room Unlock (`#blindContractModal` + `/api/deal-unlock` + `/api/stripe-checkout`)**:
   - **0% Portal Commission / 0% DLD Intervention** (avoids acting as an unlicensed brokerage without RERA ORN).
   - Tiered flat SaaS unlock fees: Standard `< AED 2M` (`$250`), Prime `AED 2M–5M` (`$450`), Luxury `AED 5M–10M` (`$850`), Ultra-Prime `AED 10M+` (`$1,500`), plus wallet credits and monthly Pro Plan quotas.
   - 3-party SHA-256 digital co-brokerage signatures, DLD/RERA developer lookup (`/api/dld-developer`), payment proof verification, unmasked direct contacts, and `DEAL_CLOSED` (`CLS-XXXXXX`) ledger persistence (`/api/ledger`).
2. **Optional Future UAE RERA ORN Monetization**:
   - Once operating with a UAE RERA ORN / licensed partner desk, monetize the **receiving UAE broker** via a signed **RERA Form I** share of the developer payout upon closing—while keeping **buyers at 0% fee**.
