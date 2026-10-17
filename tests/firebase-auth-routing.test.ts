import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import supertest from "supertest";
import authRouter from "../artifacts/api-server/src/routes/auth";

afterEach(() => vi.unstubAllEnvs());

function app() {
  return express().use(express.json()).use("/api", authRouter);
}

describe("Firebase authentication HTTP routing", () => {
  it("exposes only allowlisted Firebase web configuration and enabled social providers", async () => {
    for (const [name, value] of Object.entries({
      AUTH_PROVIDER: "firebase",
      FIREBASE_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_PROJECT_ID: "test-firebase-project",
      FIREBASE_WEB_API_KEY: "public-test-key",
      FIREBASE_WEB_AUTH_DOMAIN: "test-firebase-project.firebaseapp.com",
      FIREBASE_WEB_APP_ID: "test-web-app",
      FIREBASE_GOOGLE_ENABLED: "true",
      FIREBASE_GITHUB_ENABLED: "false",
      GOOGLE_APPLICATION_CREDENTIALS: "private-not-public",
    }))
      vi.stubEnv(name, value);
    const response = await supertest(app()).get("/api/auth/firebase/config");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      provider: "firebase",
      firebase: {
        apiKey: "public-test-key",
        authDomain: "test-firebase-project.firebaseapp.com",
        projectId: "test-firebase-project",
        appId: "test-web-app",
      },
      providers: { google: true, github: false },
    });
    expect(JSON.stringify(response.body)).not.toContain("private-not-public");
  });
  it("keeps the legacy provider explicitly selected when Firebase is not enabled", async () => {
    vi.stubEnv("AUTH_PROVIDER", "supabase");
    const response = await supertest(app()).get("/api/auth/firebase/config");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ provider: "supabase" });
    expect(response.headers["cache-control"]).toContain("no-store");
  });
});
