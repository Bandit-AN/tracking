import "server-only";

import { createNeonAuth } from "@neondatabase/auth/next/server";

const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;

if (!authBaseUrl || authBaseUrl === "[SENSITIVE]") {
  throw new Error("NEON_AUTH_BASE_URL is not configured.");
}

if (!cookieSecret || cookieSecret === "[SENSITIVE]" || cookieSecret.length < 32) {
  throw new Error("NEON_AUTH_COOKIE_SECRET must be at least 32 characters.");
}

export const auth = createNeonAuth({
  baseUrl: authBaseUrl,
  cookies: {
    secret: cookieSecret,
    sessionDataTtl: 300,
    sameSite: "strict",
  },
  logLevel: process.env.NODE_ENV === "production" ? "error" : "warn",
});
