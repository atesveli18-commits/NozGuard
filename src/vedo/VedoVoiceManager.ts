import {
  Client,
  Guild,
  VoiceBasedChannel,
  ButtonInteraction
} from "discord.js";
import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState
} from "@discordjs/voice";
import { VedoContainerBuilder } from "./VedoContainerBuilder";

export class VedoVoiceManager {
  private client: Client;
  private connection: VoiceConnection | null = null;
  private currentGuildId: string | null = null;
  private currentChannelId: string | null = null;
  private joinedTimestamp: number = 0;
  private reconnectAttempts: number = 0;
  private manualDisconnect: boolean = false;

  constructor(client: Client) {
    this.client = client;
  }

  public async join(guildId: string, channelId: string): Promise<boolean> {
    this.manualDisconnect = false;
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      return false;
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      return false;
    }

    this.currentGuildId = guildId;
    this.currentChannelId = channelId;

    try {
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true
      });

      this.joinedTimestamp = Date.now();
      this.reconnectAttempts = 0;

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
            entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000)
          ]);
        } catch {
          if (this.manualDisconnect) {
            return;
          }
          if (this.connection) {
            this.connection.destroy();
            this.connection = null;
          }
          setTimeout(() => {
            this.reconnect();
          }, 3000);
        }
      });

      this.connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (this.manualDisconnect) {
          return;
        }
        setTimeout(() => {
          this.reconnect();
        }, 5000);
      });

      return true;
    } catch {
      return false;
    }
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }
    this.joinedTimestamp = 0;
  }

  public isConnected(): boolean {
    return this.connection?.state.status === VoiceConnectionStatus.Ready;
  }

  public async reconnect(): Promise<boolean> {
    if (this.manualDisconnect) {
      return false;
    }
    if (!this.currentGuildId || !this.currentChannelId) {
      return false;
    }
    this.reconnectAttempts += 1;
    return await this.join(this.currentGuildId, this.currentChannelId);
  }

  public getStatusContainer(guild: Guild): VedoContainerBuilder {
    const channel = this.currentChannelId
      ? guild.channels.cache.get(this.currentChannelId)
      : null;

    const isConnected = this.connection?.state.status === VoiceConnectionStatus.Ready;
    const channelName = channel ? channel.name : "Tanımlanmadı";
    const statusText = isConnected ? "🟢 Bağlı ve Aktif (7/24 Koruma)" : "🔴 Bağlantı Yok";

    let uptimeText = "0 Dakika";
    if (this.joinedTimestamp > 0 && isConnected) {
      const minutes = Math.floor((Date.now() - this.joinedTimestamp) / 60000);
      const hours = Math.floor(minutes / 60);
      uptimeText = hours > 0 ? `${hours} Saat ${minutes % 60} Dakika` : `${minutes} Dakika`;
    }

    const container = new VedoContainerBuilder()
      .setAccentColor(isConnected ? 0x57f287 : 0xed4245)
      .addTextDisplay(
        `# 🎙️ **7/24 SES KONTROL PANELİ**\n` +
        `*Botun ses kanalı aktifliği ve self-healing bağlantı durumu.*\n\n` +
        `📡 **Bağlantı Durumu:** ${statusText}\n` +
        `🔊 **Aktif Ses Kanalı:** ${channel ? `<#${channel.id}> (${channelName})` : "`Kanal Bulunamadı`"}\n` +
        `⏱️ **Kesintisiz Çalışma Süresi:** \`${uptimeText}\`\n` +
        `🔇 **Kendi Sağırlaştırma:** \`Aktif (selfDeaf: true)\`\n` +
        `🔄 **Yeniden Bağlanma Sayısı:** \`${this.reconnectAttempts}\``
      )
      .addActionRow([
        {
          type: 2,
          style: 3,
          label: "Yeniden Bağlan",
          custom_id: "vedo_voice_reconnect_btn",
          emoji: { name: "🔄" }
        },
        {
          type: 2,
          style: 1,
          label: "Durumu Yenile",
          custom_id: "vedo_voice_status_btn",
          emoji: { name: "📊" }
        }
      ])
      .setFooter("VedoGuard UI V2 7/24 Ses Sistemi");

    return container;
  }

  public async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) {
      return;
    }

    if (interaction.customId === "vedo_voice_reconnect_btn") {
      await interaction.deferUpdate();
      await this.reconnect();
      const updatedContainer = this.getStatusContainer(interaction.guild);
      await interaction.editReply(updatedContainer.toReply());
    } else if (interaction.customId === "vedo_voice_status_btn") {
      await interaction.deferUpdate();
      const updatedContainer = this.getStatusContainer(interaction.guild);
      await interaction.editReply(updatedContainer.toReply());
    }
  }
}
