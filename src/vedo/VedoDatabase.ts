import mongoose, { Schema, Document, Model } from "mongoose";
import fs from "fs";
import path from "path";

export interface IVedoGuardLog extends Document {
  executorId: string;
  actionType: string;
  targetId?: string;
  guildId: string;
  reason?: string;
  createdAt: Date;
}

const VedoGuardLogSchema: Schema = new Schema({
  executorId: { type: String, required: true, index: true },
  actionType: { type: String, required: true },
  targetId: { type: String },
  guildId: { type: String, required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now, expires: 604800 }
});

export const VedoGuardLogModel: Model<IVedoGuardLog> = mongoose.model<IVedoGuardLog>("VedoGuardLog", VedoGuardLogSchema);

export class VedoDatabase {
  public static isConnected: boolean = false;

  public static async connect(uri: string): Promise<void> {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 });
      VedoDatabase.isConnected = true;
      console.log("[VedoGuard] MongoDB veritabanı bağlantısı başarıyla kuruldu.");
    } catch (error) {
      VedoDatabase.isConnected = false;
      console.warn("[VedoGuard] Yerel MongoDB servisi aktif değil. Bot yerel dosya depolama (JSON) modunda kesintisiz çalışmaya başladı.");
    }
  }

  public static async logAction(
    executorId: string,
    actionType: string,
    guildId: string,
    targetId?: string,
    reason?: string
  ): Promise<any> {
    if (VedoDatabase.isConnected) {
      return await VedoGuardLogModel.create({
        executorId,
        actionType,
        guildId,
        targetId,
        reason
      });
    }

    const logEntry = {
      executorId,
      actionType,
      guildId,
      targetId,
      reason,
      createdAt: new Date().toISOString()
    };

    try {
      const logsDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const logsFile = path.join(logsDir, "guard-logs.json");
      fs.appendFileSync(logsFile, JSON.stringify(logEntry) + "\n");
    } catch {}

    return logEntry;
  }
}
