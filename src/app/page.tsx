import { queryCatalogFeed } from "@/lib/catalog/repository";
import { DealFeedClient } from "@/components/DealFeedClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialData = await queryCatalogFeed({
    inStockOnly: true,
    sort: "score_desc",
    page: 1,
    pageSize: 24,
  });

  return <DealFeedClient initialData={initialData} />;
}
