import { MessageFlags } from "discord.js";
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

  it("should build online Components V2 control panel with MediaGallery and enable offline button", async () => {
    const bot = new VedoGuardBot(createTestConfig({ botOfflineMode: false }));
    createdBots.push(bot);

    const container = await bot.getBotControlContainer();
    const reply = container.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const actionRow = containerJson.components.find((c: any) => c.type === 1);
    const mediaGallery = containerJson.components.find((c: any) => c.type === 12);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(reply.files).toBeDefined();
    expect(reply.files!.length).toBe(1);
    expect(reply.files![0].name).toBe("vedo-bot-panel.png");
    expect(containerJson.type).toBe(17);
    expect(mediaGallery).toBeDefined();
    expect(mediaGallery.items[0].media.url).toBe("attachment://vedo-bot-panel.png");

    const serialized = JSON.stringify(containerJson);
    expect(serialized).toContain("Çevrimiçi");
    expect(serialized).toContain("Made by Noz");
    expect(actionRow.components.map((btn: any) => btn.custom_id)).toEqual([
      "vedo_bot_offline_btn",
      "vedo_bot_online_btn",
      "vedo_bot_status_btn"
    ]);
    expect(actionRow.components[0].disabled).toBe(false);
    expect(actionRow.components[1].disabled).toBe(true);
    expect(actionRow.components[2].disabled).toBeUndefined();
  });

  it("should build offline Components V2 control panel and enable online button", async () => {
    const bot = new VedoGuardBot(createTestConfig({ botOfflineMode: true }));
    createdBots.push(bot);

    const container = await bot.getBotControlContainer();
    const reply = container.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const actionRow = containerJson.components.find((c: any) => c.type === 1);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(JSON.stringify(containerJson)).toContain("Çevrimdışı");
    expect(actionRow.components[0].disabled).toBe(true);
    expect(actionRow.components[1].disabled).toBe(false);
    expect(actionRow.components.every((btn: any) => String(btn.custom_id).startsWith("vedo_bot_"))).toBe(true);
  });
});
