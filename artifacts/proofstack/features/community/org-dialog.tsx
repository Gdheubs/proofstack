"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunityOrganization } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCommunityRun } from "@/hooks/use-community";
import { slugify } from "@/lib/community";
import { Fld, FormDialog, selectCls } from "./ui";

export function OrgDialog({
  open,
  onOpenChange,
  org,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  org?: CommunityOrganization;
}) {
  const router = useRouter();
  const { run, pending, error, code } = useCommunityRun();
  const [f, setF] = useState({
    name: "",
    slug: "",
    description: "",
    website: "",
    visibility: "public",
  });
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      name: org?.name ?? "",
      slug: org?.slug ?? "",
      description: org?.description ?? "",
      website: org?.website ?? "",
      visibility: org?.visibility ?? "public",
    });
    setTouched(!!org);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, org?.id]);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const mfa =
    code?.includes("MFA") ||
    /mfa|multi-factor|authenticator|security key/i.test(error ?? "");
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={org ? "Organization settings" : "New organization"}
      description={
        org
          ? undefined
          : "Creating an organization needs a recent native multi-factor check."
      }
      pending={pending}
      error={error}
      errorExtra={
        mfa ? (
          <Link className="underline" href="/account#security">
            Open account security
          </Link>
        ) : null
      }
      onSubmit={async () => {
        const r = await run(
          {
            action: "organization-save",
            id: org?.id,
            name: f.name.trim(),
            slug: f.slug,
            description: f.description.trim(),
            website: f.website.trim(),
            visibility: f.visibility as "public" | "private",
          },
          org ? "Organization saved." : "Organization created.",
        );
        if (r) {
          onOpenChange(false);
          const slug = r.slug ?? f.slug;
          if (slug && slug !== org?.slug) router.push(`/organizations/${slug}`);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Fld label="Name">
          <Input
            required
            maxLength={80}
            value={f.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!touched) set("slug", slugify(e.target.value));
            }}
          />
        </Fld>
        <Fld label="Slug">
          <Input
            required
            maxLength={48}
            value={f.slug}
            onChange={(e) => {
              setTouched(true);
              set("slug", slugify(e.target.value));
            }}
          />
        </Fld>
      </div>
      <Fld label="Description">
        <Textarea
          rows={4}
          maxLength={2000}
          value={f.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Fld>
      <Fld label="Website">
        <Input
          type="url"
          placeholder="https://"
          value={f.website}
          onChange={(e) => set("website", e.target.value)}
        />
      </Fld>
      <Fld
        label="Visibility"
        hint="Members, teams and repositories stay private to active members either way."
      >
        <select
          className={selectCls}
          value={f.visibility}
          onChange={(e) => set("visibility", e.target.value)}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </Fld>
    </FormDialog>
  );
}
