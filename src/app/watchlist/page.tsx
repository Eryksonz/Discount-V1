import { getAlertsMode } from "@config/app";
import { WatchlistClient } from "@/components/WatchlistClient";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  const alertsMode = getAlertsMode();
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3]">
      <div className="flex-1">
        <WatchlistClient alertsMode={alertsMode} />
      </div>
      <SiteFooter />
    </div>
  );
}
