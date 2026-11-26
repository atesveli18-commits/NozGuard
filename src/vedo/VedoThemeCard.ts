import { createCanvas, loadImage, Path2D, SKRSContext2D } from "@napi-rs/canvas";

export type VedoThemeIcon =
  | "user"
  | "users"
  | "shield"
  | "crown"
  | "clock"
  | "bolt"
  | "target"
  | "lock"
  | "mic"
  | "micOff"
  | "power"
  | "refresh"
  | "settings"
  | "list"
  | "check"
  | "cross"
  | "alert"
  | "file"
  | "trash"
  | "bell"
  | "info"
  | "chart"
  | "chat";

export interface IVedoThemeCardItem {
  icon: VedoThemeIcon;
  title: string;
  description: string;
  accent?: string;
}

export interface IVedoThemeCardOptions {
  title: string;
  greeting: string;
  subtitle: string;
  items: IVedoThemeCardItem[];
  columns?: 2 | 3;
  accentColor?: string;
  watermark?: string;
  iconUrl?: string;
  footerLeft?: string;
  footerRight?: string;
}

const VEDO_FONT_FAMILY = '"Segoe UI", "DejaVu Sans", "Liberation Sans", Arial, sans-serif';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3
    ? clean.split("").map((ch) => ch + ch).join("")
    : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) {
    return `rgba(212, 175, 55, ${alpha})`;
  }
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapLines(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const rawParagraphs = text.split("\n");
  const lines: string[] = [];

  for (const para of rawParagraphs) {
    const words = para.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      continue;
    }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${cur} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        cur = candidate;
      } else {
        lines.push(cur);
        cur = words[i];
      }
    }
    lines.push(cur);
  }

  if (lines.length === 0) {
    return [""];
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const sliced = lines.slice(0, maxLines);
  let last = sliced[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1).trimEnd();
  }
  sliced[maxLines - 1] = `${last}…`;
  return sliced;
}

function fitSingleLine(ctx: SKRSContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }
  return `${clipped}…`;
}

function drawVectorIcon(
  ctx: SKRSContext2D,
  icon: VedoThemeIcon,
  x: number,
  y: number,
  scale: number,
  color: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const strokePaths = (paths: string[]): void => {
    for (const d of paths) {
      ctx.stroke(new Path2D(d));
    }
  };

  switch (icon) {
    case "user":
      ctx.beginPath();
      ctx.arc(12, 7, 4, 0, Math.PI * 2);
      ctx.stroke();
      strokePaths(["M5 20v-1a7 7 0 0 1 14 0v1"]);
      break;
    case "users":
      ctx.beginPath();
      ctx.arc(9, 7, 4, 0, Math.PI * 2);
      ctx.stroke();
      strokePaths([
        "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
        "M22 21v-2a4 4 0 0 0-3-3.87",
        "M16 3.13a4 4 0 0 1 0 7.75"
      ]);
      break;
    case "shield":
      strokePaths(["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"]);
      break;
    case "crown":
      strokePaths([
        "M2 5l3 11h14l3-11-6 6-4-6-4 6-6-6z",
        "M5 20h14"
      ]);
      break;
    case "clock":
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      strokePaths(["M12 7v5l3 3"]);
      break;
    case "bolt":
      strokePaths(["M13 2L3 14h9l-1 8 10-12h-9l1-8z"]);
      break;
    case "target":
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 12, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(12, 12, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "lock":
      strokePaths([
        "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z",
        "M7 11V7a5 5 0 0 1 10 0v4"
      ]);
      break;
    case "mic":
      strokePaths([
        "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z",
        "M19 10v2a7 7 0 0 1-14 0v-2",
        "M12 19v3",
        "M8 22h8"
      ]);
      break;
    case "micOff":
      strokePaths([
        "M2 2l20 20",
        "M15 9.34V5a3 3 0 0 0-5.68-1.33",
        "M9 9v3a3 3 0 0 0 5.12 2.12",
        "M19 10v2a7 7 0 0 1-.11 1.23",
        "M5 10v2a7 7 0 0 0 9.65 6.47",
        "M12 19v3",
        "M8 22h8"
      ]);
      break;
    case "power":
      strokePaths([
        "M18.36 6.64a9 9 0 1 1-12.73 0",
        "M12 2v10"
      ]);
      break;
    case "refresh":
      strokePaths([
        "M3 12a9 9 0 0 1 15-6.7L21 8",
        "M21 3v5h-5",
        "M21 12a9 9 0 0 1-15 6.7L3 16",
        "M3 21v-5h5"
      ]);
      break;
    case "settings":
      ctx.beginPath();
      ctx.arc(12, 12, 3, 0, Math.PI * 2);
      ctx.stroke();
      strokePaths([
        "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      ]);
      break;
    case "list":
      strokePaths(["M8 6h13", "M8 12h13", "M8 18h13"]);
      for (const dotY of [6, 12, 18]) {
        ctx.beginPath();
        ctx.arc(3.5, dotY, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case "check":
      strokePaths(["M20 6L9 17l-5-5"]);
      break;
    case "cross":
      strokePaths(["M18 6L6 18", "M6 6l12 12"]);
      break;
    case "alert":
      strokePaths([
        "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
        "M12 9v4"
      ]);
      ctx.beginPath();
      ctx.arc(12, 17, 1.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "file":
      strokePaths([
        "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
        "M14 2v6h6",
        "M16 13H8",
        "M16 17H8",
        "M10 9H8"
      ]);
      break;
    case "trash":
      strokePaths([
        "M3 6h18",
        "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
        "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
      ]);
      break;
    case "bell":
      strokePaths([
        "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9",
        "M13.73 21a2 2 0 0 1-3.46 0"
      ]);
      break;
    case "info":
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.stroke();
      strokePaths(["M12 16v-4"]);
      ctx.beginPath();
      ctx.arc(12, 8, 1.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "chart":
      strokePaths(["M18 20V10", "M12 20V4", "M6 20v-6"]);
      break;
    case "chat":
      strokePaths(["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"]);
      break;
  }

  ctx.restore();
}

export class VedoThemeCard {
  public static async generate(options: IVedoThemeCardOptions): Promise<Buffer> {
    const width = 920;
    const paddingX = 34;
    const gap = 14;
    const accent = options.accentColor || "#D4AF37";
    const columns: 2 | 3 = options.columns || (options.items.length <= 4 ? 2 : 3);
    const rows = Math.max(1, Math.ceil(options.items.length / columns));
    const tileW = (width - paddingX * 2 - gap * (columns - 1)) / columns;
    const tileH = columns === 2 ? 90 : 86;

    const measureCanvas = createCanvas(width, 100);
    const measureCtx = measureCanvas.getContext("2d");
    measureCtx.font = `13.5px ${VEDO_FONT_FAMILY}`;
    const subtitleLines = wrapLines(measureCtx, options.subtitle, width - paddingX * 2, 2);

    const introHeight = subtitleLines.length * 19 + 46;
    const gridStartY = 132 + introHeight;
    const gridHeight = rows * tileH + (rows - 1) * gap;
    const height = gridStartY + gridHeight + 48;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#07080B");
    bgGrad.addColorStop(0.5, "#0E1017");
    bgGrad.addColorStop(1, "#08090D");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const topGlow = ctx.createRadialGradient(width / 2, 24, 0, width / 2, 24, 460);
    topGlow.addColorStop(0, hexToRgba(accent, 0.2));
    topGlow.addColorStop(0.55, hexToRgba(accent, 0.05));
    topGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);

    const bottomGlow = ctx.createRadialGradient(
      width * 0.85,
      height * 0.92,
      0,
      width * 0.85,
      height * 0.92,
      340
    );
    bottomGlow.addColorStop(0, "rgba(212, 175, 55, 0.08)");
    bottomGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.014)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width * 0.42, 0);
    ctx.lineTo(width * 0.16, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(212, 175, 55, 0.018)";
    ctx.beginPath();
    ctx.moveTo(width * 0.68, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    const badgeSize = 54;
    const badgeX = width / 2 - badgeSize / 2;
    const badgeY = 20;

    const badgeGlow = ctx.createRadialGradient(
      width / 2,
      badgeY + badgeSize / 2,
      4,
      width / 2,
      badgeY + badgeSize / 2,
      54
    );
    badgeGlow.addColorStop(0, hexToRgba(accent, 0.26));
    badgeGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = badgeGlow;
    ctx.fillRect(badgeX - 30, badgeY - 20, badgeSize + 60, badgeSize + 50);

    let badgeDrawn = false;
    if (options.iconUrl) {
      try {
        const res = await fetch(options.iconUrl, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const imgBuf = Buffer.from(await res.arrayBuffer());
          const iconImg = await loadImage(imgBuf);
          ctx.save();
          drawRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 14);
          ctx.clip();
          ctx.drawImage(iconImg, badgeX, badgeY, badgeSize, badgeSize);
          ctx.restore();

          drawRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 14);
          ctx.strokeStyle = hexToRgba(accent, 0.55);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          badgeDrawn = true;
        }
      } catch {
        badgeDrawn = false;
      }
    }

    if (!badgeDrawn) {
      const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeSize);
      badgeGrad.addColorStop(0, "#14161F");
      badgeGrad.addColorStop(1, "#0B0C11");
      drawRoundedRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 14);
      ctx.fillStyle = badgeGrad;
      ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, 0.55);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      drawVectorIcon(ctx, "shield", badgeX + 11, badgeY + 11, 1.33, accent);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = `bold 14px ${VEDO_FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Q", badgeX + badgeSize / 2, badgeY + badgeSize / 2 - 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    const titleUpper = options.title.toLocaleUpperCase("tr-TR");
    ctx.font = `bold 22px ${VEDO_FONT_FAMILY}`;
    ctx.fillStyle = "#F8FAFC";
    ctx.textAlign = "center";
    ctx.fillText(titleUpper, width / 2, 104);
    const titleW = ctx.measureText(titleUpper).width;
    ctx.textAlign = "left";

    const lineY = 97;
    const leftEnd = Math.max(paddingX + 20, width / 2 - titleW / 2 - 18);
    const rightStart = Math.min(width - paddingX - 20, width / 2 + titleW / 2 + 18);

    const leftGrad = ctx.createLinearGradient(paddingX, lineY, leftEnd, lineY);
    leftGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
    leftGrad.addColorStop(1, hexToRgba(accent, 0.5));
    ctx.strokeStyle = leftGrad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, lineY);
    ctx.lineTo(leftEnd, lineY);
    ctx.stroke();

    const rightGrad = ctx.createLinearGradient(rightStart, lineY, width - paddingX, lineY);
    rightGrad.addColorStop(0, hexToRgba(accent, 0.5));
    rightGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.strokeStyle = rightGrad;
    ctx.beginPath();
    ctx.moveTo(rightStart, lineY);
    ctx.lineTo(width - paddingX, lineY);
    ctx.stroke();

    drawRoundedRect(ctx, paddingX, 132, 4, 20, 2);
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.fillStyle = "#F8FAFC";
    ctx.font = `bold 15.5px ${VEDO_FONT_FAMILY}`;
    ctx.fillText(fitSingleLine(ctx, options.greeting, width - paddingX * 2 - 16), paddingX + 14, 147);

    ctx.fillStyle = "#94A3B8";
    ctx.font = `13.5px ${VEDO_FONT_FAMILY}`;
    let subY = 171;
    for (const line of subtitleLines) {
      ctx.fillText(line, paddingX, subY);
      subY += 19;
    }

    const watermark = (options.watermark || "QUERENCIA").toLocaleUpperCase("tr-TR");
    let wmFontSize = 108;
    ctx.font = `900 ${wmFontSize}px ${VEDO_FONT_FAMILY}`;
    const maxWmWidth = width - 100;
    while (wmFontSize > 42 && ctx.measureText(watermark).width > maxWmWidth) {
      wmFontSize -= 4;
      ctx.font = `900 ${wmFontSize}px ${VEDO_FONT_FAMILY}`;
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const wmX = width / 2;
    const wmY = gridStartY + gridHeight / 2;
    ctx.fillStyle = "rgba(212, 175, 55, 0.055)";
    ctx.fillText(watermark, wmX, wmY);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
    ctx.lineWidth = 1.5;
    ctx.strokeText(watermark, wmX, wmY);
    ctx.restore();

    for (let idx = 0; idx < options.items.length; idx++) {
      const item = options.items[idx];
      const col = idx % columns;
      const row = Math.floor(idx / columns);
      const tx = paddingX + col * (tileW + gap);
      const ty = gridStartY + row * (tileH + gap);
      const itemAccent = item.accent || accent;

      const tileGrad = ctx.createLinearGradient(tx, ty, tx, ty + tileH);
      tileGrad.addColorStop(0, "rgba(255, 255, 255, 0.055)");
      tileGrad.addColorStop(1, "rgba(17, 20, 28, 0.42)");

      drawRoundedRect(ctx, tx, ty, tileW, tileH, 11);
      ctx.fillStyle = tileGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const sheenGrad = ctx.createLinearGradient(tx + 12, ty + 0.5, tx + tileW - 12, ty + 0.5);
      sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
      sheenGrad.addColorStop(0.5, hexToRgba(itemAccent, 0.28));
      sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.strokeStyle = sheenGrad;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx + 12, ty + 0.5);
      ctx.lineTo(tx + tileW - 12, ty + 0.5);
      ctx.stroke();

      drawVectorIcon(ctx, item.icon, tx + 15, ty + 16, 0.8, itemAccent);

      ctx.fillStyle = "#F8FAFC";
      ctx.font = `bold 14.5px ${VEDO_FONT_FAMILY}`;
      ctx.fillText(fitSingleLine(ctx, item.title, tileW - 56), tx + 42, ty + 31);

      ctx.fillStyle = "#94A3B8";
      ctx.font = `12.5px ${VEDO_FONT_FAMILY}`;
      const descLines = wrapLines(ctx, item.description, tileW - 30, 2);
      let dy = ty + 53;
      for (const dLine of descLines) {
        ctx.fillText(dLine, tx + 15, dy);
        dy += 16;
      }
    }

    const footerLineY = gridStartY + gridHeight + 16;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, footerLineY);
    ctx.lineTo(width - paddingX, footerLineY);
    ctx.stroke();

    ctx.font = `11px ${VEDO_FONT_FAMILY}`;
    ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
    ctx.textAlign = "left";
    ctx.fillText(options.footerLeft || "QUERENCIA  •  VEDOGUARD", paddingX, height - 14);

    ctx.fillStyle = "rgba(212, 175, 55, 0.78)";
    ctx.textAlign = "right";
    ctx.fillText(options.footerRight || "Made by Noz", width - paddingX, height - 14);
    ctx.textAlign = "left";

    return canvas.toBuffer("image/png");
  }
}
