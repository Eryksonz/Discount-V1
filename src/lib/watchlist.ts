"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tt_watchlist_v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(readIds());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setIds(readIds());
    };
    const onCustom = () => setIds(readIds());
    window.addEventListener("storage", onStorage);
    window.addEventListener("tt-watchlist-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tt-watchlist-change", onCustom);
    };
  }, []);

  const toggle = useCallback((productId: string) => {
    const current = readIds();
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [productId, ...current].slice(0, 50);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setIds(next);
    window.dispatchEvent(new Event("tt-watchlist-change"));
  }, []);

  const isSaved = useCallback((productId: string) => ids.includes(productId), [ids]);

  return { ids, toggle, isSaved, count: ids.length };
}
