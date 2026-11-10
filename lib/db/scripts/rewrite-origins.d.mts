export function rewriteOrigins(
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rowCount: number | null }>,
  from: unknown,
  to: unknown,
): Promise<{ repository_url: number; demo_url: number }>;
