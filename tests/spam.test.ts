import { MessageFlags } from "discord.js";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "../src/vedo/VedoContainerBuilder";

describe("VedoContainerBuilder Unit Tests", () => {
  it("should construct a valid real Components V2 container without embeds or content", () => {
    const builder = new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.gold)
      .addTextDisplay("### Test Paneli\n› Test Metni")
      .addSeparator(true, 1)
      .setFooter("Made by Noz")
      .addActionRow([
        {
          type: 2,
          style: 2,
          label: "Test Buton",
          custom_id: "vedo_test_btn"
        }
      ]);

    const reply = builder.toReply();
    const containerJson = reply.components[0].toJSON() as any;

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();

    expect(reply.components.length).toBe(1);
    expect(containerJson.type).toBe(17);
    expect(containerJson.accent_color).toBe(VEDO_THEME_COLORS.gold);

    const componentTypes = containerJson.components.map((c: any) => c.type);
    expect(componentTypes).toContain(10);
    expect(componentTypes).toContain(14);
    expect(componentTypes).toContain(1);

    const serialized = JSON.stringify(containerJson);
    expect(serialized).toContain("Test Metni");
    expect(serialized).toContain("-# Made by Noz");
    expect(serialized).toContain("vedo_test_btn");
  });
});
