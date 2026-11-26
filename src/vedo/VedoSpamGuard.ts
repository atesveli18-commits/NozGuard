import { Message, GuildMember } from "discord.js";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "./VedoContainerBuilder";
import { VedoDatabase } from "./VedoDatabase";

interface IVedoUserSpamState {
  timestamps: number[];
  warnings: number;
}

export class VedoSpamGuard {
  private userStates: Map<string, IVedoUserSpamState> = new Map();
  private whitelistedUsers: Set<string>;
  private whitelistedRoles: Set<string>;
  private messageThreshold: number;
  private windowMs: number;
  private maxWarnings: number;
  private timeoutDurationMs: number;

  constructor(
    whitelistedUsers: string[],
    whitelistedRoles: string[],
    messageThreshold: number,
    windowMs: number,
    maxWarnings: number,
    timeoutDurationMs: number
  ) {
    this.whitelistedUsers = new Set(whitelistedUsers);
    this.whitelistedRoles = new Set(whitelistedRoles);
    this.messageThreshold = messageThreshold;
    this.windowMs = windowMs;
    this.maxWarnings = maxWarnings;
    this.timeoutDurationMs = timeoutDurationMs;
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
    if (member.user.bot) {
      return true;
    }
    if (this.whitelistedUsers.has(member.id)) {
      return true;
    }
    return member.roles.cache.some((role) => this.whitelistedRoles.has(role.id));
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!message.guild || !message.member || message.author.bot || !("send" in message.channel)) {
      return;
    }

    if (this.isWhitelisted(message.member)) {
      return;
    }

    const userId = message.author.id;
    const now = Date.now();
    let state = this.userStates.get(userId);

    if (!state) {
      state = { timestamps: [], warnings: 0 };
      this.userStates.set(userId, state);
    }

    state.timestamps = state.timestamps.filter((ts) => now - ts <= this.windowMs);
    state.timestamps.push(now);

    if (state.timestamps.length >= this.messageThreshold) {
      state.timestamps = [];
      state.warnings += 1;

      try {
        if ("messages" in message.channel && "bulkDelete" in message.channel) {
          const recentMsgs = await message.channel.messages.fetch({ limit: 30 }).catch(() => null);
          if (recentMsgs) {
            const userSpamMsgs = recentMsgs.filter(
              (m) => m.author.id === userId && now - m.createdTimestamp < 60000
            );
            if (userSpamMsgs.size > 0) {
              await message.channel.bulkDelete(userSpamMsgs, true).catch(() => {});
            }
          }
        } else {
          await message.delete().catch(() => {});
        }
      } catch {}

      if (state.warnings >= this.maxWarnings) {
        try {
          if (message.member.moderatable) {
            await message.member.timeout(this.timeoutDurationMs, "VedoGuard: Sürekli chat spam tespiti");
          }
        } catch {}

        await VedoDatabase.logAction(
          userId,
          "spam_timeout",
          message.guild.id,
          message.channel.id,
          `Spam cezası: ${state.warnings} uyarı aşıldı`
        );

        const timeoutContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.danger)
          .addTextDisplay(
            `### Sohbet Susturma Cezası\n` +
            `› **Kullanıcı:** <@${userId}>\n` +
            `› **Süre:** \`5 Dakika (Timeout)\`\n` +
            `› **Sebep:** \`Sürekli hızlı mesaj ve spam tespiti\``
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        await message.channel.send(timeoutContainer.toReply());
        this.userStates.delete(userId);
      } else {
        const warnContainer = new VedoContainerBuilder()
          .setAccentColor(VEDO_THEME_COLORS.warning)
          .addTextDisplay(
            `### Sohbet Hızı Uyarısı\n` +
            `› **Kullanıcı:** <@${userId}> — *Lütfen çok hızlı mesaj göndermeyiniz.*\n` +
            `› **Uyarı Sayacı:** \`${state.warnings}/${this.maxWarnings}\`  •  *Tekrarında 5 dakika susturulacaksınız.*`
          )
          .addSeparator(true, 1)
          .setFooter("Made by Noz");

        const warnMsg = await message.channel.send(warnContainer.toReply());
        setTimeout(() => {
          warnMsg.delete().catch(() => {});
        }, 5000);
      }
    }
  }
}
