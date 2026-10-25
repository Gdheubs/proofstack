"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  getGetAccountQueryKey,
  getGetCommunityQueryKey,
  useGetCareers,
  useGetCommunity,
} from "@workspace/api-client-react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActivityPanel,
  OrgPanel,
  OrganizationSummaryPanel,
  PasswordPanel,
  PhonePanel,
  SecurityPanel,
  SessionsPanel,
} from "@/features/account/sections";
import {
  Field,
  KindPicker,
  Notice,
  Panel,
  type Kind,
} from "@/features/auth/shared";
import { CareerPreferences } from "@/features/careers/workspace";
import { ProfileSettings } from "@/features/community/profile-settings";
import { QueryError } from "@/features/community/ui";
import { editorApi } from "@/features/editor/editor-api";
import { PrivacyPanel } from "@/features/legal/privacy-panel";
import { errInfo } from "@/hooks/use-auth";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import {
  NOTIFICATION_CATEGORIES,
  type ChannelPreference,
  type NotificationCategory,
  channelDefault,
} from "@/lib/notifications";
import { SettingsSection, type Loaded } from "./use-settings";

// ---------- Profile ----------
function ProfileType({ ctx, act }: Loaded) {
  const [kind, setKind] = useState<Kind>(ctx.user?.kind ?? "developer");
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Profile type" eyebrow="Identity">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setState({});
          try {
            const r = await act({
              action: "update-profile",
              displayName: ctx.user!.displayName,
              kind,
            });
            setState({ ok: r.message });
          } catch (error) {
            setState({ err: errInfo(error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <KindPicker value={kind} onChange={setKind} />
        {state.err && <Notice tone="error">{state.err}</Notice>}
        {state.ok && <Notice tone="ok">{state.ok}</Notice>}
        <Button type="submit" disabled={busy || kind === ctx.user?.kind}>
          Save profile type
        </Button>
      </form>
    </Panel>
  );
}
export function ProfileSection() {
  return (
    <SettingsSection
      title="Profile"
      description="What other members and recruiters see."
    >
      {(loaded) => (
        <div className="space-y-6">
          <ProfileSettings embedded />
          <ProfileType {...loaded} />
        </div>
      )}
    </SettingsSection>
  );
}

// ---------- Account ----------
function EmailPanel({ account, act }: Loaded) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  return (
    <Panel title="Email" eyebrow="Sign-in">
      <p className="text-sm">
        Current:{" "}
        <span className="font-medium">{account.user.email ?? "—"}</span>
        {account.user.email && (
          <span className="ml-2 text-xs text-muted-foreground">
            {account.user.emailVerified ? "verified" : "unverified"}
          </span>
        )}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setState({});
          try {
            const r = await act({
              action: "update-email",
              email: email.trim(),
            });
            setState({ ok: r.message });
            setEmail("");
          } catch (error) {
            setState({ err: errInfo(error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="New email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          hint="We send a confirmation to both your current and new address. The change applies after you confirm in each."
        />
        {state.err && <Notice tone="error">{state.err}</Notice>}
        {state.ok && <Notice tone="ok">{state.ok}</Notice>}
        <Button type="submit" variant="outline" disabled={busy || !email}>
          Change email
        </Button>
      </form>
    </Panel>
  );
}
export function AccountSection() {
  return (
    <SettingsSection
      title="Account"
      description="How you sign in and how we reach you."
    >
      {(loaded) => (
        <div className="space-y-6">
          <EmailPanel {...loaded} />
          <PhonePanel {...loaded} />
          <Panel title="Delete account" eyebrow="Danger zone">
            <p className="text-sm text-muted-foreground">
              Deleting your account removes your profile and content. You can
              download your data first.
            </p>
            <Button asChild variant="outline" className="mt-3">
              <Link href="/settings/privacy">Go to Privacy &amp; data</Link>
            </Button>
          </Panel>
        </div>
      )}
    </SettingsSection>
  );
}

// ---------- Security ----------
export function SecuritySection() {
  return (
    <SettingsSection
      title="Security"
      description="Password, two-step verification and the devices signed in."
    >
      {(loaded) => (
        <div className="space-y-6">
          <PasswordPanel {...loaded} />
          <SecurityPanel {...loaded} />
          <SessionsPanel {...loaded} />
          <ActivityPanel {...loaded} />
        </div>
      )}
    </SettingsSection>
  );
}

// ---------- Notifications ----------
type Prefs = Record<NotificationCategory, ChannelPreference>;
function NotificationsForm({ account }: Loaded) {
  const qc = useQueryClient();
  const { run, pending, error } = useCommunityRun();
  const stored = account.notificationPreferences as Partial<Prefs>;
  const [prefs, setPrefs] = useState<Prefs>(
    () =>
      Object.fromEntries(
        NOTIFICATION_CATEGORIES.map((c) => [
          c.key,
          {
            inApp: channelDefault(stored[c.key]?.inApp, c.key),
            email: channelDefault(stored[c.key]?.email, c.key),
          },
        ]),
      ) as Prefs,
  );
  const toggle = (
    key: NotificationCategory,
    channel: keyof ChannelPreference,
  ) =>
    setPrefs((p) => ({
      ...p,
      [key]: { ...p[key], [channel]: !p[key][channel] },
    }));
  return (
    <form
      className="rounded-lg border bg-card"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          { action: "notification-preferences-save", preferences: prefs },
          "Notification preferences saved.",
        );
        if (r)
          await qc.invalidateQueries({ queryKey: getGetAccountQueryKey() });
      }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="p-4 font-medium">Event</th>
              <th className="p-4 text-center font-medium">In app</th>
              <th className="p-4 text-center font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <tr key={c.key} className="border-b last:border-0">
                <td className="p-4">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.description}
                  </div>
                </td>
                {(["inApp", "email"] as const).map((channel) => (
                  <td key={channel} className="p-4 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${c.label}: ${channel === "inApp" ? "in app" : "email"}`}
                      className="h-4 w-4 accent-primary"
                      checked={prefs[c.key][channel]}
                      onChange={() => toggle(c.key, channel)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Security notices (new device sign-ins, account recovery) are always
          sent. Email delivery starts once ProofStack sends email from its own
          domain; your choices are saved now.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={pending}>
          Save preferences
        </Button>
      </div>
    </form>
  );
}
export function NotificationsSection() {
  return (
    <SettingsSection
      title="Notifications"
      description="Choose what reaches you, and where."
    >
      {(loaded) => <NotificationsForm {...loaded} />}
    </SettingsSection>
  );
}

// ---------- Career ----------
export function CareerSection() {
  const r = useGetCareers({ view: "dashboard" });
  return (
    <SettingsSection
      title="Career"
      description="Your availability and what recruiters can see in the talent directory."
    >
      {() =>
        r.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : r.error ? (
          <QueryError error={r.error} onRetry={() => r.refetch()} />
        ) : r.data?.profile ? (
          <CareerPreferences
            profile={r.data.profile}
            projects={r.data.ownProjects}
          />
        ) : (
          <Notice>Claim your handle in Profile first.</Notice>
        )
      }
    </SettingsSection>
  );
}

// ---------- Connections ----------
function GithubConnection() {
  const { csrf } = useCsrf();
  const qc = useQueryClient();
  const sources = useQuery({
    queryKey: ["editor-sources"],
    queryFn: () => editorApi.sources(),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("github");
    if (result === "failed") setErr("GitHub was not connected. Try again.");
  }, []);
  const gh = sources.data?.github;
  return (
    <Panel title="GitHub" eyebrow="Code">
      {!gh ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : !gh.available ? (
        <Notice>GitHub connection is not available yet.</Notice>
      ) : gh.connected ? (
        <div className="space-y-3 text-sm">
          <p>
            Connected as <span className="font-medium">{gh.login}</span>. The
            code editor can open and commit to your repositories.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await editorApi.disconnectGithub(csrf);
                await qc.invalidateQueries({ queryKey: ["editor-sources"] });
              } catch (e) {
                setErr(errInfo(e).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Disconnect GitHub
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Open and commit to your GitHub repositories from the code editor.
            Your GitHub token stays on our server, encrypted, and is never sent
            to your browser.
          </p>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const { authorizeUrl } = await editorApi.connectGithub(
                  csrf,
                  "settings",
                );
                window.location.assign(authorizeUrl);
              } catch (e) {
                setErr(errInfo(e).message);
                setBusy(false);
              }
            }}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            Connect GitHub
          </Button>
        </div>
      )}
      {err && <Notice tone="error">{err}</Notice>}
    </Panel>
  );
}
export function ConnectionsSection() {
  return (
    <SettingsSection
      title="Connections"
      description="Services linked to your ProofStack account."
    >
      {() => <GithubConnection />}
    </SettingsSection>
  );
}

// ---------- Organizations ----------
export function OrganizationsSection() {
  return (
    <SettingsSection
      title="Organizations"
      description="Where you belong, and what you can create."
    >
      {(loaded) => (
        <div className="space-y-6">
          <OrganizationSummaryPanel {...loaded} />
          <OrgPanel {...loaded} />
        </div>
      )}
    </SettingsSection>
  );
}

// ---------- Privacy & data ----------
function VisibilityPanel() {
  const qc = useQueryClient();
  const { canAct } = useCsrf();
  const params = { view: "profile", handle: "me" } as const;
  const me = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      retry: false,
    },
  });
  const { run, pending, error } = useCommunityRun();
  const current = me.data?.profile?.visibility ?? "public";
  const [value, setValue] = useState<"public" | "members">(current);
  useEffect(() => setValue(current), [current]);
  return (
    <Panel title="Who can see your profile" eyebrow="Visibility">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            { action: "privacy-save", profileVisibility: value },
            "Privacy settings saved.",
          );
          if (r)
            await qc.invalidateQueries({ queryKey: getGetCommunityQueryKey() });
        }}
      >
        {(
          [
            ["public", "Everyone", "Visible to visitors and search engines."],
            [
              "members",
              "Members only",
              "Only signed-in ProofStack members can open it. Not indexed by search engines.",
            ],
          ] as const
        ).map(([v, label, hint]) => (
          <label
            key={v}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-[:checked]:border-primary"
          >
            <input
              type="radio"
              name="visibility"
              className="mt-1 accent-primary"
              checked={value === v}
              onChange={() => setValue(v)}
            />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">
                {hint}
              </span>
            </span>
          </label>
        ))}
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          type="submit"
          disabled={pending || value === current || !me.data?.profile}
        >
          Save visibility
        </Button>
      </form>
    </Panel>
  );
}
export function PrivacySection() {
  return (
    <SettingsSection
      title="Privacy & data"
      description="Control who sees you, download your data, or delete your account."
    >
      {(loaded) => (
        <div className="space-y-6">
          <VisibilityPanel />
          <PrivacyPanel act={loaded.act} />
        </div>
      )}
    </SettingsSection>
  );
}

// ---------- Appearance ----------
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved on this device.
        </p>
      </header>
      <Panel title="Theme" eyebrow="Display">
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "Match my device"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm has-[:checked]:border-primary"
            >
              <input
                type="radio"
                name="theme"
                className="accent-primary"
                checked={mounted && (theme ?? "system") === value}
                onChange={() => setTheme(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </Panel>
    </section>
  );
}

// ---------- Administration ----------
export function AdminSection() {
  return (
    <SettingsSection
      title="Administration"
      description="Platform tools for moderators and admins."
    >
      {({ ctx }) =>
        ctx.user?.platformRole ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel title="Accounts" eyebrow="Moderation">
              <p className="text-sm text-muted-foreground">
                Review accounts, change platform roles, enable or disable.
              </p>
              <Button asChild className="mt-3">
                <Link href="/account/admin">Open accounts</Link>
              </Button>
            </Panel>
            <Panel title="Operations" eyebrow="Health">
              <p className="text-sm text-muted-foreground">
                Queues, workers, database and configured services.
              </p>
              <Button asChild variant="outline" className="mt-3">
                <Link href="/account/operations">Open operations</Link>
              </Button>
            </Panel>
          </div>
        ) : (
          <Notice tone="warn">
            Your account does not hold a platform role.
          </Notice>
        )
      }
    </SettingsSection>
  );
}
