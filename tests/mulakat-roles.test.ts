import { Client, GatewayIntentBits, MessageFlags } from "discord.js";
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
});
