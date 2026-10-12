"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { StatusPill } from "@/components/status-pill";

const swatches = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["primary", "bg-primary"],
  ["accent", "bg-accent"],
  ["secondary", "bg-secondary"],
  ["muted", "bg-muted"],
  ["destructive", "bg-destructive"],
  ["border", "bg-border"],
];

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t py-10">
      <h2 className="mb-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [email, setEmail] = useState("");
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <Toaster />
      <p className="rise font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Design system
      </p>
      <h1 className="rise d1 mt-3 text-4xl font-semibold md:text-6xl">
        Ink, paper and one signal color.
      </h1>
      <p className="rise d2 mt-4 max-w-xl text-muted-foreground">
        Deep ink-teal carries structure; amber marks what needs attention.
        Fraunces sets the voice, DM Sans does the work, JetBrains Mono labels
        the facts.
      </p>

      <Block title="Color tokens">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {swatches.map(([n, c]) => (
            <div key={n} className="overflow-hidden rounded-lg border">
              <div className={`${c} h-20`} />
              <p className="bg-card px-3 py-2 font-mono text-xs">{n}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Typography">
        <p className="font-serif text-6xl font-semibold">Aa Display</p>
        <p className="mt-3 text-lg">
          Body text in DM Sans reads comfortably at length.
        </p>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          GET /api/readyz 200
        </p>
      </Block>

      <Block title="Buttons and badges">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </Block>

      <Block title="Status">
        <div className="flex flex-wrap gap-3">
          <StatusPill tone="ok" label="Ready" />
          <StatusPill tone="pending" label="Pending" />
          <StatusPill tone="bad" label="Unavailable" />
          <StatusPill tone="off" label="Not configured" />
        </div>
      </Block>

      <Block title="Form controls">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="demo-email">Email address</Label>
            <Input
              id="demo-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Demonstration only. Nothing is submitted.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="dark"
              checked={resolvedTheme === "dark"}
              onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
            />
            <Label htmlFor="dark">Dark mode (saved in this browser)</Label>
          </div>
        </div>
      </Block>

      <Block title="Feedback">
        <Alert>
          <AlertTitle>Informational</AlertTitle>
          <AlertDescription>Alerts state facts plainly.</AlertDescription>
        </Alert>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              toast("Toast displayed", {
                description: "Theme tokens apply here too.",
              })
            }
          >
            Show toast
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Hover or focus me</Button>
            </TooltipTrigger>
            <TooltipContent>Tooltips are keyboard accessible</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Block>

      <Block title="Tabs">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Structure</TabsTrigger>
            <TabsTrigger value="b">Motion</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="pt-4 text-sm text-muted-foreground">
            Hairline borders and ledger rules organize content.
          </TabsContent>
          <TabsContent value="b" className="pt-4 text-sm text-muted-foreground">
            Short rises and pulses; all disabled under reduced-motion
            preferences.
          </TabsContent>
        </Tabs>
      </Block>
    </div>
  );
}
