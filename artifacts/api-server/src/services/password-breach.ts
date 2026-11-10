import { createHash } from "node:crypto";
import { ApiError } from "../lib/errors";
import { logger } from "../lib/logger";

// Refuses passwords that appear in known data breaches, using the Pwned
// Passwords range API: only the first 5 characters of the password's SHA-1
// leave this server (k-anonymity), never the password. When the service is
// slow or down the password is accepted, so sign-up never depends on it.
// PASSWORD_BREACH_CHECK=off turns the check off.
export async function assertPasswordNotBreached(
  password: string,
  fetcher: typeof fetch = fetch,
) {
  if (process.env.PASSWORD_BREACH_CHECK === "off") return;
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  let body: string;
  try {
    const response = await fetcher(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: { "Add-Padding": "true" },
        redirect: "error",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
    body = await response.text();
  } catch {
    logger.warn("Password breach check unavailable; password accepted");
    return;
  }
  const found = body.split("\n").some((line) => {
    const [rest, count] = line.trim().split(":");
    return rest === suffix && Number(count) > 0;
  });
  if (found)
    throw new ApiError(
      400,
      "PASSWORD_BREACHED",
      "This password appeared in a data breach elsewhere. Choose a different one.",
    );
}
