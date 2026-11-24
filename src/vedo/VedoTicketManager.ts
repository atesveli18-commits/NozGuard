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
import { VedoContainerBuilder } from "./VedoContainerBuilder";

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

  public getPanelContainer(): VedoContainerBuilder {
    return new VedoContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplay(
        `# 📋 **MÜLAKAT & KAYIT BAŞVURUSU**\n` +
        `*Sunucumuza ve ekibimize katılmak için resmi mülakat sürecini başlatın.*\n\n` +
        `📌 **Başvuru Bilgilendirmesi**\n` +
        `Mülakat aşamasına geçebilmek için aşağıdaki **Başvuru Yap** butonuna tıklayarak açılan 5 soruluk formu eksiksiz ve doğru şekilde doldurunuz.\n\n` +
        `⏱️ **Süreç Nasıl İlerler?**\n` +
        `• Formu gönderdiğiniz an yalnızca sizin ve yetkili ekibimizin görebileceği **Özel Mülakat Odası** açılır.\n` +
        `• Yetkililerimiz başvurunuzu değerlendirip odanızda sizinle iletişime geçer.\n` +
        `• Onaylandığınız takdirde mülakat rolünüz alınıp üye rolünüz tanımlanır.`
      )
      .addSeparator(true, 1)
      .addActionRow([
        {
          type: 2,
          style: 3,
          label: "Mülakat Başvurusu Yap",
          custom_id: "vedo_ticket_apply_btn",
          emoji: { name: "📝" }
        }
      ])
      .setFooter("VedoGuard UI V2 Kayıt & Denetim Sistemi");
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
      .setLabel("Prime Saatlerde Rolde misiniz? (20.00-00.00)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Evet / Hayır")
      .setRequired(true);

    const strikeInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_strike")
      .setLabel("3 Strike Atılma Kuralı Kabulü")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Kabul Ediyorum / Etmiyorum")
      .setRequired(true);

    const ckInput = new TextInputBuilder()
      .setCustomId("vedo_ticket_field_ck")
      .setLabel("Legal Ekipten Çıkışta CK Kabulü")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Kabul Ediyorum / Etmiyorum")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ageInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(hoursInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(strikeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ckInput)
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
    const ckAccept = interaction.fields.getTextInputValue("vedo_ticket_field_ck");

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

    const ticketContainer = new VedoContainerBuilder()
      .setAccentColor(0x5865f2)
      .addTextDisplay(
        `# 📋 **YENİ MÜLAKAT BAŞVURUSU**\n` +
        `**Aday Bilgisi:** <@${user.id}> (\`${user.tag}\`)\n` +
        `**Gönderilme Tarihi:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
      .addSeparator(true, 1)
      .addTextDisplay(
        `👤 **OOC İsim:** \`${oocName}\`\n` +
        `🎂 **OOC Yaş:** \`${oocAge}\`\n` +
        `⏰ **Prime Saatler (20:00 - 00:00):** \`${primeHours}\`\n` +
        `⚡ **3 Strike Atılma Kuralı:** \`${strikeAccept}\`\n` +
        `⚖️ **Legal Ekip Sonrası CK:** \`${ckAccept}\``
      )
      .addSeparator(true, 1)
      .addTextDisplay(`ℹ️ *Aşağıdaki butonları kullanarak adayı onaylayabilir, reddedebilir veya odayı kapatabilirsiniz.*`)
      .addActionRow([
        {
          type: 2,
          style: 3,
          label: "Kabul Et",
          custom_id: `vedo_ticket_approve_${user.id}`,
          emoji: { name: "✅" }
        },
        {
          type: 2,
          style: 4,
          label: "Reddet",
          custom_id: `vedo_ticket_reject_${user.id}`,
          emoji: { name: "❌" }
        },
        {
          type: 2,
          style: 2,
          label: "Talebi Kapat",
          custom_id: "vedo_ticket_close_btn",
          emoji: { name: "🔒" }
        }
      ])
      .setFooter("VedoGuard UI V2 Mülakat Değerlendirme");

    const staffMention = this.config.staffRoleId ? `<@&${this.config.staffRoleId}>` : "Yetkililer";
    const ticketReply = ticketContainer.toReply();
    await ticketChannel.send({
      content: `${staffMention} <@${user.id}>\n\n${ticketReply.content}`,
      components: ticketReply.components
    });

    const replyContainer = new VedoContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplay(`## ✅ Başvurunuz Alındı\nMülakat kanalınız oluşturuldu: <#${ticketChannel.id}>`)
      .setFooter("VedoGuard UI V2 Kayıt Sistemi");

    try {
      await interaction.editReply(replyContainer.toReply());
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
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "> 🔒 *Bu mülakat odası 5 saniye içerisinde silinecektir...*",
            flags: MessageFlags.Ephemeral
          });
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
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "> ⚠️ *Bu işlemi gerçekleştirmek için mülakat yetkisine sahip olmalısınız.*",
            flags: MessageFlags.Ephemeral
          });
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

      const approveContainer = new VedoContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplay(
          `## 🎉 **MÜLAKAT BAŞARIYLA ONAYLANDI**\n` +
          `<@${targetUserId}> mülakat sürecini başarıyla geçmiştir.\n` +
          `• Mülakat Rolü kaldırıldı.\n` +
          `• Üye Rolü teslim edildi.\n\n` +
          `**Onaylayan Yetkili:** <@${interaction.user.id}>\n` +
          `**İşlem Tarihi:** <t:${Math.floor(Date.now() / 1000)}:R>`
        )
        .setFooter("VedoGuard UI V2 Mülakat Sistemi");

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
        .setAccentColor(0xed4245)
        .addTextDisplay(
          `## ❌ **MÜLAKAT BAŞVURUSU REDDEDİLDİ**\n` +
          `<@${targetUserId}> mülakat başvurusu yetkili tarafından reddedilmiştir.\n\n` +
          `**Reddeden Yetkili:** <@${interaction.user.id}>\n` +
          `**İşlem Tarihi:** <t:${Math.floor(Date.now() / 1000)}:R>`
        )
        .setFooter("VedoGuard UI V2 Mülakat Sistemi");

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
