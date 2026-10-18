"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGetCommunityQueryKey,
  useGetCommunity,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/features/auth/shared";
import { useCommunityRun, useCsrf } from "@/hooks/use-community";
import { csv, ENTRY_KINDS, errStatus } from "@/lib/community";
import { AssistInline } from "./assist";
import { EntryList } from "./entry-list";
import { Empty, Fld, PageHead, PersonAvatar, QueryError } from "./ui";
import { ImagePicker } from "./uploader";

export function ProfileSettings() {
  const { canAct, session } = useCsrf();
  const params = { view: "profile", handle: "me" } as const;
  const q = useGetCommunity(params, {
    query: {
      queryKey: getGetCommunityQueryKey(params),
      enabled: canAct,
      retry: false,
    },
  });
  const router = useRouter();
  const { run, pending, error } = useCommunityRun();
  const me = q.data?.profile ?? null;
  const claimed = !!me?.handle;
  const unclaimed =
    (q.isError && errStatus(q.error) === 404) || (q.isSuccess && !me);
  const [f, setF] = useState({
    handle: "",
    displayName: "",
    bio: "",
    location: "",
    skills: "",
    avatarPath: "",
  });
  useEffect(() => {
    if (me)
      setF({
        handle: me.handle,
        displayName: me.displayName,
        bio: me.bio,
        location: me.location,
        skills: me.skills.join(", "),
        avatarPath: me.avatarPath,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  if (session.isPending) return <Skeleton className="h-64" />;
  if (!canAct)
    return (
      <Empty
        title="Sign in to manage your profile"
        action={
          <Button asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError && !unclaimed)
    return <QueryError error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHead
        eyebrow="Profile"
        title={me ? "Edit your profile" : "Claim your handle"}
      >
        {me && (
          <Button asChild variant="outline">
            <Link href={`/profile/${me.handle}`}>View public profile</Link>
          </Button>
        )}
      </PageHead>
      {!me && (
        <Notice>
          Your handle is your public address, like
          proofstack.app/profile/yourhandle. Pick one you want to keep.
        </Notice>
      )}
      <form
        className="space-y-4 rounded-lg border bg-card p-5 sm:p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            {
              action: "profile-save",
              handle: f.handle.trim(),
              displayName: f.displayName.trim(),
              bio: f.bio.trim(),
              location: f.location.trim(),
              skills: csv(f.skills),
              avatarPath: f.avatarPath,
            },
            me ? "Profile saved." : "Handle claimed.",
          );
          if (r && !claimed)
            router.replace(`/profile/${r.handle ?? f.handle.trim()}`);
        }}
      >
        <div className="flex items-center gap-4">
          <PersonAvatar
            person={{
              displayName: f.displayName || "?",
              avatarPath: f.avatarPath,
            }}
            size={72}
          />
          <div className="space-y-1">
            <ImagePicker
              label="Upload avatar"
              onDone={(p) => set("avatarPath", p)}
            />
            {f.avatarPath && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("avatarPath", "")}
              >
                Remove avatar
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              PNG, JPEG or WebP, up to 8 MiB. Saved when you save the profile.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fld label="Handle" hint="Letters, numbers, dashes. Unique.">
            <Input
              required
              minLength={3}
              maxLength={32}
              value={f.handle}
              onChange={(e) => set("handle", e.target.value.toLowerCase())}
              autoComplete="off"
            />
          </Fld>
          <Fld label="Display name">
            <Input
              required
              maxLength={80}
              value={f.displayName}
              onChange={(e) => set("displayName", e.target.value)}
            />
          </Fld>
        </div>
        <Fld label="Bio">
          <Textarea
            rows={4}
            maxLength={1000}
            value={f.bio}
            onChange={(e) => set("bio", e.target.value)}
          />
        </Fld>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fld label="Location">
            <Input
              maxLength={80}
              value={f.location}
              onChange={(e) => set("location", e.target.value)}
            />
          </Fld>
          <Fld label="Skills" hint="Comma separated. Self-reported.">
            <Input
              value={f.skills}
              onChange={(e) => set("skills", e.target.value)}
            />
          </Fld>
        </div>
        <AssistInline
          tasks={["profile-summary", "skill-extraction"]}
          text={f.bio || f.skills}
          applyLabel="Apply to profile"
          onApply={(d, t) =>
            t === "skill-extraction"
              ? set("skills", csv([f.skills, ...d.skills].join(",")).join(", "))
              : set("bio", d.content)
          }
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : claimed ? "Save profile" : "Claim handle"}
        </Button>
      </form>
      {claimed && q.data && (
        <section aria-labelledby="records">
          <h2 id="records" className="mb-1 text-2xl font-semibold">
            Your records
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Experience, repositories, contributions, achievements, challenges
            and engineering evidence. All manual.
          </p>
          <EntryList
            entries={q.data.entries}
            kinds={ENTRY_KINDS.personal}
            canAdd
          />
        </section>
      )}
    </div>
  );
}
