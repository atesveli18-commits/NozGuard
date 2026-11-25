import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import http from "http";
import { VedoGuardBot, IVedoGuardConfig } from "./vedo/VedoGuardBot";

dotenv.config();

const v_port = process.env.PORT || 3000;
const v_server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("VedoGuard 7/24 Aktif ve Calisiyor!");
});

v_server.listen(v_port, () => {
  console.log(`[VedoGuard Health-Check] Port ${v_port} uzerinde hazir.`);
});

const v_keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
if (v_keepAliveUrl) {
  setInterval(async () => {
    try {
      await fetch(v_keepAliveUrl);
      console.log(`[VedoGuard Keep-Alive] Otomatik ping gonderildi: ${v_keepAliveUrl}`);
    } catch (err) {
      console.error("[VedoGuard Keep-Alive] Ping basarisiz:", err);
    }
  }, 8 * 60 * 1000);
}

const v_token = process.env.DISCORD_TOKEN;
const v_mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/nozguard";

if (!v_token) {
  console.error("[VedoGuard Hata] .env dosyasında DISCORD_TOKEN bulunamadı. Lütfen DISCORD_TOKEN bilgisini giriniz.");
  process.exit(1);
}

const v_configPath = path.join(process.cwd(), "config.json");
const v_rawConfig = fs.readFileSync(v_configPath, "utf-8");
const v_config: IVedoGuardConfig = JSON.parse(v_rawConfig);

if (process.env.GUILD_ID) {
  v_config.guildId = process.env.GUILD_ID;
}

if (process.env.LOG_CHANNEL_ID) {
  v_config.logChannelId = process.env.LOG_CHANNEL_ID;
}

if (process.env.VOICE_CHANNEL_ID) {
  v_config.voiceChannelId = process.env.VOICE_CHANNEL_ID;
}

if (process.env.TICKET_CATEGORY_ID) {
  v_config.ticketCategoryId = process.env.TICKET_CATEGORY_ID;
}

if (process.env.STAFF_ROLE_ID) {
  v_config.staffRoleId = process.env.STAFF_ROLE_ID;
}

if (process.env.REGISTERED_ROLE_ID) {
  v_config.registeredRoleId = process.env.REGISTERED_ROLE_ID;
}

if (process.env.UNREGISTERED_ROLE_ID) {
  v_config.unregisteredRoleId = process.env.UNREGISTERED_ROLE_ID;
}

if (process.env.JOIN_LEAVE_CHANNEL_ID) {
  v_config.joinLeaveChannelId = process.env.JOIN_LEAVE_CHANNEL_ID;
}

const v_bot = new VedoGuardBot(v_config);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

v_bot.start(v_token, v_mongoUri).catch((error) => {
  console.error("Failed to start VedoGuard:", error);
  process.exit(1);
});
