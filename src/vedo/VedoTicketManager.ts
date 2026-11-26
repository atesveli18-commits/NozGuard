import {
  Client,
  Guild,
  TextChannel,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionsBitField,
  MessageFlags
} from "discord.js";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoThemeCard } from "./VedoThemeCard";

export interface IVedoTicketConfig {
  ticketCategoryId?: string;
  staffRoleId?: string;
  registeredRoleId?: string;
  unregisteredRoleId?: string;
}

export class VedoTicketManager {
  private client: Client;
  private config: IVedoTicketConfig;

  constructor(client: Client, config: IVedoTicketConfig) {
    this.client = client;
    this.config = config;
  }

  public updateConfig(newConfig: Partial<IVedoTicketConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): IVedoTicketConfig {
    return this.config;
  }

  public async getPanelContainer(guild?: Guild | null): Promise<VedoContainerBuilder> {
    const regRoleMention = this.config.registeredRoleId ? `<@&${this.config.registeredRoleId}>` : "@Querencia";
    const unregRoleMention = this.config.unregisteredRoleId ? `<@&${this.config.unregisteredRoleId}>` : "@Mülakat";

    const cardBuffer = await VedoThemeCard.generate({
      title: "ÖZEL MÜLAKAT SİSTEMİ",
      greeting: "Merhaba Querencia üyeleri,",
      subtitle: "Sunucumuza katılmak ve yetkili ekibimizle mülakat yapmak için aşağıdaki butondan başvurunuzu iletin.",
      accentColor: "#D4AF37",
      watermark: "QUERENCIA",
      iconUrl: guild?.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 3,
      items: [
        {
          icon: "user",
          title: "OOC İSİM",
          description: "Başvuruda gerçek isminizi belirtiniz."
        },
        {
          icon: "clock",
          title: "OOC YAŞ",
          description: "Yaş bilginizi eksiksiz doldurunuz."
        },
        {
          icon: "bell",
          title: "Prime Saatler",
          description: "20.00 - 12.00 arası aktiflik durumu."
        },
        {
          icon: "alert",
          title: "3 Strike Kuralı",
          description: "3 Strike atılma kuralı kabul onayı."
        },
        {
          icon: "target",
          title: "K/DA",
          description: "Oyun içi K/DA oranınızı paylaşınız."
        },
        {
          icon: "crown",
          title: "Rol Süreci",
          description: "Başlangıç ve onay sonrası rol aktarımı."
        }
      ]
    });

    return new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.gold)
      .setImageBuffer(cardBuffer, "vedo-mulakat-panel.png")
      .addTextDisplay(
        `› **Verilecek Rol:** ${regRoleMention}  •  **Alınacak Rol:** ${unregRoleMention}`
      )
      .addSeparator(true, 1)
      .addActionRow([
        {
          type: 2,
          style: 2,
          label: "Mülakat Başvurusu Yap",
          custom_id: "vedo_ticket_apply_btn"
        }
      ])
      .setFooter("Made by Noz");
  }

  public async showApplicationModal(interaction: ButtonInteraction): Promise<void> {
    if (interaction.replied || interaction.deferred) {
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("vedo_ticket_modal_submit")
      .setTitle("Mülakat Başvuru Formu");

    const nameInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_name")
      .setLabel("OOC İSİM")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Adınız")
      .setRequired(true)
      .setMaxLength(32);

    const ageInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_age")
      .setLabel("OOC YAŞ")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Yaşınız")
      .setRequired(true)
      .setMaxLength(3);

    const hoursInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_hours")
      .setLabel("Prime Saatler Oyunda mısınız? 20.00 12.00")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Evet / Hayır")
      .setRequired(true);

    const strikeInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_strike")
      .setLabel("3 Strike Atılma Kuralı Kabulü")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Kabul Ediyorum / Etmiyorum")
      .setRequired(true);

    const kdaInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_kda")
      .setLabel("K/DA")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("K/DA bilginiz")
      .setRequired(true)
      .setMaxLength(16);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ageInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(hoursInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(strikeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(kdaInput)
    );

    try {
      await interaction.showModal(modal);
    } catch (error) {
      console.error("[VedoGuard] Modal açılamadı:", error);
    }
  }

  public async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.guild) {
      return;
    }

    const guild = interaction.guild;
    const user = interaction.user;

    const oocName = interaction.fields.getTextInputValue("vedo_ticket_field_name");
    const oocAge = interaction.fields.getTextInputValue("vedo_ticket_field_age");
    const primeHours = interaction.fields.getTextInputValue("vedo_ticket_field_hours");
    const strikeAccept = interaction.fields.getTextInputValue("vedo_ticket_field_strike");
    const kda = interaction.fields.getTextInputValue("vedo_ticket_field_kda");

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }
    } catch {
      return;
    }

    const permissionOverwrites: any[] = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles
        ]
      },
      {
        id: this.client.user!.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ];

    if (this.config.staffRoleId && guild.roles.cache.has(this.config.staffRoleId)) {
      permissionOverwrites.push({
        id: this.config.staffRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }

    const channelName = `mulakat-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: this.config.ticketCategoryId || undefined,
      permissionOverwrites
    });

    const cardBuffer = await VedoThemeCard.generate({
      title: "YENİ MÜLAKAT BAŞVURUSU",
      greeting: "Aday Başvuru Dosyası,",
      subtitle: "Adayın ilettiği form yanıtları aşağıdadır. Ekibinizle değerlendirip kararınızı veriniz.",
      accentColor: "#D4AF37",
      watermark: "QUERENCIA",
      iconUrl: guild.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 3,
      items: [
        {
          icon: "user",
          title: "Aday",
          description: user.tag
        },
        {
          icon: "file",
          title: "OOC İsim",
          description: oocName
        },
        {
          icon: "clock",
          title: "OOC Yaş",
          description: oocAge
        },
        {
          icon: "bell",
          title: "Prime Saatler (20.00 - 12.00)",
          description: primeHours
        },
        {
          icon: "alert",
          title: "3 Strike Kuralı",
          description: strikeAccept
        },
        {
          icon: "target",
          title: "K/DA",
          description: kda
        }
      ]
    });

    const staffMention = this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "Yetkililer";
    const ticketContainer = new VedoContainerBuilder()
      .setHeaderNotice(`${staffMention} <@${user.id}>`)
      .setAccentColor(VEDO_THEME_COLORS.gold)
      .setImageBuffer(cardBuffer, "vedo-basvuru-karti.png")
      .addTextDisplay(
        `› **Aday:** <@${user.id}>  •  **Tarih:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
      .addSeparator(true, 1)
      .addActionRow([
        {
          type: 2,
          style: 3,
          label: "Kabul Et",
          custom_id: `vedo_ticket_approve_${user.id}`
        },
        {
          type: 2,
          style: 4,
          label: "Reddet",
          custom_id: `vedo_ticket_reject_${user.id}`
        },
        {
          type: 2,
          style: 2,
          label: "Odayı Sil",
          custom_id: "vedo_ticket_close_btn"
        }
      ])
      .setFooter("Made by Noz");

    await ticketChannel.send(ticketContainer.toReply());

    const replyContainer = new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.success)
      .addTextDisplay(
        `### Başvurunuz Alındı\n` +
        `› **Mülakat Odanız:** <#${ticketChannel.id}>\n` +
        `› *Yetkililerimiz en kısa sürede odanızda sizinle iletişime geçecektir.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");

    try {
      await interaction.editReply(replyContainer.toEditReply());
    } catch {}
  }

  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      return;
    }

    if (interaction.customId === "vedo_ticket_apply_btn") {
      await this.showApplicationModal(interaction);
      return;
    }

    if (interaction.customId === "vedo_ticket_close_btn") {
      const closingContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.warning)
        .addTextDisplay(
          `### Oda Kapatılıyor\n` +
          `› *Bu mülakat odası 5 saniye içerisinde silinecektir.*`
        )
        .setFooter("Made by Noz");

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply(closingContainer.toEphemeralReply());
        }
      } catch {}
      setTimeout(() => {
        interaction.channel?.delete().catch(() => {});
      }, 5000);
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const hasStaffRole = this.config.staffRoleId && member?.roles.cache.has(this.config.staffRoleId);
    const isAdmin = member?.permissions.has(PermissionsBitField.Flags.Administrator);

    if (!hasStaffRole && !isAdmin && interaction.user.id !== interaction.guild.ownerId) {
      const deniedContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.danger)
        .addTextDisplay(
          `### Yetkisiz İşlem\n` +
          `› *Bu işlemi gerçekleştirmek için mülakat yetkisine sahip olmalısınız.*`
        )
        .setFooter("Made by Noz");

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply(deniedContainer.toEphemeralReply());
        }
      } catch {}
      return;
    }

    if (interaction.customId.startsWith("vedo_ticket_approve_")) {
      const targetUserId = interaction.customId.replace("vedo_ticket_approve_", "");
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (targetMember) {
        if (this.config.unregisteredRoleId && targetMember.roles.cache.has(this.config.unregisteredRoleId)) {
          await targetMember.roles.remove(this.config.unregisteredRoleId).catch(() => {});
        }
        if (this.config.registeredRoleId) {
          await targetMember.roles.add(this.config.registeredRoleId).catch(() => {});
        }
      }

      const regRoleMention = this.config.registeredRoleId ? `<@&${this.config.registeredRoleId}>` : "@querencia";
      const unregRoleMention = this.config.unregisteredRoleId ? `<@&${this.config.unregisteredRoleId}>` : "@Mülakat";

      const approveContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.success)
        .addTextDisplay(
          `### Mülakat Onaylandı\n` +
          `› **Onaylanan Üye:** <@${targetUserId}>\n` +
          `› **Onaylayan Yetkili:** <@${interaction.user.id}>\n` +
          `› **İşlem Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
          `› **Rol Aktarımı:** ${unregRoleMention} alındı — ${regRoleMention} verildi`
        )
        .addSeparator(true, 1)
        .setFooter("Made by Noz");

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply(approveContainer.toReply());
        } else {
          await interaction.followUp(approveContainer.toReply());
        }
      } catch {}
      return;
    }

    if (interaction.customId.startsWith("vedo_ticket_reject_")) {
      const targetUserId = interaction.customId.replace("vedo_ticket_reject_", "");

      const rejectContainer = new VedoContainerBuilder()
        .setAccentColor(VEDO_THEME_COLORS.danger)
        .addTextDisplay(
          `### Mülakat Başvurusu Reddedildi\n` +
          `› **Aday:** <@${targetUserId}>\n` +
          `› **Reddeden Yetkili:** <@${interaction.user.id}>\n` +
          `› **İşlem Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
          `› **Durum:** *Yetkili incelemesi sonucunda olumsuz değerlendirildi.*`
        )
        .addSeparator(true, 1)
        .setFooter("Made by Noz");

      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply(rejectContainer.toReply());
        } else {
          await interaction.followUp(rejectContainer.toReply());
        }
      } catch {}
      return;
    }
  }
}
