import { readFileSync } from "node:fs";
import type { Auth, DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { ApiError } from "../lib/errors";

export interface FirebaseCredentials {
  provider: "firebase";
  sessionCookie: string;
}
export interface FirebaseNativeFactor {
  uid: string;
  factorId: string;
  displayName: string | null;
}
export interface FirebasePrincipal {
  provider: "firebase";
  projectId: string;
  subject: string;
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  nativeFactors: FirebaseNativeFactor[];
  assurance: "aal1" | "aal2";
  authTime: number;
}
export interface FirebaseVerifiedIdentity {
  decoded: DecodedIdToken;
  principal: FirebasePrincipal;
}
/** Injectable only at the external Admin SDK boundary, and only in tests. */
export type FirebaseAdminBoundary = Pick<
  Auth,
  "verifyIdToken" | "verifySessionCookie" | "getUser" | "createSessionCookie"
>;

export interface FirebaseSession extends FirebaseVerifiedIdentity {
  credentials: FirebaseCredentials;
}
export interface FirebaseProvider {
  verifyIdToken(idToken: string): Promise<FirebaseVerifiedIdentity>;
  createSessionCookie(
    idToken: string,
    expiresIn: number,
  ): Promise<FirebaseSession>;
  verifySessionCookie(
    credentials: FirebaseCredentials,
  ): Promise<FirebaseVerifiedIdentity>;
}
export interface FirebaseProviderOptions {
  env?: FirebaseEnvironment;
  admin?: FirebaseAdminBoundary;
}
export function createFirebaseProvider(
  options: FirebaseProviderOptions = {},
): FirebaseProvider {
  const env = { ...(options.env ?? process.env) };
  const projectId = getFirebaseProjectId(env);
  assertRuntimePolicy(env);
  if (
    options.admin &&
    (env.NODE_ENV !== "test" || process.env.NODE_ENV !== "test")
  )
    throw unavailable();
  const resolveAdmin = async (): Promise<FirebaseAdminBoundary> => {
    assertRuntimePolicy(env);
    return options.admin ?? (await getFirebaseAuth(env));
  };
  const provider: FirebaseProvider = {
    async verifyIdToken(idToken) {
      validateTokenInput(idToken);
      const admin = await resolveAdmin();
      const decoded = await adminCall(() => admin.verifyIdToken(idToken, true));
      validateDecoded(projectId, decoded, "id");
      const user = await adminCall(() => admin.getUser(decoded.uid));
      return {
        decoded,
        principal: principalFromUser(projectId, decoded, user),
      };
    },
    async createSessionCookie(idToken, expiresIn) {
      if (
        !Number.isSafeInteger(expiresIn) ||
        expiresIn < 300_000 ||
        expiresIn > 1_209_600_000
      )
        throw unavailable();
      const initial = await provider.verifyIdToken(idToken);
      const admin = await resolveAdmin();
      const sessionCookie = await adminCall(() =>
        admin.createSessionCookie(idToken, { expiresIn }),
      );
      const credentials: FirebaseCredentials = {
        provider: "firebase",
        sessionCookie,
      };
      const verified = await provider.verifySessionCookie(credentials);
      if (
        verified.principal.subject !== initial.principal.subject ||
        verified.principal.authTime !== initial.principal.authTime ||
        verified.principal.assurance !== initial.principal.assurance ||
        verified.decoded.firebase.sign_in_provider !==
          initial.decoded.firebase.sign_in_provider ||
        verified.decoded.firebase.sign_in_second_factor !==
          initial.decoded.firebase.sign_in_second_factor ||
        verified.decoded.firebase.second_factor_identifier !==
          initial.decoded.firebase.second_factor_identifier
      )
        throw unauthorized();
      return { ...verified, credentials };
    },
    async verifySessionCookie(credentials) {
      if (!credentials || credentials.provider !== "firebase")
        throw unauthorized();
      validateTokenInput(credentials.sessionCookie);
      const admin = await resolveAdmin();
      const decoded = await adminCall(() =>
        admin.verifySessionCookie(credentials.sessionCookie, true),
      );
      validateDecoded(projectId, decoded, "session");
      const user = await adminCall(() => admin.getUser(decoded.uid));
      return {
        decoded,
        principal: principalFromUser(projectId, decoded, user),
      };
    },
  };
  return provider;
}

function assertRuntimePolicy(env: FirebaseEnvironment): void {
  if (
    (env.FIREBASE_AUTH_EMULATOR_HOST !== undefined &&
      (env.NODE_ENV !== "test" || process.env.NODE_ENV !== "test")) ||
    (process.env.FIREBASE_AUTH_EMULATOR_HOST !== undefined &&
      process.env.NODE_ENV !== "test")
  )
    throw unavailable();
}

const adminClients = new Map<string, Promise<Auth>>();
/** ADC and the SDK are initialized on first use, never while importing this module. */
export async function getFirebaseAuth(
  env: FirebaseEnvironment = process.env,
): Promise<Auth> {
  const projectId = getFirebaseProjectId(env);
  assertRuntimePolicy(env);
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = `${projectId}:${emulator ?? "live"}`;
  const existing = adminClients.get(key);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const [{ applicationDefault, getApps, initializeApp }, { getAuth }] =
        await Promise.all([
          import("firebase-admin/app"),
          import("firebase-admin/auth"),
        ]);
      const name = `proofstack-firebase-${projectId}-${emulator ? "test-emulator" : "live"}`;
      const app =
        getApps().find((candidate) => candidate.name === name) ??
        initializeApp({ projectId, credential: applicationDefault() }, name);
      if (app.options.projectId !== projectId) throw unavailable();
      return getAuth(app);
    } catch {
      throw unavailable();
    }
  })();
  adminClients.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    adminClients.delete(key);
    throw error;
  }
}

export const getFirebaseAdminAuth: (
  env?: FirebaseEnvironment,
) => Promise<Auth> = getFirebaseAuth;

const unauthorized = () =>
  new ApiError(
    401,
    "FIREBASE_UNAUTHORIZED",
    "Firebase authentication is invalid or expired",
  );

function validateTokenInput(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 16_384 ||
    value.trim() !== value
  )
    throw unauthorized();
}

const authenticationErrorCodes = new Set([
  "auth/id-token-revoked",
  "auth/id-token-expired",
  "auth/invalid-id-token",
  "auth/session-cookie-revoked",
  "auth/session-cookie-expired",
  "auth/invalid-session-cookie",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/argument-error",
  "auth/invalid-argument",
]);
async function adminCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw mapFirebaseAdminError(error);
  }
}
/** Use when integrating other Admin operations; never expose the SDK error itself. */
export function mapFirebaseAdminError(error: unknown): ApiError {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return typeof code === "string" && authenticationErrorCodes.has(code)
    ? unauthorized()
    : unavailable();
}

function validateDecoded(
  projectId: string,
  decoded: DecodedIdToken,
  kind: "id" | "session",
): void {
  const now = Math.floor(Date.now() / 1000);
  const issuer =
    kind === "id"
      ? "https://securetoken.google.com/"
      : "https://session.firebase.google.com/";
  if (
    !decoded ||
    decoded.aud !== projectId ||
    decoded.iss !== `${issuer}${projectId}` ||
    typeof decoded.uid !== "string" ||
    !decoded.uid ||
    decoded.uid.length > 128 ||
    decoded.sub !== decoded.uid ||
    !Number.isSafeInteger(decoded.exp) ||
    decoded.exp <= now ||
    !Number.isSafeInteger(decoded.iat) ||
    decoded.iat < 0 ||
    decoded.iat > now + 60 ||
    !Number.isSafeInteger(decoded.auth_time) ||
    decoded.auth_time < 0 ||
    decoded.auth_time > now + 60 ||
    (kind === "id" && now - decoded.auth_time > 300) ||
    decoded.firebase?.tenant !== undefined ||
    !["google.com", "github.com"].includes(decoded.firebase?.sign_in_provider)
  )
    throw unauthorized();
}

function principalFromUser(
  projectId: string,
  decoded: DecodedIdToken,
  user: UserRecord,
): FirebasePrincipal {
  if (!user || user.uid !== decoded.uid || user.disabled !== false)
    throw unauthorized();
  const email =
    decoded.email_verified === true &&
    user.emailVerified === true &&
    typeof user.email === "string" &&
    user.email.length > 0 &&
    user.email === decoded.email
      ? user.email
      : null;
  const phoneNumber =
    typeof user.phoneNumber === "string" &&
    /^\+[1-9]\d{6,14}$/.test(user.phoneNumber) &&
    user.phoneNumber === decoded.phone_number
      ? user.phoneNumber
      : null;
  if (!email && !phoneNumber) throw unauthorized();
  const nativeFactors = (user.multiFactor?.enrolledFactors ?? []).map(
    (factor) => ({
      uid: factor.uid,
      factorId: factor.factorId,
      displayName: factor.displayName ?? null,
    }),
  );
  let assurance: FirebasePrincipal["assurance"] = "aal1";
  const factorType = decoded.firebase.sign_in_second_factor;
  const factorUid = decoded.firebase.second_factor_identifier;
  if (factorType !== undefined || factorUid !== undefined) {
    if (
      typeof factorType !== "string" ||
      !["totp", "phone"].includes(factorType) ||
      typeof factorUid !== "string" ||
      !factorUid ||
      !nativeFactors.some(
        (factor) => factor.uid === factorUid && factor.factorId === factorType,
      )
    )
      throw unauthorized();
    assurance = "aal2";
  }
  return {
    provider: "firebase",
    projectId,
    subject: `firebase:${projectId}:${encodeURIComponent(user.uid)}`,
    uid: user.uid,
    email,
    phoneNumber,
    displayName: user.displayName ?? null,
    nativeFactors,
    assurance,
    authTime: decoded.auth_time,
  };
}

export type FirebaseEnvironment = Readonly<Record<string, string | undefined>>;
export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export function getFirebasePublicConfig(
  env: FirebaseEnvironment = process.env,
): FirebasePublicConfig {
  const projectId = getFirebaseProjectId(env);
  let config: Record<string, unknown>;
  try {
    config = env.FIREBASE_WEB_CONFIG_FILE
      ? JSON.parse(readFileSync(env.FIREBASE_WEB_CONFIG_FILE, "utf8"))
      : {
          apiKey: env.FIREBASE_WEB_API_KEY,
          authDomain: env.FIREBASE_WEB_AUTH_DOMAIN,
          projectId: env.FIREBASE_WEB_PROJECT_ID,
          appId: env.FIREBASE_WEB_APP_ID,
        };
    if (!config || typeof config !== "object" || Array.isArray(config))
      throw unavailable();
  } catch {
    throw unavailable();
  }
  const { apiKey, authDomain, projectId: webProjectId, appId } = config;
  if (
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    typeof appId !== "string" ||
    !appId.trim() ||
    webProjectId !== projectId ||
    authDomain !== `${projectId}.firebaseapp.com`
  )
    throw unavailable();
  return { apiKey, authDomain, projectId, appId };
}

const unavailable = () =>
  new ApiError(
    503,
    "FIREBASE_UNAVAILABLE",
    "Firebase authentication is unavailable",
  );

export function getFirebaseProjectId(
  env: FirebaseEnvironment = process.env,
): string {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId))
    throw unavailable();
  return projectId;
}
