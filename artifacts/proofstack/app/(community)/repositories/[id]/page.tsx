import { RepositoryView } from "@/components/repositories/repository-view";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string; path?: string; revision?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  return <RepositoryView key={id + JSON.stringify(q)} id={id} {...q} />;
}
