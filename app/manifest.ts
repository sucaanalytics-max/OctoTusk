import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next auto-injects the <link rel="manifest"> tag.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OctoTusk — Tusk Invest",
    short_name: "OctoTusk",
    description: "Tusk Invest Portfolio Intelligence",
    start_url: "/dashboard", // auth-gated: an unauthenticated launch redirects to sign-in
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0F1117",
    theme_color: "#0F1117",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
