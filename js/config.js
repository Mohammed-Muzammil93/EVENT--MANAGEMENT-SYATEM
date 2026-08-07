/**
 * ==========================================================================
 * GLOBAL APPLICATION ENVIRONMENT CONFIGURATION
 * ==========================================================================
 * Centralized environment variable reader and fallback manager.
 * Checks Vercel environment variables (VITE_API_URL, NEXT_PUBLIC_API_URL,
 * REACT_APP_API_URL, DATABASE_API_URL, VERCEL_API_URL, API_URL) and window configs.
 */

(function () {
  const globalObj = typeof window !== "undefined" ? window : globalThis;

  const envApiUrl = 
    globalObj.VITE_API_URL ||
    globalObj.NEXT_PUBLIC_API_URL ||
    globalObj.REACT_APP_API_URL ||
    globalObj.DATABASE_API_URL ||
    globalObj.VERCEL_API_URL ||
    globalObj.API_URL ||
    "";

  globalObj.APP_CONFIG = {
    API_URL: envApiUrl,
    SITE_URL: "https://event-management-system-chi-seven.vercel.app"
  };

  console.log("[Config] Loaded application configuration. Environment API_URL:", envApiUrl || "(not set in env)");
})();
