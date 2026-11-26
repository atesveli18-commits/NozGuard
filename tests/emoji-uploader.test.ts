import { Attachment, GuildPremiumTier, MessageFlags } from "discord.js";
import { VedoEmojiUploader } from "../src/vedo/VedoEmojiUploader";

describe("VedoEmojiUploader Unit Tests", () => {
  it("should transliterate Turkish characters and enforce Discord emoji name bounds", () => {
    expect(VedoEmojiUploader.sanitizeEmojiName("Mülakat Onay!", 1)).toBe("Mulakat_Onay");
    expect(VedoEmojiUploader.sanitizeEmojiName("Şanlı_Gün_Özel_Çalışma", 2)).toBe("Sanli_Gun_Ozel_Calisma");
    expect(VedoEmojiUploader.sanitizeEmojiName("a", 5)).toBe("emoji_5");
    expect(VedoEmojiUploader.sanitizeEmojiName("___", 9)).toBe("emoji_9");

    const veryLong = "cok_uzun_bir_emoji_ismi_test_karakter_siniri_kontrolu";
    const cleaned = VedoEmojiUploader.sanitizeEmojiName(veryLong, 1);
    expect(cleaned.length).toBeLessThanOrEqual(32);
  });

  it("should resolve duplicate names sequentially with _2, _3 case-insensitively", () => {
    const used = new Set<string>(["logo"]);

    expect(VedoEmojiUploader.resolveUniqueName("LOGO", used)).toBe("LOGO_2");
    expect(VedoEmojiUploader.resolveUniqueName("logo", used)).toBe("logo_3");

    const longName = "a".repeat(32);
    const maxLenSet = new Set<string>([longName.toLowerCase()]);
    const suffixed = VedoEmojiUploader.resolveUniqueName(longName, maxLenSet);
    expect(suffixed.length).toBeLessThanOrEqual(32);
    expect(suffixed.endsWith("_2")).toBe(true);
  });

  it("should validate external URLs and block SSRF targets", () => {
    expect(VedoEmojiUploader.isSafeExternalUrl("https://cdn.discordapp.com/emojis/123456.png")).toBe(true);
    expect(VedoEmojiUploader.isSafeExternalUrl("http://localhost:3000/test.png")).toBe(false);
    expect(VedoEmojiUploader.isSafeExternalUrl("http://127.0.0.1/test.png")).toBe(false);
    expect(VedoEmojiUploader.isSafeExternalUrl("http://192.168.1.10/a.png")).toBe(false);
    expect(VedoEmojiUploader.isSafeExternalUrl("http://10.0.0.5/a.png")).toBe(false);
    expect(VedoEmojiUploader.isSafeExternalUrl("http://172.16.5.4/a.png")).toBe(false);
    expect(VedoEmojiUploader.isSafeExternalUrl("file:///etc/passwd")).toBe(false);
  });

  it("should map GuildPremiumTier values to accurate Discord emoji slot limits", () => {
    expect(VedoEmojiUploader.getGuildEmojiLimit(GuildPremiumTier.None)).toBe(50);
    expect(VedoEmojiUploader.getGuildEmojiLimit(GuildPremiumTier.Tier1)).toBe(100);
    expect(VedoEmojiUploader.getGuildEmojiLimit(GuildPremiumTier.Tier2)).toBe(150);
    expect(VedoEmojiUploader.getGuildEmojiLimit(GuildPremiumTier.Tier3)).toBe(250);
  });

  it("should parse custom emojis, external URLs, and attachments while capping at MAX_BATCH_SIZE", () => {
    const raw =
      "<:onay:111111111111111111> <a:ates:222222222222222222> <:onay:111111111111111111> https://example.com/ikon.png http://127.0.0.1/bad.png";
    const mockAttachment = {
      url: "https://cdn.discordapp.com/attachments/1/2/kalkan.webp",
      name: "kalkan.webp",
      contentType: "image/webp"
    } as Attachment;

    const parsed = VedoEmojiUploader.parseInputs(raw, [mockAttachment]);
    expect(parsed.items.length).toBe(4);
    expect(parsed.skippedInvalidUrls).toBe(1);
    expect(parsed.truncatedCount).toBe(0);
    expect(parsed.items[0]).toEqual({
      name: "onay",
      url: "https://cdn.discordapp.com/emojis/111111111111111111.png?size=128&quality=lossless",
      animated: false
    });
    expect(parsed.items[1]).toEqual({
      name: "ates",
      url: "https://cdn.discordapp.com/emojis/222222222222222222.gif?size=128&quality=lossless",
      animated: true
    });
    expect(parsed.items[2].name).toBe("ikon");
    expect(parsed.items[3].name).toBe("kalkan");

    const manyEmojis = Array.from({ length: 35 }, (_, i) => {
      const id = `15748314853855724${String(10 + i)}`;
      return `<:e${i}:${id}>`;
    }).join(" ");
    const capped = VedoEmojiUploader.parseInputs(manyEmojis, []);
    expect(capped.items.length).toBe(30);
    expect(capped.truncatedCount).toBe(5);
  });

  it("should build a valid Components V2 summary container without embeds", async () => {
    const container = await VedoEmojiUploader.buildResultContainer(null, {
      succeeded: [
        { name: "onay", id: "111", animated: false, tag: "<:onay:111>" },
        { name: "ates", id: "222", animated: true, tag: "<a:ates:222>" }
      ],
      failed: [{ name: "bozuk", reason: "Görsel indirilemedi (HTTP 404)" }],
      truncatedCount: 0,
      maxLimit: 50,
      staticUsed: 12,
      animatedUsed: 4,
      durationMs: 1450
    });

    const reply = container.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const mediaGallery = containerJson.components.find((c: any) => c.type === 12);
    const serialized = JSON.stringify(containerJson);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(reply.files).toBeDefined();
    expect(reply.files![0].name).toBe("vedo-emoji-sonuc.png");
    expect(containerJson.type).toBe(17);
    expect(mediaGallery).toBeDefined();
    expect(serialized).toContain("<:onay:111>");
    expect(serialized).toContain("<a:ates:222>");
    expect(serialized).toContain("bozuk");
    expect(serialized).toContain("Made by Noz");
  });
});
