import Link from "next/link";
import { Calendar, Clock, Radio, Tag, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { BRAND_BY_SLUG } from "@config/brands";
import { getSqlClient } from "@/db";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface SaleEventRow {
  id: number;
  slug: string;
  name: string;
  brandSlug: string | null;
  startsAt: string;
  endsAt: string;
  typicalDiscountNote: string;
  triggersHighFrequency: boolean;
  confirmed: boolean;
  confirmedAt: string | null;
}

interface PromoRow {
  id: number;
  brandSlug: string;
  description: string;
  code: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  appliesTo: string;
  hasExclusions: boolean;
  endsAt: string;
}

function formatDateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

function ConfirmationBadge({ confirmed, confirmedAt }: { confirmed: boolean; confirmedAt: string | null }) {
  if (confirmed) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#E8F3EC] border border-[#14532D]/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#14532D]"
        title={confirmedAt ? `Confirmed ${new Date(confirmedAt).toLocaleDateString("en-US")}` : "Admin confirmed"}
      >
        <CheckCircle2 className="w-3 h-3" />
        Confirmed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] border border-[#D97706]/30 px-2 py-0.5 font-mono text-[10px] font-medium text-[#92400E]">
      <Info className="w-3 h-3" />
      Typical timing, not confirmed
    </span>
  );
}

export default async function SaleCalendarPage() {
  const sql = getSqlClient();
  let events: SaleEventRow[] = [];
  let activePromos: PromoRow[] = [];
  let unclassifiedCount = 0;

  if (sql) {
    const [eventRows, promoRows, countRows] = await Promise.all([
      sql`
        SELECT id, slug, name, brand_slug, starts_at, ends_at, typical_discount_note, triggers_high_frequency, confirmed, confirmed_at
        FROM sale_events
        ORDER BY starts_at ASC
      `,
      sql`
        SELECT id, brand_slug, description, code, percent_off, amount_off_cents, applies_to, has_exclusions, ends_at
        FROM brand_promos
        WHERE active = TRUE AND starts_at <= NOW() AND ends_at >= NOW()
        ORDER BY ends_at ASC
      `,
      sql`
        SELECT count(*) FILTER (WHERE classification_status = 'unclassified')::int AS cnt
        FROM products
      `,
    ]);

    events = eventRows.map((r) => ({
      id: Number(r.id),
      slug: String(r.slug),
      name: String(r.name),
      brandSlug: r.brand_slug ? String(r.brand_slug) : null,
      startsAt: new Date(String(r.starts_at)).toISOString(),
      endsAt: new Date(String(r.ends_at)).toISOString(),
      typicalDiscountNote: String(r.typical_discount_note ?? ""),
      triggersHighFrequency: Boolean(r.triggers_high_frequency),
      confirmed: Boolean(r.confirmed),
      confirmedAt: r.confirmed_at ? new Date(String(r.confirmed_at)).toISOString() : null,
    }));

    activePromos = promoRows.map((r) => ({
      id: Number(r.id),
      brandSlug: String(r.brand_slug),
      description: String(r.description),
      code: r.code ? String(r.code) : null,
      percentOff: r.percent_off !== null ? Number(r.percent_off) : null,
      amountOffCents: r.amount_off_cents !== null ? Number(r.amount_off_cents) : null,
      appliesTo: String(r.applies_to ?? "Sitewide"),
      hasExclusions: Boolean(r.has_exclusions),
      endsAt: new Date(String(r.ends_at)).toISOString(),
    }));

    unclassifiedCount = Number(countRows[0]?.cnt ?? 0);
  }

  const now = Date.now();
  const liveEvents = events.filter(
    (e) => new Date(e.startsAt).getTime() <= now && new Date(e.endsAt).getTime() >= now
  );
  const upcomingEvents = events.filter((e) => new Date(e.startsAt).getTime() > now);
  const pastEvents = events.filter((e) => new Date(e.endsAt).getTime() < now);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#141A22]">
      <SiteHeader
        source={sql ? "postgres" : "demo-fallback"}
        isDemoData={!sql}
        unclassifiedCount={unclassifiedCount}
        activeNav="calendar"
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        <header className="space-y-2 border-b border-[#E2DCD0] pb-6">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#7A6338]">
            <Calendar className="w-3.5 h-3.5" />
            Retail Event Schedule
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#0F1D32]">
            Menswear Sale Calendar
          </h1>
          <p className="text-sm text-[#4B5869] max-w-2xl leading-relaxed">
            Seasonal markdown windows across our curated brands. Future annual events are labeled{" "}
            <span className="font-mono text-xs font-semibold text-[#92400E]">
              Typical timing, not confirmed
            </span>{" "}
            until an editor explicitly confirms dates in <span className="font-mono text-xs">/admin</span>.
          </p>
        </header>

        {/* Live Now */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#14532D]" />
            <h2 className="font-serif text-xl font-semibold text-[#0F1D32]">
              Current Sale Windows ({liveEvents.length})
            </h2>
          </div>

          {liveEvents.length === 0 ? (
            <div className="rounded-lg border border-[#E2DCD0] bg-white p-6 text-sm text-[#5C6776]">
              No tracked seasonal sale windows are currently active. Daily baseline price tracking
              continues as normal.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveEvents.map((ev) => {
                const brand = ev.brandSlug ? BRAND_BY_SLUG[ev.brandSlug] : null;
                return (
                  <div
                    key={ev.id}
                    className="rounded-lg border-2 border-[#14532D]/30 bg-white p-5 space-y-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F3EC] px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#14532D]">
                            Active Window
                          </span>
                          <ConfirmationBadge
                            confirmed={ev.confirmed}
                            confirmedAt={ev.confirmedAt}
                          />
                        </div>
                        <h3 className="font-serif text-lg font-semibold text-[#0F1D32]">
                          {ev.name}
                        </h3>
                      </div>
                      {ev.triggersHighFrequency && (
                        <span className="rounded bg-[#0F1D32] px-2 py-0.5 font-mono text-[10px] text-[#E5C98B] shrink-0">
                          4H CRAWL
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-[#5C6776]">
                      {formatDateRange(ev.startsAt, ev.endsAt)} ·{" "}
                      {brand ? `${brand.name} (${brand.code})` : "Market-wide"}
                    </div>
                    <p className="text-sm text-[#3E4C5E] leading-relaxed">
                      {ev.typicalDiscountNote}
                    </p>
                    <div className="pt-1">
                      <Link
                        href={brand ? `/?brands=${brand.slug}` : "/"}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#0F1D32] hover:text-[#14532D]"
                      >
                        Browse Deal Desk
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Active Verified Checkout Promos */}
        {activePromos.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#B8924A]" />
              <h2 className="font-serif text-xl font-semibold text-[#0F1D32]">
                Active Checkout Promos ({activePromos.length})
              </h2>
            </div>
            <p className="text-xs text-[#5C6776]">
              Checkout codes are tracked separately as a display layer and never overwrite historical
              item prices or 90-day medians.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activePromos.map((pr) => {
                const brand = BRAND_BY_SLUG[pr.brandSlug];
                return (
                  <div
                    key={pr.id}
                    className="rounded-lg border border-[#E2DCD0] bg-white p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm text-[#0F1D32]">
                        {brand?.name ?? pr.brandSlug}
                      </span>
                      {pr.code && (
                        <span className="rounded border border-dashed border-[#B8924A] bg-[#FAF5E8] px-2 py-0.5 font-mono text-xs font-semibold text-[#7A6338]">
                          {pr.code}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#3E4C5E]">{pr.description}</p>
                    <div className="font-mono text-[11px] text-[#5C6776] flex flex-wrap gap-3">
                      {pr.percentOff && <span>{pr.percentOff}% off</span>}
                      {pr.amountOffCents && <span>{formatCurrency(pr.amountOffCents)} off</span>}
                      <span>Applies: {pr.appliesTo}</span>
                      {pr.hasExclusions && <span>Exclusions apply</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Upcoming Events */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0F1D32]" />
            <h2 className="font-serif text-xl font-semibold text-[#0F1D32]">
              Upcoming Seasonal Events ({upcomingEvents.length})
            </h2>
          </div>

          <div className="rounded-lg border border-[#E2DCD0] bg-white divide-y divide-[#EDE7DB]">
            {upcomingEvents.map((ev) => {
              const brand = ev.brandSlug ? BRAND_BY_SLUG[ev.brandSlug] : null;
              return (
                <div
                  key={ev.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm sm:text-base text-[#0F1D32]">
                        {ev.name}
                      </h3>
                      <ConfirmationBadge
                        confirmed={ev.confirmed}
                        confirmedAt={ev.confirmedAt}
                      />
                      <span className="rounded bg-[#EFEAE0] px-2 py-0.5 font-mono text-[10px] text-[#5C6776]">
                        {brand ? `${brand.code} · ${brand.name}` : "MARKET-WIDE"}
                      </span>
                      {ev.triggersHighFrequency && (
                        <span className="rounded bg-[#E8F3EC] px-2 py-0.5 font-mono text-[10px] text-[#14532D]">
                          HIGH-FREQ
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#4B5869]">{ev.typicalDiscountNote}</p>
                  </div>
                  <div className="font-mono text-xs text-[#0F1D32] shrink-0">
                    {formatDateRange(ev.startsAt, ev.endsAt)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {pastEvents.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-[#5C6776]">
              Recent Completed Events ({pastEvents.length})
            </h2>
            <div className="rounded-lg border border-[#E2DCD0] bg-white/70 divide-y divide-[#EDE7DB]">
              {pastEvents.map((ev) => (
                <div key={ev.id} className="px-4 py-3 flex items-center justify-between text-xs text-[#5C6776]">
                  <span className="flex items-center gap-2">
                    {ev.name}
                    <ConfirmationBadge confirmed={ev.confirmed} confirmedAt={ev.confirmedAt} />
                  </span>
                  <span className="font-mono">{formatDateRange(ev.startsAt, ev.endsAt)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
