// Non-secret unit-test defaults. Integration tests require the real test/development DB.
process.env.PORT ??= "8080";
process.env.DATABASE_URL ??= "postgresql://localhost/proofstack_unit";
process.env.LOG_LEVEL = "silent";
// No network calls from tests; tests/password-breach.test.ts covers the check.
process.env.PASSWORD_BREACH_CHECK ??= "off";
