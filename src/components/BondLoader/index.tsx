import { BondGrid } from "@/components/BondGrid";
import { parseBondGridQuery, toGridFilters, type SearchParamsInput } from "@/data/bond-search-params";
import { createGridQuery } from "@/server/grid-query";

export interface BondLoaderProps {
  searchParams?: SearchParamsInput;
}

export async function BondLoader({ searchParams = {} }: BondLoaderProps) {
  const query = parseBondGridQuery(searchParams);
  const initialPage = await createGridQuery({ filters: toGridFilters(query), sort: query.sort });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BondGrid initialQuery={query} initialPage={initialPage} />
    </div>
  );
}
