"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PRODUCT_CATEGORIES } from "@config/categories";
import { formatCurrency } from "@/lib/utils";
import { Lock, LogOut, RefreshCw, CheckCircle2, AlertTriangle, Activity } from "lucide-react";

interface UnclassifiedProduct {
  id: string;
  brandSlug: string;
  name: string;
  rawBreadcrumb: string;
  currentPriceCents: number;
  originalPriceCents: number;
  productUrl: string;
}

interface FlaggedUpdate {
  id: number;
  brandSlug: string;
  externalId: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface CrawlRunRow {
  id: number;
  brandName: string;
  mode: string;
  status: string;
  startedAt: string;
  durationMs: number;
  productsSeen: number;
  priceChanges: number;
  newProducts: number;
  quarantinedCount: number;
  errorsCount: number;
  errorSummary: string | null;
}

interface BrandHealthRow {
  id: number;
  name: string;
  brandCode: string;
  slug: string;
  circuitState: string;
  consecutiveErrors: number;
  lastCrawledAt: string | null;
}

interface AdminData {
  unclassified: UnclassifiedProduct[];
  flagged: FlaggedUpdate[];
  crawlRuns: CrawlRunRow[];
  brands: BrandHealthRow[];
  customRules: Array<{
    id: number;
    ruleId: string;
    category: string;
    subcategory: string;
    keywords: string[];
  }>;
  outboundClicksSampled: number;
}

export function AdminClient({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"unclassified" | "flagged" | "runs">("unclassified");

  // Per-item classification draft state
  const [drafts, setDrafts] = useState<
    Record<string, { category: string; subcategory: string; createRule: boolean; keywords: string }>
  >({});

  const loadData = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/admin/queue");
    if (res.status === 401) {
      setAuthenticated(false);
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setLoadError(json.error ?? "Failed to load admin queue");
      return;
    }
    setData(json);
  }, []);

  useEffect(() => {
    if (authenticated) {
      void loadData();
    }
  }, [authenticated, loadData]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setAuthError(json.error ?? "Login failed");
      return;
    }
    setPassword("");
    setAuthenticated(true);
  }

  async function handleLogout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthenticated(false);
    setData(null);
  }

  function getDraft(item: UnclassifiedProduct) {
    return (
      drafts[item.id] ?? {
        category: PRODUCT_CATEGORIES[0].slug,
        subcategory: PRODUCT_CATEGORIES[0].subcategories[0],
        createRule: false,
        keywords: item.name
          .split(/\s+/)
          .slice(-2)
          .join(" ")
          .toLowerCase(),
      }
    );
  }

  async function handleClassify(item: UnclassifiedProduct) {
    const draft = getDraft(item);
    setBusyId(item.id);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "classify",
          productId: item.id,
          category: draft.category,
          subcategory: draft.subcategory,
          createRule: draft.createRule,
          ruleKeywords: draft.keywords,
        }),
      });
      if (res.ok) {
        await loadData();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleResolveFlagged(id: number, status: "approved" | "rejected") {
    setBusyId(`flag-${id}`);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_flagged", id, status }),
      });
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetCircuit(brandId: number) {
    setBusyId(`brand-${brandId}`);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_circuit", brandId }),
      });
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-[#FAF8F3] flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-lg border border-[#D8D0C0] bg-white p-6 space-y-5 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#7A5B1F]">
              <Lock className="w-3.5 h-3.5" />
              Restricted Desk
            </div>
            <h1 className="font-serif text-2xl font-semibold text-[#0F1D32]">
              Tape &amp; Tailor Admin
            </h1>
            <p className="text-xs text-[#5C6776]">
              Sign in with <span className="font-mono">ADMIN_PASSWORD</span> to manage
              unclassified items, quarantined price updates, and crawler runs.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-[#5C6776] mb-1">
                Admin Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded border border-[#D8D0C0] px-3 py-2 text-sm text-[#0F1D32] focus:border-[#0F1D32] focus:outline-none"
              />
            </div>
            {authError && (
              <p className="text-xs text-[#8C3426] font-medium">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full rounded bg-[#0F1D32] hover:bg-[#1B365D] py-2 text-xs font-semibold text-white transition-colors"
            >
              Sign In
            </button>
          </form>

          <Link
            href="/"
            className="block text-center font-mono text-xs text-[#3E4C5E] hover:underline"
          >
            ← Back to Deal Desk
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAF8F3] text-[#0F1D32]">
      <header className="bg-[#0F1D32] text-[#FAF8F3] border-b-2 border-[#B8924A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-[#E5C98B]">
              Operations &amp; Classification Queue
            </div>
            <h1 className="font-serif text-2xl font-semibold">Tape &amp; Tailor Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-mono text-xs text-[#CBD5E1] hover:text-white"
            >
              Deal Desk
            </Link>
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-1 rounded border border-white/20 px-2.5 py-1 font-mono text-xs hover:bg-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded bg-white/10 px-2.5 py-1 font-mono text-xs hover:bg-white/20"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loadError && (
          <div className="rounded-md border border-[#8C3426]/40 bg-[#FAEEE9] p-4 text-sm text-[#8C3426]">
            {loadError}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[#E2DCD0] pb-3">
          <button
            type="button"
            onClick={() => setTab("unclassified")}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-semibold border ${
              tab === "unclassified"
                ? "bg-[#0F1D32] text-white border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#D8D0C0]"
            }`}
          >
            Unclassified Queue ({data?.unclassified.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("flagged")}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-semibold border ${
              tab === "flagged"
                ? "bg-[#0F1D32] text-white border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#D8D0C0]"
            }`}
          >
            Quarantined Updates ({data?.flagged.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("runs")}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-semibold border ${
              tab === "runs"
                ? "bg-[#0F1D32] text-white border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#D8D0C0]"
            }`}
          >
            Crawl Runs &amp; Brand Health ({data?.crawlRuns.length ?? 0})
          </button>
          {data && (
            <span className="ml-auto font-mono text-xs text-[#5C6776] self-center">
              Outbound Clicks Logged: <strong>{data.outboundClicksSampled}</strong> · Custom Rules:{" "}
              <strong>{data.customRules.length}</strong>
            </span>
          )}
        </div>

        {/* Unclassified Queue */}
        {tab === "unclassified" && data && (
          <div className="space-y-3">
            {data.unclassified.length === 0 ? (
              <div className="rounded-lg border border-[#E2DCD0] bg-white p-8 text-center text-sm text-[#5C6776] flex flex-col items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-[#14532D]" />
                All products are currently classified.
              </div>
            ) : (
              data.unclassified.map((item) => {
                const draft = getDraft(item);
                const catObj =
                  PRODUCT_CATEGORIES.find((c) => c.slug === draft.category) ??
                  PRODUCT_CATEGORIES[0];

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[#E2DCD0] bg-white p-4 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-center"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[11px] uppercase text-[#5C6776]">
                        {item.brandSlug} · {item.rawBreadcrumb || "No breadcrumb"} ·{" "}
                        {formatCurrency(item.currentPriceCents)}
                      </div>
                      <div className="font-serif text-lg font-semibold text-[#0F1D32]">
                        {item.name}
                      </div>
                      <a
                        href={item.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-[#1B365D] hover:underline break-all"
                      >
                        {item.productUrl}
                      </a>
                    </div>

                    <div className="space-y-2 rounded bg-[#FAF8F3] p-3 border border-[#E6E0D4]">
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={draft.category}
                          onChange={(e) => {
                            const nextCat =
                              PRODUCT_CATEGORIES.find((c) => c.slug === e.target.value) ??
                              PRODUCT_CATEGORIES[0];
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...draft,
                                category: nextCat.slug,
                                subcategory: nextCat.subcategories[0],
                              },
                            }));
                          }}
                          className="rounded border border-[#D8D0C0] bg-white px-2 py-1 text-xs"
                        >
                          {PRODUCT_CATEGORIES.map((c) => (
                            <option key={c.slug} value={c.slug}>
                              {c.shortLabel}
                            </option>
                          ))}
                        </select>

                        <select
                          value={draft.subcategory}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, subcategory: e.target.value },
                            }))
                          }
                          className="rounded border border-[#D8D0C0] bg-white px-2 py-1 text-xs"
                        >
                          {catObj.subcategories.map((sub) => (
                            <option key={sub} value={sub}>
                              {sub}
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-[#3E4C5E]">
                        <input
                          type="checkbox"
                          checked={draft.createRule}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, createRule: e.target.checked },
                            }))
                          }
                        />
                        <span>Also save a reusable rule (comma-separated keywords)</span>
                      </label>

                      {draft.createRule && (
                        <input
                          type="text"
                          value={draft.keywords}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.id]: { ...draft, keywords: e.target.value },
                            }))
                          }
                          placeholder="e.g. shoe tree, garment bag"
                          className="w-full rounded border border-[#D8D0C0] bg-white px-2 py-1 font-mono text-xs"
                        />
                      )}

                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleClassify(item)}
                        className="w-full rounded bg-[#14532D] hover:bg-[#0F4C29] py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === item.id ? "Saving..." : "Assign Category"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Flagged Updates Quarantine */}
        {tab === "flagged" && data && (
          <div className="space-y-3">
            {data.flagged.length === 0 ? (
              <div className="rounded-lg border border-[#E2DCD0] bg-white p-8 text-center text-sm text-[#5C6776]">
                No quarantined price updates pending review.
              </div>
            ) : (
              data.flagged.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-lg border border-[#8C3426]/30 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-xs text-[#8C3426] font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {flag.brandSlug} · {flag.externalId}
                    </div>
                    <p className="text-sm font-medium text-[#0F1D32]">{flag.reason}</p>
                    <pre className="text-[11px] font-mono bg-[#FAF8F3] p-2 rounded overflow-x-auto max-w-2xl">
                      {JSON.stringify(flag.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === `flag-${flag.id}`}
                      onClick={() => void handleResolveFlagged(flag.id, "rejected")}
                      className="rounded border border-[#8C3426] px-3 py-1.5 font-mono text-xs text-[#8C3426] hover:bg-[#FAEEE9]"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === `flag-${flag.id}`}
                      onClick={() => void handleResolveFlagged(flag.id, "approved")}
                      className="rounded bg-[#14532D] px-3 py-1.5 font-mono text-xs text-white hover:bg-[#0F4C29]"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Crawl Runs & Circuit Breakers */}
        {tab === "runs" && data && (
          <div className="space-y-6">
            <div className="rounded-lg border border-[#E2DCD0] bg-white overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#E6E0D4] flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider">
                <Activity className="w-4 h-4 text-[#14532D]" />
                Recent Standalone Crawl Runs
              </div>
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#FAF8F3] text-[#5C6776] border-b border-[#E6E0D4]">
                  <tr>
                    <th className="p-2.5">Brand</th>
                    <th className="p-2.5">Mode</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Seen</th>
                    <th className="p-2.5">New</th>
                    <th className="p-2.5">Changes</th>
                    <th className="p-2.5">Quarantined</th>
                    <th className="p-2.5">Duration</th>
                    <th className="p-2.5">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0]">
                  {data.crawlRuns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-[#5C6776]">
                        No crawl runs logged yet. Run `npm run crawl` to execute pilot adapters.
                      </td>
                    </tr>
                  ) : (
                    data.crawlRuns.map((run) => (
                      <tr key={run.id}>
                        <td className="p-2.5 font-semibold">{run.brandName}</td>
                        <td className="p-2.5">{run.mode}</td>
                        <td className="p-2.5">{run.status}</td>
                        <td className="p-2.5 tabular-nums">{run.productsSeen}</td>
                        <td className="p-2.5 tabular-nums">{run.newProducts}</td>
                        <td className="p-2.5 tabular-nums">{run.priceChanges}</td>
                        <td className="p-2.5 tabular-nums">{run.quarantinedCount}</td>
                        <td className="p-2.5 tabular-nums">{(run.durationMs / 1000).toFixed(1)}s</td>
                        <td className="p-2.5 text-[#5C6776]">
                          {new Date(run.startedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-[#E2DCD0] bg-white p-4">
              <h2 className="font-mono text-xs font-semibold uppercase tracking-wider mb-3">
                Brand Circuit Breakers
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {data.brands.map((b) => (
                  <div
                    key={b.id}
                    className="rounded border border-[#E6E0D4] p-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold">
                        <span className="font-mono text-[10px] mr-1.5 text-[#5C6776]">
                          {b.brandCode}
                        </span>
                        {b.name}
                      </div>
                      <div className="font-mono text-[10px] text-[#5C6776]">
                        state: {b.circuitState} · errs: {b.consecutiveErrors}
                      </div>
                    </div>
                    {b.circuitState !== "active" && (
                      <button
                        type="button"
                        disabled={busyId === `brand-${b.id}`}
                        onClick={() => void handleResetCircuit(b.id)}
                        className="rounded bg-[#0F1D32] px-2 py-1 font-mono text-[10px] text-white"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
