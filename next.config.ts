import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The self-host image sets JOBSMITH_STANDALONE=1 to get .next/standalone.
  // Without it nothing changes, so the Vercel build stays as it was.
  ...(process.env.JOBSMITH_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  // Files read at runtime by path, which the file tracer cannot see. Keys are
  // route globs; "/*" applies to every route. A pattern that matches nothing
  // yet is harmless.
  outputFileTracingIncludes: {
    "/*": [
      "./content/legal/**",
      "./lib/auth/disposable-domains.txt",
      "./lib/doc-export/fonts/**",
    ],
  },
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
    ];
  },
};

export default nextConfig;
