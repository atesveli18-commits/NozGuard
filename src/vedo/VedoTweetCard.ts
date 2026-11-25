import { createCanvas, loadImage, Path2D } from "@napi-rs/canvas";

export interface VedoTweetOptions {
  displayName: string;
  username: string;
  avatarUrl?: string;
  text: string;
  timeStr: string;
  dateStr: string;
  imageUrl?: string;
}

export class VedoTweetCard {
  public static async generate(options: VedoTweetOptions): Promise<Buffer> {
    const { displayName, username, avatarUrl, text, timeStr, dateStr, imageUrl } = options;

    const width = 941;
    const paddingX = 25;
    const maxTextWidth = width - paddingX * 2;

    const tempCanvas = createCanvas(width, 100);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = '24px "Segoe UI", Arial, sans-serif';

    const rawLines = text.split("\n");
    const lines: string[] = [];

    for (const rawLine of rawLines) {
      const words = rawLine.split(" ");
      let curLine = words[0] || "";
      for (let i = 1; i < words.length; i++) {
        const w = words[i];
        const test = curLine + " " + w;
        if (tempCtx.measureText(test).width < maxTextWidth) {
          curLine = test;
        } else {
          lines.push(curLine);
          curLine = w;
        }
      }
      lines.push(curLine);
    }

    const lineHeight = 34;
    const textBlockHeight = lines.length * lineHeight;

    let loadedAttachedImage: any = null;
    let attachedImgHeight = 0;
    if (imageUrl) {
      try {
        loadedAttachedImage = await loadImage(imageUrl);
        const aspect = loadedAttachedImage.height / loadedAttachedImage.width;
        attachedImgHeight = Math.min(450, maxTextWidth * aspect);
      } catch {
        loadedAttachedImage = null;
        attachedImgHeight = 0;
      }
    }

    const extraHeight = (lines.length - 1) * lineHeight + (attachedImgHeight > 0 ? attachedImgHeight + 20 : 0);
    const height = 351 + Math.max(0, extraHeight);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    let avatarLoaded = false;
    if (avatarUrl) {
      try {
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(paddingX + 32, 52, 32, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, paddingX, 20, 64, 64);
        ctx.restore();
        avatarLoaded = true;
      } catch {
        avatarLoaded = false;
      }
    }

    if (!avatarLoaded) {
      ctx.fillStyle = "#27272a";
      ctx.beginPath();
      ctx.arc(paddingX + 32, 52, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((displayName[0] || "U").toUpperCase(), paddingX + 32, 52);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText(displayName, paddingX + 78, 46);

    const nameWidth = ctx.measureText(displayName).width;
    const badgeX = paddingX + 78 + nameWidth + 8;
    const badgeY = 30;

    ctx.fillStyle = "#1d9bf0";
    ctx.beginPath();
    ctx.arc(badgeX + 10, badgeY + 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(badgeX + 6.5, badgeY + 10);
    ctx.lineTo(badgeX + 9, badgeY + 13);
    ctx.lineTo(badgeX + 14, badgeY + 7);
    ctx.stroke();

    ctx.fillStyle = "#71767b";
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText("@" + username, paddingX + 78, 73);

    ctx.save();
    ctx.translate(width - paddingX - 40, 24);
    ctx.fillStyle = "#1d9bf0";
    const birdPath = new Path2D("M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z");
    ctx.scale(1.4, 1.4);
    ctx.fill(birdPath);
    ctx.restore();

    ctx.fillStyle = "#ffffff";
    ctx.font = '24px "Segoe UI", Arial, sans-serif';
    let curY = 140;
    for (const line of lines) {
      ctx.fillText(line, paddingX, curY);
      curY += lineHeight;
    }

    if (loadedAttachedImage && attachedImgHeight > 0) {
      curY += 10;
      const imgX = paddingX;
      const imgY = curY;
      const imgW = maxTextWidth;
      const imgH = attachedImgHeight;
      const radius = 16;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(imgX + radius, imgY);
      ctx.lineTo(imgX + imgW - radius, imgY);
      ctx.quadraticCurveTo(imgX + imgW, imgY, imgX + imgW, imgY + radius);
      ctx.lineTo(imgX + imgW, imgY + imgH - radius);
      ctx.quadraticCurveTo(imgX + imgW, imgY + imgH, imgX + imgW - radius, imgY + imgH);
      ctx.lineTo(imgX + radius, imgY + imgH);
      ctx.quadraticCurveTo(imgX, imgY + imgH, imgX, imgY + imgH - radius);
      ctx.lineTo(imgX, imgY + radius);
      ctx.quadraticCurveTo(imgX, imgY, imgX + radius, imgY);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(loadedAttachedImage, imgX, imgY, imgW, imgH);
      ctx.restore();

      curY += attachedImgHeight + 10;
    }

    curY = Math.max(curY, 140 + lineHeight);
    const dateY = curY + 6;

    ctx.fillStyle = "#71767b";
    ctx.font = '16px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`${timeStr} · ${dateStr} · Twitter for Android`, paddingX, dateY);

    const div1Y = dateY + 24;
    ctx.strokeStyle = "#242627";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, div1Y);
    ctx.lineTo(width - paddingX, div1Y);
    ctx.stroke();

    const statsY = div1Y + 34;
    let statX = paddingX;
    const stats = [
      { num: "1.1K", label: "Retweet" },
      { num: "546", label: "Alıntı Tweetler" },
      { num: "5.8K", label: "Beğeni" },
      { num: "318", label: "Yer İşareti" }
    ];

    for (const stat of stats) {
      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
      ctx.fillText(stat.num, statX, statsY);
      statX += ctx.measureText(stat.num).width + 6;

      ctx.fillStyle = "#71767b";
      ctx.font = '16px "Segoe UI", Arial, sans-serif';
      ctx.fillText(stat.label, statX, statsY);
      statX += ctx.measureText(stat.label).width + 28;
    }

    const div2Y = statsY + 26;
    ctx.strokeStyle = "#242627";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, div2Y);
    ctx.lineTo(width - paddingX, div2Y);
    ctx.stroke();

    const iconY = div2Y + 32;
    ctx.fillStyle = "#71767b";

    const commentIcon = new Path2D("M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-1.602.88 1.054 2.45c.449 1.05-.28 2.25-1.42 2.25-.43 0-.84-.17-1.14-.48l-3.32-3.34-.84.05c-.71.04-1.42.06-2.13.06-4.42 0-8.006-3.58-8.006-8zm8.005-6c-3.317 0-6.005 2.69-6.005 6s2.688 6 6.005 6c.77 0 1.54-.03 2.3-.08l1.43-.09 3.96 3.99-1.29-2.99-.48-1.12 1.11-.61c2.19-1.21 3.55-3.51 3.55-6.02 0-3.39-2.75-6.13-6.13-6.13h-4.45z");
    const rtIcon = new Path2D("M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 20.12l-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2H11V4h2.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14z");
    const heartIcon = new Path2D("M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-2.415.11-4.3 2.1-4.3 4.6 0 1.3.56 2.5 1.54 3.4l7.46 7.5 7.46-7.5c.98-.9 1.54-2.1 1.54-3.4 0-2.5-1.89-4.49-4.3-4.6zm-4.695 14.2l-6.05-6.1c-.68-.6-1.07-1.4-1.07-2.3 0-1.6 1.19-2.9 2.76-3 .92-.04 2.06.45 2.99 1.7l1.37 1.9 1.37-1.9c.93-1.25 2.07-1.74 2.99-1.7 1.57.1 2.76 1.4 2.76 3 0 .9-.39 1.7-1.07 2.3l-6.05 6.1z");
    const bmIcon = new Path2D("M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v16.74c0 .69-.75 1.12-1.34.78L12 18.06l-6.66 3.96c-.59.34-1.34-.09-1.34-.78V4.5zm2.5-.5c-.276 0-.5.22-.5.5v14.47l5.52-3.28c.3-.18.66-.18.96 0l5.52 3.28V4.5c0-.28-.224-.5-.5-.5h-11z");
    const shareIcon = new Path2D("M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41L7.71 9.71 6.3 8.29 12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21.01 3 19.9 3 18.51V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5V15h2.02z");

    const icons = [
      { p: commentIcon, x: 77 },
      { p: rtIcon, x: 280 },
      { p: heartIcon, x: 485 },
      { p: bmIcon, x: 690 },
      { p: shareIcon, x: 845 }
    ];

    for (const ic of icons) {
      ctx.save();
      ctx.translate(ic.x, iconY);
      ctx.scale(0.9, 0.9);
      ctx.fill(ic.p);
      ctx.restore();
    }

    return canvas.toBuffer("image/png");
  }
}
