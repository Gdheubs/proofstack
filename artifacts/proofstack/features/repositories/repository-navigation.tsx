import Link from "next/link";

type RepositoryPage = "source" | "pulls" | "releases" | "security";

const pages: Array<{ kind: RepositoryPage; suffix: string; label: string }> = [
  { kind: "source", suffix: "", label: "Source" },
  { kind: "pulls", suffix: "/pulls", label: "Pull requests" },
  { kind: "releases", suffix: "/releases", label: "Releases" },
  { kind: "security", suffix: "/security", label: "Security review" },
];

export function RepositoryNavigation({
  repositoryId,
  canManage,
  active,
}: {
  repositoryId: string;
  canManage: boolean;
  active: RepositoryPage;
}) {
  return (
    <nav aria-label="Repository" className="mb-6 border-b">
      <ul className="flex flex-wrap gap-1">
        {pages
          .filter((page) => page.kind !== "security" || canManage)
          .map((page) => (
            <li key={page.kind}>
              <Link
                href={`/repositories/${repositoryId}${page.suffix}`}
                aria-current={active === page.kind ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2 text-sm transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active === page.kind
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                {page.label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
