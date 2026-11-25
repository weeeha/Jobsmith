import type { MetadataRoute } from "next";
import { THEME_COLOR_LIGHT } from "@/lib/pwa/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jobsmith",
    short_name: "Jobsmith",
    description: "Track a job search from saved to offer.",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR_LIGHT,
    theme_color: THEME_COLOR_LIGHT,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
