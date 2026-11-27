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
    env: { ...process.env },
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`);

    const checks: Array<{ path: string; check: (text: string, status: number) => void }> = [
      {
        path: "/api/health",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/health status ${s}`);
          const j = JSON.parse(t);
          if (!j.ok) throw new Error(`/api/health not ok`);
        },
      },
      {
        path: "/calendar",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Menswear Sale Calendar")) {
            throw new Error(`/calendar failed (${s})`);
          }
        },
      },
      {
        path: "/students",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Student Discounts Directory") || !t.includes("SheerID")) {
            throw new Error(`/students failed (${s})`);
          }
        },
      },
      {
        path: "/kits",
        check: (t, s) => {
          if (s !== 200 || !t.includes("Interview &amp; Internship Kits")) {
            throw new Error(`/kits failed (${s})`);
          }
        },
      },
      {
        path: "/api/kits?tier=student",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=student failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalPriceCents > 45000) throw new Error(`Student kit exceeded $450 cap`);
          console.log(`  /api/kits?tier=student: filled=${j.filledCount}/${j.totalSlots} total=$${(j.totalPriceCents / 100).toFixed(2)} avgScore=${j.averageDealScore} brands=${JSON.stringify(j.brandCounts)}`);
        },
      },
      {
        path: "/api/kits?tier=intern",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=intern failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalPriceCents > 85000) throw new Error(`Intern kit exceeded $850 cap`);
          for (const cnt of Object.values(j.brandCounts) as number[]) {
            if (cnt > 2) throw new Error(`Brand cap exceeded (>2)`);
          }
          console.log(`  /api/kits?tier=intern:  filled=${j.filledCount}/${j.totalSlots} total=$${(j.totalPriceCents / 100).toFixed(2)} avgScore=${j.averageDealScore} brands=${JSON.stringify(j.brandCounts)}`);
        },
      },
      {
        path: "/api/kits?tier=full_time",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/kits?tier=full_time failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalPriceCents > 150000) throw new Error(`Full-time kit exceeded $1500 cap`);
          console.log(`  /api/kits?tier=full_time: filled=${j.filledCount}/${j.totalSlots} total=$${(j.totalPriceCents / 100).toFixed(2)} avgScore=${j.averageDealScore} brands=${JSON.stringify(j.brandCounts)}`);
        },
      },
      {
        path: "/api/products?brands=peter-millar",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/products?brands=peter-millar failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalMatched !== 0) throw new Error(`Peter Millar feed_pending leaked ${j.totalMatched} items`);
          const pmStrip = j.brandStrip.find((b: any) => b.slug === "peter-millar");
          if (pmStrip?.ingestionStatus !== "feed_pending") {
            throw new Error(`Peter Millar brandStrip missing feed_pending status`);
          }
          console.log(`  /api/products?brands=peter-millar: totalMatched=0, status=${pmStrip.ingestionStatus} (PASS)`);
        },
      },
      {
        path: "/api/products?brands=brooks-brothers",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/products?brands=brooks-brothers failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalMatched < 10) throw new Error(`Expected BB pilot products, got ${j.totalMatched}`);
          console.log(`  /api/products?brands=brooks-brothers: totalMatched=${j.totalMatched} (PASS)`);
        },
      },
      {
        path: "/api/products?brands=vineyard-vines",
        check: (t, s) => {
          if (s !== 200) throw new Error(`/api/products?brands=vineyard-vines failed (${s})`);
          const j = JSON.parse(t);
          if (j.totalMatched < 10) throw new Error(`Expected VV pilot products, got ${j.totalMatched}`);
          console.log(`  /api/products?brands=vineyard-vines: totalMatched=${j.totalMatched} (PASS)`);
        },
      },
    ];

    for (const c of checks) {
      const resp = await fetch(`${base}${c.path}`);
      const text = await resp.text();
      c.check(text, resp.status);
    }

    console.log("ALL PHASE 4 + BB/VV + PETER MILLAR SMOKE CHECKS PASSED!");
  } finally {
    child.kill();
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
