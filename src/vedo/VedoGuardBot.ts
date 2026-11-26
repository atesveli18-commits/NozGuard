import {
  Client,
  GatewayIntentBits,
  Partials,
  Guild,
  GuildMember,
  Events,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
  ChannelType,
  TextChannel,
  Attachment
} from "discord.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { VedoAuditGuard } from "./VedoAuditGuard";
import { VedoSpamGuard } from "./VedoSpamGuard";
import { VedoDatabase } from "./VedoDatabase";
import { VedoVoiceManager } from "./VedoVoiceManager";
import { VedoTicketManager } from "./VedoTicketManager";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoTweetCard } from "./VedoTweetCard";
import { VedoThemeCard } from "./VedoThemeCard";
import { VedoEmojiUploader } from "./VedoEmojiUploader";

export interface IVedoGuardConfig {
  guildId: string;
  botName?: string;
  botOwnerId?: string;
  botOfflineMode?: boolean;
  botAvatarHash?: string;
  logChannelId: string;
  joinLeaveChannelId?: string;
  voiceChannelId?: string;
  afkChannelId?: string;
  afkMuteEnabled?: boolean;
  ticketCategoryId?: string;
  staffRoleId?: string;
  registeredRoleId?: string;
  unregisteredRoleId?: string;
  whitelistedUsers: string[];
  whitelistedRoles: string[];
  limits: {
    ban: { limit: number; windowMs: number };
    timeout: { limit: number; windowMs: number };
    channelDelete: { limit: number; windowMs: number };
    roleDelete: { limit: number; windowMs: number };
    spam: {
      messageThreshold: number;
      windowMs: number;
      maxWarnings: number;
      timeoutDurationMs: number;
    };
  };
}

export interface IVedoMemberEvent {
  type: "giris" | "cikis";
  userId: string;
  userTag: string;
  timestamp: number;
}

export class VedoGuardBot {
  public client: Client;
  public voiceManager: VedoVoiceManager;
  public ticketManager: VedoTicketManager;
  private config: IVedoGuardConfig;
  private auditGuard: VedoAuditGuard;
  private spamGuard: VedoSpamGuard;
  private token: string = "";
  private memberEvents: IVedoMemberEvent[] = [];

  constructor(config: IVedoGuardConfig) {
    this.config = config;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
      ],
      partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
    });

    this.auditGuard = new VedoAuditGuard(
      this.config.whitelistedUsers,
      this.config.whitelistedRoles,
      this.config.logChannelId
    );

    this.spamGuard = new VedoSpamGuard(
      this.config.whitelistedUsers,
      this.config.whitelistedRoles,
      this.config.limits.spam.messageThreshold,
      this.config.limits.spam.windowMs,
      this.config.limits.spam.maxWarnings,
      this.config.limits.spam.timeoutDurationMs
    );

    this.voiceManager = new VedoVoiceManager(this.client);
    this.ticketManager = new VedoTicketManager(this.client, {
      ticketCategoryId: this.config.ticketCategoryId,
      staffRoleId: this.config.staffRoleId,
      registeredRoleId: this.config.registeredRoleId,
      unregisteredRoleId: this.config.unregisteredRoleId
    });

    this.registerEvents();
  }

  private saveConfig(): void {
    try {
      const configPath = path.join(process.cwd(), "config.json");
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (error) {
      console.error("[VedoGuard] Config kaydedilemedi:", error);
    }
  }

  private async syncBotAvatar(): Promise<void> {
    const avatarPath = path.join(process.cwd(), "assets", "bot-avatar.jpg");
    if (!fs.existsSync(avatarPath)) {
      return;
    }
    try {
      const avatarBuffer = fs.readFileSync(avatarPath);
      const currentHash = crypto.createHash("sha256").update(avatarBuffer).digest("hex");
      if (this.config.botAvatarHash === currentHash) {
        return;
      }
      await this.client.user?.setAvatar(avatarBuffer);
      this.config.botAvatarHash = currentHash;
      this.saveConfig();
      console.log("[VedoGuard] Bot profil fotoğrafı başarıyla güncellendi.");
    } catch (error) {
      console.error("[VedoGuard] Bot profil fotoğrafı güncellenemedi:", error);
    }
  }

  private async syncBotName(): Promise<void> {
    const targetName = this.config.botName?.trim();
    if (!targetName) {
      return;
    }

    if (this.client.user && this.client.user.username !== targetName) {
      try {
        await this.client.user.setUsername(targetName);
        console.log(`[VedoGuard] Bot kullanıcı adı "${targetName}" olarak güncellendi.`);
      } catch (error) {
        console.error("[VedoGuard] Bot kullanıcı adı güncellenemedi:", error);
      }
    }

    const guild = this.client.guilds.cache.get(this.config.guildId);
    if (guild?.members.me && guild.members.me.nickname !== targetName) {
      try {
        await guild.members.me.setNickname(targetName);
        console.log(`[VedoGuard] Bot sunucu takma adı "${targetName}" olarak güncellendi.`);
      } catch (error) {
        console.error("[VedoGuard] Bot sunucu takma adı güncellenemedi:", error);
      }
    }
  }

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("kayit")
        .setDescription("Kayıt ve mülakat sistemini yönetir")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("ayarla")
            .setDescription("Kayıt ve mülakat rollerini ve kategorisini ayarlar")
            .addRoleOption((opt) =>
              opt.setName("uye-rolu").setDescription("Onaylanan üyeye verilecek kayıtlı rol (@querencia)").setRequired(true)
            )
            .addRoleOption((opt) =>
              opt.setName("mulakat-rolu").setDescription("Mülakata giren üyeye verilecek rol (@Mülakat)").setRequired(true)
            )
            .addRoleOption((opt) =>
              opt.setName("yetkili-rolu").setDescription("Mülakatları inceleyip onaylayacak yetkili rolü").setRequired(false)
            )
            .addChannelOption((opt) =>
              opt
                .setName("kategori")
                .setDescription("Mülakat kanallarının açılacağı kategori")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("kur")
            .setDescription("Mülakat başvuru butonlu paneli belirtilen kanala kurar")
            .addChannelOption((opt) =>
              opt
                .setName("kanal")
                .setDescription("Panelin kurulacağı metin kanalı")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub.setName("bilgi").setDescription("Mevcut kayıt ve mülakat yapılandırmasını görüntüler")
        ),

      new SlashCommandBuilder()
        .setName("mulakat")
        .setDescription("Mülakat onayında verilecek ve alınacak rolleri yönetir")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("verilecek-rol")
            .setDescription("Mülakat kabul edildiğinde adaya verilecek rolü belirler")
            .addRoleOption((opt) =>
              opt.setName("rol").setDescription("Onay sonrası verilecek rol").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("alinacak-rol")
            .setDescription("Mülakat kabul edildiğinde adaydan alınacak rolü belirler")
            .addRoleOption((opt) =>
              opt.setName("rol").setDescription("Onay sonrası alınacak mülakat rolü").setRequired(true)
            )
        ),

      new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Ticket ve mülakat odası yönetim komutları")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("ayarla")
            .setDescription("Ticket açılacak kategoriyi ve yetkilisini belirler")
            .addChannelOption((opt) =>
              opt
                .setName("kategori")
                .setDescription("Ticket/mülakat kanallarının açılacağı kategori")
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
            )
            .addRoleOption((opt) =>
              opt.setName("yetkili-rolu").setDescription("Ticket odalarını yönetecek ekip rolü").setRequired(false)
            )
            .addChannelOption((opt) =>
              opt
                .setName("log-kanali")
                .setDescription("Kapanan biletlerin loglanacağı metin kanalı")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("kur")
            .setDescription("Mülakat/ticket başvuru panelini kanala gönderir")
            .addChannelOption((opt) =>
              opt
                .setName("kanal")
                .setDescription("Panelin gönderileceği metin kanalı")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub.setName("kapat").setDescription("Bulunulan mülakat odasını güvenle siler")
        ),

      new SlashCommandBuilder()
        .setName("guard")
        .setDescription("Sunucu koruma, log, ses ve limit yönetim komutları")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("ayarla")
            .setDescription("Guard log kanalını, ses odasını ve limitleri yapılandırır")
            .addChannelOption((opt) =>
              opt
                .setName("log-kanali")
                .setDescription("Güvenlik ihlallerinin bildirileceği metin kanalı")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
            )
            .addChannelOption((opt) =>
              opt
                .setName("ses-kanali")
                .setDescription("Botun 7/24 kalacağı ses kanalı")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(false)
            )
            .addIntegerOption((opt) =>
              opt.setName("ban-limit").setDescription("10 dakikada uygulanabilecek maksimum ban sayısı").setRequired(false)
            )
            .addIntegerOption((opt) =>
              opt.setName("timeout-limit").setDescription("10 dakikada uygulanabilecek maksimum timeout sayısı").setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub.setName("limitler").setDescription("Aktif sunucu guard limitlerini listeler")
        )
        .addSubcommand((sub) =>
          sub
            .setName("whitelist")
            .setDescription("Guard cezalarından muaf tutulacak kullanıcı veya rolü yönetir")
            .addStringOption((opt) =>
              opt
                .setName("islem")
                .setDescription("Yapılacak işlem")
                .setRequired(true)
                .addChoices({ name: "Ekle", value: "ekle" }, { name: "Çıkar", value: "cikar" })
            )
            .addUserOption((opt) => opt.setName("kullanici").setDescription("Muaf tutulacak kullanıcı").setRequired(false))
            .addRoleOption((opt) => opt.setName("rol").setDescription("Muaf tutulacak rol").setRequired(false))
        ),

      new SlashCommandBuilder()
        .setName("tweet")
        .setDescription("X (Twitter) formatında görsel veya mesaj paylaşır")
        .addStringOption((opt) =>
          opt.setName("mesaj").setDescription("Paylaşılacak tweet içeriği").setRequired(true).setMaxLength(500)
        )
        .addAttachmentOption((opt) =>
          opt.setName("gorsel").setDescription("Tweet'e eklenecek fotoğraf").setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("emojiyukle")
        .setDescription("Özel emojileri, görsel linklerini veya dosyaları sunucuya toplu olarak yükler")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuildExpressions)
        .addStringOption((opt) =>
          opt
            .setName("emojiler")
            .setDescription("Yan yana yapıştırılmış özel emojiler veya boşlukla ayrılmış görsel linkleri")
            .setRequired(false)
            .setMaxLength(2000)
        )
        .addStringOption((opt) =>
          opt
            .setName("isim")
            .setDescription("Dosya veya URL emojileri için özel isim / ön ek")
            .setRequired(false)
            .setMaxLength(28)
        )
        .addAttachmentOption((opt) =>
          opt.setName("dosya1").setDescription("Yüklenecek görsel dosyası (1)").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("dosya2").setDescription("Yüklenecek görsel dosyası (2)").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("dosya3").setDescription("Yüklenecek görsel dosyası (3)").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("dosya4").setDescription("Yüklenecek görsel dosyası (4)").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("dosya5").setDescription("Yüklenecek görsel dosyası (5)").setRequired(false)
        ),

      new SlashCommandBuilder()
        .setName("giris-cikis")
        .setDescription("Sunucuya girenleri ve çıkanları görüntüler veya log kanalını ayarlar")
        .addSubcommand((sub) =>
          sub
            .setName("liste")
            .setDescription("Sunucuya son giren ve çıkan üyelerin listesini görüntüler")
        )
        .addSubcommand((sub) =>
          sub
            .setName("ayarla")
            .setDescription("Giriş ve çıkış bildirimlerinin otomatik yapılacağı metin kanalını ayarlar")
            .addChannelOption((opt) =>
              opt
                .setName("kanal")
                .setDescription("Bildirimlerin yapılacağı metin kanalı")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("kapat")
            .setDescription("Otomatik giriş ve çıkış bildirimlerini kapatır")
        ),

      new SlashCommandBuilder()
        .setName("ses")
        .setDescription("Ses sistemleri ve AFK yönetimi")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("afk")
            .setDescription("AFK odasına giren üyelerin otomatik susturulmasını (mute) ayarlar")
            .addChannelOption((opt) =>
              opt
                .setName("kanal")
                .setDescription("AFK ses kanalı (boş bırakılırsa sunucunun varsayılan AFK odası kullanılır)")
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(false)
            )
            .addBooleanOption((opt) =>
              opt
                .setName("durum")
                .setDescription("AFK otomatik susturma aktif olsun mu? (Açık: true / Kapalı: false)")
                .setRequired(false)
            )
        ),

      new SlashCommandBuilder()
        .setName("bot")
        .setDescription("Bot çevrimdışı (uyku) ve çevrimiçi kontrol komutları (Yalnızca Bot Sahibi)")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((sub) =>
          sub
            .setName("durum")
            .setDescription("Botu çevrimdışı/çevrimiçi yapar veya anlık çalışma durumunu gösterir")
            .addStringOption((opt) =>
              opt
                .setName("islem")
                .setDescription("Uygulanacak durum işlemi")
                .setRequired(true)
                .addChoices(
                  { name: "Çevrimdışı Yap (Görünmez + Uyku Modu)", value: "kapat" },
                  { name: "Çevrimiçi Yap (Aktif)", value: "ac" },
                  { name: "Durum Göster", value: "bilgi" }
                )
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("panel")
            .setDescription("Butonlu çevrimdışı/çevrimiçi bot kontrol panelini kanala kurar")
        ),

      new SlashCommandBuilder()
        .setName("sil")
        .setDescription("Belirtilen miktarda mesajı kanaldan toplu olarak siler")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addIntegerOption((option) =>
          option
            .setName("sayi")
            .setDescription("Silinecek mesaj sayısı (1-100)")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)
        ),

      new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Botun anlık gecikme süresini görüntüler"),

      new SlashCommandBuilder()
        .setName("yardim")
        .setDescription("VedoGuard bot komut rehberini listeler"),

      new SlashCommandBuilder()
        .setName("kayit-paneli")
        .setDescription("Mülakat ve kayıt başvuru panelini kanala kurar")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

      new SlashCommandBuilder()
        .setName("ses-paneli")
        .setDescription("7/24 ses kontrol panelini kanala gönderir")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    ];

    try {
      const rest = new REST().setToken(this.token);
      await rest.put(
        Routes.applicationGuildCommands(this.client.user!.id, this.config.guildId),
        { body: commands.map((c) => c.toJSON()) }
      );
      console.log("[VedoGuard] Slash komutları (/) başarıyla sunucuya kaydedildi.");
    } catch (error) {
      console.error("[VedoGuard] Slash komutları kaydedilirken hata oluştu:", error);
    }
  }

  public async getLimitsContainer(guild?: Guild | null): Promise<VedoContainerBuilder> {
    const cardBuffer = await VedoThemeCard.generate({
      title: "SUNUCU KORUMA LİMİTLERİ",
      greeting: "Querencia Güvenlik Eşiği,",
      subtitle: "Yetkili kötüye kullanımını ve sohbet saldırılarını engelleyen aktif koruma sınırları.",
      accentColor: "#D4AF37",
      watermark: "QUERENCIA",
      iconUrl: guild?.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 3,
      items: [
        {
          icon: "bolt",
          title: "Ban Limiti",
          description: `${this.config.limits.ban.limit} Ban / ${this.config.limits.ban.windowMs / 1000} Saniye`
        },
        {
          icon: "clock",
          title: "Timeout Limiti",
          description: `${this.config.limits.timeout.limit} Timeout / ${this.config.limits.timeout.windowMs / 1000} Saniye`
        },
        {
          icon: "trash",
          title: "Kanal Silme",
          description: `${this.config.limits.channelDelete.limit} Kanal / ${this.config.limits.channelDelete.windowMs / 1000} Saniye`
        },
        {
          icon: "lock",
          title: "Rol Silme",
          description: `${this.config.limits.roleDelete.limit} Rol / ${this.config.limits.roleDelete.windowMs / 1000} Saniye`
        },
        {
          icon: "chat",
          title: "Spam Eşiği",
          description: `${this.config.limits.spam.messageThreshold} Mesaj / ${this.config.limits.spam.windowMs / 1000}sn — ${this.config.limits.spam.maxWarnings} Uyarı`
        },
        {
          icon: "shield",
          title: "Yaptırım Politikası",
          description: "Roller sıfırlanır ve log bildirilir",
          accent: "#EF4444"
        }
      ]
    });

    return new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.gold)
      .setImageBuffer(cardBuffer, "vedo-limitler.png")
      .addTextDisplay(
        `› *İhlal durumunda yetkili rolleri otomatik olarak alınır ve denetim kaydına işlenir.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");
  }

  public async getHelpContainer(guild?: Guild | null): Promise<VedoContainerBuilder> {
    const cardBuffer = await VedoThemeCard.generate({
      title: "KOMUT REHBERİ",
      greeting: "Merhaba Querencia yetkilileri,",
      subtitle: "Sunucu genelinde yetkili yönetim, güvenlik, mülakat ve topluluk komutları rehberi.",
      accentColor: "#D4AF37",
      watermark: "QUERENCIA",
      iconUrl: guild?.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 3,
      items: [
        {
          icon: "user",
          title: "Kayıt & Mülakat",
          description: "/mulakat verilecek-rol, alinacak-rol, /kayit"
        },
        {
          icon: "file",
          title: "Ticket Odaları",
          description: "/ticket ayarla, kur, kapat komutları"
        },
        {
          icon: "shield",
          title: "Guard & Güvenlik",
          description: "/guard ayarla, limitler, whitelist"
        },
        {
          icon: "mic",
          title: "Ses & AFK",
          description: "/ses afk ve /ses-paneli komutları"
        },
        {
          icon: "power",
          title: "Bot Kontrolü",
          description: "/bot durum ve /bot panel (Sahip)"
        },
        {
          icon: "chat",
          title: "Topluluk & Yönetim",
          description: "/emojiyukle, /giris-cikis, /tweet, /sil, /ping"
        }
      ]
    });

    return new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.gold)
      .setImageBuffer(cardBuffer, "vedo-yardim.png")
      .addTextDisplay(
        `› **Mülakat & Kayıt:** \`/mulakat verilecek-rol\`, \`/mulakat alinacak-rol\`, \`/kayit kur\`, \`/kayit bilgi\`\n` +
        `› **Ticket:** \`/ticket ayarla\`, \`/ticket kur\`, \`/ticket kapat\`\n` +
        `› **Guard & Ses:** \`/guard ayarla\`, \`/guard limitler\`, \`/guard whitelist\`, \`/ses afk\`, \`/ses-paneli\`\n` +
        `› **Bot & Topluluk:** \`/bot durum\`, \`/bot panel\`, \`/emojiyukle\`, \`/giris-cikis\`, \`/tweet\`, \`/sil\`, \`/ping\``
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");
  }

  public isBotOwner(userId: string): boolean {
    if (!this.config.botOwnerId) {
      return false;
    }
    const ownerIds = this.config.botOwnerId
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    return ownerIds.includes(userId);
  }

  public async getBotControlContainer(guild?: Guild | null): Promise<VedoContainerBuilder> {
    const isOffline = Boolean(this.config.botOfflineMode);
    const ownerDisplay = this.config.botOwnerId
      ? `<@${this.config.botOwnerId.split(",")[0].trim()}>`
      : "`Tanımlanmadı`";
    const ownerIdRaw = this.config.botOwnerId
      ? this.config.botOwnerId.split(",")[0].trim()
      : "Tanımlanmadı";
    const voiceStatusText = isOffline
      ? "Uyku Modunda Kapalı"
      : this.voiceManager.isConnected()
        ? "Bağlı (7/24 Aktif)"
        : "Hazır";

    const cardBuffer = await VedoThemeCard.generate({
      title: "BOT KONTROL PANELİ",
      greeting: "Querencia Sistem Yönetimi,",
      subtitle: "Botun Discord görünürlüğünü, 7/24 ses bağlantısını ve uyku modunu anlık olarak yönetin.",
      accentColor: isOffline ? "#EF4444" : "#D4AF37",
      watermark: "QUERENCIA",
      iconUrl: guild?.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 2,
      items: [
        {
          icon: "power",
          title: "Çalışma Durumu",
          description: isOffline ? "Çevrimdışı (Görünmez + Uyku Modu)" : "Çevrimiçi (Aktif & Koruma Açık)",
          accent: isOffline ? "#EF4444" : "#22C55E"
        },
        {
          icon: "shield",
          title: "Guard & Otomasyon",
          description: isOffline ? "Duraklatıldı" : "Aktif",
          accent: isOffline ? "#F59E0B" : "#22C55E"
        },
        {
          icon: "mic",
          title: "7/24 Ses Bağlantısı",
          description: voiceStatusText
        },
        {
          icon: "crown",
          title: "Yetkili Sahip",
          description: ownerIdRaw
        }
      ]
    });

    return new VedoContainerBuilder()
      .setAccentColor(isOffline ? VEDO_THEME_COLORS.danger : VEDO_THEME_COLORS.gold)
      .setImageBuffer(cardBuffer, "vedo-bot-panel.png")
      .addTextDisplay(
        `› **Durum:** ${isOffline ? "● Çevrimdışı (Uyku Modu)" : "● Çevrimiçi (Aktif)"}  •  **Yetkili Sahip:** ${ownerDisplay}`
      )
      .addSeparator(true, 1)
      .addActionRow([
        {
          type: 2,
          style: 4,
          label: "Çevrimdışı Yap",
          custom_id: "vedo_bot_offline_btn",
          disabled: isOffline
        },
        {
          type: 2,
          style: 3,
          label: "Çevrimiçi Yap",
          custom_id: "vedo_bot_online_btn",
          disabled: !isOffline
        },
        {
          type: 2,
          style: 2,
          label: "Durumu Yenile",
          custom_id: "vedo_bot_status_btn"
        }
      ])
      .setFooter("Made by Noz");
  }

  private getOwnerOnlyContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.danger)
      .addTextDisplay(
        `### Yetkisiz İşlem\n` +
        `› *Bu komut ve kontrol paneli yalnızca bot sahibi tarafından kullanılabilir.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");
  }

  private getOfflineNoticeContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.danger)
      .addTextDisplay(
        `### Bot Çevrimdışı (Uyku Modunda)\n` +
        `› *Bot şu anda sahibi tarafından çevrimdışı/bakım moduna alınmıştır. Aktif edildiğinde komutlar yeniden çalışacaktır.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");
  }

  public async setOfflineMode(offline: boolean, actorUserId?: string): Promise<void> {
    this.config.botOfflineMode = offline;
    this.saveConfig();

    this.client.user?.setPresence({
      status: offline ? "invisible" : "online",
      activities: []
    });

    if (offline) {
      this.voiceManager.disconnect();
    } else if (this.config.voiceChannelId) {
      await this.voiceManager.join(this.config.guildId, this.config.voiceChannelId);
    }

    if (this.config.logChannelId) {
      const guild = this.client.guilds.cache.get(this.config.guildId);
      const logChannel = guild?.channels.cache.get(this.config.logChannelId);
      if (logChannel && "send" in logChannel) {
        const logContainer = new VedoContainerBuilder()
          .setAccentColor(offline ? VEDO_THEME_COLORS.danger : VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### ${offline ? "Bot Çevrimdışı (Uyku Modu)" : "Bot Çevrimiçi Moda Geçti"}\n` +
            `› **Yeni Durum:** ${offline ? "`Çevrimdışı (Görünmez + Uyku)`" : "`Çevrimiçi (Aktif)`"}\n` +
            `› **İşlemi Yapan:** ${actorUserId ? `<@${actorUserId}>` : "`Sistem`"}\n` +
            `› **Zaman:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
            `› *${offline ? "Bot görünmez duruma alındı, ses kanalından çıkarıldı ve tüm guard/komut otomasyonları duraklatıldı." : "Bot tekrar çevrimiçi duruma geçti ve tüm guard/ses sistemleri aktifleştirildi."}*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await (logChannel as TextChannel).send(logContainer.toReply()).catch(() => {});
      }
    }
  }

  private async handleBotPanelButton(interaction: ButtonInteraction): Promise<void> {
    if (!this.isBotOwner(interaction.user.id)) {
      await interaction.reply(this.getOwnerOnlyContainer().toEphemeralReply());
      return;
    }

    await interaction.deferUpdate();

    if (interaction.customId === "vedo_bot_offline_btn") {
      await this.setOfflineMode(true, interaction.user.id);
    } else if (interaction.customId === "vedo_bot_online_btn") {
      await this.setOfflineMode(false, interaction.user.id);
    }

    const updatedControl = await this.getBotControlContainer(interaction.guild);
    await interaction.editReply(updatedControl.toEditReply());
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;

    if (commandName === "bot") {
      if (!this.isBotOwner(interaction.user.id)) {
        await interaction.reply(this.getOwnerOnlyContainer().toEphemeralReply());
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "durum") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const islem = interaction.options.getString("islem", true);
        if (islem === "kapat") {
          await this.setOfflineMode(true, interaction.user.id);
        } else if (islem === "ac") {
          await this.setOfflineMode(false, interaction.user.id);
        }
        const controlContainer = await this.getBotControlContainer(interaction.guild);
        await interaction.editReply(controlContainer.toEditReply());
        return;
      }

      if (sub === "panel") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const controlContainer = await this.getBotControlContainer(interaction.guild);

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send(controlContainer.toReply());
        }

        const confirmContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Kontrol Paneli Gönderildi\n` +
            `› *Bot kontrol paneli bu kanala başarıyla gönderildi.*`
          )
          .setFooter("Made by Noz");

        await interaction.editReply(confirmContainer.toEditReply());
        return;
      }
    }

    if (this.config.botOfflineMode) {
      await interaction.reply(this.getOfflineNoticeContainer().toEphemeralReply());
      return;
    }

    if (commandName === "mulakat") {
      const sub = interaction.options.getSubcommand();
      const rol = interaction.options.getRole("rol", true);

      if (rol.id === interaction.guildId || ("managed" in rol && rol.managed)) {
        const invalidContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.danger)
          .addTextDisplay(
            `### Geçersiz Rol\n` +
            `› *@everyone veya entegrasyon/bot rolleri mülakat rolü olarak seçilemez.*`
          )
          .setFooter("Made by Noz");
        await interaction.reply(invalidContainer.toEphemeralReply());
        return;
      }

      if (sub === "verilecek-rol") {
        this.config.registeredRoleId = rol.id;
        this.ticketManager.updateConfig({ registeredRoleId: rol.id });
        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Mülakat Verilecek Rol Güncellendi\n` +
            `› **Verilecek Rol:** <@&${rol.id}>\n` +
            `› **Alınacak Rol:** ${this.config.unregisteredRoleId ? `<@&${this.config.unregisteredRoleId}>` : "`Tanımlanmadı`"}\n` +
            `› *Mülakat kabul edildiğinde adaya bu rol otomatik olarak verilecektir.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "alinacak-rol") {
        this.config.unregisteredRoleId = rol.id;
        this.ticketManager.updateConfig({ unregisteredRoleId: rol.id });
        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Mülakat Alınacak Rol Güncellendi\n` +
            `› **Alınacak Rol:** <@&${rol.id}>\n` +
            `› **Verilecek Rol:** ${this.config.registeredRoleId ? `<@&${this.config.registeredRoleId}>` : "`Tanımlanmadı`"}\n` +
            `› *Yeni üyelere başlangıçta verilecek ve mülakat kabul edildiğinde adaydan otomatik olarak alınacaktır.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }
    }

    if (commandName === "kayit") {
      const sub = interaction.options.getSubcommand();

      if (sub === "ayarla") {
        const uyeRolu = interaction.options.getRole("uye-rolu", true);
        const mulakatRolu = interaction.options.getRole("mulakat-rolu", true);
        const yetkiliRolu = interaction.options.getRole("yetkili-rolu");
        const kategori = interaction.options.getChannel("kategori");

        this.config.registeredRoleId = uyeRolu.id;
        this.config.unregisteredRoleId = mulakatRolu.id;
        if (yetkiliRolu) this.config.staffRoleId = yetkiliRolu.id;
        if (kategori) this.config.ticketCategoryId = kategori.id;

        this.ticketManager.updateConfig({
          registeredRoleId: uyeRolu.id,
          unregisteredRoleId: mulakatRolu.id,
          staffRoleId: this.config.staffRoleId,
          ticketCategoryId: this.config.ticketCategoryId
        });
        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Kayıt & Mülakat Ayarları Güncellendi\n` +
            `› **Kayıtlı Üye Rolü:** <@&${uyeRolu.id}>\n` +
            `› **Mülakat Rolü:** <@&${mulakatRolu.id}>\n` +
            `› **Yetkili Rolü:** ${this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`"}\n` +
            `› **Mülakat Kategorisi:** ${this.config.ticketCategoryId ? `<#${this.config.ticketCategoryId}>` : "`Tanımlanmadı`"}\n` +
            `› *Ayarlar başarıyla kaydedildi ve yürürlüğe girdi.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "kur") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const kanal = interaction.options.getChannel("kanal", true);
        if ("send" in kanal) {
          const panel = await this.ticketManager.getPanelContainer(interaction.guild);
          await (kanal as TextChannel).send(panel.toReply());
          const okContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.success)
            .addTextDisplay(
              `### Kayıt Paneli Kuruldu\n` +
              `› *Mülakat başvuru paneli <#${kanal.id}> kanalına başarıyla kuruldu.*`
            )
            .setFooter("Made by Noz");
          await interaction.editReply(okContainer.toEditReply());
        } else {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### Geçersiz Kanal\n` +
              `› *Lütfen geçerli bir metin kanalı seçiniz.*`
            )
            .setFooter("Made by Noz");
          await interaction.editReply(errContainer.toEditReply());
        }
        return;
      }

      if (sub === "bilgi") {
        await interaction.deferReply();
        const reg = this.config.registeredRoleId ? `<@&${this.config.registeredRoleId}>` : "`Tanımlanmadı`";
        const unreg = this.config.unregisteredRoleId ? `<@&${this.config.unregisteredRoleId}>` : "`Tanımlanmadı`";
        const staff = this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`";
        const cat = this.config.ticketCategoryId ? `<#${this.config.ticketCategoryId}>` : "`Tanımlanmadı`";

        const regName = this.config.registeredRoleId
          ? `@${interaction.guild?.roles.cache.get(this.config.registeredRoleId)?.name || this.config.registeredRoleId}`
          : "Tanımlanmadı";
        const unregName = this.config.unregisteredRoleId
          ? `@${interaction.guild?.roles.cache.get(this.config.unregisteredRoleId)?.name || this.config.unregisteredRoleId}`
          : "Tanımlanmadı";
        const staffName = this.config.staffRoleId
          ? `@${interaction.guild?.roles.cache.get(this.config.staffRoleId)?.name || this.config.staffRoleId}`
          : "Tanımlanmadı";
        const catName = this.config.ticketCategoryId
          ? `#${interaction.guild?.channels.cache.get(this.config.ticketCategoryId)?.name || this.config.ticketCategoryId}`
          : "Tanımlanmadı";

        const cardBuffer = await VedoThemeCard.generate({
          title: "GÜNCEL KAYIT YAPILANDIRMASI",
          greeting: "Querencia Kayıt Sistemi,",
          subtitle: "Sunucuda aktif olarak kullanılan mülakat rolleri ve kategori yapılandırması özeti.",
          accentColor: "#D4AF37",
          watermark: "QUERENCIA",
          iconUrl: interaction.guild?.iconURL({ extension: "png", size: 128 }) || undefined,
          columns: 2,
          items: [
            { icon: "crown", title: "Kayıtlı Üye Rolü", description: regName },
            { icon: "shield", title: "Mülakat Rolü", description: unregName },
            { icon: "user", title: "Yetkili Rolü", description: staffName },
            { icon: "file", title: "Mülakat Kategorisi", description: catName }
          ]
        });

        const infoContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.gold)
          .setImageBuffer(cardBuffer, "vedo-kayit-bilgi.png")
          .addTextDisplay(
            `› **Üye:** ${reg}  •  **Mülakat:** ${unreg}\n` +
            `› **Yetkili:** ${staff}  •  **Kategori:** ${cat}`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.editReply(infoContainer.toEditReply());
        return;
      }
    }

    if (commandName === "ticket") {
      const sub = interaction.options.getSubcommand();

      if (sub === "ayarla") {
        const kategori = interaction.options.getChannel("kategori", true);
        const yetkiliRolu = interaction.options.getRole("yetkili-rolu");
        const logKanali = interaction.options.getChannel("log-kanali");

        this.config.ticketCategoryId = kategori.id;
        if (yetkiliRolu) this.config.staffRoleId = yetkiliRolu.id;
        if (logKanali) this.config.logChannelId = logKanali.id;

        this.ticketManager.updateConfig({
          ticketCategoryId: kategori.id,
          staffRoleId: this.config.staffRoleId
        });
        if (logKanali) {
          this.auditGuard.updateLogChannel(logKanali.id);
        }
        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Ticket Ayarları Güncellendi\n` +
            `› **Ticket Kategorisi:** <#${kategori.id}>\n` +
            `› **Yetkili Rolü:** ${this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`"}\n` +
            `› **Log Kanalı:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : "`Tanımlanmadı`"}\n` +
            `› *Ticket ve mülakat oda yapılandırması kalıcı olarak kaydedildi.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "kur") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const kanal = interaction.options.getChannel("kanal", true);
        if ("send" in kanal) {
          const panel = await this.ticketManager.getPanelContainer(interaction.guild);
          await (kanal as TextChannel).send(panel.toReply());
          const okContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.success)
            .addTextDisplay(
              `### Ticket Paneli Kuruldu\n` +
              `› *Mülakat ve ticket paneli <#${kanal.id}> kanalına başarıyla kuruldu.*`
            )
            .setFooter("Made by Noz");
          await interaction.editReply(okContainer.toEditReply());
        } else {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### Geçersiz Kanal\n` +
              `› *Lütfen geçerli bir metin kanalı seçiniz.*`
            )
            .setFooter("Made by Noz");
          await interaction.editReply(errContainer.toEditReply());
        }
        return;
      }

      if (sub === "kapat") {
        if (interaction.channel && "delete" in interaction.channel) {
          const closingContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.warning)
            .addTextDisplay(
              `### Oda Kapatılıyor\n` +
              `› *Bu mülakat/ticket odası 5 saniye içerisinde siliniyor.*`
            )
            .setFooter("Made by Noz");
          await interaction.reply(closingContainer.toReply());
          setTimeout(() => {
            interaction.channel?.delete().catch(() => {});
          }, 5000);
        } else {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### İşlem Başarısız\n` +
              `› *Bu komut yalnızca silinebilir kanallarda çalıştırılabilir.*`
            )
            .setFooter("Made by Noz");
          await interaction.reply(errContainer.toEphemeralReply());
        }
        return;
      }
    }

    if (commandName === "guard") {
      const sub = interaction.options.getSubcommand();

      if (sub === "ayarla") {
        const logKanali = interaction.options.getChannel("log-kanali");
        const sesKanali = interaction.options.getChannel("ses-kanali");
        const banLimit = interaction.options.getInteger("ban-limit");
        const timeoutLimit = interaction.options.getInteger("timeout-limit");

        if (logKanali) {
          this.config.logChannelId = logKanali.id;
          this.auditGuard.updateLogChannel(logKanali.id);
        }
        if (sesKanali) {
          this.config.voiceChannelId = sesKanali.id;
          if (interaction.guildId) {
            await this.voiceManager.join(interaction.guildId, sesKanali.id);
          }
        }
        if (banLimit) this.config.limits.ban.limit = banLimit;
        if (timeoutLimit) this.config.limits.timeout.limit = timeoutLimit;

        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Guard Ayarları Güncellendi\n` +
            `› **Log Kanalı:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : "`Tanımlanmadı`"}\n` +
            `› **7/24 Ses Kanalı:** ${this.config.voiceChannelId ? `<#${this.config.voiceChannelId}>` : "`Tanımlanmadı`"}\n` +
            `› **Ban Limiti:** \`${this.config.limits.ban.limit} Ban / 10 Saniye\`\n` +
            `› **Timeout Limiti:** \`${this.config.limits.timeout.limit} Timeout / 10 Saniye\`\n` +
            `› *Guard limit ve kanal ayarları kalıcı olarak kaydedildi.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "limitler") {
        await interaction.deferReply();
        const limitsContainer = await this.getLimitsContainer(interaction.guild);
        await interaction.editReply(limitsContainer.toEditReply());
        return;
      }

      if (sub === "whitelist") {
        const islem = interaction.options.getString("islem", true);
        const kullanici = interaction.options.getUser("kullanici");
        const rol = interaction.options.getRole("rol");

        if (!kullanici && !rol) {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### Eksik Bilgi\n` +
              `› *Lütfen bir kullanıcı veya rol belirtiniz.*`
            )
            .setFooter("Made by Noz");
          await interaction.reply(errContainer.toEphemeralReply());
          return;
        }

        if (islem === "ekle") {
          if (kullanici) {
            if (!this.config.whitelistedUsers.includes(kullanici.id)) {
              this.config.whitelistedUsers.push(kullanici.id);
            }
            this.auditGuard.addWhitelistedUser(kullanici.id);
            this.spamGuard.addWhitelistedUser(kullanici.id);
          }
          if (rol) {
            if (!this.config.whitelistedRoles.includes(rol.id)) {
              this.config.whitelistedRoles.push(rol.id);
            }
            this.auditGuard.addWhitelistedRole(rol.id);
            this.spamGuard.addWhitelistedRole(rol.id);
          }
        } else {
          if (kullanici) {
            this.config.whitelistedUsers = this.config.whitelistedUsers.filter((id) => id !== kullanici.id);
            this.auditGuard.removeWhitelistedUser(kullanici.id);
            this.spamGuard.removeWhitelistedUser(kullanici.id);
          }
          if (rol) {
            this.config.whitelistedRoles = this.config.whitelistedRoles.filter((id) => id !== rol.id);
            this.auditGuard.removeWhitelistedRole(rol.id);
            this.spamGuard.removeWhitelistedRole(rol.id);
          }
        }

        this.saveConfig();

        const container = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Whitelist Güncellendi\n` +
            `› **İşlem:** \`${islem === "ekle" ? "Eklendi" : "Çıkarıldı"}\`\n` +
            (kullanici ? `› **Kullanıcı:** <@${kullanici.id}>\n` : "") +
            (rol ? `› **Rol:** <@&${rol.id}>\n` : "") +
            `› *Muafiyet listesi başarıyla güncellendi.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }
    }

    if (commandName === "emojiyukle") {
      if (!interaction.guild) {
        return;
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageGuildExpressions)) {
        const permContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.danger)
          .addTextDisplay(
            `### Yetki Eksik\n` +
            `› *Botun emoji yükleyebilmesi için sunucuda \`İfadeleri Yönet\` yetkisine sahip olması gerekir.*`
          )
          .setFooter("Made by Noz");
        await interaction.reply(permContainer.toEphemeralReply());
        return;
      }

      const rawText = interaction.options.getString("emojiler");
      const customPrefix = interaction.options.getString("isim");
      const attachmentNames = ["dosya1", "dosya2", "dosya3", "dosya4", "dosya5"];
      const attachments: Attachment[] = [];
      for (const fieldName of attachmentNames) {
        const file = interaction.options.getAttachment(fieldName);
        if (file) {
          attachments.push(file);
        }
      }

      const { items, truncatedCount } = VedoEmojiUploader.parseInputs(
        rawText,
        attachments,
        customPrefix
      );

      if (items.length === 0) {
        const emptyContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.warning)
          .addTextDisplay(
            `### Geçerli Emoji Bulunamadı\n` +
            `› *Lütfen en az bir özel emoji (\`<:ad:id>\`), geçerli bir görsel bağlantısı (\`https://...\`) veya görsel dosyası (\`dosya1\`-\`dosya5\`) giriniz.*`
          )
          .setFooter("Made by Noz");
        await interaction.reply(emptyContainer.toEphemeralReply());
        return;
      }

      await interaction.deferReply();

      const progressContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.gold)
        .addTextDisplay(
          `### Toplu Emoji Yükleniyor\n` +
          `› **Toplam:** \`${items.length}\` emoji işleniyor — *lütfen bekleyiniz.*`
        )
        .setFooter("Made by Noz");
      await interaction.editReply(progressContainer.toEditReply());

      const result = await VedoEmojiUploader.uploadBatch(
        interaction.guild,
        items,
        truncatedCount
      );
      const reportContainer = await VedoEmojiUploader.buildResultContainer(
        interaction.guild,
        result
      );
      await interaction.editReply(reportContainer.toEditReply());
      return;
    }

    if (commandName === "tweet") {
      const mesaj = interaction.options.getString("mesaj", true);
      const gorsel = interaction.options.getAttachment("gorsel");
      const member = interaction.member as GuildMember;
      const displayName = member?.displayName || interaction.user.displayName || interaction.user.username;
      const username = interaction.user.username;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 128 });

      const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const day = now.getDate();
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      const timeStr = `${hours}:${minutes}`;
      const dateStr = `${day} ${month} ${year}`;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        const imageBuffer = await VedoTweetCard.generate({
          displayName,
          username,
          avatarUrl,
          text: mesaj,
          timeStr,
          dateStr,
          imageUrl: gorsel?.url
        });

        if (interaction.channel && "send" in interaction.channel) {
          await (interaction.channel as TextChannel).send({
            files: [{ attachment: imageBuffer, name: "tweet.png" }]
          });
        }

        const tweetOk = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Tweet Paylaşıldı\n` +
            `› *Tweet görseliniz kanala başarıyla gönderildi.*`
          )
          .setFooter("Made by Noz");

        await interaction.editReply(tweetOk.toEditReply());
      } catch {
        const tweetErr = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.danger)
          .addTextDisplay(
            `### Tweet Gönderilemedi\n` +
            `› *Tweet görseli oluşturulurken bir hata meydana geldi.*`
          )
          .setFooter("Made by Noz");

        await interaction.editReply(tweetErr.toEditReply());
      }
      return;
    }

    if (commandName === "giris-cikis") {
      const sub = interaction.options.getSubcommand();

      if (sub === "liste") {
        if (!interaction.guild) return;
        await interaction.deferReply();

        const joinCount = this.memberEvents.filter((ev) => ev.type === "giris").length;
        const leaveCount = this.memberEvents.filter((ev) => ev.type === "cikis").length;

        const cardBuffer = await VedoThemeCard.generate({
          title: "SUNUCU GİRİŞ & ÇIKIŞ KAYITLARI",
          greeting: "Querencia Üye Hareketleri,",
          subtitle: "Sunucuya katılan ve ayrılan son üyelerin anlık izleme ve istatistik özeti.",
          accentColor: "#D4AF37",
          watermark: "QUERENCIA",
          iconUrl: interaction.guild.iconURL({ extension: "png", size: 128 }) || undefined,
          columns: 2,
          items: [
            { icon: "users", title: "Toplam Üye", description: `${interaction.guild.memberCount} üye` },
            { icon: "check", title: "Son Katılımlar", description: `${joinCount} üye katıldı`, accent: "#22C55E" },
            { icon: "cross", title: "Son Ayrılmalar", description: `${leaveCount} üye ayrıldı`, accent: "#EF4444" },
            { icon: "list", title: "Son Hareketler", description: `Son ${this.memberEvents.length} kayıt` }
          ]
        });

        let listContent = "";
        if (this.memberEvents.length === 0) {
          listContent = "› *Henüz kaydedilmiş yeni giriş veya çıkış hareketi bulunmuyor.*";
        } else {
          listContent = this.memberEvents
            .map((ev) => {
              const marker = ev.type === "giris" ? "● **Katıldı:**" : "● **Ayrıldı:**";
              return `› ${marker} <@${ev.userId}> (\`${ev.userTag}\`) — <t:${Math.floor(ev.timestamp / 1000)}:R>`;
            })
            .join("\n");
        }

        const listContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.gold)
          .setImageBuffer(cardBuffer, "vedo-giris-cikis.png")
          .addTextDisplay(listContent)
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.editReply(listContainer.toEditReply());
        return;
      }

      if (sub === "ayarla") {
        const kanal = interaction.options.getChannel("kanal", true);
        this.config.joinLeaveChannelId = kanal.id;
        this.saveConfig();

        const setupContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### Giriş - Çıkış Kanalı Ayarlandı\n` +
            `› **Bildirim Kanalı:** <#${kanal.id}>\n` +
            `› *Sunucuya katılan veya ayrılan tüm üyeler bu kanala bildirilecektir.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(setupContainer.toReply());
        return;
      }

      if (sub === "kapat") {
        this.config.joinLeaveChannelId = undefined;
        this.saveConfig();

        const closeContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.danger)
          .addTextDisplay(
            `### Giriş - Çıkış Bildirimleri Kapatıldı\n` +
            `› *Otomatik giriş ve çıkış bildirimleri devre dışı bırakıldı.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(closeContainer.toReply());
        return;
      }
    }

    if (commandName === "ses") {
      const sub = interaction.options.getSubcommand();
      if (sub === "afk") {
        const kanal = interaction.options.getChannel("kanal");
        const durum = interaction.options.getBoolean("durum");

        if (durum === false) {
          this.config.afkMuteEnabled = false;
          this.saveConfig();

          const disableContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### AFK Susturma Devre Dışı Bırakıldı\n` +
              `› **Durum:** \`Kapalı\`\n` +
              `› *Artık AFK odasına geçen kullanıcılar otomatik olarak susturulmayacaktır.*`
            )
            .addSeparator(true, 1)
            .setFooter("Made by Noz");

          await interaction.reply(disableContainer.toReply());
          return;
        }

        const targetId = kanal ? kanal.id : this.config.afkChannelId || interaction.guild?.afkChannelId;

        if (!targetId) {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### AFK Odası Bulunamadı\n` +
              `› *Sunucuda tanımlı bir Discord AFK odası bulunamadı. Lütfen kanal belirtiniz:* \`/ses afk kanal:[#kanal]\``
            )
            .setFooter("Made by Noz");
          await interaction.reply(errContainer.toEphemeralReply());
          return;
        }

        this.config.afkChannelId = targetId;
        this.config.afkMuteEnabled = true;
        this.saveConfig();

        let affectedCount = 0;
        const afkChannel = interaction.guild?.channels.cache.get(targetId);
        if (afkChannel && afkChannel.isVoiceBased()) {
          for (const [, voiceMember] of afkChannel.members) {
            if (!voiceMember.voice.serverMute) {
              await voiceMember.voice.setMute(true, "VedoGuard AFK Odası Otomatik Susturma").catch(() => {});
              affectedCount++;
            }
          }
        }

        const successContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.success)
          .addTextDisplay(
            `### AFK Otomatik Susturma Aktif Edildi\n` +
            `› **AFK Kanalı:** <#${targetId}>\n` +
            `› **Sistem Durumu:** \`Aktif (Sunucu Geneli Susturma)\`\n` +
            `› **Mevcut Susturulan Üye:** \`${affectedCount}\`\n` +
            `› *Bu odaya geçen tüm kullanıcılar otomatik olarak susturulacaktır.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await interaction.reply(successContainer.toReply());
        return;
      }
    }

    if (commandName === "kayit-paneli") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const panel = await this.ticketManager.getPanelContainer(interaction.guild);
      if (interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send(panel.toReply());
      }
      const confirmContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.success)
        .addTextDisplay(
          `### Mülakat Paneli Oluşturuldu\n` +
          `› *Başvuru paneli bu kanala başarıyla gönderildi.*`
        )
        .setFooter("Made by Noz");
      await interaction.editReply(confirmContainer.toEditReply());
      return;
    }

    if (commandName === "ses-paneli") {
      if (!interaction.guild) return;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const panel = await this.voiceManager.getStatusContainer(interaction.guild);
      if (interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send(panel.toReply());
      }
      const confirmContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.success)
        .addTextDisplay(
          `### Ses Kontrol Paneli Oluşturuldu\n` +
          `› *7/24 ses kontrol paneli bu kanala başarıyla gönderildi.*`
        )
        .setFooter("Made by Noz");
      await interaction.editReply(confirmContainer.toEditReply());
      return;
    }

    if (commandName === "sil") {
      const amount = interaction.options.getInteger("sayi", true);
      if (interaction.channel && "bulkDelete" in interaction.channel) {
        try {
          const deleted = await interaction.channel.bulkDelete(amount, true);
          const successContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.success)
            .addTextDisplay(
              `### Mesaj Temizleme Tamamlandı\n` +
              `› **Silinen Mesaj Sayısı:** \`${deleted.size}\`\n` +
              `› **İşlemi Yapan:** <@${interaction.user.id}>\n` +
              `› *14 günden eski mesajlar Discord politikası gereği toplu silinemez.*`
            )
            .addSeparator(true, 1)
            .setFooter("Made by Noz");

          await interaction.reply(successContainer.toReply());
          setTimeout(() => {
            interaction.deleteReply().catch(() => {});
          }, 5000);
        } catch {
          const errContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### İşlem Başarısız\n` +
              `› *Mesajlar silinirken bir hata oluştu.*`
            )
            .setFooter("Made by Noz");
          await interaction.reply(errContainer.toEphemeralReply());
        }
      }
      return;
    }

    if (commandName === "limitler") {
      await interaction.deferReply();
      const limitsContainer = await this.getLimitsContainer(interaction.guild);
      await interaction.editReply(limitsContainer.toEditReply());
      return;
    }

    if (commandName === "yardim") {
      await interaction.deferReply();
      const helpContainer = await this.getHelpContainer(interaction.guild);
      await interaction.editReply(helpContainer.toEditReply());
      return;
    }

    if (commandName === "ping") {
      const pingContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.gold)
        .addTextDisplay(
          `### Sistem Gecikmesi\n` +
          `› **WebSocket Gecikmesi:** \`${this.client.ws.ping}ms\`\n` +
          `› **Mesaj Yanıt Süresi:** \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\``
        )
        .addSeparator(true, 1)
        .setFooter("Made by Noz");
      await interaction.reply(pingContainer.toReply());
      return;
    }
  }

  private registerEvents(): void {
    this.client.on(Events.Error, (error) => {
      console.error("[VedoGuard Gateway Error]", error);
    });

    this.client.on(Events.ShardDisconnect, (event, shardId) => {
      console.warn(`[VedoGuard Shard ${shardId} Baglanti Kesildi]`, event);
    });

    this.client.on(Events.ShardReconnecting, (shardId) => {
      console.log(`[VedoGuard Shard ${shardId} Yeniden Baglaniyor...]`);
    });

    this.client.on(Events.ShardResume, (shardId, replayedEvents) => {
      console.log(`[VedoGuard Shard ${shardId} Oturumu Surduruldu] ${replayedEvents} olay.`);
      this.client.user?.setPresence({
        status: this.config.botOfflineMode ? "invisible" : "online",
        activities: []
      });
    });

    this.client.once(Events.ClientReady, async () => {
      console.log(`[VedoGuard] ${this.client.user?.tag} aktif ve izlemede.`);

      await this.registerSlashCommands();
      await this.syncBotAvatar();
      await this.syncBotName();

      if (this.config.botOfflineMode) {
        this.client.user?.setPresence({ status: "invisible", activities: [] });
      } else {
        this.client.user?.setPresence({ status: "online", activities: [] });
        if (this.config.voiceChannelId) {
          await this.voiceManager.join(this.config.guildId, this.config.voiceChannelId);
        }
      }
    });

    this.client.on(Events.GuildMemberAdd, async (member) => {
      if (this.config.botOfflineMode) return;
      if (member.guild.id !== this.config.guildId) return;

      this.memberEvents.unshift({
        type: "giris",
        userId: member.id,
        userTag: member.user.tag,
        timestamp: Date.now()
      });
      if (this.memberEvents.length > 20) {
        this.memberEvents.pop();
      }

      if (this.config.unregisteredRoleId) {
        await member.roles.add(this.config.unregisteredRoleId).catch(() => {});
      }

      if (this.config.joinLeaveChannelId) {
        const channel = member.guild.channels.cache.get(this.config.joinLeaveChannelId);
        if (channel && "send" in channel) {
          const joinContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.success)
            .addTextDisplay(
              `### Yeni Üye Katıldı\n` +
              `› **Kullanıcı:** <@${member.id}> (\`${member.user.tag}\`)\n` +
              `› **Katılım Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
              `› **Hesap Açılış:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:d>\n` +
              `› **Toplam Sunucu Üyesi:** \`${member.guild.memberCount}\``
            )
            .addSeparator(true, 1)
            .setFooter("Made by Noz");

          await (channel as TextChannel).send(joinContainer.toReply()).catch(() => {});
        }
      }
    });

    this.client.on(Events.GuildMemberRemove, async (member) => {
      if (this.config.botOfflineMode) return;
      if (member.guild.id !== this.config.guildId) return;

      this.memberEvents.unshift({
        type: "cikis",
        userId: member.id,
        userTag: member.user.tag,
        timestamp: Date.now()
      });
      if (this.memberEvents.length > 20) {
        this.memberEvents.pop();
      }

      if (this.config.joinLeaveChannelId) {
        const channel = member.guild.channels.cache.get(this.config.joinLeaveChannelId);
        if (channel && "send" in channel) {
          const leaveContainer = new VedoContainerBuilder()
            .setAccentColor(VEDO_THEME_COLORS.danger)
            .addTextDisplay(
              `### Bir Üye Ayrıldı\n` +
              `› **Kullanıcı:** <@${member.id}> (\`${member.user.tag}\`)\n` +
              `› **Ayrılma Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
              `› **Kalan Üye Sayısı:** \`${member.guild.memberCount}\``
            )
            .addSeparator(true, 1)
            .setFooter("Made by Noz");

          await (channel as TextChannel).send(leaveContainer.toReply()).catch(() => {});
        }
      }
    });

    this.client.on(Events.GuildBanAdd, async (ban) => {
      if (this.config.botOfflineMode) return;
      if (ban.guild.id !== this.config.guildId) return;
      await this.auditGuard.trackAndEnforce(
        ban.guild,
        "ban",
        this.config.limits.ban.limit,
        this.config.limits.ban.windowMs
      );
    });

    this.client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
      if (this.config.botOfflineMode) return;
      if (newMember.guild.id !== this.config.guildId) return;
      if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        if (newMember.isCommunicationDisabled()) {
          await this.auditGuard.trackAndEnforce(
            newMember.guild,
            "timeout",
            this.config.limits.timeout.limit,
            this.config.limits.timeout.windowMs
          );
        }
      }
    });

    this.client.on(Events.ChannelDelete, async (channel) => {
      if (this.config.botOfflineMode) return;
      if (!channel.isDMBased() && channel.guild.id === this.config.guildId) {
        await this.auditGuard.trackAndEnforce(
          channel.guild,
          "channelDelete",
          this.config.limits.channelDelete.limit,
          this.config.limits.channelDelete.windowMs
        );
      }
    });

    this.client.on(Events.GuildRoleDelete, async (role) => {
      if (this.config.botOfflineMode) return;
      if (role.guild.id !== this.config.guildId) return;
      await this.auditGuard.trackAndEnforce(
        role.guild,
        "roleDelete",
        this.config.limits.roleDelete.limit,
        this.config.limits.roleDelete.windowMs
      );
    });

    this.client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
      if (this.config.botOfflineMode) return;
      if (newState.guild.id !== this.config.guildId) return;
      if (!this.config.afkMuteEnabled) return;

      const targetAfkChannelId = this.config.afkChannelId || newState.guild.afkChannelId;
      if (!targetAfkChannelId) return;

      if (newState.channelId === targetAfkChannelId) {
        if (newState.member && !newState.serverMute) {
          try {
            await newState.member.voice.setMute(true, "VedoGuard AFK Odası Otomatik Susturma");
            if (this.config.logChannelId) {
              const logChannel = newState.guild.channels.cache.get(this.config.logChannelId);
              if (logChannel && "send" in logChannel) {
                const logCard = new VedoContainerBuilder()
                  .setAccentColor(VEDO_THEME_COLORS.obsidian)
                  .addTextDisplay(
                    `### AFK Otomatik Susturma Uygulandı\n` +
                    `› **Üye:** <@${newState.member.id}> (\`${newState.member.user.tag}\`)\n` +
                    `› **AFK Odası:** <#${targetAfkChannelId}>\n` +
                    `› **Zaman:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                    `› *Kullanıcı AFK kanalına girdiği için mikrofonu sunucu genelinde susturuldu.*`
                  )
                  .addSeparator(true, 1)
                  .setFooter("Made by Noz");
                await (logChannel as TextChannel).send(logCard.toReply()).catch(() => {});
              }
            }
          } catch (err) {
            console.error("[VedoGuard AFK Mute Error]", err);
          }
        }
      } else if (oldState.channelId === targetAfkChannelId && newState.channelId !== null) {
        if (newState.member && newState.serverMute) {
          try {
            await newState.member.voice.setMute(false, "VedoGuard AFK Odasından Çıkış");
          } catch (err) {
            console.error("[VedoGuard AFK Unmute Error]", err);
          }
        }
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (this.config.botOfflineMode) return;
      if (!message.guild || message.author.bot) return;

      if (message.content === "!limitler") {
        const limitsContainer = await this.getLimitsContainer(message.guild);
        await message.channel.send(limitsContainer.toReply());
        return;
      }

      if (message.content === "!yardım" || message.content === "!help") {
        const helpContainer = await this.getHelpContainer(message.guild);
        await message.channel.send(helpContainer.toReply());
        return;
      }

      await this.spamGuard.handleMessage(message);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isChatInputCommand()) {
          await this.handleSlashCommand(interaction);
          return;
        }

        if (interaction.isButton()) {
          if (interaction.customId.startsWith("vedo_bot_")) {
            await this.handleBotPanelButton(interaction);
            return;
          }
          if (this.config.botOfflineMode) {
            await interaction.reply(this.getOfflineNoticeContainer().toEphemeralReply());
            return;
          }
          if (interaction.customId.startsWith("vedo_ticket_")) {
            await this.ticketManager.handleButtonInteraction(interaction);
            return;
          }
          if (interaction.customId.startsWith("vedo_voice_")) {
            await this.voiceManager.handleInteraction(interaction);
            return;
          }
        }

        if (interaction.isModalSubmit()) {
          if (this.config.botOfflineMode) {
            await interaction.reply(this.getOfflineNoticeContainer().toEphemeralReply());
            return;
          }
          if (interaction.customId === "vedo_ticket_modal_submit") {
            await this.ticketManager.handleModalSubmit(interaction);
            return;
          }
        }
      } catch (error) {
        console.error("[VedoGuard] Etkileşim hatası yakalandı:", error);
      }
    });
  }

  public async start(token: string, mongoUri: string): Promise<void> {
    this.token = token;
    await VedoDatabase.connect(mongoUri);
    await this.client.login(token);
  }
}
