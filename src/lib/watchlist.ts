"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tt_watchlist_v2";
const LEGACY_STORAGE_KEY = "tt_watchlist_v1";

export interface WatchlistEntry {
  productId: string;
  targetPriceCents: number | null;
  addedAt: string;
}

export function evaluateLocalPriceTarget(
  currentPriceCents: number,
  inStock: boolean,
  targetPriceCents: number | null
): { met: boolean; belowTargetCents: number } {
  if (!inStock || targetPriceCents === null || targetPriceCents <= 0) {
    return { met: false, belowTargetCents: 0 };
  }
  const met = currentPriceCents <= targetPriceCents;
  return {
    met,
    belowTargetCents: met ? Math.max(0, targetPriceCents - currentPriceCents) : 0,
  };
}

function readEntries(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const rawV2 = window.localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is WatchlistEntry => Boolean(x && typeof x.productId === "string"))
          .map((x) => ({
            productId: x.productId,
            targetPriceCents:
              typeof x.targetPriceCents === "number" &&
              Number.isFinite(x.targetPriceCents) &&
              x.targetPriceCents > 0
                ? Math.round(x.targetPriceCents)
                : null,
            addedAt: typeof x.addedAt === "string" ? x.addedAt : new Date().toISOString(),
          }));
      }
    }

    // One-time migration from legacy string[] key
    const rawV1 = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1);
      if (Array.isArray(parsed)) {
        const migrated: WatchlistEntry[] = parsed
          .filter((x): x is string => typeof x === "string")
          .map((productId) => ({
            productId,
            targetPriceCents: null,
            addedAt: new Date().toISOString(),
          }));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    return [];
  } catch {
    return [];
  }
}

function writeEntries(entries: WatchlistEntry[]): void {
  const capped = entries.slice(0, 50);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  window.dispatchEvent(new Event("tt-watchlist-change"));
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  useEffect(() => {
    setEntries(readEntries());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
        setEntries(readEntries());
      }
    };
    const onCustom = () => setEntries(readEntries());
    window.addEventListener("storage", onStorage);
    window.addEventListener("tt-watchlist-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tt-watchlist-change", onCustom);
    };
  }, []);

  const toggle = useCallback((productId: string) => {
    const current = readEntries();
    const exists = current.some((e) => e.productId === productId);
    const next = exists
      ? current.filter((e) => e.productId !== productId)
      : [{ productId, targetPriceCents: null, addedAt: new Date().toISOString() }, ...current];
    writeEntries(next);
    setEntries(next.slice(0, 50));
  }, []);

  const setTargetPrice = useCallback((productId: string, targetPriceCents: number | null) => {
    const normalized =
      targetPriceCents !== null && Number.isFinite(targetPriceCents) && targetPriceCents > 0
        ? Math.round(targetPriceCents)
        : null;
    const current = readEntries();
    const exists = current.some((e) => e.productId === productId);
    const next = exists
      ? current.map((e) =>
          e.productId === productId ? { ...e, targetPriceCents: normalized } : e
        )
      : [
          { productId, targetPriceCents: normalized, addedAt: new Date().toISOString() },
          ...current,
        ];
    writeEntries(next);
    setEntries(next.slice(0, 50));
  }, []);

  const ids = entries.map((e) => e.productId);
  const isSaved = useCallback(
    (productId: string) => entries.some((e) => e.productId === productId),
    [entries]
  );
  const getTargetPrice = useCallback(
    (productId: string) => entries.find((e) => e.productId === productId)?.targetPriceCents ?? null,
    [entries]
  );

  return { entries, ids, toggle, setTargetPrice, isSaved, getTargetPrice, count: entries.length };
}
