import { VedoContainerBuilder } from "../src/vedo/VedoContainerBuilder";

describe("VedoContainerBuilder Unit Tests", () => {
  it("should construct a valid UI V2 container without any embeds", () => {
    const builder = new VedoContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplay("Test Metni")
      .addSeparator(true, 1)
      .setFooter("VedoGuard Footer")
      .addActionRow([
        {
          type: 2,
          style: 1,
          label: "Test Buton",
          custom_id: "vedo_test_btn"
        }
      ]);

    const reply = builder.toReply();

    expect(reply.content).toBeDefined();
    expect(reply.content).toContain("Test Metni");
    expect(reply.content).toContain("VedoGuard Footer");

    expect(reply.components).toBeDefined();
    expect(reply.components.length).toBe(1);

    const actionRow = reply.components[0];
    expect(actionRow.type).toBe(1);
    expect(actionRow.components.length).toBe(1);

    expect((reply as any).embeds).toBeUndefined();
  });
});
