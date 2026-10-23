import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host;
  } catch {
    return "";
  }
})();

const connectSrc = [
  "'self'",
  supabaseHost && `https://${supabaseHost}`,
  "blob:",
  "data:",
].filter(Boolean);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js injects inline styles/scripts (hydration + Turbopack HMR);
              // styles also carry the Apple chromatic gradients.
              `script-src 'self' 'unsafe-inline' 'unsafe-eval'${supabaseHost ? ` https://${supabaseHost}` : ""}`,
              "style-src 'self' 'unsafe-inline'",
              `img-src 'self' data: blob:${supabaseHost ? ` https://${supabaseHost}` : ""}`,
              `connect-src ${connectSrc.join(" ")}`,
              "font-src 'self' data:",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
