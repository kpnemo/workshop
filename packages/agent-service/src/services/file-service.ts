import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { Database } from "./database.js";
import type { FileRecord } from "../types.js";

export class FileService {
  private db: Database;
  private uploadsDir: string;
  private anthropic: Anthropic;

  constructor(db: Database, uploadsDir: string) {
    this.db = db;
    this.uploadsDir = uploadsDir;
    this.anthropic = new Anthropic();
  }

  async saveFile(
    userId: string,
    filename: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<FileRecord> {
    const fileId = crypto.randomUUID();
    const userDir = path.join(this.uploadsDir, userId);
    fs.mkdirSync(userDir, { recursive: true });

    const safeName = path.basename(filename);
    const storageName = `${fileId}-${safeName}`;
    const storagePath = path.join(userDir, storageName);

    // 1. Save to disk
    fs.writeFileSync(storagePath, buffer);

    // 2. Insert DB row
    this.db.addFile({
      id: fileId,
      userId,
      filename,
      storagePath,
      sizeBytes: buffer.length,
      mimeType,
    });

    // 3. Generate description via Haiku
    let description: string;
    try {
      description = await this.generateDescription(filename, buffer, mimeType);
    } catch (err) {
      console.error(`[file-service] Failed to generate description for ${filename}:`, err);
      description = "No description available.";
    }

    // 4. Update DB with description
    this.db.updateFileDescription(fileId, description);

    // 5. Regenerate index
    this.regenerateIndex(userId);

    return this.db.getFileById(fileId)!;
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const file = this.db.getFileById(fileId);

    // 1. Delete DB row
    this.db.deleteFile(fileId);

    // 2. Regenerate index
    this.regenerateIndex(userId);

    // 3. Delete from disk (best-effort)
    if (file) {
      try {
        fs.unlinkSync(file.storagePath);
      } catch (err) {
        console.warn(`[file-service] Could not delete file from disk: ${file.storagePath}`, err);
      }
    }
  }

  readIndex(userId: string): string {
    const indexPath = path.join(this.uploadsDir, userId, "index.md");
    try {
      return fs.readFileSync(indexPath, "utf-8");
    } catch {
      return "No files in library.";
    }
  }

  async readFileContent(fileId: string, userId?: string): Promise<string> {
    const file = this.db.getFileById(fileId);
    if (!file || (userId && file.userId !== userId)) {
      return `Error: File with ID "${fileId}" not found.`;
    }

    try {
      if (file.mimeType === "application/pdf") {
        const pdfParse = (await import("pdf-parse")).default;
        const buffer = fs.readFileSync(file.storagePath);
        const data = await pdfParse(buffer);
        return data.text;
      }
      return fs.readFileSync(file.storagePath, "utf-8");
    } catch (err) {
      return `Error reading file "${file.filename}": ${(err as Error).message}`;
    }
  }

  private async generateDescription(filename: string, buffer: Buffer, mimeType: string): Promise<string> {
    let textContent: string;
    if (mimeType === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      textContent = data.text;
    } else {
      textContent = buffer.toString("utf-8");
    }

    // Truncate to avoid huge prompts
    const maxChars = 10000;
    const truncated = textContent.length > maxChars
      ? textContent.slice(0, maxChars) + "\n[Content truncated]"
      : textContent;

    const response = await this.anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Summarize this file in 1-2 sentences. Focus on what the file contains and its purpose. File name: ${filename}\n\nContent:\n${truncated}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock?.text ?? "No description available.";
  }

  private regenerateIndex(userId: string): void {
    const files = this.db.getFilesByUser(userId);
    const userDir = path.join(this.uploadsDir, userId);
    fs.mkdirSync(userDir, { recursive: true });
    const indexPath = path.join(userDir, "index.md");

    if (files.length === 0) {
      fs.writeFileSync(indexPath, "# File Library\n\nNo files uploaded yet.\n");
      return;
    }

    const lines = ["# File Library", ""];
    for (const file of files) {
      const sizeKB = Math.ceil(file.sizeBytes / 1024);
      const date = file.createdAt.toISOString().split("T")[0];
      lines.push(`## ${file.filename}`);
      lines.push(`- **ID:** ${file.id}`);
      lines.push(`- **Uploaded:** ${date}`);
      lines.push(`- **Size:** ${sizeKB}KB`);
      lines.push(`- **Description:** ${file.description ?? "No description available."}`);
      lines.push("");
    }

    fs.writeFileSync(indexPath, lines.join("\n"));
  }
}
