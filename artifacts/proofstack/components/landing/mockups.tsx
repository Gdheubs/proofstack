// Animated product previews for the landing page. Pure CSS/SVG so they load
// instantly, follow the theme, and stop moving when the visitor prefers
// reduced motion (see .mock-* rules in globals.css).

function Window({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden rounded-xl border bg-card text-[11px] shadow-lg ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

const Line = ({ w, className = "" }: { w: string; className?: string }) => (
  <span
    className={`block h-2 rounded bg-muted-foreground/25 ${className}`}
    style={{ width: w }}
  />
);

export function FeedMock() {
  return (
    <Window title="proofstack · home">
      <div className="space-y-3 p-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="mock-card rounded-lg border p-3"
            style={{ animationDelay: `${i * 0.9}s` }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary/20" />
              <Line w="38%" />
            </div>
            <Line w="92%" className="mb-1.5" />
            <Line w="70%" className="mb-2.5" />
            <div className="flex gap-1.5">
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[9px] text-accent-foreground">
                TypeScript
              </span>
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[9px] text-accent-foreground">
                shipped
              </span>
            </div>
          </div>
        ))}
      </div>
    </Window>
  );
}

export function EditorMock() {
  return (
    <Window title="proofstack · code">
      <div className="flex h-44">
        <div className="w-28 space-y-1.5 border-r p-2 font-mono text-[10px] text-muted-foreground">
          <div>▾ src</div>
          <div className="pl-3 text-foreground">app.ts</div>
          <div className="pl-3">routes.ts</div>
          <div className="pl-3">db.ts</div>
          <div>▾ tests</div>
          <div className="pl-3">app.test.ts</div>
          <div className="pt-2 text-[9px]">
            <span className="text-emerald-600">M</span> src/app.ts
          </div>
        </div>
        <div className="flex-1 p-3 font-mono text-[10px] leading-5">
          <div>
            <span className="text-primary">export</span> const app ={" "}
            <span className="text-accent-foreground">express</span>();
          </div>
          <div>app.get(&quot;/health&quot;, (req, res) =&gt; &#123;</div>
          <div className="pl-4">
            res.json(&#123; ok: <span className="text-primary">true</span>{" "}
            &#125;);
          </div>
          <div>&#125;);</div>
          <div className="mock-type overflow-hidden whitespace-nowrap border-r-2 border-foreground">
            app.listen(8080); // commit → main
          </div>
        </div>
      </div>
    </Window>
  );
}

export function ProfileMock() {
  return (
    <Window title="proofstack · profile">
      <div className="p-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="h-10 w-10 rounded-full bg-primary/20" />
          <div className="space-y-1.5">
            <Line w="90px" className="bg-foreground/50" />
            <Line w="140px" />
          </div>
        </div>
        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Profile strength</span>
          <span className="mock-pct" />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="mock-fill h-full rounded-full bg-primary dark:bg-accent" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["Projects 6", "Skill checks 3", "Followers 48"].map((s) => (
            <div
              key={s}
              className="rounded-md border p-2 text-center text-[10px]"
            >
              {s}
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}

export function SkillsMock() {
  return (
    <Window title="proofstack · skills">
      <div className="space-y-2.5 p-3">
        {[
          ["Async & promises", "92%"],
          ["Arrays & objects", "80%"],
          ["Modern syntax", "64%"],
        ].map(([label, pct], i) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-[10px]">
              <span>{label}</span>
              <span className="text-muted-foreground">{pct}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="mock-bar h-full rounded-full bg-primary dark:bg-accent"
                style={{
                  width: pct,
                  animationDelay: `${i * 0.25}s`,
                }}
              />
            </div>
          </div>
        ))}
        <p className="pt-1 text-[10px] text-muted-foreground">
          Practice next: Modern syntax · new questions each attempt
        </p>
      </div>
    </Window>
  );
}

export function OpportunitiesMock() {
  return (
    <Window title="proofstack · opportunities">
      <div className="space-y-2 p-3">
        {["Frontend engineer · Remote", "Rust contributor · Open source"].map(
          (job, i) => (
            <div
              key={job}
              className="mock-card flex items-center justify-between rounded-lg border p-3"
              style={{ animationDelay: `${i * 0.8}s` }}
            >
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium">{job}</div>
                <Line w="110px" />
              </div>
              <span className="mock-pulse rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground dark:bg-accent dark:text-accent-foreground">
                Apply with a project
              </span>
            </div>
          ),
        )}
      </div>
    </Window>
  );
}

export function CollabMock() {
  return (
    <Window title="proofstack · collab">
      <div className="p-3">
        <div className="mb-2 text-[11px] font-medium">Work board</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["To do", 2],
            ["In progress", 1],
            ["Done", 3],
          ].map(([col, n]) => (
            <div key={String(col)} className="rounded-md bg-muted/60 p-2">
              <div className="mb-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {col}
              </div>
              {Array.from({ length: Number(n) }).map((_, i) => (
                <div
                  key={i}
                  className="mock-card mb-1.5 rounded border bg-card p-1.5"
                  style={{ animationDelay: `${i * 0.5}s` }}
                >
                  <Line w="80%" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Window>
  );
}
