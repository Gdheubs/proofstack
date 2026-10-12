---
name: Identity provider boundary
description: Ownership of identity, OTP verification, and SMS delivery for Phase 2.
---

Supabase Auth is the authoritative identity, OTP, and MFA verifier. MSG91 is the SMS delivery provider, reached through a signed server-side Supabase SMS hook.

**Why:** A separate MSG91-issued and verified OTP does not itself establish a verified Supabase identity or MFA assurance level. Parallel OTP authorities would require an explicitly supported federation mechanism, not a homemade session-minting shortcut.

**How to apply:** Route OTP requests and verification through the backend and Supabase Auth. Verify SMS-hook signatures and enforce replay protection before delivering Supabase-issued codes through MSG91. Do not generate authentication OTPs in the browser or silently replace provider verification with a local code database.

Experimental SDK methods do not prove availability in the deployed provider. Check live service support before changing recovery ownership or its assurance policy.

**Why:** The installed SDK exposed experimental native recovery-code methods while earlier provider research reported no native recovery support. Neither SDK presence nor older documentation resolves deployed availability.

**How to apply:** Keep recovery requiring verified fresh primary identity and native MFA re-enrollment; do not introduce an automatic fallback or claim native AAL2 from app-owned backup codes.