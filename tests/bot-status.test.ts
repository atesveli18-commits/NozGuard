import { VedoGuardBot, IVedoGuardConfig } from "../src/vedo/VedoGuardBot";

const createTestConfig = (overrides: Partial<IVedoGuardConfig> = {}): IVedoGuardConfig => ({
  guildId: "1574831485385572422",
  botOwnerId: "791914260564672512",
  botOfflineMode: false,
  logChannelId: "1574839308458664136",
  whitelistedUsers: [],
  whitelistedRoles: [],
  limits: {
    ban: { limit: 3, windowMs: 10000 },
    timeout: { limit: 3, windowMs: 10000 },
    channelDelete: { limit: 2, windowMs: 10000 },
    roleDelete: { limit: 2, windowMs: 10000 },
    spam: {
      messageThreshold: 5,
      windowMs: 3000,
      maxWarnings: 2,
      timeoutDurationMs: 300000
    }
  },
  ...overrides
});

describe("VedoGuardBot Owner & Offline Control Unit Tests", () => {
  const createdBots: VedoGuardBot[] = [];

  afterEach(async () => {
    while (createdBots.length > 0) {
      const bot = createdBots.pop();
      if (bot) {
        await bot.client.destroy();
      }
    }
  });

  it("should validate single and comma-separated bot owner IDs accurately", () => {
    const singleOwnerBot = new VedoGuardBot(createTestConfig());
    createdBots.push(singleOwnerBot);

    expect(singleOwnerBot.isBotOwner("791914260564672512")).toBe(true);
    expect(singleOwnerBot.isBotOwner("111111111111111111")).toBe(false);

    const multiOwnerBot = new VedoGuardBot(
      createTestConfig({ botOwnerId: "791914260564672512, 222222222222222222" })
    );
    createdBots.push(multiOwnerBot);

    expect(multiOwnerBot.isBotOwner("791914260564672512")).toBe(true);
    expect(multiOwnerBot.isBotOwner("222222222222222222")).toBe(true);
    expect(multiOwnerBot.isBotOwner("333333333333333333")).toBe(false);

    const noOwnerBot = new VedoGuardBot(createTestConfig({ botOwnerId: undefined }));
    createdBots.push(noOwnerBot);

    expect(noOwnerBot.isBotOwner("791914260564672512")).toBe(false);
  });

  it("should build online UI V2 control panel without embeds and enable offline button", () => {
    const bot = new VedoGuardBot(createTestConfig({ botOfflineMode: false }));
    createdBots.push(bot);

    const reply = bot.getBotControlContainer().toReply();
    const row = reply.components[0];

    expect((reply as any).embeds).toBeUndefined();
    expect(reply.content).toContain("Çevrimiçi");
    expect(reply.content).toContain("Made by Noz");
    expect(row.components.map((btn: any) => btn.custom_id)).toEqual([
      "vedo_bot_offline_btn",
      "vedo_bot_online_btn",
      "vedo_bot_status_btn"
    ]);
    expect(row.components[0].disabled).toBe(false);
    expect(row.components[1].disabled).toBe(true);
    expect(row.components[2].disabled).toBeUndefined();
  });

  it("should build offline UI V2 control panel without embeds and enable online button", () => {
    const bot = new VedoGuardBot(createTestConfig({ botOfflineMode: true }));
    createdBots.push(bot);

    const reply = bot.getBotControlContainer().toReply();
    const row = reply.components[0];

    expect((reply as any).embeds).toBeUndefined();
    expect(reply.content).toContain("Çevrimdışı");
    expect(reply.content).toContain("Uyku Modunda Kapalı");
    expect(row.components[0].disabled).toBe(true);
    expect(row.components[1].disabled).toBe(false);
    expect(row.components.every((btn: any) => String(btn.custom_id).startsWith("vedo_bot_"))).toBe(true);
  });
});
