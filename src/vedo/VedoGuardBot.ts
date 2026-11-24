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
  MessageFlags
} from "discord.js";
import { VedoAuditGuard } from "./VedoAuditGuard";
import { VedoSpamGuard } from "./VedoSpamGuard";
import { VedoDatabase } from "./VedoDatabase";
import { VedoVoiceManager } from "./VedoVoiceManager";
import { VedoTicketManager } from "./VedoTicketManager";
import { VedoContainerBuilder } from "./VedoContainerBuilder";

export interface IVedoGuardConfig {
  guildId: string;
  logChannelId: string;
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

export class VedoGuardBot {
  public client: Client;
  public voiceManager: VedoVoiceManager;
  public ticketManager: VedoTicketManager;
  private config: IVedoGuardConfig;
  private auditGuard: VedoAuditGuard;
  private spamGuard: VedoSpamGuard;
  private token: string = "";

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

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName("kayit-paneli")
        .setDescription("Mülakat ve kayıt başvuru panelini kanala kurar")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
      new SlashCommandBuilder()
        .setName("ses-paneli")
        .setDescription("7/24 ses kontrol panelini kanala gönderir")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
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
        .setName("limitler")
        .setDescription("Sunucudaki aktif guard koruma limitlerini görüntüler"),
      new SlashCommandBuilder()
        .setName("yardim")
        .setDescription("VedoGuard bot komut rehberini listeler"),
      new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Botun anlık gecikme süresini görüntüler")
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
        `⚠️ **Maksimum Spam Uyarısı:** \`${this.config.limits.spam.maxWarnings} İhlal (Ardından 5 Dk Timeout)\`\n\n` +
        `⚖️ **Uygulanan Yaptırım:** \`İhlal yapan yetkilinin tüm rolleri geri alınır ve log kanalına kırmızı bildirim düşülür.\``
      )
      .setFooter("VedoGuard UI V2 Güvenlik Mimarisi");
  }

  public getHelpContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplay(
        `# 📖 **VEDOGUARD SLASH KOMUT REHBERİ**\n` +
        `*Bot üzerinde aktif olan tüm komutlar:*\n\n` +
        `📌 **YÖNETİCİ KOMUTLARI**\n` +
        `• \`/kayit-paneli\` → Mülakat ve başvuru panelini kanala kurar.\n` +
        `• \`/ses-paneli\` → 7/24 ses kontrol ve durum panelini gönderir.\n` +
        `• \`/sil sayi:[1-100]\` → Belirtilen miktarda mesajı kanaldan siler.\n\n` +
        `📊 **GENEL & BİLGİ KOMUTLARI**\n` +
        `• \`/limitler\` → Aktif guard limitlerini ve yaptırımları gösterir.\n` +
        `• \`/ping\` → Botun anlık bağlantı gecikmesini gösterir.\n` +
        `• \`/yardim\` → Bu rehber menüsünü görüntüler.\n\n` +
        `🛡️ **GÜVENLİK SİSTEMLERİ (7/24)**\n` +
        `• **Ban / Timeout Koruması** (Limit aşan yetkilinin rolleri alınır)\n` +
        `• **Kanal / Rol Silme Koruması** (Limit aşan yetkilinin rolleri alınır)\n` +
        `• **Sohbet Spam Koruması** (Hızlı mesaj silinir, uyarı ve timeout verilir)\n` +
        `• **7/24 Ses Koruması** (Kanal kopmalarında otomatik yeniden bağlanır)\n` +
        `• **Giriş Mülakat Rolü** (Yeni üyelere otomatik mülakat rolü verilir)`
      )
      .setFooter("VedoGuard UI V2 Bot Yönetimi");
  }

  private async handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;

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
            .setFooter("VedoGuard Mesaj Yönetimi");

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
        .setFooter("VedoGuard Sistem Durumu");
      await interaction.reply(pingContainer.toReply());
      return;
    }
  }

  private registerEvents(): void {
    this.client.once(Events.ClientReady, async () => {
      console.log(`[VedoGuard] ${this.client.user?.tag} aktif ve izlemede.`);

      await this.registerSlashCommands();

      if (this.config.voiceChannelId) {
        await this.voiceManager.join(this.config.guildId, this.config.voiceChannelId);
      }
    });

    this.client.on(Events.GuildMemberAdd, async (member) => {
      if (member.guild.id !== this.config.guildId) return;
      if (this.config.unregisteredRoleId) {
        await member.roles.add(this.config.unregisteredRoleId).catch(() => {});
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
