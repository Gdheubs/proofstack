"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetAuthContextQueryKey,
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  KindPicker,
  Notice,
  Skeleton,
  type Kind,
} from "@/features/auth/shared";
import { PersonAvatar } from "@/features/community/ui";
import { ImagePicker } from "@/features/community/uploader";
import { editorApi } from "@/features/editor/editor-api";
import { errInfo, useAct, useSession } from "@/hooks/use-auth";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { csv, errStatus } from "@/lib/community";

const STEPS = ["You", "Profile", "Skills", "GitHub"] as const;

// Four short, skippable steps. Each saves on its own so a member who leaves
// half-way keeps what they entered.
export function OnboardingView() {
  const router = useRouter();
  const qc = useQueryClient();
  const session = useSession();
  const { canAct, csrf } = useCsrf();
  const { act } = useAct();
  const { run, pending, error } = useCommunityRun();
  const params = { view: "profile", handle: "me" } as const;
  const me = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      retry: false,
    },
  });
  const sources = useQuery({
    queryKey: ["editor-sources"],
    queryFn: () => editorApi.sources(),
    enabled: canAct,
    retry: false,
  });
  const profile = me.data?.profile ?? null;
  const unclaimed = me.isError && errStatus(me.error) === 404;
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("developer");
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [avatarPath, setAvatarPath] = useState("");
  const [skills, setSkills] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const user = session.data?.user;
    if (user) {
      setKind(user.kind);
      setDisplayName((v) => v || user.displayName);
    }
    if (profile) {
      setHandle((v) => v || profile.handle);
      setHeadline((v) => v || profile.headline);
      setAvatarPath((v) => v || profile.avatarPath);
      setSkills((v) => v || profile.skills.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.data?.user?.id, profile?.id]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("github")) setStep(3);
  }, []);

  const saveProfile = () =>
    run(
      {
        action: "profile-save",
        handle: handle.trim().toLowerCase(),
        displayName: displayName.trim(),
        bio: profile?.bio ?? "",
        location: profile?.location ?? "",
        skills: csv(skills),
        avatarPath: avatarPath || undefined,
        headline: headline.trim(),
        links: profile?.links ?? { website: "", github: "", linkedin: "" },
      },
      "Saved.",
    );
  const finish = async () => {
    setBusy(true);
    try {
      await run({ action: "onboarding-complete" }, "Welcome aboard.");
      await qc.invalidateQueries({ queryKey: getGetAuthContextQueryKey() });
      router.replace("/home");
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    setProblem(null);
    setBusy(true);
    try {
      if (step === 0) {
        if (!displayName.trim()) return setProblem("Add your name.");
        await act({
          action: "update-profile",
          displayName: displayName.trim(),
          kind,
        });
      }
      if (step === 1 || step === 2) {
        if (!handle.trim()) return setProblem("Choose a handle.");
        const saved = await saveProfile();
        if (!saved) return;
      }
      if (step === 3) return finish();
      setStep(step + 1);
    } catch (e) {
      setProblem(errInfo(e).message);
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await editorApi.connectGithub(csrf, "welcome");
      window.location.assign(authorizeUrl);
    } catch (e) {
      setProblem(errInfo(e).message);
      setBusy(false);
    }
  };

  if (session.isPending || (canAct && me.isPending && !unclaimed))
    return <Skeleton className="mx-auto mt-10 h-72 max-w-lg" />;
  if (!canAct)
    return (
      <section className="mx-auto max-w-md space-y-3 p-8 text-center">
        <h1 className="text-2xl font-semibold">
          Let&apos;s set up your profile
        </h1>
        <Button asChild>
          <Link href="/auth?next=%2Fwelcome">Sign in to continue</Link>
        </Button>
      </section>
    );
  const working = busy || pending;
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <ol
        aria-label="Steps"
        className="mb-8 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
      >
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={i === step ? "step" : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${i <= step ? "border-primary bg-primary text-primary-foreground dark:border-accent dark:bg-accent dark:text-accent-foreground" : ""}`}
            >
              {i + 1}
            </span>
            <span className={i === step ? "text-foreground" : ""}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-4 border-t" />}
          </li>
        ))}
      </ol>
      <form
        className="space-y-5 rounded-xl border bg-card p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step === 0 && (
          <>
            <h1 className="text-2xl font-semibold">Welcome. Who are you?</h1>
            <Field
              label="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              required
            />
            <KindPicker value={kind} onChange={setKind} />
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-2xl font-semibold">Your public profile</h1>
            <div className="flex items-center gap-4">
              <PersonAvatar
                person={{ displayName: displayName || "?", avatarPath }}
                size={64}
              />
              <ImagePicker label="Add a photo" onDone={setAvatarPath} />
            </div>
            <Field
              label="Handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              hint="Your profile address: proofstack/profile/yourhandle. Lowercase letters, numbers and dashes."
              required
            />
            <Field
              label="Headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={
                kind === "recruiter"
                  ? "Talent partner at Acme"
                  : "Full-stack developer · TypeScript, Postgres"
              }
              maxLength={160}
            />
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-semibold">What are you good at?</h1>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Skills</span>
              <Input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="React, Node.js, SQL"
              />
              <span className="block text-xs text-muted-foreground">
                Separate with commas. These power search and job matching.
              </span>
            </label>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-2xl font-semibold">Connect GitHub</h1>
            <p className="text-sm text-muted-foreground">
              Import your repositories and edit code from ProofStack. Your
              GitHub token stays on our server, encrypted, and you can
              disconnect any time.
            </p>
            {sources.data?.github.connected ? (
              <Notice tone="ok">
                Connected as {sources.data.github.login}.
              </Notice>
            ) : sources.data && !sources.data.github.available ? (
              <Notice>GitHub connection is not available yet.</Notice>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={working}
                onClick={() => void connect()}
              >
                <Github className="h-4 w-4" aria-hidden="true" />
                Connect GitHub
              </Button>
            )}
          </>
        )}
        {(problem || error) && <Notice tone="error">{problem ?? error}</Notice>}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2"
            disabled={working}
            onClick={() => void finish()}
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={working}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            <Button type="submit" disabled={working}>
              {step === STEPS.length - 1 ? "Finish" : "Continue"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
