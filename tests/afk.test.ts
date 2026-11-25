import { VedoContainerBuilder } from "../src/vedo/VedoContainerBuilder";

describe("VedoGuard AFK Mute Unit Tests", () => {
  it("should create an active AFK mute UI V2 container without embeds", () => {
    const targetId = "1574849200510992474";
    const affectedCount = 3;

    const container = new VedoContainerBuilder()
      .setAccentColor(0x57f287)
      .addTextDisplay(
        `# 🔇 **AFK OTOMATİK SUSTURMA AKTİF EDİLDİ**\n` +
        `> 🔊 **AFK Kanalı:** <#${targetId}>\n` +
        `> ⚙️ **Sistem Durumu:** \`Aktif (Sunucu Geneli Susturma)\`\n` +
        `> 👥 **Mevcut Susturulan Üye:** \`${affectedCount}\`\n` +
        `────────────────────────────────────────\n` +
        `> ℹ️ *Bu odaya geçen veya Discord tarafından AFK'ya atılan tüm kullanıcılar anında otomatik olarak susturulacaktır (Server Mute).*`
      )
      .setFooter("Made by Noz");

    const reply = container.toReply();

    expect(reply.content).toContain("AFK OTOMATİK SUSTURMA AKTİF EDİLDİ");
    expect(reply.content).toContain(targetId);
    expect(reply.content).toContain("Made by Noz");
    expect((reply as any).embeds).toBeUndefined();
  });

  it("should create a disabled AFK mute UI V2 container without embeds", () => {
    const container = new VedoContainerBuilder()
      .setAccentColor(0xed4245)
      .addTextDisplay(
        `# 🔇 **AFK SUSTURMA DEVRE DIŞI BIRAKILDI**\n` +
        `> ⚙️ **Durum:** \`Kapalı\`\n` +
        `────────────────────────────────────────\n` +
        `> ℹ️ *Artık AFK odasına geçen kullanıcılar otomatik olarak susturulmayacaktır.*`
      )
      .setFooter("Made by Noz");

    const reply = container.toReply();

    expect(reply.content).toContain("AFK SUSTURMA DEVRE DIŞI BIRAKILDI");
    expect(reply.content).toContain("Kapalı");
    expect((reply as any).embeds).toBeUndefined();
  });
});
