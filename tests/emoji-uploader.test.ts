import zlib from "zlib";
import { Attachment, Guild, GuildPremiumTier, MessageFlags } from "discord.js";
import { VedoEmojiUploader } from "../src/vedo/VedoEmojiUploader";

const SAMPLE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

const SAMPLE_GIF = Buffer.from(
  "4749463839610100010000000021f90401000000002c00000000010001000002024401003b",
  "hex"
);

function createTestZip(
  entries: Array<{ name: string; data: Buffer; compress?: boolean }>
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const useDeflate = Boolean(entry.compress);
    const payload = useDeflate ? zlib.deflateRawSync(entry.data) : entry.data;
    const method = useDeflate ? 8 : 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

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

  it("should resolve duplicate querencia names sequentially", () => {
    const used = new Set<string>(["logo"]);

    expect(VedoEmojiUploader.resolveUniqueName("LOGO", used)).toBe("LOGO_2");
    expect(VedoEmojiUploader.resolveUniqueName("logo", used)).toBe("logo_3");

    const querenciaUsed = new Set<string>();
    expect(VedoEmojiUploader.resolveUniqueName("querencia", querenciaUsed)).toBe("querencia");
    expect(VedoEmojiUploader.resolveUniqueName("querencia", querenciaUsed)).toBe("querencia_2");
    expect(VedoEmojiUploader.resolveUniqueName("querencia", querenciaUsed)).toBe("querencia_3");

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

  it("should extract Store and Deflate images from ZIP with querencia default names and filter junk", () => {
    const zipBuffer = createTestZip([
      { name: "alt-klasor/", data: Buffer.alloc(0) },
      { name: "alt-klasor/bir.png", data: SAMPLE_PNG, compress: false },
      { name: "iki.gif", data: SAMPLE_GIF, compress: true },
      { name: "__MACOSX/._junk.png", data: SAMPLE_PNG, compress: true },
      { name: ".DS_Store", data: Buffer.from("junk"), compress: false },
      { name: "readme.txt", data: Buffer.from("hello"), compress: false }
    ]);

    const extracted = VedoEmojiUploader.extractImagesFromZip(zipBuffer);
    expect(extracted.items.length).toBe(2);
    expect(extracted.truncatedCount).toBe(0);
    expect(extracted.skippedNonImages).toBe(3);

    expect(extracted.items[0].name).toBe("querencia");
    expect(extracted.items[0].animated).toBe(false);
    expect(Buffer.isBuffer(extracted.items[0].buffer)).toBe(true);
    expect(extracted.items[0].buffer!.equals(SAMPLE_PNG)).toBe(true);

    expect(extracted.items[1].name).toBe("querencia");
    expect(extracted.items[1].animated).toBe(true);
    expect(extracted.items[1].buffer!.equals(SAMPLE_GIF)).toBe(true);
  });

  it("should cap ZIP extraction at MAX_BATCH_SIZE 50", () => {
    const manyEntries = Array.from({ length: 55 }, (_, i) => ({
      name: `emoji_${i}.png`,
      data: SAMPLE_PNG,
      compress: i % 2 === 0
    }));
    const zipBuffer = createTestZip(manyEntries);

    const extracted = VedoEmojiUploader.extractImagesFromZip(zipBuffer);
    expect(extracted.items.length).toBe(50);
    expect(extracted.truncatedCount).toBe(5);
    expect(extracted.items.every((item) => item.name === "querencia")).toBe(true);
  });

  it("should reject RAR buffers and RAR attachments cleanly", async () => {
    const rarBuffer = Buffer.from("526172211a0700", "hex");
    expect(() => VedoEmojiUploader.extractImagesFromZip(rarBuffer)).toThrow(/RAR.*\.zip/i);

    const rarAttachment = {
      url: "https://cdn.discordapp.com/attachments/1/2/emojiler.rar",
      name: "emojiler.rar",
      contentType: "application/x-rar-compressed",
      size: 1024
    } as Attachment;

    await expect(VedoEmojiUploader.parseAttachmentFile(rarAttachment)).rejects.toThrow(/RAR.*\.zip/i);
  });

  it("should upload Buffer-backed candidates sequentially as querencia and querencia_2 without fetch", async () => {
    const createdNames: string[] = [];
    let nextEmojiId = 1001;
    const mockGuild = {
      premiumTier: GuildPremiumTier.None,
      emojis: {
        fetch: jest.fn().mockResolvedValue(new Map()),
        create: jest.fn().mockImplementation(async ({ name }: { name: string }) => {
          createdNames.push(name);
          const id = String(nextEmojiId++);
          return {
            name,
            id,
            animated: false,
            toString: () => `<:${name}:${id}>`
          };
        })
      }
    } as unknown as Guild;

    const fetchSpy = jest.spyOn(global, "fetch");
    try {
      const result = await VedoEmojiUploader.uploadBatch(
        mockGuild,
        [
          { name: "querencia", buffer: SAMPLE_PNG, animated: false },
          { name: "querencia", buffer: SAMPLE_PNG, animated: false }
        ],
        0
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.succeeded.length).toBe(2);
      expect(result.failed.length).toBe(0);
      expect(createdNames).toEqual(["querencia", "querencia_2"]);
      expect(result.succeeded.map((e) => e.name)).toEqual(["querencia", "querencia_2"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("should build a valid Components V2 summary container without embeds", async () => {
    const container = await VedoEmojiUploader.buildResultContainer(null, {
      succeeded: [
        { name: "querencia", id: "111", animated: false, tag: "<:querencia:111>" },
        { name: "querencia_2", id: "222", animated: true, tag: "<a:querencia_2:222>" }
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
    expect(serialized).toContain("<:querencia:111>");
    expect(serialized).toContain("<a:querencia_2:222>");
    expect(serialized).toContain("bozuk");
    expect(serialized).toContain("Made by Noz");
  });
});
