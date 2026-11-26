import { MessageFlags } from "discord.js";
import { VedoContainerBuilder, VEDO_THEME_COLORS } from "../src/vedo/VedoContainerBuilder";

describe("VedoGuard AFK Mute Unit Tests", () => {
  it("should create an active AFK mute Components V2 container without embeds or content", () => {
    const targetId = "1574849200510992474";
    const affectedCount = 3;

    const container = new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.success)
      .addTextDisplay(
        `### AFK Otomatik Susturma Aktif Edildi\n` +
        `› **AFK Kanalı:** <#${targetId}>\n` +
        `› **Sistem Durumu:** \`Aktif (Sunucu Geneli Susturma)\`\n` +
        `› **Mevcut Susturulan Üye:** \`${affectedCount}\`\n` +
        `› *Bu odaya geçen tüm kullanıcılar otomatik olarak susturulacaktır.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");

    const reply = container.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const serialized = JSON.stringify(containerJson);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(containerJson.type).toBe(17);
    expect(serialized).toContain("AFK Otomatik Susturma Aktif Edildi");
    expect(serialized).toContain(targetId);
    expect(serialized).toContain("Made by Noz");
  });

  it("should create a disabled AFK mute Components V2 container without embeds or content", () => {
    const container = new VedoContainerBuilder()
      .setAccentColor(VEDO_THEME_COLORS.danger)
      .addTextDisplay(
        `### AFK Susturma Devre Dışı Bırakıldı\n` +
        `› **Durum:** \`Kapalı\`\n` +
        `› *Artık AFK odasına geçen kullanıcılar otomatik olarak susturulmayacaktır.*`
      )
      .addSeparator(true, 1)
      .setFooter("Made by Noz");

    const reply = container.toReply();
    const containerJson = reply.components[0].toJSON() as any;
    const serialized = JSON.stringify(containerJson);

    expect(reply.flags).toContain(MessageFlags.IsComponentsV2);
    expect((reply as any).content).toBeUndefined();
    expect((reply as any).embeds).toBeUndefined();
    expect(containerJson.type).toBe(17);
    expect(serialized).toContain("AFK Susturma Devre Dışı Bırakıldı");
    expect(serialized).toContain("Kapalı");
  });
});
