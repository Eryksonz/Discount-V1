import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

async function waitForServer(url: string, timeoutMs = 25_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status > 0) return;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function buildMinimalEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Explicitly blank out ALL optional vars so Next.js does not hydrate them from local .env.local;
  // server boots with ONLY the 4 minimal production app variables!
  return {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "production",
    DATABASE_URL: process.env.DATABASE_URL!,
    ADMIN_PASSWORD: "MinimalProdCheck-StrongKey-2026!",
    ALERTS_MODE: "local",
    NEXT_PUBLIC_SITE_URL: "https://tape-and-tailor.vercel.app",
    // Explicitly unset optional services so .env.local cannot leak into this test
    DATABASE_URL_UNPOOLED: "",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_ENDPOINT_URL_S3: "",
    AWS_REGION: "",
    NEON_REALTIME_URL: "",
    NEON_REALTIME_SECRET: "",
    RESEND_API_KEY: "",
    ALERT_FROM_EMAIL: "",
    ADMIN_ALERT_EMAIL: "",
    GITHUB_TOKEN: "",
    GITHUB_REPO: "",
    SITE_INDEXING: "",
    DEMO_MODE: "",
    ...extra,
  };
}

async function runCheckPass(port: number, extraEnv: Record<string, string>, label: string) {
  const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    stdio: "pipe",
    env: buildMinimalEnv(extraEnv),
  });

  let stderrBuf = "";
  child.stderr?.on("data", (d) => {
    stderrBuf += d.toString();
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`);

    // 1. /api/health MUST be HTTP 200 with only DATABASE_URL (Object Storage & Realtime unconfigured)
    const healthRes = await fetch(`${base}/api/health`);
    const healthJson = await healthRes.json();
    if (healthRes.status !== 200 || !healthJson.ok) {
      throw new Error(`[${label}] /api/health failed (${healthRes.status}): ${JSON.stringify(healthJson)}`);
    }
    if (
      healthJson.services?.objectStorage?.configured !== false ||
      healthJson.services?.realtime?.configured !== false
    ) {
      throw new Error(`[${label}] Expected optional services unconfigured: ${JSON.stringify(healthJson)}`);
    }
    console.log(`  [${label}] /api/health -> HTTP 200 ok=true (optional services cleanly unconfigured)`);

    // 2. robots.txt + X-Robots-Tag + <meta name="robots"> + sitemap.xml
    const robotsRes = await fetch(`${base}/robots.txt`);
    const robotsTxt = await robotsRes.text();
    const homeRes = await fetch(`${base}/`);
    const homeHtml = await homeRes.text();
    const xRobots = homeRes.headers.get("x-robots-tag");
    const sitemapRes = await fetch(`${base}/sitemap.xml`);
    const sitemapXml = await sitemapRes.text();

    if (extraEnv.SITE_INDEXING === "on") {
      if (!robotsTxt.includes("Allow: /") || !robotsTxt.includes("Sitemap:")) {
        throw new Error(`[${label}] robots.txt unexpected for SITE_INDEXING=on:\n${robotsTxt}`);
      }
      if (xRobots && xRobots.includes("noindex")) {
        throw new Error(`[${label}] Unexpected X-Robots-Tag noindex on / when SITE_INDEXING=on`);
      }
      if (!sitemapXml.includes("/p/") || !sitemapXml.includes("/kits")) {
        throw new Error(`[${label}] sitemap.xml missing public/product URLs when SITE_INDEXING=on`);
      }
      console.log(`  [${label}] SITE_INDEXING=on: robots.txt Allow + Sitemap, / has no noindex, sitemap.xml lists public & /p/ URLs (PASS)`);
    } else {
      if (!robotsTxt.includes("Disallow: /")) {
        throw new Error(`[${label}] robots.txt did not Disallow: / when SITE_INDEXING=off:\n${robotsTxt}`);
      }
      if (xRobots !== "noindex, nofollow") {
        throw new Error(`[${label}] Missing X-Robots-Tag: noindex, nofollow on /, got: ${xRobots}`);
      }
      if (!homeHtml.includes('name="robots"') || !homeHtml.includes("noindex")) {
        throw new Error(`[${label}] Missing <meta name="robots" content="noindex, nofollow"> on /`);
      }
      if (sitemapXml.includes("/p/")) {
        throw new Error(`[${label}] sitemap.xml leaked product URLs when SITE_INDEXING=off`);
      }
      console.log(`  [${label}] SITE_INDEXING=off: robots.txt Disallow: /, X-Robots-Tag + meta noindex, empty sitemap.xml (PASS)`);
    }

    // 3. Key routes respond HTTP 200 under minimal 4-var env
    for (const p of ["/kits", "/calendar", "/students", "/about", "/watchlist", "/status"]) {
      const r = await fetch(`${base}${p}`);
      if (r.status !== 200) {
        throw new Error(`[${label}] ${p} failed with HTTP ${r.status}`);
      }
    }
    console.log(`  [${label}] All core routes (/kits, /calendar, /students, /about, /watchlist, /status) -> HTTP 200`);
  } catch (err) {
    if (stderrBuf) console.error("Server stderr:", stderrBuf.slice(0, 1000));
    throw err;
  } finally {
    child.kill();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL required in .env.local to run minimal production env check.");
  }
  await runCheckPass(3458, {}, "MINIMAL-4-VAR-INDEXING-OFF");
  await runCheckPass(3459, { SITE_INDEXING: "on" }, "MINIMAL-4-VAR-INDEXING-ON");
  console.log("ALL MINIMAL 4-VAR PRODUCTION ENV & SITE_INDEXING CHECKS PASSED!");
}

main().catch((err) => {
  console.error("Minimal prod verification failed:", err);
  process.exit(1);
});
