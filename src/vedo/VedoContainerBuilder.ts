export interface IVedoComponent {
  type: number;
  [key: string]: any;
}

export class VedoContainerBuilder {
  private accentColor?: number;
  private textContents: string[] = [];
  private actionRows: IVedoComponent[] = [];
  private footerText?: string;

  public setAccentColor(color: number): this {
    this.accentColor = color;
    return this;
  }

  public addTextDisplay(content: string): this {
    this.textContents.push(content);
    return this;
  }

  public addSeparator(divider: boolean = true, spacing: number = 1): this {
    this.textContents.push("───────────────────────────────");
    return this;
  }

  public addActionRow(components: any[]): this {
    this.actionRows.push({
      type: 1,
      components: components
    });
    return this;
  }

  public setFooter(text: string): this {
    this.footerText = text;
    return this;
  }

  public buildContent(): string {
    const rawBlocks: string[] = [];

    for (const item of this.textContents) {
      rawBlocks.push(item);
    }

    if (this.footerText) {
      rawBlocks.push(`-# 🛡️ *${this.footerText}*`);
    }

    const formattedLines: string[] = [];
    for (let i = 0; i < rawBlocks.length; i++) {
      const block = rawBlocks[i];
      const lines = block.split("\n");
      for (const line of lines) {
        if (line.trim().length === 0) {
          formattedLines.push(">");
        } else {
          formattedLines.push(`> ${line}`);
        }
      }
      if (
        i < rawBlocks.length - 1 &&
        rawBlocks[i] !== "───────────────────────────────" &&
        rawBlocks[i + 1] !== "───────────────────────────────"
      ) {
        formattedLines.push(">");
      }
    }

    return formattedLines.join("\n");
  }

  public toReply(): { content: string; components: IVedoComponent[] } {
    return {
      content: this.buildContent(),
      components: this.actionRows
    };
  }
}
