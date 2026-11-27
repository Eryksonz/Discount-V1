import { spawn } from "node:child_process";
import path from "node:path";

async function waitForServer(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const port = 3457;
  const nextBin = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    stdio: "pipe",
    env: {
      ...process.env,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 16
        ? process.env.ADMIN_PASSWORD
        : "SmokeTest-StrongAdminKey-2026!",
    },
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`);

    const checks: Array<{ path: string; check: (text: string, status: number) => void }> = [
      {
        path: "/api/health",
        check: (t, s) => {
          if (s !== 200 || !JSON.parse(t).ok) throw new Error(`/api/health failed (${s})`);
        },
      },
      {
        path: "/calendar",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Typical timing, not confirmed")) {
            throw new Error(`/calendar missing honest 'Typical timing, not confirmed' label (${s})`);
          }
          console.log("  /calendar: contains 'Typical timing, not confirmed' (PASS)");
        },
      },
      {
        path: "/students",
        check: (t, s) => {
          if (
            s !== 200 ||
            !t.includes("Check the Brand") ||
            !t.includes("Verified Student Offers")
          ) {
            throw new Error(`/students missing honest Verified vs Check-the-brand sections (${s})`);
          }
          console.log("  /students: honest Verified vs Check-the-brand sections rendered (PASS)");
        },
      },
      {
        path: "/status",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Admin Authentication Required")) {
            throw new Error(`/status did not gate unauthenticated visitor (${s})`);
          }
          console.log("  /status (unauthenticated): gated behind admin login (PASS)");
        },
      },
      {
        path: "/api/admin/status",
        check: (_t, s) => {
          if (s !== 401) throw new Error(`/api/admin/status expected 401, got ${s}`);
          console.log("  /api/admin/status (unauthenticated): HTTP 401 (PASS)");
        },
      },
      {
        path: "/kits",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Dress Shoes") || !t.includes("Dress Belt")) {
            throw new Error(`/kits missing split Dress Shoes / Dress Belt slots (${s})`);
          }
        },
      },
      {
        path: "/api/kits?tier=student",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=student failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalSlots !== 6 || j.requiredTotalCount !== 5) {
            throw new Error(`Expected 6 total / 5 required slots, got ${j.totalSlots}/${j.requiredTotalCount}`);
          }
          if (j.totalPriceCents > 45000) throw new Error(`Student kit exceeded $450 cap`);
          console.log(
            `  /api/kits?tier=student:   req=${j.requiredFilledCount}/${j.requiredTotalCount} total=${j.filledCount}/${j.totalSlots} cost=$${(j.totalPriceCents / 100).toFixed(2)} brands=${JSON.stringify(j.brandCounts)}`
          );
        },
      },
      {
        path: "/api/kits?tier=intern",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=intern failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalPriceCents > 85000) throw new Error(`Intern kit exceeded $850 cap`);
          console.log(
            `  /api/kits?tier=intern:    req=${j.requiredFilledCount}/${j.requiredTotalCount} total=${j.filledCount}/${j.totalSlots} cost=$${(j.totalPriceCents / 100).toFixed(2)} brands=${JSON.stringify(j.brandCounts)}`
          );
        },
      },
      {
        path: "/api/kits?tier=full_time",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=full_time failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalPriceCents > 150000) throw new Error(`Full-time kit exceeded $1500 cap`);
          console.log(
            `  /api/kits?tier=full_time: req=${j.requiredFilledCount}/${j.requiredTotalCount} total=${j.filledCount}/${j.totalSlots} cost=$${(j.totalPriceCents / 100).toFixed(2)} brands=${JSON.stringify(j.brandCounts)}`
          );
        },
      },
      {
        path: "/about",
        check: (t, s) => {
          if (
            s !== 200 ||
            !t.includes("This site has no affiliate links and earns no revenue") ||
            !t.includes("Brands Not Tracked Yet") ||
            !t.includes("Peter Millar")
          ) {
            throw new Error(`/about missing non-commercial notice or Peter Millar untracked section (${s})`);
          }
          console.log("  /about: non-commercial notice + Brands Not Tracked Yet (Peter Millar) (PASS)");
        },
      },
      {
        path: "/watchlist",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Saved Watchlist")) {
            throw new Error(`/watchlist failed (${s})`);
          }
          console.log("  /watchlist: local target watchlist rendered (PASS)");
        },
      },
      {
        path: "/api/products?brands=peter-millar",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/products?brands=peter-millar failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalMatched !== 0) throw new Error(`Peter Millar leaked ${j.totalMatched} items`);
          console.log("  /api/products?brands=peter-millar: totalMatched=0 (PASS)");
        },
      },
    ];

    for (const c of checks) {
      const resp = await fetch(`${base}${c.path}`);
      const text = await resp.text();
      c.check(text, resp.status);
    }

    // Confirm POST /api/alerts returns 503 when ALERTS_MODE=local (default)
    const alertResp = await fetch(`${base}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", productId: "x", targetPriceDollars: 50 }),
    });
    if (alertResp.status !== 503) {
      throw new Error(`Expected POST /api/alerts to return 503 in local mode, got ${alertResp.status}`);
    }
    console.log("  POST /api/alerts (ALERTS_MODE=local): HTTP 503 disabled (PASS)");

    console.log("ALL HARDENING, HONEST LABELING, KIT ENGINE & STATUS CHECKS PASSED!");
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
