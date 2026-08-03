import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Event Register System 活動報名平台",
    short_name: "活動報名",
    description: "活動瀏覽、報名、QR Code 電子入場證及現場登記平台",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f5bd3",
    lang: "zh-HK",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
