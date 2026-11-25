import type { NextConfig } from "next";

// Computed once so the build id Next uses and the one the browser sends in
// /sw.js?build=<id> (NEXT_PUBLIC_BUILD_ID) are the same value.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  // turndown ships a browser build and linkedom an optional `canvas` require;
  // this makes Next require them at runtime instead of bundling them, so the
  // bundler never has to choose between turndown's builds or resolve an
  // optional native dependency linkedom does not actually need here.
  serverExternalPackages: ["linkedom", "turndown", "@mozilla/readability"],
  experimental: {
    serverActions: {
      // The default 1 MB would reject a document near the 1 MiB artifact
      // limit (MAX_ARTIFACT_BYTES, lib/bridge/wire.ts) once multipart
      // form-data overhead is added on top of the field's own bytes.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Blocks this app from being framed by any site at all, including
          // its own origin: there is no legitimate reason to embed it, and
          // this is the modern replacement for X-Frame-Options.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Sends the full URL as a referrer only on same-origin navigation;
          // cross-origin navigation gets the origin alone, and downgrading
          // to a plain HTTP destination gets nothing.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Stops a browser from guessing a response's type from its
          // content and executing it as something other than what the
          // Content-Type header says.
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        // The worker script itself: never served from the HTTP cache, so a
        // new build reaches the browser at its next update check. Listed after
        // /:path*, so these values win for the same key; the policy repeats
        // frame-ancestors 'none' because it replaces the global one.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
