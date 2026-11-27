import { notFound } from "next/navigation";
import { getAlertsMode } from "@config/app";
import { getProductDetailBySlug } from "@/lib/catalog/repository";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductDetailBySlug(slug);
  if (!product) {
    notFound();
  }

  const alertsMode = getAlertsMode();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3]">
      <div className="flex-1">
        <ProductDetailClient product={product} alertsMode={alertsMode} />
      </div>
      <SiteFooter />
    </div>
  );
}
