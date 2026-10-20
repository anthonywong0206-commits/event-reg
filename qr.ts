import QRCode from "qrcode";
import { appUrl } from "@/lib/env";

export function checkInUrl(token: string): string {
  return `${appUrl()}/check-in?token=${encodeURIComponent(token)}`;
}

export async function createQrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(checkInUrl(token), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
    color: {
      dark: "#102a43",
      light: "#ffffff",
    },
  });
}
