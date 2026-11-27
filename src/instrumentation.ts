/**
 * Next.js server startup hook: fails fast in production on the Node.js runtime if required
 * security config (such as a strong ADMIN_PASSWORD) is missing or weak.
 * Uses a dynamic import inside the nodejs runtime guard so Edge middleware compilation stays clean.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionSecurityConfig } = await import("@/lib/admin/auth");
    validateProductionSecurityConfig(process.env);
  }
}
