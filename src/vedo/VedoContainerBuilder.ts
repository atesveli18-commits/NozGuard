import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags,
  AttachmentBuilder
} from "discord.js";

export const VEDO_THEME_COLORS = {
  gold: 0xd4af37,
  obsidian: 0x181a20,
  success: 0x22c55e,
  danger: 0xef4444,
  warning: 0xf59e0b
};

export interface IVedoButtonInput {
  type?: number;
  style: number;
  label: string;
  custom_id: string;
  disabled?: boolean;
  emoji?: { name: string };
}

type VedoContainerEntry =
  | { kind: "text"; content: string }
  | { kind: "separator"; divider: boolean; spacing: SeparatorSpacingSize };

export class VedoContainerBuilder {
  private accentColor: number = VEDO_THEME_COLORS.gold;
  private headerNotice?: string;
  private imageName?: string;
  private files: AttachmentBuilder[] = [];
  private entries: VedoContainerEntry[] = [];
  private actionRows: IVedoButtonInput[][] = [];
  private footerText?: string;

  public setAccentColor(color: number): this {
    this.accentColor = color;
    return this;
  }

  public setHeaderNotice(text: string): this {
    this.headerNotice = text;
    return this;
  }

  public setImageBuffer(buffer: Buffer, fileName: string = "vedo-card.png"): this {
    this.imageName = fileName;
    this.files = [new AttachmentBuilder(buffer, { name: fileName })];
    return this;
  }

  public addTextDisplay(content: string): this {
    this.entries.push({ kind: "text", content });
    return this;
  }

  public addSeparator(divider: boolean = true, spacing: number = 1): this {
    const size = spacing === 2 ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small;
    this.entries.push({ kind: "separator", divider, spacing: size });
    return this;
  }

  public addActionRow(components: IVedoButtonInput[]): this {
    this.actionRows.push(components);
    return this;
  }

  public setFooter(text: string): this {
    this.footerText = text;
    return this;
  }

  public buildComponents(): (TextDisplayBuilder | ContainerBuilder)[] {
    const container = new ContainerBuilder().setAccentColor(this.accentColor);

    if (this.imageName) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(`attachment://${this.imageName}`)
        )
      );
    }

    for (const entry of this.entries) {
      if (entry.kind === "text") {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(entry.content)
        );
      } else {
        container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(entry.divider).setSpacing(entry.spacing)
        );
      }
    }

    if (this.footerText) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${this.footerText}`)
      );
    }

    for (const rowButtons of this.actionRows) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowButtons.map((btn) => new ButtonBuilder({ type: 2, ...btn } as any))
      );
      container.addActionRowComponents(row);
    }

    const result: (TextDisplayBuilder | ContainerBuilder)[] = [];
    if (this.headerNotice) {
      result.push(new TextDisplayBuilder().setContent(this.headerNotice));
    }
    result.push(container);
    return result;
  }

  public toReply(): {
    flags: [MessageFlags.IsComponentsV2];
    components: (TextDisplayBuilder | ContainerBuilder)[];
    files?: AttachmentBuilder[];
  } {
    const base: {
      flags: [MessageFlags.IsComponentsV2];
      components: (TextDisplayBuilder | ContainerBuilder)[];
      files?: AttachmentBuilder[];
    } = {
      flags: [MessageFlags.IsComponentsV2],
      components: this.buildComponents()
    };
    if (this.files.length > 0) {
      base.files = this.files;
    }
    return base;
  }

  public toEphemeralReply(): {
    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral];
    components: (TextDisplayBuilder | ContainerBuilder)[];
    files?: AttachmentBuilder[];
  } {
    const base: {
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral];
      components: (TextDisplayBuilder | ContainerBuilder)[];
      files?: AttachmentBuilder[];
    } = {
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      components: this.buildComponents()
    };
    if (this.files.length > 0) {
      base.files = this.files;
    }
    return base;
  }

  public toEditReply(): {
    flags: [MessageFlags.IsComponentsV2];
    components: (TextDisplayBuilder | ContainerBuilder)[];
    files?: AttachmentBuilder[];
    attachments?: [];
  } {
    const base: {
      flags: [MessageFlags.IsComponentsV2];
      components: (TextDisplayBuilder | ContainerBuilder)[];
      files?: AttachmentBuilder[];
      attachments?: [];
    } = {
      flags: [MessageFlags.IsComponentsV2],
      components: this.buildComponents()
    };
    if (this.files.length > 0) {
      base.files = this.files;
      base.attachments = [];
    }
    return base;
  }
}
