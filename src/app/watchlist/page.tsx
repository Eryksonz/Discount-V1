import { WatchlistClient } from "@/components/WatchlistClient";
import { SiteFooter } from "@/components/SiteFooter";

export default function WatchlistPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3]">
      <div className="flex-1">
        <WatchlistClient />
      </div>
      <SiteFooter />
    </div>
  );
}
