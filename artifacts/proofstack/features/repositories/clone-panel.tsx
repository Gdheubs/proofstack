"use client";
import { useState } from "react";
import type { RepositoryData } from "@workspace/api-client-react";
import { card, field, Field, values, val } from "@/features/careers/shared";
import { Button } from "@/components/ui/button";
import { useRepositoryRun } from "@/hooks/use-repository";
import { useCsrf } from "@/hooks/use-community";
import { ActionForm } from "./action-form";
import { Copy } from "lucide-react";
function CloneControls({ data: d }: { data: RepositoryData }) {
  const a = useRepositoryRun();
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [clone, setClone] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const id = d.repositories[0].id;
  return (
    <section className={card}>
      <h2 className="font-semibold">Clone & fetch</h2>
      <p className="text-sm text-muted-foreground">
        Read-only HTTPS access. Edit and commit in the browser; external push is
        disabled.
      </p>
      <Button
        variant="outline"
        onClick={() =>
          setClone(`git clone ${window.location.origin}/api/git/${id}`)
        }
      >
        Show clone command
      </Button>
      {clone && (
        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
          {clone}
        </pre>
      )}
      <p className="text-xs text-muted-foreground">
        For a private repository, use any username and a read token as the
        password. Never place a token in the URL or share it in a screenshot.
      </p>
      {a.canAct && (
        <>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              const f = values(e);
              const result = await a.run({
                action: "token-create",
                id,
                name: val(f, "name"),
                scope,
              });
              if (result?.token) {
                setToken(result.token);
                setCopied(false);
              }
            }}
          >
            <ActionForm action={a} label={`Create 30-day ${scope} token`}>
              <Field
                label="Token label"
                name="name"
                value="My development machine"
                max={60}
                required
              />
              <label className="block space-y-1 text-sm">
                <span>Permission</span>
                <select
                  className={field}
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as typeof scope)
                  }
                >
                  <option value="read">Clone and fetch only</option>
                  {d.repositories[0].canWrite && (
                    <option value="write">Push feature branches</option>
                  )}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Requires recent MFA. Write tokens cannot update the protected
                default branch. Every token loses access if your account or
                project access is revoked.
              </p>
            </ActionForm>
          </form>
          {token && (
            <div className="space-y-2 rounded border p-3">
              <p className="text-sm font-medium">Copy once, then hide</p>
              <input
                aria-label="New repository read token"
                readOnly
                type="password"
                value={token}
                className={field}
              />
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                    setCopied(true);
                    setCopyError("");
                  } catch {
                    setCopyError(
                      "Clipboard unavailable. Select the field and copy manually.",
                    );
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy token"}
              </Button>
              <button
                className="ml-3 text-sm underline"
                onClick={() => setToken("")}
              >
                Hide token
              </button>
              {copyError && (
                <p role="alert" className="text-sm">
                  {copyError}
                </p>
              )}
            </div>
          )}
          <ul className="space-y-3">
            {d.tokens.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div>
                  {t.name}
                  <p className="text-xs text-muted-foreground">
                    {t.scope} access ·{" "}
                    {t.revoked
                      ? "Revoked"
                      : `Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                {!t.revoked && (
                  <button
                    disabled={a.pending}
                    className="underline"
                    onClick={() =>
                      a.run({ action: "token-revoke", id, tokenId: t.id })
                    }
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function ClonePanel({ data }: { data: RepositoryData }) {
  const { session } = useCsrf();
  return (
    <CloneControls key={session.data?.user?.id ?? "anonymous"} data={data} />
  );
}
