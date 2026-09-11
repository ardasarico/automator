import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QrCode } from "./qr-code";

describe("QrCode", () => {
  test("draws a value that fits", () => {
    const html = renderToStaticMarkup(<QrCode value="ticket-1" label="QR code: ticket-1" />);
    expect(html).toContain("<svg");
    expect(html).toContain('aria-label="QR code: ticket-1"');
  });

  test("says why when the value cannot be encoded instead of leaving an empty square", () => {
    const html = renderToStaticMarkup(<QrCode value={"x".repeat(5000)} label="QR code" />);
    expect(html).not.toContain("<svg");
    expect(html).toContain("This value is too long for a QR code.");
  });
});
