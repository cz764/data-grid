import { Suspense } from "react";

import { BondLoader } from "@/components/BondLoader";
import { DataGridSkeleton } from "@/components/DataGridSkeleton";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;

  return (
    <Suspense fallback={<DataGridSkeleton />}>
      <BondLoader searchParams={params} />
    </Suspense>
  );
}
