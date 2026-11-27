import { validateProductionSecurityConfig } from "@/lib/admin/auth";

/**
 * Next.js server startup hook: fails fast in production if required security config
 * (such as a strong ADMIN_PASSWORD) is missing or weak.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || !process.env.NEXT_RUNTIME) {
    validateProductionSecurityConfig(process.env);
  }
}
