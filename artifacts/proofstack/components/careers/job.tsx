"use client";
import Link from "next/link";
import { useGetCareers, type CareerJob } from "@workspace/api-client-react";
import { useState } from "react";
import { PageHead, QueryError } from "@/components/community/ui";
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
} from "./shared";
export function JobEditor({
  organizations,
  job,
  done,
}: {
  organizations: { id: string; name: string }[];
  job?: CareerJob;
  done: () => void;
}) {
  const a = useCareerRun();
  return (
    <form
      className={card}
      onSubmit={async (e) => {
        const f = values(e);
        if (
          await a.run({
            action: "job-save",
            ...(job ? { id: job.id } : {}),
            organizationId: job?.organizationId ?? val(f, "organization"),
            title: val(f, "title"),
            description: val(f, "description"),
            skills: list(val(f, "skills")),
            kind: val(f, "kind"),
            workplace: val(f, "workplace"),
            location: val(f, "location"),
            compensation: val(f, "compensation"),
            status: val(f, "status"),
          })
        )
          done();
      }}
    >
      <h2 className="text-xl font-semibold">
        {job ? "Edit opportunity" : "Publish an opportunity"}
      </h2>
      <CareerForm action={a} submit="Save opportunity">
        <label className="block text-sm">
          Organization
          <select
            className="ml-2 rounded border bg-background p-2"
            name="organization"
            defaultValue={job?.organizationId}
            disabled={!!job}
            required
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          name="title"
          label="Role or collaboration title"
          value={job?.title}
          required
        />
        <Field
          name="description"
          label="Work, responsibilities, requirements, and hiring process"
          area
          max={12000}
          value={job?.description}
          required
        />
        <Field
          name="skills"
          label="Skills, separated by commas"
          value={job?.skills.join(", ")}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            name="kind"
            label="Type"
            items={["job", "internship", "contract", "collaboration"]}
            value={job?.kind}
          />
          <Select
            name="workplace"
            label="Workplace"
            items={["remote", "hybrid", "onsite"]}
            value={job?.workplace}
          />
          <Select
            name="status"
            label="Publishing status"
            items={["draft", "open", "closed"]}
            value={job?.status}
          />
        </div>
        <Field
          name="location"
          label="Location / eligible regions"
          value={job?.location}
        />
        <Field
          name="compensation"
          label="Compensation, currency, and period (or explicitly unpaid)"
          value={job?.compensation}
        />
        <p className="text-xs text-muted-foreground">
          Organization management requires recent MFA verification in Account
          settings.
        </p>
      </CareerForm>
    </form>
  );
}
export function Opportunity({ id }: { id: string }) {
  const r = useGetCareers({ view: "job", id });
  const a = useCareerRun();
  const [edit, setEdit] = useState(false);
  if (r.isPending) return <p>Loading opportunity…</p>;
  if (r.error) return <QueryError error={r.error} />;
  const j = r.data?.jobs[0];
  if (!j) return null;
  return (
    <>
      <PageHead eyebrow={j.organizationName} title={j.title}>
        {j.status === "open" && (
          <Link className="underline" href={`/intelligence/plan/${j.id}`}>
            Build a learning plan
          </Link>
        )}
        <Link href="/opportunities" className="underline">
          All opportunities
        </Link>
      </PageHead>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <article className={card}>
          <p className="text-muted-foreground">
            {j.kind} · {j.workplace} · {j.location || "Location not specified"}{" "}
            · {j.status}
          </p>
          <p className="font-medium">
            {j.compensation || "Compensation not specified"}
          </p>
          <p className="whitespace-pre-wrap">{j.description}</p>
          <p>{j.skills.join(" · ")}</p>
          <Link
            className="underline"
            href={`/organizations/${j.organizationSlug}`}
          >
            Organization profile →
          </Link>
        </article>
        <aside className="space-y-4">
          {j.canManage ? (
            <>
              <button className="underline" onClick={() => setEdit(!edit)}>
                Edit listing
              </button>
              <Link className="block underline" href={`/career?job=${j.id}`}>
                Review {j.applicationCount} applications →
              </Link>
              {edit && (
                <JobEditor
                  job={j}
                  organizations={[
                    { id: j.organizationId, name: j.organizationName },
                  ]}
                  done={() => setEdit(false)}
                />
              )}
            </>
          ) : j.applied ? (
            <div className={card}>
              You have applied.{" "}
              <Link className="underline" href="/career">
                Track your application
              </Link>
            </div>
          ) : j.status === "open" ? (
            <form
              className={card}
              onSubmit={async (e) => {
                const f = values(e);
                await a.run({
                  action: "apply",
                  jobId: id,
                  note: val(f, "note"),
                  projectIds: f.getAll("projects").map(String),
                });
              }}
            >
              <h2 className="text-xl font-semibold">Let your work speak</h2>
              <CareerForm action={a} submit="Submit private application">
                <Field
                  name="note"
                  label="Explain your contribution and why this opportunity fits"
                  area
                  max={5000}
                  required
                />
                <PickProof projects={r.data?.ownProjects ?? []} />
                <p className="text-xs text-muted-foreground">
                  Your note and selected public projects are shared with the
                  organization’s authorized hiring team. Applications are
                  private. Links are not independently verified.
                </p>
              </CareerForm>
            </form>
          ) : (
            <p className={card}>Applications are closed.</p>
          )}
        </aside>
      </div>
    </>
  );
}
