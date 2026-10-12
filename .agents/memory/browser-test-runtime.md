---
name: Browser test runtime
description: Restrictions of the isolated testing notebook when verifying native MFA.
---

The browser tester's injected modules are restricted, not full Node modules: `crypto` lacks HMAC/WebCrypto and `fs` requires asynchronous reads.

**Why:** An otherwise working native MFA verification stopped at test-authenticator calculation because the notebook did not expose `createHmac` or `subtle`. Synchronous file reads were also unavailable.

**How to apply:** Use test-only RFC6238 tooling for native MFA and async reads in the testing notebook. Never add an application authentication bypass to accommodate test tooling. Browser observations may include populated inputs, so use disposable fixtures, avoid secret-bearing screenshots, and delete fixtures afterward.