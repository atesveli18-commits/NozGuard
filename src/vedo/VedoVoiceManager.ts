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
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoThemeCard } from "./VedoThemeCard";

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

  public async getStatusContainer(guild: Guild): Promise<VedoContainerBuilder> {
    const channel = this.currentChannelId
      ? guild.channels.cache.get(this.currentChannelId)
      : null;

    const isConnected = this.connection?.state.status === VoiceConnectionStatus.Ready;
    const channelName = channel ? channel.name : "Tanımlanmadı";

    let uptimeText = "0 Dakika";
    if (this.joinedTimestamp > 0 && isConnected) {
      const minutes = Math.floor((Date.now() - this.joinedTimestamp) / 60000);
      const hours = Math.floor(minutes / 60);
      uptimeText = hours > 0 ? `${hours} Saat ${minutes % 60} Dakika` : `${minutes} Dakika`;
    }

    const cardBuffer = await VedoThemeCard.generate({
      title: "7/24 SES KONTROL PANELİ",
      greeting: "Querencia Ses Altyapısı,",
      subtitle: "Botun ses kanalı aktifliği, anlık bağlantı durumu ve otomatik yeniden bağlanma telemetrisi.",
      accentColor: isConnected ? "#D4AF37" : "#EF4444",
      watermark: "QUERENCIA",
      iconUrl: guild.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 3,
      items: [
        {
          icon: "power",
          title: "Bağlantı Durumu",
          description: isConnected ? "Aktif — 7/24 Koruma" : "Bağlantı Yok",
          accent: isConnected ? "#22C55E" : "#EF4444"
        },
        {
          icon: "mic",
          title: "Aktif Ses Kanalı",
          description: channelName
        },
        {
          icon: "clock",
          title: "Kesintisiz Süre",
          description: uptimeText
        },
        {
          icon: "micOff",
          title: "Sağırlaştırma",
          description: "Aktif (selfDeaf: true)"
        },
        {
          icon: "refresh",
          title: "Yeniden Bağlanma",
          description: `${this.reconnectAttempts} deneme`
        },
        {
          icon: "shield",
          title: "Koruma Modu",
          description: "Self-Healing Aktif"
        }
      ]
    });

    return new VedoContainerBuilder()
      .setAccentColor(isConnected ? VEDO_THEME_COLORS.gold : VEDO_THEME_COLORS.danger)
      .setImageBuffer(cardBuffer, "vedo-ses-panel.png")
      .addTextDisplay(
        `› **Hedef Ses Kanalı:** ${channel ? `<#${channel.id}>` : "`Tanımlanmadı`"}  •  **Durum:** ${isConnected ? "● Çevrimiçi" : "● Bağlantı Yok"}`
      )
      .addSeparator(true, 1)
      .addActionRow([
        {
          type: 2,
          style: 2,
          label: "Yeniden Bağlan",
          custom_id: "vedo_voice_reconnect_btn"
        },
        {
          type: 2,
          style: 2,
          label: "Durumu Yenile",
          custom_id: "vedo_voice_status_btn"
        }
      ])
      .setFooter("Made by Noz");
  }

  public async handleInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.guild) {
      return;
    }

    if (interaction.customId === "vedo_voice_reconnect_btn") {
      await interaction.deferUpdate();
      await this.reconnect();
      const updatedContainer = await this.getStatusContainer(interaction.guild);
      await interaction.editReply(updatedContainer.toEditReply());
    } else if (interaction.customId === "vedo_voice_status_btn") {
      await interaction.deferUpdate();
      const updatedContainer = await this.getStatusContainer(interaction.guild);
      await interaction.editReply(updatedContainer.toEditReply());
    }
  }
}
