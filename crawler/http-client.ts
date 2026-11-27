export interface HttpFetchResult {
  ok: boolean;
  status: number;
  url: string;
  body: string;
  fromCache: boolean;
  blockedByRobots?: boolean;
  circuitOpen?: boolean;
}

interface CacheEntry {
  body: string;
  status: number;
  etag?: string;
  lastModified?: string;
  expiresAt: number;
}

interface ParsedRobots {
  disallows: string[];
  crawlDelayMs: number | null;
}

const DEFAULT_RATE_LIMIT_MS = Number(process.env.CRAWLER_DEFAULT_RATE_LIMIT_MS ?? 2000);
const CONTACT_EMAIL =
  process.env.CRAWLER_CONTACT_EMAIL ?? "crawler@tapeandtailor.example.com";
export const CRAWLER_USER_AGENT = `TapeAndTailorBot/0.1 (+https://tapeandtailor.example.com; contact: ${CONTACT_EMAIL})`;

/**
 * Shared compliant HTTP client for all brand adapters:
 * - Public pages only; strict robots.txt enforcement & caching per host
 * - Configurable per-domain rate limiter (default 1 req / 2s)
 * - HTTP response cache honoring ETag / Last-Modified / TTL
 * - Exponential backoff with jitter for transient 5xx responses
 * - Circuit breaker automatically halting requests to a host after repeated 403/429 responses
 */
export class PoliteHttpClient {
  private readonly robotsCache = new Map<string, ParsedRobots>();
  private readonly lastRequestAtByHost = new Map<string, number>();
  private readonly responseCache = new Map<string, CacheEntry>();
  private readonly consecutiveBlocksByHost = new Map<string, number>();
  private readonly circuitOpenHosts = new Set<string>();

  constructor(
    private readonly options: {
      defaultRateLimitMs?: number;
      circuitBreakerThreshold?: number;
      cacheTtlMs?: number;
      maxRetries?: number;
      timeoutMs?: number;
    } = {}
  ) {}

  private get rateLimitMs() {
    return this.options.defaultRateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  }

  private get circuitThreshold() {
    return this.options.circuitBreakerThreshold ?? 3;
  }

  private get cacheTtlMs() {
    return this.options.cacheTtlMs ?? 15 * 60_000; // 15 min in-run cache
  }

  private get maxRetries() {
    return this.options.maxRetries ?? 2;
  }

  private get timeoutMs() {
    return this.options.timeoutMs ?? 12_000;
  }

  isCircuitOpen(host: string): boolean {
    return this.circuitOpenHosts.has(host.toLowerCase());
  }

  getConsecutiveBlocks(host: string): number {
    return this.consecutiveBlocksByHost.get(host.toLowerCase()) ?? 0;
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async enforceRateLimit(host: string, customRateLimitMs?: number): Promise<void> {
    const robots = this.robotsCache.get(host);
    const delayMs = Math.max(
      customRateLimitMs ?? this.rateLimitMs,
      robots?.crawlDelayMs ?? 0
    );
    const last = this.lastRequestAtByHost.get(host) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < delayMs) {
      await this.sleep(delayMs - elapsed);
    }
    this.lastRequestAtByHost.set(host, Date.now());
  }

  private parseRobots(text: string): ParsedRobots {
    const disallows: string[] = [];
    let crawlDelayMs: number | null = null;
    let applies = false;

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("#")[0].trim();
      if (!line) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();

      if (key === "user-agent") {
        applies = val === "*" || val.toLowerCase().includes("tapeandtailor");
      } else if (applies && key === "disallow" && val) {
        disallows.push(val);
      } else if (applies && key === "crawl-delay") {
        const sec = Number(val);
        if (Number.isFinite(sec) && sec > 0) {
          crawlDelayMs = sec * 1000;
        }
      }
    }

    return { disallows, crawlDelayMs };
  }

  private async loadRobots(origin: string, host: string): Promise<ParsedRobots> {
    const existing = this.robotsCache.get(host);
    if (existing) return existing;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": CRAWLER_USER_AGENT },
        signal: controller.signal,
      });
      const parsed = resp.ok ? this.parseRobots(await resp.text()) : { disallows: [], crawlDelayMs: null };
      this.robotsCache.set(host, parsed);
      return parsed;
    } catch {
      const empty = { disallows: [], crawlDelayMs: null };
      this.robotsCache.set(host, empty);
      return empty;
    } finally {
      clearTimeout(timer);
    }
  }

  private isAllowedByRobots(pathname: string, robots: ParsedRobots): boolean {
    for (const rule of robots.disallows) {
      if (rule === "/") return false;
      if (rule.includes("*")) {
        const re = new RegExp(
          "^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
        );
        if (re.test(pathname)) return false;
      } else if (pathname.startsWith(rule)) {
        return false;
      }
    }
    return true;
  }

  async get(
    url: string,
    opts: { rateLimitMs?: number; accept?: string } = {}
  ): Promise<HttpFetchResult> {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (this.circuitOpenHosts.has(host)) {
      return {
        ok: false,
        status: 429,
        url,
        body: "",
        fromCache: false,
        circuitOpen: true,
      };
    }

    const robots = await this.loadRobots(parsed.origin, host);
    if (!this.isAllowedByRobots(parsed.pathname, robots)) {
      return {
        ok: false,
        status: 451,
        url,
        body: "",
        fromCache: false,
        blockedByRobots: true,
      };
    }

    const cached = this.responseCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ok: cached.status >= 200 && cached.status < 300,
        status: cached.status,
        url,
        body: cached.body,
        fromCache: true,
      };
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      await this.enforceRateLimit(host, opts.rateLimitMs);

      const headers: Record<string, string> = {
        "User-Agent": CRAWLER_USER_AGENT,
        Accept: opts.accept ?? "application/json,text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };
      if (cached?.etag) headers["If-None-Match"] = cached.etag;
      if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const resp = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (resp.status === 304 && cached) {
          cached.expiresAt = Date.now() + this.cacheTtlMs;
          this.consecutiveBlocksByHost.set(host, 0);
          return {
            ok: true,
            status: 200,
            url,
            body: cached.body,
            fromCache: true,
          };
        }

        if (resp.status === 403 || resp.status === 429) {
          const blocks = (this.consecutiveBlocksByHost.get(host) ?? 0) + 1;
          this.consecutiveBlocksByHost.set(host, blocks);
          if (blocks >= this.circuitThreshold) {
            this.circuitOpenHosts.add(host);
            return {
              ok: false,
              status: resp.status,
              url,
              body: "",
              fromCache: false,
              circuitOpen: true,
            };
          }
          // Respectful exponential backoff with jitter
          const backoffMs = 1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
          await this.sleep(backoffMs);
          attempt += 1;
          continue;
        }

        if (resp.status >= 500 && attempt < this.maxRetries) {
          const backoffMs = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
          await this.sleep(backoffMs);
          attempt += 1;
          continue;
        }

        const body = await resp.text();
        if (resp.ok) {
          this.consecutiveBlocksByHost.set(host, 0);
          this.responseCache.set(url, {
            body,
            status: resp.status,
            etag: resp.headers.get("etag") ?? undefined,
            lastModified: resp.headers.get("last-modified") ?? undefined,
            expiresAt: Date.now() + this.cacheTtlMs,
          });
        }

        return {
          ok: resp.ok,
          status: resp.status,
          url,
          body,
          fromCache: false,
        };
      } catch {
        clearTimeout(timer);
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt));
          attempt += 1;
          continue;
        }
        return {
          ok: false,
          status: 0,
          url,
          body: "",
          fromCache: false,
        };
      }
    }

    return { ok: false, status: 429, url, body: "", fromCache: false, circuitOpen: true };
  }
}
