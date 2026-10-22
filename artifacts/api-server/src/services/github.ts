import { pool } from "@workspace/db";
import { ApiError } from "../lib/errors";
import { seal, unseal } from "../lib/auth-crypto";

// GitHub OAuth App owned by the operator. The access token is sealed at rest
// and used only by this server; it is never returned to the browser.
const API = "https://api.github.com";
const TOKEN_PURPOSE = "github-token";
export const GITHUB_SCOPES = "repo";

export function githubConfig() {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const unavailable = () =>
  new ApiError(503, "GITHUB_UNAVAILABLE", "GitHub is not reachable right now");
export const reconnect = () =>
  new ApiError(
    401,
    "GITHUB_RECONNECT",
    "Your GitHub connection expired. Connect GitHub again",
  );

// One request to GitHub. Maps its errors to safe, stable API errors.
export async function githubRequest<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ProofStack",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw unavailable();
  }
  if (response.ok) return (await response.json()) as T;
  if (response.status === 401) throw reconnect();
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  )
    throw new ApiError(
      429,
      "GITHUB_RATE_LIMITED",
      "GitHub's request limit was reached. Try again in a few minutes",
    );
  if (response.status === 403 || response.status === 404)
    throw new ApiError(
      404,
      "GITHUB_NOT_FOUND",
      "That repository, branch or file was not found, or you cannot change it",
    );
  if (response.status === 409 || response.status === 422)
    throw new ApiError(
      409,
      "GITHUB_CONFLICT",
      "GitHub refused the change. The branch may have moved; reload and try again",
    );
  throw unavailable();
}

export async function githubConnection(userId: string) {
  const row = (
    await pool.query<{
      login: string;
      encrypted_token: string;
      scopes: string;
    }>(
      "SELECT login,encrypted_token,scopes FROM github_connections WHERE user_id=$1",
      [userId],
    )
  ).rows[0];
  if (!row) return null;
  try {
    return {
      login: row.login,
      scopes: row.scopes,
      token: unseal<string>(row.encrypted_token, TOKEN_PURPOSE),
    };
  } catch {
    // A rotated server secret makes old tokens unreadable: ask to reconnect.
    await disconnectGithub(userId);
    return null;
  }
}

export async function requireGithub(userId: string) {
  const connection = await githubConnection(userId);
  if (!connection)
    throw new ApiError(
      409,
      "GITHUB_NOT_CONNECTED",
      "Connect your GitHub account to edit GitHub repositories",
    );
  return connection;
}

export function githubAuthorizeUrl(state: string, redirectUri: string) {
  const config = githubConfig();
  if (!config)
    throw new ApiError(
      503,
      "GITHUB_NOT_CONFIGURED",
      "GitHub editing is not available yet",
    );
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GITHUB_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

// Exchanges the OAuth code and stores the sealed token for this user.
export async function completeGithubConnection(
  userId: string,
  code: string,
  redirectUri: string,
) {
  const config = githubConfig();
  if (!config) throw unavailable();
  let token: { access_token?: string; scope?: string };
  try {
    const response = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "ProofStack",
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    token = (await response.json()) as typeof token;
  } catch {
    throw unavailable();
  }
  if (!token.access_token)
    throw new ApiError(
      400,
      "GITHUB_CONNECT_FAILED",
      "GitHub did not complete the connection. Try again",
    );
  const user = await githubRequest<{ id: number; login: string }>(
    token.access_token,
    "/user",
  );
  await pool.query(
    `INSERT INTO github_connections(user_id,github_user_id,login,encrypted_token,scopes)
     VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET github_user_id=EXCLUDED.github_user_id,
     login=EXCLUDED.login,encrypted_token=EXCLUDED.encrypted_token,scopes=EXCLUDED.scopes,updated_at=now()`,
    [
      userId,
      String(user.id),
      user.login,
      seal(token.access_token, TOKEN_PURPOSE),
      token.scope ?? "",
    ],
  );
  return user.login;
}

export async function disconnectGithub(userId: string) {
  await pool.query("DELETE FROM github_connections WHERE user_id=$1", [userId]);
}
