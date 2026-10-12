export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect
          x="2"
          y="17"
          width="22"
          height="6"
          rx="1.5"
          className="fill-primary"
        />
        <rect
          x="5"
          y="9.5"
          width="16"
          height="6"
          rx="1.5"
          className="fill-primary"
          opacity=".6"
        />
        <rect
          x="8"
          y="2"
          width="10"
          height="6"
          rx="1.5"
          className="fill-accent"
        />
      </svg>
      <span className="font-serif text-xl font-semibold tracking-tight">
        ProofStack
      </span>
    </span>
  );
}
