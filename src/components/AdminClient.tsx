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

interface OutOfScopeProduct extends UnclassifiedProduct {
  subcategory: string | null;
  matchedRuleId: string | null;
}

interface BrandHealthRow {
  id: number;
  name: string;
  brandCode: string;
  slug: string;
  circuitState: string;
  consecutiveErrors: number;
  highFrequencyMode: boolean;
  crawlFrequency: string;
  lastCrawledAt: string | null;
}

interface BrandPromoRow {
  id: number;
  brandId: number;
  brandSlug: string;
  description: string;
  code: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  minSpendCents: number | null;
  appliesTo: string;
  hasExclusions: boolean;
  startsAt: string;
  endsAt: string;
  sourceUrl: string | null;
  active: boolean;
}

interface SaleEventRow {
  id: number;
  slug: string;
  name: string;
  brandSlug: string | null;
  startsAt: string;
  endsAt: string;
  typicalDiscountNote: string;
  triggersHighFrequency: boolean;
}

interface AdminData {
  unclassified: UnclassifiedProduct[];
  outOfScope: OutOfScopeProduct[];
  flagged: FlaggedUpdate[];
  crawlRuns: CrawlRunRow[];
  brands: BrandHealthRow[];
  promos: BrandPromoRow[];
  saleEvents: SaleEventRow[];
  activeAlertsCount: number;
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
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "unclassified" | "out_of_scope" | "promos" | "flagged" | "runs"
  >("unclassified");

  // New promo form state
  const [promoForm, setPromoForm] = useState({
    brandSlug: "faherty",
    description: "",
    code: "",
    percentOff: "",
    amountOffDollars: "",
    minSpendDollars: "",
    appliesTo: "Sitewide",
    hasExclusions: true,
    endsAt: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 16),
    sourceUrl: "",
  });

  // New sale event form state
  const [eventForm, setEventForm] = useState({
    name: "",
    brandSlug: "",
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16),
    typicalDiscountNote: "",
  });

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

  async function handleSetCrawlFrequency(brandId: number, crawlFrequency: string) {
    setBusyId(`freq-${brandId}`);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_crawl_frequency", brandId, crawlFrequency }),
      });
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCrawlNow(brandSlug = "") {
    setBusyId(`crawl-${brandSlug || "all"}`);
    setStatusNotice(null);
    try {
      const res = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crawl_now", brandSlug }),
      });
      const json = await res.json();
      setStatusNotice(res.ok ? json.message : `Crawl Now: ${json.error}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreatePromo(e: React.FormEvent) {
    e.preventDefault();
    const brand = data?.brands.find((b) => b.slug === promoForm.brandSlug);
    if (!brand) return;
    setBusyId("create-promo");
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_promo",
          brandId: brand.id,
          brandSlug: brand.slug,
          description: promoForm.description,
          code: promoForm.code || null,
          percentOff: promoForm.percentOff || null,
          amountOffDollars: promoForm.amountOffDollars || null,
          minSpendDollars: promoForm.minSpendDollars || null,
          appliesTo: promoForm.appliesTo,
          hasExclusions: promoForm.hasExclusions,
          startsAt: new Date().toISOString(),
          endsAt: new Date(promoForm.endsAt).toISOString(),
          sourceUrl: promoForm.sourceUrl || null,
        }),
      });
      setPromoForm((p) => ({ ...p, description: "", code: "" }));
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpirePromo(id: number) {
    setBusyId(`exp-promo-${id}`);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire_promo", id }),
      });
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateSaleEvent(e: React.FormEvent) {
    e.preventDefault();
    setBusyId("create-event");
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_sale_event",
          name: eventForm.name,
          brandSlug: eventForm.brandSlug || null,
          startsAt: new Date(eventForm.startsAt).toISOString(),
          endsAt: new Date(eventForm.endsAt).toISOString(),
          typicalDiscountNote: eventForm.typicalDiscountNote,
          triggersHighFrequency: true,
        }),
      });
      setEventForm((ev) => ({ ...ev, name: "", typicalDiscountNote: "" }));
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  async function handleExpireSaleEvent(id: number) {
    setBusyId(`exp-ev-${id}`);
    try {
      await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "expire_sale_event", id }),
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
        {statusNotice && (
          <div className="rounded-md border border-[#B8924A]/50 bg-[#F7F1E3] p-3 text-xs font-mono text-[#0F1D32]">
            {statusNotice}
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
            onClick={() => setTab("out_of_scope")}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-semibold border ${
              tab === "out_of_scope"
                ? "bg-[#0F1D32] text-white border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#D8D0C0]"
            }`}
          >
            Out of Scope ({data?.outOfScope.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("promos")}
            className={`rounded-md px-3.5 py-1.5 font-mono text-xs font-semibold border ${
              tab === "promos"
                ? "bg-[#0F1D32] text-white border-[#0F1D32]"
                : "bg-white text-[#3E4C5E] border-[#D8D0C0]"
            }`}
          >
            Promos &amp; Sale Events ({(data?.promos.length ?? 0) + (data?.saleEvents.length ?? 0)})
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

        {/* Out of Scope Audit View */}
        {tab === "out_of_scope" && data && (
          <div className="rounded-lg border border-[#E2DCD0] bg-white overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#E6E0D4] font-mono text-xs text-[#5C6776]">
              Excluded from public Deal Desk (showing latest 100). Audit matched rules below.
            </div>
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-[#FAF8F3] text-[#5C6776] border-b border-[#E6E0D4]">
                <tr>
                  <th className="p-2.5">Brand</th>
                  <th className="p-2.5">Product</th>
                  <th className="p-2.5">Reason / Subcategory</th>
                  <th className="p-2.5">Matched Rule</th>
                  <th className="p-2.5">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEAE0]">
                {data.outOfScope.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2.5">{item.brandSlug}</td>
                    <td className="p-2.5 font-sans font-medium text-[#0F1D32]">{item.name}</td>
                    <td className="p-2.5 text-[#5C6776]">{item.subcategory ?? "Out of scope"}</td>
                    <td className="p-2.5 text-[#1B365D]">{item.matchedRuleId ?? "—"}</td>
                    <td className="p-2.5 tabular-nums">{formatCurrency(item.currentPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Promos & Sale Events Management */}
        {tab === "promos" && data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-lg border border-[#E2DCD0] bg-white p-4 space-y-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider">
                Checkout Promo Codes (Display Layer Only)
              </h2>
              <form onSubmit={handleCreatePromo} className="space-y-2.5 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={promoForm.brandSlug}
                    onChange={(e) => setPromoForm((p) => ({ ...p, brandSlug: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5"
                  >
                    {data.brands.map((b) => (
                      <option key={b.slug} value={b.slug}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Code (optional, e.g. BF20)"
                    value={promoForm.code}
                    onChange={(e) => setPromoForm((p) => ({ ...p, code: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Description (e.g. Extra 20% off sitewide)"
                  value={promoForm.description}
                  onChange={(e) => setPromoForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full rounded border border-[#D8D0C0] px-2 py-1.5"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    placeholder="% off"
                    value={promoForm.percentOff}
                    onChange={(e) => setPromoForm((p) => ({ ...p, percentOff: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                  <input
                    type="number"
                    placeholder="$ off"
                    value={promoForm.amountOffDollars}
                    onChange={(e) =>
                      setPromoForm((p) => ({ ...p, amountOffDollars: e.target.value }))
                    }
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Min spend $"
                    value={promoForm.minSpendDollars}
                    onChange={(e) =>
                      setPromoForm((p) => ({ ...p, minSpendDollars: e.target.value }))
                    }
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Applies to (e.g. Sitewide)"
                    value={promoForm.appliesTo}
                    onChange={(e) => setPromoForm((p) => ({ ...p, appliesTo: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5"
                  />
                  <input
                    type="datetime-local"
                    value={promoForm.endsAt}
                    onChange={(e) => setPromoForm((p) => ({ ...p, endsAt: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                </div>
                <label className="flex items-center gap-2 text-[#3E4C5E]">
                  <input
                    type="checkbox"
                    checked={promoForm.hasExclusions}
                    onChange={(e) =>
                      setPromoForm((p) => ({ ...p, hasExclusions: e.target.checked }))
                    }
                  />
                  <span>Has exclusions (hides estimated post-promo price)</span>
                </label>
                <button
                  type="submit"
                  disabled={busyId === "create-promo"}
                  className="w-full rounded bg-[#14532D] py-1.5 font-semibold text-white"
                >
                  Save Promo
                </button>
              </form>

              <div className="space-y-2 pt-3 border-t border-[#E6E0D4]">
                {data.promos.map((pr) => (
                  <div
                    key={pr.id}
                    className="rounded border border-[#E6E0D4] p-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-semibold">
                        {pr.brandSlug} · {pr.description} {pr.code ? `(${pr.code})` : ""}
                      </div>
                      <div className="font-mono text-[10px] text-[#5C6776]">
                        {pr.active ? "ACTIVE" : "EXPIRED"} · ends{" "}
                        {new Date(pr.endsAt).toLocaleString()}
                      </div>
                    </div>
                    {pr.active && (
                      <button
                        type="button"
                        onClick={() => void handleExpirePromo(pr.id)}
                        className="rounded border border-[#8C3426] px-2 py-1 font-mono text-[10px] text-[#8C3426]"
                      >
                        Expire
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[#E2DCD0] bg-white p-4 space-y-4">
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider">
                Sale Events Calendar
              </h2>
              <form onSubmit={handleCreateSaleEvent} className="space-y-2.5 text-xs">
                <input
                  type="text"
                  required
                  placeholder="Event name (e.g. Black Friday 2026)"
                  value={eventForm.name}
                  onChange={(e) => setEventForm((ev) => ({ ...ev, name: e.target.value }))}
                  className="w-full rounded border border-[#D8D0C0] px-2 py-1.5"
                />
                <select
                  value={eventForm.brandSlug}
                  onChange={(e) => setEventForm((ev) => ({ ...ev, brandSlug: e.target.value }))}
                  className="w-full rounded border border-[#D8D0C0] px-2 py-1.5"
                >
                  <option value="">Market-wide (All Brands)</option>
                  {data.brands.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.name} only
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    value={eventForm.startsAt}
                    onChange={(e) => setEventForm((ev) => ({ ...ev, startsAt: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                  <input
                    type="datetime-local"
                    value={eventForm.endsAt}
                    onChange={(e) => setEventForm((ev) => ({ ...ev, endsAt: e.target.value }))}
                    className="rounded border border-[#D8D0C0] px-2 py-1.5 font-mono"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Notes"
                  value={eventForm.typicalDiscountNote}
                  onChange={(e) =>
                    setEventForm((ev) => ({ ...ev, typicalDiscountNote: e.target.value }))
                  }
                  className="w-full rounded border border-[#D8D0C0] px-2 py-1.5"
                />
                <button
                  type="submit"
                  disabled={busyId === "create-event"}
                  className="w-full rounded bg-[#0F1D32] py-1.5 font-semibold text-white"
                >
                  Save Sale Event
                </button>
              </form>

              <div className="space-y-2 pt-3 border-t border-[#E6E0D4]">
                {data.saleEvents.map((ev) => {
                  const now = Date.now();
                  const isLive =
                    new Date(ev.startsAt).getTime() <= now && new Date(ev.endsAt).getTime() >= now;
                  return (
                    <div
                      key={ev.id}
                      className="rounded border border-[#E6E0D4] p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-semibold">
                          {ev.name}{" "}
                          {isLive && (
                            <span className="ml-1 rounded bg-[#E8F3EC] px-1.5 py-0.5 font-mono text-[10px] text-[#14532D]">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-[#5C6776]">
                          {ev.brandSlug ?? "All brands"} · {new Date(ev.startsAt).toLocaleDateString()}{" "}
                          → {new Date(ev.endsAt).toLocaleDateString()}
                        </div>
                      </div>
                      {isLive && (
                        <button
                          type="button"
                          onClick={() => void handleExpireSaleEvent(ev.id)}
                          className="rounded border border-[#8C3426] px-2 py-1 font-mono text-[10px] text-[#8C3426]"
                        >
                          End Now
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
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

            <div className="rounded-lg border border-[#E2DCD0] bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-mono text-xs font-semibold uppercase tracking-wider">
                  Brand Crawl Frequency &amp; Circuit Breakers
                </h2>
                <button
                  type="button"
                  disabled={busyId === "crawl-all"}
                  onClick={() => void handleCrawlNow("")}
                  className="rounded bg-[#14532D] hover:bg-[#0F4C29] px-3 py-1.5 font-mono text-xs font-semibold text-white"
                >
                  {busyId === "crawl-all" ? "Dispatching..." : "Crawl Now (All Enabled Brands)"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {data.brands.map((b) => (
                  <div
                    key={b.id}
                    className="rounded border border-[#E6E0D4] p-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        <span className="font-mono text-[10px] mr-1.5 text-[#5C6776]">
                          {b.brandCode}
                        </span>
                        {b.name}
                      </div>
                      <div className="font-mono text-[10px] text-[#5C6776]">
                        state: {b.circuitState} · errs: {b.consecutiveErrors}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        aria-label={`Crawl frequency for ${b.name}`}
                        value={b.crawlFrequency ?? (b.highFrequencyMode ? "high_freq" : "daily")}
                        disabled={busyId === `freq-${b.id}`}
                        onChange={(e) => void handleSetCrawlFrequency(b.id, e.target.value)}
                        className="rounded border border-[#D8D0C0] bg-white px-1.5 py-1 font-mono text-[10px]"
                      >
                        <option value="daily">Daily</option>
                        <option value="high_freq">High-Freq</option>
                        <option value="paused">Paused</option>
                      </select>
                      <button
                        type="button"
                        disabled={busyId === `crawl-${b.slug}`}
                        onClick={() => void handleCrawlNow(b.slug)}
                        className="rounded border border-[#0F1D32] px-2 py-1 font-mono text-[10px] text-[#0F1D32] hover:bg-[#FAF8F3]"
                      >
                        Run
                      </button>
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
