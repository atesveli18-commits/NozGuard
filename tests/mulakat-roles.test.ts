import {
  ChannelType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  ModalSubmitInteraction,
  PermissionsBitField
} from "discord.js";
import { VedoTicketManager } from "../src/vedo/VedoTicketManager";

describe("VedoTicketManager Mulakat Role Management Unit Tests", () => {
  const createdClients: Client[] = [];

  afterEach(async () => {
    while (createdClients.length > 0) {
      const client = createdClients.pop();
      if (client) {
        await client.destroy();
      }
    }
  });

  function createModalTestContext(options: {
    username?: string;
    userId?: string;
    ticketCategoryId?: string;
    categoryExists?: boolean;
    channelsCreateMock?: jest.Mock;
    ticketSendMock?: jest.Mock;
  }) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    createdClients.push(client);
    Object.defineProperty(client, "user", {
      value: { id: "999999999999999999", tag: "Querencia Bot#0001" },
      configurable: true
    });

    const categoryId = options.ticketCategoryId ?? "1574831485909991614";
    const channelCache = new Map<string, any>();
    if (options.categoryExists !== false) {
      channelCache.set(categoryId, { id: categoryId, type: ChannelType.GuildCategory });
    }

    const ticketSend = options.ticketSendMock ?? jest.fn().mockResolvedValue({ id: "888888" });
    const createdTicketChannel = {
      id: "777777777777777777",
      send: ticketSend
    };

    const channelsCreate =
      options.channelsCreateMock ?? jest.fn().mockResolvedValue(createdTicketChannel);

    const roleCache = new Map<string, any>([
      ["1574860001510432778", { id: "1574860001510432778", name: "Yetkili" }]
    ]);

    const mockGuild: any = {
      id: "1574831485385572422",
      iconURL: () => null,
      members: {
        me: {
          id: "999999999999999999",
          permissions: new PermissionsBitField([
            PermissionsBitField.Flags.ManageChannels,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.AttachFiles
          ])
        }
      },
      roles: {
        cache: roleCache
      },
      channels: {
        cache: channelCache,
        fetch: jest.fn().mockResolvedValue(null),
        create: channelsCreate
      }
    };

    const fieldsMap: Record<string, string> = {
      vedo_ticket_field_name: "Ali",
      vedo_ticket_field_age: "22",
      vedo_ticket_field_hours: "Evet",
      vedo_ticket_field_strike: "Kabul Ediyorum",
      vedo_ticket_field_kda: "2.4"
    };

    const mockInteraction: any = {
      guild: mockGuild,
      user: {
        id: options.userId ?? "791914260564672512",
        username: options.username ?? "★ğüşöç★",
        tag: "testuser#0001"
      },
      replied: false,
      deferred: false,
      fields: {
        getTextInputValue: jest.fn((key: string) => fieldsMap[key] || "")
      },
      deferReply: jest.fn().mockImplementation(async () => {
        mockInteraction.deferred = true;
      }),
      editReply: jest.fn().mockResolvedValue({}),
      followUp: jest.fn().mockResolvedValue({})
    };

    const manager = new VedoTicketManager(client, {
      ticketCategoryId: categoryId,
      staffRoleId: "1574860001510432778",
      registeredRoleId: "1574857531069567079",
      unregisteredRoleId: "1574857475444838522"
    });

    return {
      manager,
      mockInteraction: mockInteraction as ModalSubmitInteraction,
      rawInteraction: mockInteraction,
      channelsCreate,
      ticketSend,
      categoryId
    };
  }

  it("should replace single verilecek-rol and alinacak-rol immediately via updateConfig", () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    createdClients.push(client);

    const manager = new VedoTicketManager(client, {
      registeredRoleId: "100000000000000001",
      unregisteredRoleId: "100000000000000002"
    });

    manager.updateConfig({ registeredRoleId: "200000000000000001" });
    expect(manager.getConfig().registeredRoleId).toBe("200000000000000001");
    expect(manager.getConfig().unregisteredRoleId).toBe("100000000000000002");

    manager.updateConfig({ unregisteredRoleId: "200000000000000002" });
    expect(manager.getConfig().registeredRoleId).toBe("200000000000000001");
    expect(manager.getConfig().unregisteredRoleId).toBe("200000000000000002");
  });

  it("should render Verilecek Rol and Alınacak Rol inside Components V2 panel without embeds", async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    createdClients.push(client);

    const manager = new VedoTicketManager(client, {
      registeredRoleId: "300000000000000001",
      unregisteredRoleId: "300000000000000002"
    });

    const panel = await manager.getPanelContainer();
    const reply = panel.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const mediaGallery = containerJson.components.find((c: any) => c.type === 12);
    const serialized = JSON.stringify(containerJson);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(containerJson.type).toBe(17);
    expect(mediaGallery).toBeDefined();
    expect(serialized).toContain("Verilecek Rol:");
    expect(serialized).toContain("Alınacak Rol:");
    expect(serialized).toContain("<@&300000000000000001>");
    expect(serialized).toContain("<@&300000000000000002>");
  });

  it("should handle non-ASCII username, bot AttachFiles overwrite, and Components V2 confirmation on modal submit", async () => {
    const {
      manager,
      mockInteraction,
      rawInteraction,
      channelsCreate,
      ticketSend,
      categoryId
    } = createModalTestContext({
      username: "★ğüşöç★",
      userId: "791914260564672512",
      categoryExists: true
    });

    await manager.handleModalSubmit(mockInteraction);

    expect(rawInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(channelsCreate).toHaveBeenCalledTimes(1);

    const createArgs = channelsCreate.mock.calls[0][0];
    expect(createArgs.name).toBe("mulakat-672512");
    expect(createArgs.parent).toBe(categoryId);

    const botOverwrite = createArgs.permissionOverwrites.find(
      (ow: any) => ow.id === "999999999999999999"
    );
    expect(botOverwrite).toBeDefined();
    expect(botOverwrite.allow).toContain(PermissionsBitField.Flags.AttachFiles);

    expect(ticketSend).toHaveBeenCalledTimes(1);
    const ticketPayload = ticketSend.mock.calls[0][0];
    expect(ticketPayload.flags).toContain(MessageFlags.IsComponentsV2);
    expect(ticketPayload.content).toBeUndefined();
    expect(ticketPayload.embeds).toBeUndefined();

    expect(rawInteraction.editReply).toHaveBeenCalledTimes(1);
    const replyPayload = rawInteraction.editReply.mock.calls[0][0];
    const replyJson = JSON.stringify(replyPayload.components.map((c: any) => c.toJSON()));
    expect(replyJson).toContain("Başvurunuz Alındı");
  });

  it("should fall back to parent undefined when configured ticketCategoryId does not exist", async () => {
    const { manager, mockInteraction, rawInteraction, channelsCreate } = createModalTestContext({
      username: "Ahmet",
      categoryExists: false
    });

    await manager.handleModalSubmit(mockInteraction);

    expect(channelsCreate).toHaveBeenCalledTimes(1);
    expect(channelsCreate.mock.calls[0][0].parent).toBeUndefined();
    expect(rawInteraction.editReply).toHaveBeenCalledTimes(1);
  });

  it("should retry without parent if category is full (code 30013)", async () => {
    const ticketSend = jest.fn().mockResolvedValue({ id: "999" });
    const channelsCreate = jest
      .fn()
      .mockRejectedValueOnce({ code: 30013, message: "Maximum number of channels in category reached" })
      .mockResolvedValueOnce({ id: "555555555555555555", send: ticketSend });

    const { manager, mockInteraction, rawInteraction, categoryId } = createModalTestContext({
      username: "Mehmet",
      categoryExists: true,
      channelsCreateMock: channelsCreate,
      ticketSendMock: ticketSend
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await manager.handleModalSubmit(mockInteraction);
      expect(channelsCreate).toHaveBeenCalledTimes(2);
      expect(channelsCreate.mock.calls[0][0].parent).toBe(categoryId);
      expect(channelsCreate.mock.calls[1][0].parent).toBeUndefined();

      const replyJson = JSON.stringify(
        rawInteraction.editReply.mock.calls[0][0].components.map((c: any) => c.toJSON())
      );
      expect(replyJson).toContain("Başvurunuz Alındı");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("should reply with Components V2 error container instead of hanging when permission 50013 occurs", async () => {
    const channelsCreate = jest
      .fn()
      .mockRejectedValue({ code: 50013, message: "Missing Permissions" });

    const { manager, mockInteraction, rawInteraction } = createModalTestContext({
      username: "Can",
      categoryExists: true,
      channelsCreateMock: channelsCreate
    });

    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(manager.handleModalSubmit(mockInteraction)).resolves.toBeUndefined();
      expect(rawInteraction.editReply).toHaveBeenCalledTimes(1);
      const replyPayload = rawInteraction.editReply.mock.calls[0][0];
      expect(replyPayload.flags).toContain(MessageFlags.IsComponentsV2);
      const serialized = JSON.stringify(replyPayload.components.map((c: any) => c.toJSON()));
      expect(serialized).toContain("yetkisi eksik");
    } finally {
      errSpy.mockRestore();
    }
  });
});
