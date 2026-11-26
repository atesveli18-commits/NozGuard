import { VedoThemeCard } from "../src/vedo/VedoThemeCard";

describe("VedoThemeCard Glassmorphism Canvas Unit Tests", () => {
  it("should generate a valid PNG buffer for a 3-column panel with Turkish characters", async () => {
    const buffer = await VedoThemeCard.generate({
      title: "ÖZEL MÜLAKAT SİSTEMİ",
      greeting: "Merhaba Querencia üyeleri,",
      subtitle: "Sunucumuza katılmak ve yetkili ekibimizle mülakat yapmak için başvurunuzu iletin.",
      columns: 3,
      items: [
        { icon: "user", title: "OOC İSİM", description: "Başvuruda gerçek isminizi belirtiniz." },
        { icon: "clock", title: "OOC YAŞ", description: "Yaş bilginizi eksiksiz doldurunuz." },
        { icon: "bell", title: "Prime Saatler", description: "20.00 - 12.00 arası aktiflik durumu." },
        { icon: "alert", title: "3 Strike Kuralı", description: "3 Strike atılma kuralı kabul onayı." },
        { icon: "target", title: "K/DA", description: "Oyun içi K/DA oranınızı paylaşınız." },
        { icon: "crown", title: "Rol Süreci", description: "Başlangıç ve onay sonrası rol aktarımı." }
      ]
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10000);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });

  it("should generate a valid PNG buffer for a 2-column panel", async () => {
    const buffer = await VedoThemeCard.generate({
      title: "BOT KONTROL PANELİ",
      greeting: "Querencia Sistem Yönetimi,",
      subtitle: "Botun durumunu ve uyku modunu anlık olarak yönetin.",
      columns: 2,
      accentColor: "#EF4444",
      watermark: "QUERENCIA",
      items: [
        { icon: "power", title: "Çalışma Durumu", description: "Çevrimdışı (Uyku Modu)" },
        { icon: "shield", title: "Guard & Otomasyon", description: "Duraklatıldı" },
        { icon: "mic", title: "7/24 Ses Bağlantısı", description: "Uyku Modunda Kapalı" },
        { icon: "crown", title: "Yetkili Sahip", description: "791914260564672512" }
      ]
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(10000);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4e);
    expect(buffer[3]).toBe(0x47);
  });
});
