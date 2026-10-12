"use client";
import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommunityUpload } from "@/hooks/use-community";

export function ImagePicker({
  label,
  onDone,
}: {
  label: string;
  onDone: (assetPath: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { upload, busy } = useCommunityUpload();
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const p = await upload(f);
          if (p) onDone(p);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => ref.current?.click()}
      >
        <ImagePlus className="h-4 w-4" />
        {busy ? "Uploading..." : label}
      </Button>
    </>
  );
}
