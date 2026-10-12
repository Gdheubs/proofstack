import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Users,
  Briefcase,
  GitPullRequest,
} from "lucide-react";
import { Button } from "@/components/ui/button";
const paths = [
  {
    icon: Code2,
    title: "Show what you can build",
    body: "Give each project a home: your contribution, repository, demo, and progress. Let people explore the work behind your profile.",
    href: "/projects",
    cta: "Explore projects",
  },
  {
    icon: GitPullRequest,
    title: "Make progress together",
    body: "Invite contributors, define tasks, assign ownership, and attach evidence of completed work to your project board.",
    href: "/community",
    cta: "Join the build log",
  },
  {
    icon: Briefcase,
    title: "Find work through your work",
    body: "Explore opportunities and apply with relevant projects. Keep next steps and private hiring conversations in one workspace.",
    href: "/opportunities",
    cta: "Find opportunities",
  },
  {
    icon: Users,
    title: "Meet your next teammate",
    body: "Discover builders who choose to be visible. Review their projects and contributions, then manage applications through your organization.",
    href: "/talent",
    cta: "Discover talent",
  },
];
export default function Home() {
  return (
    <>
      <section className="ledger border-b">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            A community built around the work
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[1.04] md:text-8xl">
            Build something.
            <br />
            <em className="text-primary dark:text-accent">
              Let it open doors.
            </em>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Bring your projects, collaborators, and career together. Show how
            you solve problems. Find people who want to build with you.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/projects">
                Explore the work <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/opportunities">Find your next opportunity</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-3xl font-semibold">
            From first commit to next chapter.
          </h2>
          <Link href="/profile/me" className="underline">
            Build your profile →
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {paths.map((p) => (
            <article key={p.title} className="rounded-xl border bg-card p-7">
              <p.icon className="mb-5 h-6 w-6 text-primary" />
              <h3 className="text-xl font-semibold">{p.title}</h3>
              <p className="mb-5 mt-3 text-muted-foreground">{p.body}</p>
              <Link className="font-medium underline" href={p.href}>
                {p.cta} →
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
          Project links and profile claims are supplied by members. Explore the
          source, ask about contributions, and make your own assessment.
          ProofStack does not automatically verify skills or rank candidates.
        </p>
      </section>
    </>
  );
}
