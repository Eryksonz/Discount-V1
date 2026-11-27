"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { ProductFeedItem } from "@/lib/catalog/repository";
import { useWatchlist } from "@/lib/watchlist";
import { DealCard } from "./DealCard";

export function WatchlistClient() {
  const { ids } = useWatchlist();
  const [items, setItems] = useState<ProductFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/watchlist?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => r.json())
      .then((json) => setItems(json.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [ids]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E2DCD0] pb-4">
        <div>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-[#1B365D] hover:underline"
          >
            ← Back to Deal Desk
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-[#0F1D32] mt-1 flex items-center gap-2">
            <Bookmark className="w-6 h-6 text-[#B8924A]" />
            Saved Watchlist ({ids.length})
          </h1>
          <p className="text-xs text-[#5C6776] mt-1">
            Stored locally in your browser with live tracked prices. Open any item to set an
            email price-drop alert.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-[#5C6776]">Loading saved items...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-[#E2DCD0] bg-white p-12 text-center space-y-3">
          <p className="font-serif text-xl text-[#0F1D32]">Your watchlist is empty.</p>
          <p className="text-sm text-[#5C6776]">
            Click the bookmark icon on any deal card to track items for recruiting or wardrobe
            upgrades.
          </p>
          <Link
            href="/"
            className="inline-block rounded bg-[#0F1D32] px-4 py-2 text-xs font-semibold text-white"
          >
            Browse Deal Desk
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <DealCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
