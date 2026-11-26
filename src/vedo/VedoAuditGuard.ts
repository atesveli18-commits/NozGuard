import {
  Guild,
  GuildMember,
  TextChannel,
  AuditLogEvent,
  GuildAuditLogsEntry
} from "discord.js";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoThemeCard } from "./VedoThemeCard";
import { VedoDatabase } from "./VedoDatabase";

interface IVedoAuditTracker {
  timestamps: number[];
}

export class VedoAuditGuard {
  private trackers: Map<string, IVedoAuditTracker> = new Map();
  private whitelistedUsers: Set<string>;
  private whitelistedRoles: Set<string>;
  private logChannelId: string;
  private fallbackRoleId?: string;

  constructor(
    whitelistedUsers: string[],
    whitelistedRoles: string[],
    logChannelId: string,
    fallbackRoleId?: string
  ) {
    this.whitelistedUsers = new Set(whitelistedUsers);
    this.whitelistedRoles = new Set(whitelistedRoles);
    this.logChannelId = logChannelId;
    this.fallbackRoleId = fallbackRoleId;
  }

  public updateLogChannel(channelId: string): void {
    this.logChannelId = channelId;
  }

  public updateFallbackRole(roleId?: string): void {
    this.fallbackRoleId = roleId;
  }

  public addWhitelistedUser(id: string): void {
    this.whitelistedUsers.add(id);
  }

  public removeWhitelistedUser(id: string): void {
    this.whitelistedUsers.delete(id);
  }

  public addWhitelistedRole(id: string): void {
    this.whitelistedRoles.add(id);
  }

  public removeWhitelistedRole(id: string): void {
    this.whitelistedRoles.delete(id);
  }

  public isWhitelisted(member: GuildMember): boolean {
    if (member.id === member.guild.ownerId) {
      return true;
    }
    if (member.user.bot && member.id === member.client.user?.id) {
      return true;
    }
    if (this.whitelistedUsers.has(member.id)) {
      return true;
    }
    const hasRole = member.roles.cache.some((role) => this.whitelistedRoles.has(role.id));
    return hasRole;
  }

  public async trackAndEnforce(
    guild: Guild,
    actionType: "ban" | "timeout" | "channelDelete" | "roleDelete",
    limit: number,
    windowMs: number
  ): Promise<void> {
    const auditTypeMap = {
      ban: AuditLogEvent.MemberBanAdd,
      timeout: AuditLogEvent.MemberUpdate,
      channelDelete: AuditLogEvent.ChannelDelete,
      roleDelete: AuditLogEvent.RoleDelete
    };

    const targetAudit = auditTypeMap[actionType];
    const fetchedLogs = await guild.fetchAuditLogs({ limit: 1, type: targetAudit });
    const auditEntry = fetchedLogs.entries.first();

    if (!auditEntry || !auditEntry.executor) {
      return;
    }

    const executorId = auditEntry.executor.id;
    if (executorId === guild.client.user?.id) {
      return;
    }

    let member: GuildMember | null = null;
    try {
      member = await guild.members.fetch(executorId);
    } catch {
      member = null;
    }

    if (!member || this.isWhitelisted(member)) {
      return;
    }

    if (actionType === "timeout") {
      const change = auditEntry.changes.find(
        (c) => c.key === "communication_disabled_until"
      );
      if (!change || !change.new) {
        return;
      }
    }

    const trackerKey = `${actionType}_${executorId}`;
    const now = Date.now();
    let tracker = this.trackers.get(trackerKey);

    if (!tracker) {
      tracker = { timestamps: [] };
      this.trackers.set(trackerKey, tracker);
    }

    tracker.timestamps = tracker.timestamps.filter((ts) => now - ts <= windowMs);
    tracker.timestamps.push(now);

    if (tracker.timestamps.length > limit) {
      await this.enforceAction(guild, member, actionType, tracker.timestamps.length, limit);
      this.trackers.delete(trackerKey);
    }
  }

  public async enforceAction(
    guild: Guild,
    member: GuildMember,
    actionType: string,
    actionCount: number,
    limit: number
  ): Promise<void> {
    const manageableRoles = member.roles.cache.filter(
      (role) => role.id !== guild.id && role.id !== this.fallbackRoleId && role.editable
    );

    try {
      if (manageableRoles.size > 0) {
        await member.roles.remove(manageableRoles, `VedoGuard: ${actionType} limit aşıldı (${actionCount}/${limit})`);
      }
    } catch {}

    let fallbackAssigned = false;
    try {
      if (this.fallbackRoleId) {
        const fallbackRole = guild.roles.cache.get(this.fallbackRoleId);
        if (fallbackRole && fallbackRole.editable) {
          if (!member.roles.cache.has(this.fallbackRoleId)) {
            await member.roles.add(
              fallbackRole,
              `VedoGuard: Yetkiler sıfırlandı, varsayılan üye rolü atandı`
            );
          }
          fallbackAssigned = true;
        }
      }
    } catch {}

    await VedoDatabase.logAction(
      member.id,
      actionType,
      guild.id,
      undefined,
      fallbackAssigned
        ? `Limit aşıldı: ${actionCount}/${limit} (Üye rolü atandı)`
        : `Limit aşıldı: ${actionCount}/${limit}`
    );

    await this.sendLog(guild, member, actionType, actionCount, limit, fallbackAssigned);
  }

  private async sendLog(
    guild: Guild,
    member: GuildMember,
    actionType: string,
    actionCount: number,
    limit: number,
    fallbackAssigned: boolean
  ): Promise<void> {
    const channel = guild.channels.cache.get(this.logChannelId) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) {
      return;
    }

    const actionNames: Record<string, string> = {
      ban: "Sağlayıcı Ban Limiti",
      timeout: "Zaman Aşımı (Timeout) Limiti",
      channelDelete: "Kanal Silme Limiti",
      roleDelete: "Rol Silme Limiti"
    };

    const cardBuffer = await VedoThemeCard.generate({
      title: "GÜVENLİK MÜDAHALESİ",
      greeting: "Otomatik Koruma Sistemi,",
      subtitle: "Sunucu limitlerini aşan yönetici tespit edildi ve yetkileri güvenlik amacıyla sıfırlandı.",
      accentColor: "#EF4444",
      watermark: "QUERENCIA",
      iconUrl: guild.iconURL({ extension: "png", size: 128 }) || undefined,
      columns: 2,
      items: [
        {
          icon: "alert",
          title: "İhlal Türü",
          description: actionNames[actionType] || actionType,
          accent: "#EF4444"
        },
        {
          icon: "user",
          title: "Yetkili",
          description: `${member.user.tag} (${member.id})`
        },
        {
          icon: "bolt",
          title: "Eylem / Limit",
          description: `${actionCount} / ${limit} izin verilen`,
          accent: "#F59E0B"
        },
        {
          icon: "lock",
          title: "Yaptırım",
          description: fallbackAssigned
            ? "Yetkili rolleri alındı, üye rolü verildi"
            : "Tüm yönetici rolleri geri alındı",
          accent: "#EF4444"
        }
      ]
    });

    const fallbackSuffix =
      fallbackAssigned && this.fallbackRoleId ? `  •  **Atanan Rol:** <@&${this.fallbackRoleId}>` : "";

    const container = new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.danger)
      .setImageBuffer(cardBuffer, "vedo-guard-log.png")
      .addTextDisplay(
        `› **İhlal Yapan:** <@${member.id}>${fallbackSuffix}  •  **Müdahale Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");

    await channel.send(container.toReply());
  }
}
