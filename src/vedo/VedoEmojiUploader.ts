import {
  Attachment,
  Guild,
  GuildPremiumTier
} from "discord.js";
import zlib from "zlib";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoThemeCard } from "./VedoThemeCard";

export interface IVedoEmojiCandidate {
  name: string;
  animated: boolean;
  url?: string;
  buffer?: Buffer;
}

export interface IVedoEmojiExtractResult {
  items: IVedoEmojiCandidate[];
  truncatedCount: number;
  skippedNonImages: number;
}

export interface IVedoEmojiUploadSuccess {
  name: string;
  id: string;
  animated: boolean;
  tag: string;
}

export interface IVedoEmojiUploadFailure {
  name: string;
  reason: string;
}

export interface IVedoEmojiBatchResult {
  succeeded: IVedoEmojiUploadSuccess[];
  failed: IVedoEmojiUploadFailure[];
  truncatedCount: number;
  maxLimit: number;
  staticUsed: number;
  animatedUsed: number;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPrivateIpv4(host: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) {
    return false;
  }
  const a = Number(match[1]);
  const b = Number(match[2]);
  const c = Number(match[3]);
  const d = Number(match[4]);
  if (a > 255 || b > 255 || c > 255 || d > 255) {
    return true;
  }
  if (a === 127 || a === 10 || a === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  return false;
}

async function resizeStaticEmoji(buffer: Buffer, targetSize: number): Promise<Buffer> {
  const img = await loadImage(buffer);
  const canvas = createCanvas(targetSize, targetSize);
  const ctx = canvas.getContext("2d");
  const scale = Math.min(targetSize / img.width, targetSize / img.height);
  const drawW = Math.max(1, Math.round(img.width * scale));
  const drawH = Math.max(1, Math.round(img.height * scale));
  const offsetX = Math.floor((targetSize - drawW) / 2);
  const offsetY = Math.floor((targetSize - drawH) / 2);
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  return canvas.toBuffer("image/png");
}

function isGifMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  );
}

function isValidImageBuffer(buffer: Buffer): boolean {
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  if (isGifMagic(buffer)) {
    return true;
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }
  return false;
}

function isZipMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06))
  );
}

function isRarMagic(buffer: Buffer): boolean {
  return (
    buffer.length >= 6 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x61 &&
    buffer[2] === 0x72 &&
    buffer[3] === 0x21 &&
    buffer[4] === 0x1a &&
    buffer[5] === 0x07
  );
}

function findZipEocdOffset(buffer: Buffer): number {
  if (buffer.length < 22) {
    return -1;
  }
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      const commentLen = buffer.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buffer.length) {
        return i;
      }
    }
  }
  return -1;
}

function formatUploadError(error: any): string {
  const code = error?.code;
  const rawMessage = String(error?.message || "Bilinmeyen hata");
  if (code === 30008) {
    return "Sunucu emoji kapasitesi dolu";
  }
  if (code === 50013) {
    return "İfadeleri Yönet yetkisi eksik";
  }
  if (code === 50035 && rawMessage.toLowerCase().includes("name")) {
    return "Geçersiz emoji ismi";
  }
  if (rawMessage.toLowerCase().includes("timeout") || error?.name === "TimeoutError") {
    return "Görsel indirme zaman aşımına uğradı";
  }
  return rawMessage.length > 70 ? `${rawMessage.slice(0, 67)}...` : rawMessage;
}

export class VedoEmojiUploader {
  public static readonly DEFAULT_EMOJI_NAME = "querencia";
  public static readonly MAX_BATCH_SIZE = 50;
  public static readonly MAX_EMOJI_BYTES = 256 * 1024;
  public static readonly MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
  public static readonly MAX_ARCHIVE_DOWNLOAD_BYTES = 25 * 1024 * 1024;
  public static readonly MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
  public static readonly MAX_ZIP_TOTAL_BYTES = 60 * 1024 * 1024;

  public static isSafeExternalUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return false;
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
        return false;
      }
      if (
        host === "::1" ||
        host === "::" ||
        host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80:") ||
        host.startsWith("::ffff:")
      ) {
        return false;
      }
      if (isPrivateIpv4(host)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  public static sanitizeEmojiName(raw: string, fallbackIndex: number): string {
    const trMap: Record<string, string> = {
      "ğ": "g",
      "Ğ": "G",
      "ü": "u",
      "Ü": "U",
      "ş": "s",
      "Ş": "S",
      "ı": "i",
      "İ": "I",
      "ö": "o",
      "Ö": "O",
      "ç": "c",
      "Ç": "C"
    };

    const transliterated = raw.replace(/[ğĞüÜşŞıİöÖçÇ]/g, (ch) => trMap[ch] || ch);
    const cleaned = transliterated
      .replace(/[^a-zA-Z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    if (cleaned.length < 2) {
      return `emoji_${fallbackIndex}`;
    }

    return cleaned.slice(0, 32);
  }

  public static resolveUniqueName(baseName: string, usedNamesLower: Set<string>): string {
    const cleanBase = baseName.slice(0, 32);
    if (!usedNamesLower.has(cleanBase.toLowerCase())) {
      usedNamesLower.add(cleanBase.toLowerCase());
      return cleanBase;
    }

    let suffixNum = 2;
    while (suffixNum < 10000) {
      const suffix = `_${suffixNum}`;
      const maxBaseLen = Math.max(1, 32 - suffix.length);
      const candidate = `${cleanBase.slice(0, maxBaseLen)}${suffix}`;
      if (!usedNamesLower.has(candidate.toLowerCase())) {
        usedNamesLower.add(candidate.toLowerCase());
        return candidate;
      }
      suffixNum += 1;
    }

    const fallback = `emoji_${Date.now().toString().slice(-6)}`;
    usedNamesLower.add(fallback.toLowerCase());
    return fallback;
  }

  public static getGuildEmojiLimit(tier: GuildPremiumTier): number {
    if (tier === GuildPremiumTier.Tier3) return 250;
    if (tier === GuildPremiumTier.Tier2) return 150;
    if (tier === GuildPremiumTier.Tier1) return 100;
    return 50;
  }

  public static extractImagesFromZip(
    zipBuffer: Buffer,
    baseName: string = VedoEmojiUploader.DEFAULT_EMOJI_NAME
  ): IVedoEmojiExtractResult {
    if (isRarMagic(zipBuffer)) {
      throw new Error("RAR arşivi desteklenmiyor. Lütfen klasörü .zip olarak sıkıştırıp tekrar yükleyin.");
    }

    const eocdOffset = findZipEocdOffset(zipBuffer);
    if (eocdOffset < 0) {
      throw new Error("Geçersiz veya bozuk ZIP arşivi.");
    }

    const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
    const centralDirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
    const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

    if (
      totalEntries === 0xffff ||
      centralDirOffset === 0xffffffff ||
      centralDirOffset + centralDirSize > zipBuffer.length
    ) {
      throw new Error("ZIP arşivi okunamadı veya desteklenmeyen ZIP64 formatında.");
    }

    const cleanBaseName = this.sanitizeEmojiName(baseName || this.DEFAULT_EMOJI_NAME, 1);
    const items: IVedoEmojiCandidate[] = [];
    let truncatedCount = 0;
    let skippedNonImages = 0;
    let totalUncompressedBytes = 0;
    let cdOffset = centralDirOffset;

    for (let entryIdx = 0; entryIdx < totalEntries; entryIdx += 1) {
      if (cdOffset + 46 > zipBuffer.length || zipBuffer.readUInt32LE(cdOffset) !== 0x02014b50) {
        throw new Error("ZIP merkezi dizin yapısı okunamadı.");
      }

      const generalPurposeFlag = zipBuffer.readUInt16LE(cdOffset + 8);
      const compressionMethod = zipBuffer.readUInt16LE(cdOffset + 10);
      const compressedSize = zipBuffer.readUInt32LE(cdOffset + 20);
      const uncompressedSize = zipBuffer.readUInt32LE(cdOffset + 24);
      const fileNameLength = zipBuffer.readUInt16LE(cdOffset + 28);
      const extraFieldLength = zipBuffer.readUInt16LE(cdOffset + 30);
      const fileCommentLength = zipBuffer.readUInt16LE(cdOffset + 32);
      const localHeaderOffset = zipBuffer.readUInt32LE(cdOffset + 42);

      const nameStart = cdOffset + 46;
      const nextCdOffset = nameStart + fileNameLength + extraFieldLength + fileCommentLength;
      if (nextCdOffset > zipBuffer.length) {
        throw new Error("ZIP dosya başlık sınırları bozuk.");
      }
      cdOffset = nextCdOffset;

      const rawEntryPath = zipBuffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
      const normalizedPath = rawEntryPath.replace(/\\/g, "/");
      if (normalizedPath.endsWith("/")) {
        continue;
      }

      const segments = normalizedPath.split("/").filter((seg) => seg.length > 0);
      const baseFileName = segments[segments.length - 1] || "";
      if (segments.includes("__MACOSX") || !baseFileName || baseFileName.startsWith(".")) {
        skippedNonImages += 1;
        continue;
      }

      if (!/\.(png|jpe?g|webp|gif)$/i.test(baseFileName)) {
        skippedNonImages += 1;
        continue;
      }

      if ((generalPurposeFlag & 0x0001) !== 0) {
        throw new Error("Şifreli ZIP dosyaları açılamaz. Lütfen şifresiz bir .zip arşivi yükleyin.");
      }

      if (compressionMethod !== 0 && compressionMethod !== 8) {
        skippedNonImages += 1;
        continue;
      }

      if (items.length >= this.MAX_BATCH_SIZE) {
        truncatedCount += 1;
        continue;
      }

      if (
        uncompressedSize > this.MAX_ZIP_ENTRY_BYTES ||
        compressedSize > zipBuffer.length
      ) {
        skippedNonImages += 1;
        continue;
      }

      if (
        localHeaderOffset + 30 > zipBuffer.length ||
        zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50
      ) {
        throw new Error("ZIP yerel dosya başlığı okunamadı.");
      }

      const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > zipBuffer.length) {
        throw new Error("ZIP veri bloğu bozuk veya eksik.");
      }

      let rawData: Buffer;
      if (compressionMethod === 0) {
        rawData = Buffer.from(zipBuffer.subarray(dataStart, dataEnd));
      } else {
        try {
          rawData = zlib.inflateRawSync(zipBuffer.subarray(dataStart, dataEnd), {
            maxOutputLength: this.MAX_ZIP_ENTRY_BYTES
          });
        } catch (inflateErr: any) {
          if (
            inflateErr?.code === "ERR_BUFFER_TOO_LARGE" ||
            String(inflateErr?.message || "").toLowerCase().includes("maxoutputlength") ||
            String(inflateErr?.message || "").toLowerCase().includes("buffer")
          ) {
            throw new Error("ZIP içindeki bir dosya 10 MB güvenlik sınırını aşıyor.");
          }
          skippedNonImages += 1;
          continue;
        }
      }

      totalUncompressedBytes += rawData.length;
      if (totalUncompressedBytes > this.MAX_ZIP_TOTAL_BYTES) {
        throw new Error("ZIP arşivi açıldığında izin verilen 60 MB güvenlik sınırını aşıyor.");
      }

      if (rawData.length === 0 || !isValidImageBuffer(rawData)) {
        skippedNonImages += 1;
        continue;
      }

      items.push({
        name: cleanBaseName,
        buffer: rawData,
        animated: isGifMagic(rawData) || /\.gif$/i.test(baseFileName)
      });
    }

    return { items, truncatedCount, skippedNonImages };
  }

  public static async parseAttachmentFile(
    attachment: Attachment,
    baseName: string = VedoEmojiUploader.DEFAULT_EMOJI_NAME
  ): Promise<IVedoEmojiExtractResult> {
    if (!this.isSafeExternalUrl(attachment.url)) {
      throw new Error("Geçersiz veya güvensiz dosya bağlantısı.");
    }

    const fileName = attachment.name || "dosya";
    const contentType = (attachment.contentType || "").toLowerCase();

    if (/\.rar$/i.test(fileName)) {
      throw new Error("RAR arşivi desteklenmiyor. Lütfen klasörü .zip olarak sıkıştırıp tekrar yükleyin.");
    }
    if (/\.7z$/i.test(fileName)) {
      throw new Error("7z arşivi desteklenmiyor. Lütfen klasörü .zip olarak sıkıştırıp tekrar yükleyin.");
    }

    if (typeof attachment.size === "number" && attachment.size > this.MAX_ARCHIVE_DOWNLOAD_BYTES) {
      throw new Error("Dosya boyutu 25 MB sınırını aşıyor.");
    }

    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`Dosya indirilemedi (HTTP ${response.status})`);
    }
    if (response.url && !this.isSafeExternalUrl(response.url)) {
      throw new Error("Yönlendirilen URL güvenlik politikasını ihlal ediyor");
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > this.MAX_ARCHIVE_DOWNLOAD_BYTES) {
      throw new Error("Dosya boyutu 25 MB sınırını aşıyor.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Boş dosya yüklendi.");
    }
    if (buffer.length > this.MAX_ARCHIVE_DOWNLOAD_BYTES) {
      throw new Error("Dosya boyutu 25 MB sınırını aşıyor.");
    }

    if (isRarMagic(buffer)) {
      throw new Error("RAR arşivi desteklenmiyor. Lütfen klasörü .zip olarak sıkıştırıp tekrar yükleyin.");
    }

    if (isZipMagic(buffer) || /\.zip$/i.test(fileName) || contentType.includes("zip")) {
      return this.extractImagesFromZip(buffer, baseName);
    }

    if (isValidImageBuffer(buffer)) {
      return {
        items: [
          {
            name: this.sanitizeEmojiName(baseName || this.DEFAULT_EMOJI_NAME, 1),
            buffer,
            animated: isGifMagic(buffer) || /\.gif$/i.test(fileName)
          }
        ],
        truncatedCount: 0,
        skippedNonImages: 0
      };
    }

    throw new Error(
      "Desteklenmeyen dosya formatı. Lütfen içinde emojiler bulunan bir .zip arşivi veya görsel (PNG/JPG/WEBP/GIF) seçin."
    );
  }

  public static async optimizeImageBuffer(
    buffer: Buffer,
    hintedAnimated: boolean,
    contentType: string = ""
  ): Promise<{ buffer: Buffer; animated: boolean }> {
    const normalizedType = contentType.toLowerCase();
    const isAnimated =
      isGifMagic(buffer) ||
      normalizedType.includes("image/gif") ||
      (hintedAnimated && buffer[0] !== 0x89 && buffer[0] !== 0xff);

    if (isAnimated) {
      if (buffer.length > this.MAX_EMOJI_BYTES) {
        throw new Error("Hareketli GIF 256 KB sınırını aşıyor");
      }
      return { buffer, animated: true };
    }

    if (buffer.length <= 250 * 1024) {
      return { buffer, animated: false };
    }

    const resized128 = await resizeStaticEmoji(buffer, 128);
    if (resized128.length <= this.MAX_EMOJI_BYTES) {
      return { buffer: resized128, animated: false };
    }

    const resized96 = await resizeStaticEmoji(buffer, 96);
    if (resized96.length <= this.MAX_EMOJI_BYTES) {
      return { buffer: resized96, animated: false };
    }

    throw new Error("Görsel optimize edildikten sonra bile 256 KB sınırını aşıyor");
  }

  public static async prepareImageBuffer(
    url: string,
    hintedAnimated: boolean
  ): Promise<{ buffer: Buffer; animated: boolean }> {
    if (!this.isSafeExternalUrl(url)) {
      throw new Error("Geçersiz veya güvensiz görsel bağlantısı");
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`Görsel indirilemedi (HTTP ${response.status})`);
    }

    if (response.url && !this.isSafeExternalUrl(response.url)) {
      throw new Error("Yönlendirilen URL güvenlik politikasını ihlal ediyor");
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && Number(contentLengthHeader) > this.MAX_DOWNLOAD_BYTES) {
      throw new Error("Dosya boyutu 10 MB indirme sınırını aşıyor");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error("Boş görsel verisi döndü");
    }
    if (buffer.length > this.MAX_DOWNLOAD_BYTES) {
      throw new Error("Dosya boyutu 10 MB indirme sınırını aşıyor");
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    return this.optimizeImageBuffer(buffer, hintedAnimated, contentType);
  }

  public static async uploadBatch(
    guild: Guild,
    candidates: IVedoEmojiCandidate[],
    truncatedCount: number
  ): Promise<IVedoEmojiBatchResult> {
    const startedAt = Date.now();
    const existing = await guild.emojis.fetch();
    const maxLimit = this.getGuildEmojiLimit(guild.premiumTier);
    const usedNamesLower = new Set<string>();
    let staticUsed = 0;
    let animatedUsed = 0;

    for (const [, emoji] of existing) {
      if (emoji.name) {
        usedNamesLower.add(emoji.name.toLowerCase());
      }
      if (emoji.animated) {
        animatedUsed += 1;
      } else {
        staticUsed += 1;
      }
    }

    let staticRemaining = Math.max(0, maxLimit - staticUsed);
    let animatedRemaining = Math.max(0, maxLimit - animatedUsed);

    const succeeded: IVedoEmojiUploadSuccess[] = [];
    const failed: IVedoEmojiUploadFailure[] = [];
    let nextIndex = 0;

    const createWithRetry = async (buffer: Buffer, uniqueName: string) => {
      try {
        return await guild.emojis.create({
          attachment: buffer,
          name: uniqueName,
          reason: "VedoGuard Toplu Emoji Yükleme"
        });
      } catch (firstErr: any) {
        const status = firstErr?.status;
        const retryAfterMs = Number(firstErr?.retryAfter || firstErr?.data?.retry_after || 0) * 1000;
        const shouldRetry = status === 429 || status >= 500 || firstErr?.code === "ECONNRESET";
        if (!shouldRetry) {
          throw firstErr;
        }
        await sleep(Math.min(3000, Math.max(600, retryAfterMs || 800)));
        return await guild.emojis.create({
          attachment: buffer,
          name: uniqueName,
          reason: "VedoGuard Toplu Emoji Yükleme"
        });
      }
    };

    const runWorker = async (): Promise<void> => {
      while (nextIndex < candidates.length) {
        const currentIdx = nextIndex;
        nextIndex += 1;
        const candidate = candidates[currentIdx];

        let prepared: { buffer: Buffer; animated: boolean };
        try {
          if (candidate.buffer) {
            prepared = await this.optimizeImageBuffer(candidate.buffer, candidate.animated);
          } else if (candidate.url) {
            prepared = await this.prepareImageBuffer(candidate.url, candidate.animated);
          } else {
            throw new Error("Görsel verisi bulunamadı");
          }
        } catch (prepErr) {
          failed.push({
            name: candidate.name,
            reason: formatUploadError(prepErr)
          });
          continue;
        }

        const remaining = prepared.animated ? animatedRemaining : staticRemaining;
        if (remaining <= 0) {
          failed.push({
            name: candidate.name,
            reason: prepared.animated
              ? "Sunucu hareketli emoji kapasitesi dolu"
              : "Sunucu statik emoji kapasitesi dolu"
          });
          continue;
        }

        if (prepared.animated) {
          animatedRemaining -= 1;
        } else {
          staticRemaining -= 1;
        }

        const uniqueName = this.resolveUniqueName(candidate.name, usedNamesLower);

        try {
          const created = await createWithRetry(prepared.buffer, uniqueName);
          if (prepared.animated) {
            animatedUsed += 1;
          } else {
            staticUsed += 1;
          }
          succeeded.push({
            name: created.name || uniqueName,
            id: created.id,
            animated: Boolean(created.animated),
            tag: created.toString()
          });
        } catch (uploadErr) {
          if (prepared.animated) {
            animatedRemaining += 1;
          } else {
            staticRemaining += 1;
          }
          failed.push({
            name: uniqueName,
            reason: formatUploadError(uploadErr)
          });
        }

        if (nextIndex < candidates.length) {
          await sleep(150);
        }
      }
    };

    const workerCount = Math.min(2, candidates.length);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    return {
      succeeded,
      failed,
      truncatedCount,
      maxLimit,
      staticUsed,
      animatedUsed,
      durationMs: Date.now() - startedAt
    };
  }

  public static async buildResultContainer(
    guild: Guild | null,
    result: IVedoEmojiBatchResult
  ): Promise<VedoContainerBuilder> {
    const hasSuccess = result.succeeded.length > 0;
    const cardBuffer = await VedoThemeCard.generate({
      title: "TOPLU EMOJİ YÜKLEME",
      greeting: "Querencia Emoji Sistemi,",
      subtitle: "Toplu emoji yükleme işlemi tamamlandı. Kapasite ve sonuç özeti aşağıdadır.",
      accentColor: hasSuccess ? "#D4AF37" : "#EF4444",
      watermark: "QUERENCIA",
      iconUrl: guild?.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 2,
      items: [
        {
          icon: "check",
          title: "Başarılı",
          description: `${result.succeeded.length} emoji`,
          accent: "#22C55E"
        },
        {
          icon: "cross",
          title: "Başarısız",
          description: `${result.failed.length} işlem`,
          accent: result.failed.length > 0 ? "#EF4444" : "#D4AF37"
        },
        {
          icon: "chart",
          title: "Statik Kapasite",
          description: `${result.staticUsed} / ${result.maxLimit}`
        },
        {
          icon: "bolt",
          title: "Hareketli Kapasite",
          description: `${result.animatedUsed} / ${result.maxLimit}`
        }
      ]
    });

    const lines: string[] = [];
    const durationPart = `› **Süre:** \`${(result.durationMs / 1000).toFixed(1)} sn\``;
    const truncatedPart =
      result.truncatedCount > 0
        ? `  •  **Sınır Aşan:** \`${result.truncatedCount}\` emoji (tek seferde en fazla ${this.MAX_BATCH_SIZE})`
        : "";
    lines.push(`${durationPart}${truncatedPart}`);

    if (result.succeeded.length > 0) {
      lines.push(`› **Yüklenen Emojiler:** ${result.succeeded.map((e) => e.tag).join(" ")}`);
    }

    if (result.failed.length > 0) {
      lines.push(`› **Hata Detayları:**`);
      const shownFailures = result.failed.slice(0, 6);
      for (const failure of shownFailures) {
        lines.push(`• \`${failure.name}\` — ${failure.reason}`);
      }
      if (result.failed.length > 6) {
        lines.push(`• *... ve ${result.failed.length - 6} diğer hata*`);
      }
    }

    return new VedoContainerBuilder()
      .setAccentColor(hasSuccess ? VEDO_THEME_COLORS.gold : VEDO_THEME_COLORS.danger)
      .setImageBuffer(cardBuffer, "vedo-emoji-sonuc.png")
      .addTextDisplay(lines.join("\n"))
      .addSeparator(true, 1)
      .setFooter("Made by Noz");
  }
}
