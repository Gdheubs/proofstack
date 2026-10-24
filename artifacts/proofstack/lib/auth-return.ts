/** Deliberately narrow: no query/hash data, URL normalization or extra decoding. */
export function safeAuthReturn(value: unknown): string {
  return typeof value === "string" &&
    // Workspace pages a sign-in link may return to; the feed otherwise.
    /^(?:\/home|\/code|\/welcome|\/account|\/settings(?:\/[a-z-]{1,32})?|\/assessments(?:\/[A-Za-z0-9_-]{1,128})?)$/.exec(
      value,
    )?.[0] === value
    ? value
    : "/home";
}

type ReturnStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type ReturnSession = { authenticated: boolean; mfaRequired: boolean };
export type AuthReturn = {
  readonly destination: string;
  complete: (
    session: ReturnSession | null | undefined,
    replace: (path: string) => void,
  ) => boolean;
};
const RETURN_KEY = "proofstack.auth-return";

/** Capture once on entering /auth. Only a validated, nonsecret path is stored. */
export function createAuthReturn(
  search: string,
  storage?: ReturnStorage,
): AuthReturn {
  const next = new URLSearchParams(search).getAll("next");
  let stored: string | null = null;
  if (!next.length) {
    try {
      stored = storage?.getItem(RETURN_KEY) ?? null;
    } catch {
      /* Storage can be disabled by browser privacy settings. */
    }
  }
  const destination = safeAuthReturn(
    next.length === 1 ? next[0] : next.length ? null : stored,
  );
  try {
    storage?.setItem(RETURN_KEY, destination);
  } catch {
    /* The same-tab in-memory destination still works. */
  }
  let consumed = false;
  return {
    destination,
    complete(session, replace) {
      if (consumed || !session?.authenticated || session.mfaRequired)
        return false;
      consumed = true;
      try {
        storage?.removeItem(RETURN_KEY);
      } catch {
        /* Never block successful authentication on unavailable storage. */
      }
      replace(destination);
      return true;
    },
  };
}
