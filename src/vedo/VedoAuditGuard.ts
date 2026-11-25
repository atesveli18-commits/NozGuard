import {
  Guild,
  GuildMember,
  TextChannel,
  AuditLogEvent,
  GuildAuditLogsEntry
} from "discord.js";
import { VedoContainerBuilder } from "./VedoContainerBuilder";
import { VedoDatabase } from "./VedoDatabase";

interface IVedoAuditTracker {
  timestamps: number[];
}

export class VedoAuditGuard {
  private trackers: Map<string, IVedoAuditTracker> = new Map();
  private whitelistedUsers: Set<string>;
  private whitelistedRoles: Set<string>;
  private logChannelId: string;

  constructor(whitelistedUsers: string[], whitelistedRoles: string[], logChannelId: string) {
    this.whitelistedUsers = new Set(whitelistedUsers);
    this.whitelistedRoles = new Set(whitelistedRoles);
    this.logChannelId = logChannelId;
  }

  public updateLogChannel(channelId: string): void {
    this.logChannelId = channelId;
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

  private async enforceAction(
    guild: Guild,
    member: GuildMember,
    actionType: string,
    actionCount: number,
    limit: number
  ): Promise<void> {
    const manageableRoles = member.roles.cache.filter(
      (role) => role.id !== guild.id && role.editable
    );

    try {
      if (manageableRoles.size > 0) {
        await member.roles.remove(manageableRoles, `VedoGuard: ${actionType} limit aşıldı (${actionCount}/${limit})`);
      }
    } catch {}

    await VedoDatabase.logAction(
      member.id,
      actionType,
      guild.id,
      undefined,
      `Limit aşıldı: ${actionCount}/${limit}`
    );

    await this.sendLog(guild, member, actionType, actionCount, limit);
  }

  private async sendLog(
    guild: Guild,
    member: GuildMember,
    actionType: string,
    actionCount: number,
    limit: number
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

    const container = new VedoContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplay(
        `# 🛡️ **VEDOGUARD GÜVENLİK MÜDAHALESİ**\n` +
        `🚨 **Tespit Edilen İhlal:** \`${actionNames[actionType] || actionType}\`\n\n` +
        `👤 **İhlal Yapan Yetkili:** <@${member.id}> (\`${member.user.tag}\`)\n` +
        `📊 **Eylem Sayısı:** \`${actionCount}\` / İzin Verilen Limit: \`${limit}\`\n` +
        `⚖️ **Uygulanan Yaptırım:** \`Tüm yetkili rolleri geri alındı ve izole edildi.\`\n` +
        `⏱️ **Müdahale Zamanı:** <t:${Math.floor(Date.now() / 1000)}:R>`
      )
      .setFooter("VedoGuard UI V2 Denetim & Koruma Sistemi");

    await channel.send(container.toReply());
  }
}
