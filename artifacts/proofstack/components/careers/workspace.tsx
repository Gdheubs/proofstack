"use client";
import Link from "next/link";
import { useState } from "react";
import {
  useGetCareers,
  type CareerProfile,
  type CareerProof,
  getGetCareersQueryKey,
} from "@workspace/api-client-react";
import { PageHead, QueryError, Empty } from "@/components/community/ui";
import {
  card,
  Field,
  Select,
  PickProof,
  CareerForm,
  useCareerRun,
  values,
  val,
  list,
  Pager,
  Evidence,
} from "./shared";
import { JobEditor } from "./job";
import { JobCard } from "./boards";
function Preferences({
  profile: p,
  projects,
}: {
  profile: CareerProfile;
  projects: CareerProof[];
}) {
  const a = useCareerRun();
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        const f = values(e);
        await a.run({
          action: "career-save",
          headline: val(f, "headline"),
          roles: list(val(f, "roles")),
          availability: val(f, "availability"),
          discoverable: f.has("discoverable"),
          featuredProjects: f.getAll("projects").map(String),
        });
      }}
    >
      <h2 className="text-xl font-semibold">Career preferences</h2>
      <CareerForm action={a} submit="Save preferences">
        <Field name="headline" label="What do you build?" value={p.headline} />
        <Field
          name="roles"
          label="Roles you’re exploring, separated by commas"
          value={p.roles.join(", ")}
        />
        <Select
          name="availability"
          label="Availability"
          items={["closed", "exploring", "open"]}
          value={p.availability}
        />
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="discoverable"
            defaultChecked={p.discoverable}
          />
          Show my profile in the public talent directory
        </label>
        <PickProof projects={projects} selected={p.featuredProjects} />
        <p className="text-xs text-muted-foreground">
          Discovery is off by default. Closed availability hides your directory
          entry. These preferences never appear on applications automatically.
        </p>
      </CareerForm>
    </form>
  );
}
export function Applications({ jobId }: { jobId?: string }) {
  const [scope, setScope] = useState<"mine" | "received">(
    jobId ? "received" : "mine",
  );
  const [offset, setOffset] = useState(0);
  const r = useGetCareers({
    view: "applications",
    scope,
    offset,
    ...(jobId ? { id: jobId } : {}),
  });
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-2xl font-semibold">
          {jobId ? "Listing applications" : "Application workspace"}
        </h2>
        <select
          aria-label="Application view"
          className="rounded border bg-background p-2"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as typeof scope);
            setOffset(0);
          }}
        >
          <option value="mine">My applications</option>
          <option value="received">Hiring inbox</option>
        </select>
      </div>
      {r.error ? (
        <QueryError error={r.error} />
      ) : r.isPending ? (
        <p>Loading applications…</p>
      ) : (
        <>
          {r.data?.applications.map((a) => (
            <Link
              href={`/applications/${a.id}`}
              key={a.id}
              className={card + " block hover:border-primary"}
            >
              <div className="flex justify-between gap-3">
                <h3 className="font-semibold">{a.jobTitle}</h3>
                <span className="text-xs uppercase">{a.status}</span>
              </div>
              <p className="text-sm">
                {a.organizationName} ·{" "}
                {a.isMine ? "Your application" : a.displayName}
              </p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {a.note}
              </p>
            </Link>
          ))}
          {!r.data?.applications.length && (
            <Empty
              title="No applications yet"
              body={
                scope === "mine"
                  ? "Apply to an opportunity with your project evidence."
                  : "Applications to opportunities you manage will appear here."
              }
            />
          )}
          <Pager offset={offset} more={!!r.data?.hasMore} change={setOffset} />
        </>
      )}
    </section>
  );
}
export function CareerWorkspace({ jobId }: { jobId?: string }) {
  const r = useGetCareers({ view: "dashboard" });
  const [create, setCreate] = useState(false);
  if (r.isPending) return <p>Loading career workspace…</p>;
  if (r.error) return <QueryError error={r.error} />;
  const d = r.data;
  if (!d) return null;
  return (
    <>
      <PageHead eyebrow="Your next chapter" title="Career workspace">
        <Link className="underline" href="/intelligence">
          Intelligence workspace
        </Link>
        <Link className="underline" href="/talent">
          Talent directory →
        </Link>
      </PageHead>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          {d.profile && (
            <Preferences profile={d.profile} projects={d.ownProjects} />
          )}
          <section className={card}>
            <h2 className="text-xl font-semibold">Build your hiring team</h2>
            <p className="text-sm text-muted-foreground">
              Only organization owners and authorized admins can post
              opportunities and review applicants.
            </p>
            {d.organizations.length ? (
              <button className="underline" onClick={() => setCreate(!create)}>
                {create ? "Close editor" : "Create opportunity"}
              </button>
            ) : (
              <Link className="underline" href="/organizations">
                Create or join an organization →
              </Link>
            )}
          </section>
          {create && (
            <JobEditor
              organizations={d.organizations}
              done={() => setCreate(false)}
            />
          )}
        </div>
        <div className="space-y-8">
          <Applications jobId={jobId} />
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Your latest listings</h2>
            {d.jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
            {d.hasMore && (
              <Link href="/opportunities" className="underline">
                Browse more listings
              </Link>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
const transitions: Record<string, string[]> = {
  submitted: ["reviewing", "shortlisted", "interview", "rejected"],
  reviewing: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "offered", "rejected"],
  interview: ["offered", "rejected"],
};
export function ApplicationThread({ id }: { id: string }) {
  const r = useGetCareers(
    { view: "application", id },
    {
      query: {
        queryKey: getGetCareersQueryKey({ view: "application", id }),
        refetchInterval: 15000,
      },
    },
  );
  const a = useCareerRun();
  const messageAction = useCareerRun();
  const [body, setBody] = useState("");
  if (r.isPending) return <p>Loading application…</p>;
  if (r.error) return <QueryError error={r.error} />;
  const d = r.data,
    app = d?.applications[0];
  if (!d || !app) return null;
  return (
    <>
      <PageHead eyebrow="Private application" title={app.jobTitle}>
        <Link className="underline" href="/career">
          Career workspace
        </Link>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          {a.error && (
            <p role="alert" className="text-sm text-destructive">
              {a.error}
            </p>
          )}
          <p className="text-sm">
            {app.organizationName} · {app.status}
          </p>
          <Link
            className="font-semibold underline"
            href={`/profile/${app.handle}`}
          >
            {app.displayName}
          </Link>
          <p className="whitespace-pre-wrap">{app.note}</p>
          <Evidence projects={app.projects} />
          {!app.projects.length && (
            <p className="text-sm text-muted-foreground">
              Linked project evidence is no longer public or available.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Project links demonstrate claimed contributions; they are not
            independently verified.
          </p>
          {app.canManage && (transitions[app.status]?.length ?? 0) > 0 && (
            <form
              onSubmit={async (e) => {
                const f = values(e);
                await a.run({
                  action: "application-status",
                  id,
                  status: val(f, "status"),
                });
              }}
              className="space-y-3"
            >
              <CareerForm action={a} submit="Update stage">
                <Select
                  name="status"
                  label="Next stage"
                  items={transitions[app.status] ?? []}
                />
                <p className="text-xs">
                  Recent MFA verification required for hiring decisions.
                </p>
              </CareerForm>
            </form>
          )}
          {app.isMine && app.status !== "withdrawn" && (
            <button
              disabled={a.pending}
              className="text-sm underline"
              onClick={() => {
                if (
                  window.confirm(
                    "Withdraw this application and close the conversation?",
                  )
                )
                  void a.run({
                    action: "application-status",
                    id,
                    status: "withdrawn",
                  });
              }}
            >
              Withdraw application
            </button>
          )}
        </section>
        <section className={card}>
          <h2 className="text-xl font-semibold">Conversation</h2>
          <p className="text-xs text-muted-foreground">
            Visible only to you and authorized organization managers. Showing
            the latest 100 messages.
          </p>
          <div
            className="max-h-[32rem] space-y-3 overflow-y-auto"
            aria-live="polite"
          >
            {d.messages.map((m) => (
              <article className="rounded-lg bg-muted p-3" key={m.id}>
                <p className="text-sm font-medium">
                  {m.displayName}{" "}
                  <time className="font-normal text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString()}
                  </time>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {m.body}
                </p>
              </article>
            ))}
            {!d.messages.length && (
              <p className="text-sm text-muted-foreground">
                Start a conversation about the work and next steps.
              </p>
            )}
          </div>
          {!["withdrawn", "rejected"].includes(app.status) ? (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await messageAction.run({ action: "message", id, body }))
                  setBody("");
              }}
            >
              <CareerForm action={messageAction} submit="Send message">
                <label className="block text-sm">
                  Message
                  <textarea
                    className="mt-1 w-full rounded border bg-background p-3"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={4000}
                    required
                    rows={4}
                  />
                </label>
              </CareerForm>
            </form>
          ) : (
            <p>This conversation is closed.</p>
          )}
        </section>
      </div>
    </>
  );
}
