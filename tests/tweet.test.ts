import { VedoTweetCard } from "../src/vedo/VedoTweetCard";

describe("VedoTweetCard Unit Tests", () => {
  it("should generate a valid PNG image buffer matching the Twitter card format", async () => {
    const buffer = await VedoTweetCard.generate({
      displayName: "Star Rexus",
      username: "allstarrexus.",
      text: "test tweet içeriği",
      timeStr: "09:36",
      dateStr: "25 Kas 2026"
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });
});
