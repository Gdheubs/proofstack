import { validProxyRange } from "../artifacts/api-server/src/lib/transport";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";

vi.mock("@workspace/db", () => ({ pool: { query: vi.fn() } }));

import { parseEnvironment } from "../artifacts/api-server/src/lib/env";
import {
  requireAuthenticated,
  requirePermission,
} from "../artifacts/api-server/src/middlewares/authorization";
import { validateBody } from "../artifacts/api-server/src/middlewares/validation";
import { hasPermission } from "../artifacts/api-server/src/services/authorization";
import { writeAuditEvent } from "../artifacts/api-server/src/services/audit";
import { consumeRateLimit } from "../artifacts/api-server/src/services/rate-limit";
import { buildContentSecurityPolicy } from "../artifacts/proofstack/lib/security";

describe("Security and configuration foundations", () => {
  it("supports an explicit local API bind address without accepting arbitrary hostnames", () => {
    expect(
      parseEnvironment({
        PORT: "8089",
        DATABASE_URL: "postgresql://localhost/test",
        BIND_HOST: "127.0.0.1",
      }).BIND_HOST,
    ).toBe("127.0.0.1");
    expect(() =>
      parseEnvironment({
        PORT: "8089",
        DATABASE_URL: "postgresql://localhost/test",
        BIND_HOST: "untrusted.example",
      }),
    ).toThrow("BIND_HOST");
  });
  it("allows Firebase native token/iframe traffic only for an exact configured auth domain", () => {
    const policy = buildContentSecurityPolicy(
      "testNonce123",
      false,
      "proofstack-test.firebaseapp.com",
    );
    expect(policy).toContain(
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://proofstack-test.firebaseapp.com",
    );
    expect(policy).toContain(
      "frame-src 'self' https://proofstack-test.firebaseapp.com",
    );
    expect(policy).not.toContain("*.firebaseapp.com");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("testNonce123", false)).not.toContain(
      "identitytoolkit.googleapis.com",
    );
  });
  it.each([
    "https://evil.example",
    "*.firebaseapp.com",
    "proofstack-test.firebaseapp.com; connect-src *",
    "proofstack-test.firebaseapp.com/extra",
  ])("rejects an invalid Firebase CSP domain %s", (domain) => {
    expect(() =>
      buildContentSecurityPolicy("testNonce123", false, domain),
    ).toThrow("Firebase auth domain");
  });
  it("accepts explicit proxy networks but rejects universal ranges and hostnames", () => {
    for (const value of ["127.0.0.1", "10.1.0.0/16", "::1", "2001:db8::/64"])
      expect(validProxyRange(value)).toBe(true);
    for (const value of [
      "true",
      "1",
      "0.0.0.0/0",
      "::/0",
      "example.com",
      "10.0.0.1/33",
      "::1/129",
      "127.0.0.1/8/1",
    ])
      expect(validProxyRange(value)).toBe(false);
    expect(() =>
      parseEnvironment({
        PORT: 8080,
        DATABASE_URL: "postgresql://localhost/test",
        TRUST_PROXY_CIDRS: "0.0.0.0/0",
      }),
    ).toThrow("TRUST_PROXY_CIDRS");
  });

  it("validates required environment fields without exposing their values", () => {
    const config = parseEnvironment({
      PORT: "8080",
      DATABASE_URL: "postgresql://localhost/proofstack_test",
    });
    expect(config.CORS_ALLOWED_ORIGINS).toEqual([]);
    expect(config.RATE_LIMIT_MAX).toBe(120);
    expect(() =>
      parseEnvironment({ PORT: "0", DATABASE_URL: "sensitive-invalid-value" }),
    ).toThrow("Invalid application environment: PORT, DATABASE_URL");
    expect(() =>
      parseEnvironment({
        PORT: 8080,
        DATABASE_URL: "postgresql://localhost/test",
        CORS_ALLOWED_ORIGINS: "https://allowed.example/path",
      }),
    ).toThrow("CORS_ALLOWED_ORIGINS");
  });

  it("requires a verified server principal and ignores identity headers", () => {
    const req = {
      headers: { "x-user-id": randomUUID() },
    } as unknown as Parameters<typeof requireAuthenticated>[0];
    const res = { locals: {} } as Parameters<typeof requireAuthenticated>[1];
    const next = vi.fn();
    requireAuthenticated(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("fails closed for permission middleware without a session", async () => {
    const middleware = requirePermission("organization:read", () =>
      randomUUID(),
    );
    const next = vi.fn();
    await middleware(
      {} as Parameters<typeof middleware>[0],
      { locals: {} } as Parameters<typeof middleware>[1],
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("parameterizes scoped RBAC checks and denies missing grants", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const input = {
      userId: randomUUID(),
      organizationId: randomUUID(),
      permission: "organization:read",
    };
    expect(await hasPermission(input, query)).toBe(false);
    expect(query.mock.calls[0][1]).toEqual([
      input.userId,
      input.organizationId,
      input.permission,
    ]);
    expect(query.mock.calls[0][0]).toContain("m.organization_id = $2");
    query.mockResolvedValueOnce({ rows: [{ allowed: 1 }] });
    expect(await hasPermission(input, query)).toBe(true);
  });

  it("validates request bodies before exposing parsed input to the service", () => {
    const middleware = validateBody(
      z.object({ name: z.string().min(1) }).strict(),
    );
    const next = vi.fn();
    const res = { locals: {} } as Parameters<typeof middleware>[1];
    middleware(
      { body: { name: "", administrator: true } } as Parameters<
        typeof middleware
      >[0],
      res,
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(res.locals.validatedBody).toBeUndefined();
    next.mockClear();
    middleware(
      { body: { name: "ProofStack" } } as Parameters<typeof middleware>[0],
      res,
      next,
    );
    expect(res.locals.validatedBody).toEqual({ name: "ProofStack" });
    expect(next).toHaveBeenCalledWith();
  });

  it("appends validated audit records and rejects credential metadata before SQL", async () => {
    const id = randomUUID();
    const query = vi.fn().mockResolvedValue({ rows: [{ id }] });
    const input = {
      action: "organization.updated",
      resourceType: "organization",
      requestId: randomUUID(),
    };
    expect(await writeAuditEvent(input, query)).toBe(id);
    expect(query).toHaveBeenCalledOnce();
    await expect(
      writeAuditEvent(
        {
          ...input,
          metadata: { nested: { access_token: "not-a-real-secret" } },
        },
        query,
      ),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledOnce();
    query.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(writeAuditEvent(input, query)).rejects.toThrow(
      "database unavailable",
    );
  });

  it("uses atomic fixed-window store responses and rejects invalid configuration", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ hits: 3, window_start: new Date() }] });
    expect((await consumeRateLimit("test-key", 60, 2, query)).allowed).toBe(
      false,
    );
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT");
    await expect(consumeRateLimit("test", 0, 2, query)).rejects.toThrow();
  });

  it("enforces nonce-based scripts and avoids unsafe-eval in production CSP", () => {
    const production = buildContentSecurityPolicy("testNonce123", false);
    expect(production).toContain("'nonce-testNonce123'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(
      production.split("; ").find((item) => item.startsWith("script-src")),
    ).not.toContain("'unsafe-inline'");
    expect(production).toContain("object-src 'none'");
    expect(buildContentSecurityPolicy("testNonce123", true)).toContain(
      "'unsafe-eval'",
    );
    expect(() =>
      buildContentSecurityPolicy("invalid; policy", false),
    ).toThrow();
  });
});
