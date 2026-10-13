import QRCode from "qrcode";

/** Draws a QR code as an inline SVG string, entirely on the server (the secret is never sent to a third party). */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
