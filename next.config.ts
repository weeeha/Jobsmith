import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
