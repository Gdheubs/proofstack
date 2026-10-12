import Link from "next/link";
import type { CommunityPerson } from "@workspace/api-client-react";

export function Body({
  text,
  mentions,
}: {
  text: string;
  mentions: CommunityPerson[];
}) {
  const handles = new Set(mentions.map((m) => m.handle.toLowerCase()));
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed">
      {text.split(/(@[A-Za-z0-9_-]+)/g).map((p, i) =>
        p.startsWith("@") && handles.has(p.slice(1).toLowerCase()) ? (
          <Link
            key={i}
            href={`/profile/${p.slice(1)}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {p}
          </Link>
        ) : (
          p
        ),
      )}
    </p>
  );
}
