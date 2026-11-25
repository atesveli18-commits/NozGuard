import {
  Client,
  GatewayIntentBits,
  Partials,
  GuildMember,
  Events,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ChannelType,
  TextChannel
} from "discord.js";
import fs from "fs";
import path from "path";
import { VedoAuditGuard } from "./VedoAuditGuard";
import { VedoSpamGuard } from "./VedoSpamGuard";
import { VedoDatabase } from "./VedoDatabase";
import { VedoVoiceManager } from "./VedoVoiceManager";
import { VedoTicketManager } from "./VedoTicketManager";
import { VedoContainerBuilder } from "./VedoContainerBuilder";
import { VedoTweetCard } from "./VedoTweetCard";

export interface IVedoGuardConfig {
  guildId: string;
  logChannelId: string;
  joinLeaveChannelId?: string;
  voiceChannelId?: string;
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

  public getLimitsContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplay(
        `# 🛡️ **VEDOGUARD SUNUCU KORUMA LİMİTLERİ**\n` +
        `*Sunucuda yetkililerin kötüye kullanımını ve saldırıları önleyen aktif limitler:*\n\n` +
        `🔨 **Sağlayıcı Ban Limiti:** \`${this.config.limits.ban.limit} Ban / ${this.config.limits.ban.windowMs / 1000} Saniye\`\n` +
        `⏳ **Zaman Aşımı (Timeout) Limiti:** \`${this.config.limits.timeout.limit} Timeout / ${this.config.limits.timeout.windowMs / 1000} Saniye\`\n` +
        `📁 **Kanal Silme Limiti:** \`${this.config.limits.channelDelete.limit} Kanal / ${this.config.limits.channelDelete.windowMs / 1000} Saniye\`\n` +
        `🎭 **Rol Silme Limiti:** \`${this.config.limits.roleDelete.limit} Rol / ${this.config.limits.roleDelete.windowMs / 1000} Saniye\`\n` +
        `💬 **Sohbet Spam Eşiği:** \`${this.config.limits.spam.messageThreshold} Mesaj / ${this.config.limits.spam.windowMs / 1000} Saniye\`\n` +
        `⚠️ **Maksimum Spam Uyarısı:** \`${this.config.limits.spam.maxWarnings} İhlal (Ardından 5 Dk Timeout ve Mesaj Temizleme)\`\n\n` +
        `⚖️ **Uygulanan Yaptırım:** \`İhlal yapan yetkilinin tüm rolleri geri alınır ve log kanalına kırmızı bildirim düşülür.\``
      )
      .setFooter("Made by Noz");
  }

  public getHelpContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplay(
        `# 📖 **VEDOGUARD FIVEM SLASH KOMUT REHBERİ**\n` +
        `*Sunucu üzerinde aktif olan tüm yönetim ve etkileşim komutları:*\n\n` +
        `📋 **KAYIT & MÜLAKAT KOMUTLARI**\n` +
        `• \`/kayit ayarla uye-rolu:[@rol] mulakat-rolu:[@rol]\` → Rolleri tek komutla kaydeder.\n` +
        `• \`/kayit kur kanal:[#kanal]\` → Başvuru panelini kanala kurar.\n` +
        `• \`/kayit bilgi\` → Aktif kayıt yapılandırmasını gösterir.\n\n` +
        `🎫 **TICKET & MÜLAKAT ODALARI**\n` +
        `• \`/ticket ayarla kategori:[#kategori] yetkili-rolu:[@rol]\` → Ticket odalarını ayarlar.\n` +
        `• \`/ticket kur kanal:[#kanal]\` → Ticket panelini kanala gönderir.\n` +
        `• \`/ticket kapat\` → Açılan odayı 5 saniye içinde kapatır.\n\n` +
        `🛡️ **GUARD & GÜVENLİK KOMUTLARI**\n` +
        `• \`/guard ayarla\` → Log kanalı, ses odası ve limitleri belirler.\n` +
        `• \`/guard limitler\` → Aktif güvenlik eşiklerini listeler.\n` +
        `• \`/guard whitelist islem:[ekle/cikar]\` → Muaf kullanıcı/rol tanımlar.\n\n` +
        `🐦 **TOPLULUK & YÖNETİM**\n` +
        `• \`/giris-cikis liste\` → Son giren ve çıkan üyeleri listeler.\n` +
        `• \`/giris-cikis ayarla kanal:[#kanal]\` → Otomatik bildirim kanalını belirler.\n` +
        `• \`/tweet mesaj:[metin] gorsel:[resim]\` → X formatında tweet paylaşır.\n` +
        `• \`/sil sayi:[1-100]\` → Kanaldaki mesajları toplu siler.\n` +
        `• \`/ping\` → Bot gecikmesini ölçer.`
      )
      .setFooter("Made by Noz");
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;

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
          .setAccentColor(0x57f287)
          .addTextDisplay(
            `# 📋 **KAYIT & MÜLAKAT AYARLARI GÜNCELLENDİ**\n` +
            `> 👑 **Kayıtlı Üye Rolü:** <@&${uyeRolu.id}>\n` +
            `> 🛡️ **Mülakat Rolü:** <@&${mulakatRolu.id}>\n` +
            `> 👮 **Yetkili Rolü:** ${this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`"}\n` +
            `> 📁 **Mülakat Kategorisi:** ${this.config.ticketCategoryId ? `<#${this.config.ticketCategoryId}>` : "`Tanımlanmadı`"}\n\n` +
            `ℹ️ *Ayarlar başarıyla kaydedildi ve hemen yürürlüğe girdi.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "kur") {
        const kanal = interaction.options.getChannel("kanal", true);
        if ("send" in kanal) {
          const panel = this.ticketManager.getPanelContainer();
          await (kanal as TextChannel).send(panel.toReply());
          await interaction.reply({
            content: `> ✅ *Kayıt & mülakat başvuru paneli <#${kanal.id}> kanalına başarıyla kuruldu.*`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content: "> ❌ *Lütfen geçerli bir metin kanalı seçiniz.*",
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      if (sub === "bilgi") {
        const reg = this.config.registeredRoleId ? `<@&${this.config.registeredRoleId}>` : "`Tanımlanmadı`";
        const unreg = this.config.unregisteredRoleId ? `<@&${this.config.unregisteredRoleId}>` : "`Tanımlanmadı`";
        const staff = this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`";
        const cat = this.config.ticketCategoryId ? `<#${this.config.ticketCategoryId}>` : "`Tanımlanmadı`";

        const infoContainer = new VedoContainerBuilder()
          .setAccentColor(0x5865f2)
          .addTextDisplay(
            `# 📋 **GÜNCEL KAYIT YAPILANDIRMASI**\n` +
            `> 👑 **Kayıtlı Üye Rolü:** ${reg}\n` +
            `> 🛡️ **Mülakat Rolü:** ${unreg}\n` +
            `> 👮 **Yetkili Rolü:** ${staff}\n` +
            `> 📁 **Mülakat Kategorisi:** ${cat}`
          )
          .setFooter("Made by Noz");

        await interaction.reply(infoContainer.toReply());
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
          .setAccentColor(0x57f287)
          .addTextDisplay(
            `# 🎫 **TICKET AYARLARI GÜNCELLENDİ**\n` +
            `> 📁 **Ticket Kategorisi:** <#${kategori.id}>\n` +
            `> 👮 **Yetkili Rolü:** ${this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "`Tanımlanmadı`"}\n` +
            `> 📜 **Log Kanalı:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : "`Tanımlanmadı`"}\n\n` +
            `ℹ️ *Ticket ve mülakat oda yapılandırması başarıyla kaydedildi.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "kur") {
        const kanal = interaction.options.getChannel("kanal", true);
        if ("send" in kanal) {
          const panel = this.ticketManager.getPanelContainer();
          await (kanal as TextChannel).send(panel.toReply());
          await interaction.reply({
            content: `> ✅ *Mülakat ve ticket paneli <#${kanal.id}> kanalına başarıyla kuruldu.*`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply({
            content: "> ❌ *Lütfen geçerli bir metin kanalı seçiniz.*",
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      if (sub === "kapat") {
        if (interaction.channel && "delete" in interaction.channel) {
          await interaction.reply({
            content: "> 🔒 *Bu mülakat/ticket odası 5 saniye içerisinde siliniyor...*"
          });
          setTimeout(() => {
            interaction.channel?.delete().catch(() => {});
          }, 5000);
        } else {
          await interaction.reply({
            content: "> ❌ *Bu komut yalnızca silinebilir kanallarda çalıştırılabilir.*",
            flags: MessageFlags.Ephemeral
          });
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
          .setAccentColor(0x57f287)
          .addTextDisplay(
            `# 🛡️ **GUARD AYARLARI GÜNCELLENDİ**\n` +
            `> 📜 **Log Kanalı:** ${this.config.logChannelId ? `<#${this.config.logChannelId}>` : "`Tanımlanmadı`"}\n` +
            `> 🔊 **7/24 Ses Kanalı:** ${this.config.voiceChannelId ? `<#${this.config.voiceChannelId}>` : "`Tanımlanmadı`"}\n` +
            `> 🔨 **Ban Limiti:** \`${this.config.limits.ban.limit} Ban / 10 Saniye\`\n` +
            `> ⏳ **Timeout Limiti:** \`${this.config.limits.timeout.limit} Timeout / 10 Saniye\`\n\n` +
            `ℹ️ *Guard limit ve kanal ayarları kalıcı olarak kaydedildi.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }

      if (sub === "limitler") {
        await interaction.reply(this.getLimitsContainer().toReply());
        return;
      }

      if (sub === "whitelist") {
        const islem = interaction.options.getString("islem", true);
        const kullanici = interaction.options.getUser("kullanici");
        const rol = interaction.options.getRole("rol");

        if (!kullanici && !rol) {
          await interaction.reply({
            content: "> ❌ *Lütfen bir kullanıcı veya rol belirtiniz.*",
            flags: MessageFlags.Ephemeral
          });
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
          .setAccentColor(0x57f287)
          .addTextDisplay(
            `# 🛡️ **WHITELIST GÜNCELLENDİ**\n` +
            `> ⚙️ **İşlem:** \`${islem === "ekle" ? "Eklendi" : "Çıkarıldı"}\`\n` +
            (kullanici ? `> 👤 **Kullanıcı:** <@${kullanici.id}>\n` : "") +
            (rol ? `> 🎭 **Rol:** <@&${rol.id}>\n` : "") +
            `\nℹ️ *Muafiyet listesi başarıyla güncellendi.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(container.toReply());
        return;
      }
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

        await interaction.editReply({
          content: "> ✅ *Tweet'iniz bire bir X formatında başarıyla paylaşıldı.*"
        });
      } catch {
        await interaction.editReply({
          content: "> ❌ *Tweet görseli oluşturulurken bir hata meydana geldi.*"
        });
      }
      return;
    }

    if (commandName === "giris-cikis") {
      const sub = interaction.options.getSubcommand();

      if (sub === "liste") {
        if (!interaction.guild) return;

        let listContent = "";
        if (this.memberEvents.length === 0) {
          listContent = "> ℹ️ *Henüz kaydedilmiş yeni giriş veya çıkış hareketi bulunmuyor.*";
        } else {
          listContent = this.memberEvents
            .map((ev) => {
              const icon = ev.type === "giris" ? "📥" : "📤";
              const label = ev.type === "giris" ? "Katıldı" : "Ayrıldı";
              return `> ${icon} **${label}:** <@${ev.userId}> (\`${ev.userTag}\`) - <t:${Math.floor(ev.timestamp / 1000)}:R>`;
            })
            .join("\n");
        }

        const listContainer = new VedoContainerBuilder()
          .setAccentColor(0x2f3136)
          .addTextDisplay(
            `# 📊 **SUNUCU GİRİŞ & ÇIKIŞ KAYITLARI**\n` +
            `> 👥 **Toplam Sunucu Üyesi:** \`${interaction.guild.memberCount}\`\n` +
            `────────────────────────────────────────\n` +
            listContent +
            `\n────────────────────────────────────────\n` +
            `> 🕒 *Son ${this.memberEvents.length} üye hareketi listelenmektedir.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(listContainer.toReply());
        return;
      }

      if (sub === "ayarla") {
        const kanal = interaction.options.getChannel("kanal", true);
        this.config.joinLeaveChannelId = kanal.id;
        this.saveConfig();

        const setupContainer = new VedoContainerBuilder()
          .setAccentColor(0x57f287)
          .addTextDisplay(
            `# ⚙️ **GİRİŞ - ÇIKIŞ KANALI AYARLANDI**\n` +
            `> 📢 **Bildirim Kanalı:** <#${kanal.id}>\n` +
            `────────────────────────────────────────\n` +
            `> ℹ️ *Artık sunucuya katılan veya ayrılan tüm üyeler bu kanala otomatik olarak bildirilecektir.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(setupContainer.toReply());
        return;
      }

      if (sub === "kapat") {
        this.config.joinLeaveChannelId = undefined;
        this.saveConfig();

        const closeContainer = new VedoContainerBuilder()
          .setAccentColor(0xed4245)
          .addTextDisplay(
            `# 🔒 **GİRİŞ - ÇIKIŞ BİLDİRİMLERİ KAPATILDI**\n` +
            `────────────────────────────────────────\n` +
            `> ℹ️ *Otomatik giriş ve çıkış bildirimleri devre dışı bırakıldı.*`
          )
          .setFooter("Made by Noz");

        await interaction.reply(closeContainer.toReply());
        return;
      }
    }

    if (commandName === "kayit-paneli") {
      const panel = this.ticketManager.getPanelContainer();
      await interaction.reply({
        content: "> ✅ *Mülakat paneli başarıyla oluşturuluyor...*",
        flags: MessageFlags.Ephemeral
      });
      if (interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send(panel.toReply());
      }
      return;
    }

    if (commandName === "ses-paneli") {
      if (!interaction.guild) return;
      const panel = this.voiceManager.getStatusContainer(interaction.guild);
      await interaction.reply({
        content: "> ✅ *Ses kontrol paneli başarıyla oluşturuluyor...*",
        flags: MessageFlags.Ephemeral
      });
      if (interaction.channel && "send" in interaction.channel) {
        await interaction.channel.send(panel.toReply());
      }
      return;
    }

    if (commandName === "sil") {
      const amount = interaction.options.getInteger("sayi", true);
      if (interaction.channel && "bulkDelete" in interaction.channel) {
        try {
          const deleted = await interaction.channel.bulkDelete(amount, true);
          const successContainer = new VedoContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplay(
              `# 🗑️ **MESAJ TEMİZLEME İŞLEMİ**\n` +
              `> 💬 **Silinen Mesaj Sayısı:** \`${deleted.size}\`\n` +
              `> 👤 **İşlemi Yapan:** <@${interaction.user.id}>\n` +
              `> ℹ️ *14 günden eski mesajlar Discord politikası gereği toplu silinemez.*`
            )
            .setFooter("Made by Noz");

          await interaction.reply(successContainer.toReply());
          setTimeout(() => {
            interaction.deleteReply().catch(() => {});
          }, 5000);
        } catch {
          await interaction.reply({
            content: "> ❌ *Mesajlar silinirken bir hata oluştu.*",
            flags: MessageFlags.Ephemeral
          });
        }
      }
      return;
    }

    if (commandName === "limitler") {
      const limitsContainer = this.getLimitsContainer();
      await interaction.reply(limitsContainer.toReply());
      return;
    }

    if (commandName === "yardim") {
      const helpContainer = this.getHelpContainer();
      await interaction.reply(helpContainer.toReply());
      return;
    }

    if (commandName === "ping") {
      const pingContainer = new VedoContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplay(
          `# 🏓 **PONG! SİSTEM GECİKMESİ**\n` +
          `> 📡 **WebSocket Gecikmesi:** \`${this.client.ws.ping}ms\`\n` +
          `> ⏱️ **Mesaj Yanıt Süresi:** \`${Math.abs(Date.now() - interaction.createdTimestamp)}ms\``
        )
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
    });

    this.client.once(Events.ClientReady, async () => {
      console.log(`[VedoGuard] ${this.client.user?.tag} aktif ve izlemede.`);

      await this.registerSlashCommands();

      if (this.config.voiceChannelId) {
        await this.voiceManager.join(this.config.guildId, this.config.voiceChannelId);
      }
    });

    this.client.on(Events.GuildMemberAdd, async (member) => {
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
            .setAccentColor(0x57f287)
            .addTextDisplay(
              `# 📥 **YENİ ÜYE KATILDI**\n` +
              `> 👤 **Kullanıcı:** <@${member.id}> (\`${member.user.tag}\`)\n` +
              `> 🕒 **Katılım Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
              `> 📅 **Hesap Açılış:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:d>\n` +
              `────────────────────────────────────────\n` +
              `> 👥 **Toplam Sunucu Üyesi:** \`${member.guild.memberCount}\``
            )
            .setFooter("Made by Noz");

          await (channel as TextChannel).send(joinContainer.toReply()).catch(() => {});
        }
      }
    });

    this.client.on(Events.GuildMemberRemove, async (member) => {
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
            .setAccentColor(0xed4245)
            .addTextDisplay(
              `# 📤 **BİR ÜYE AYRILDI**\n` +
              `> 👤 **Kullanıcı:** <@${member.id}> (\`${member.user.tag}\`)\n` +
              `> 🕒 **Ayrılma Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
              `────────────────────────────────────────\n` +
              `> 👥 **Kalan Üye Sayısı:** \`${member.guild.memberCount}\``
            )
            .setFooter("Made by Noz");

          await (channel as TextChannel).send(leaveContainer.toReply()).catch(() => {});
        }
      }
    });

    this.client.on(Events.GuildBanAdd, async (ban) => {
      if (ban.guild.id !== this.config.guildId) return;
      await this.auditGuard.trackAndEnforce(
        ban.guild,
        "ban",
        this.config.limits.ban.limit,
        this.config.limits.ban.windowMs
      );
    });

    this.client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
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
      if (role.guild.id !== this.config.guildId) return;
      await this.auditGuard.trackAndEnforce(
        role.guild,
        "roleDelete",
        this.config.limits.roleDelete.limit,
        this.config.limits.roleDelete.windowMs
      );
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (!message.guild || message.author.bot) return;

      if (message.content === "!limitler") {
        await message.channel.send(this.getLimitsContainer().toReply());
        return;
      }

      if (message.content === "!yardım" || message.content === "!help") {
        await message.channel.send(this.getHelpContainer().toReply());
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
