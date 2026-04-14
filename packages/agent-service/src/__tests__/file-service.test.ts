import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database } from "../services/database.js";
import { FileService } from "../services/file-service.js";

// Mock the Anthropic SDK
const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "A summary of the uploaded document." }],
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

describe("FileService", () => {
  let db: Database;
  let dbPath: string;
  let uploadsDir: string;
  let service: FileService;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-fs-${Date.now()}.db`);
    uploadsDir = path.join(os.tmpdir(), `test-uploads-${Date.now()}`);
    db = new Database(dbPath);
    service = new FileService(db, uploadsDir);
    db.createUser("u-1", "test@example.com", "pw");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  describe("saveFile", () => {
    it("saves file to disk and inserts DB record", async () => {
      const buffer = Buffer.from("hello world");
      const result = await service.saveFile("u-1", "notes.txt", "text/plain", buffer);

      expect(result.id).toBeDefined();
      expect(result.filename).toBe("notes.txt");
      expect(result.sizeBytes).toBe(11);
      expect(result.mimeType).toBe("text/plain");
      expect(result.description).toBe("A summary of the uploaded document.");

      // File exists on disk
      const diskPath = path.join(uploadsDir, "u-1", `${result.id}-notes.txt`);
      expect(fs.existsSync(diskPath)).toBe(true);
      expect(fs.readFileSync(diskPath, "utf-8")).toBe("hello world");

      // DB record exists
      const dbFile = db.getFileById(result.id);
      expect(dbFile).toBeDefined();
      expect(dbFile!.filename).toBe("notes.txt");
    });

    it("generates index.md after saving", async () => {
      const buffer = Buffer.from("content");
      await service.saveFile("u-1", "data.csv", "text/csv", buffer);

      const indexPath = path.join(uploadsDir, "u-1", "index.md");
      expect(fs.existsSync(indexPath)).toBe(true);
      const indexContent = fs.readFileSync(indexPath, "utf-8");
      expect(indexContent).toContain("# File Library");
      expect(indexContent).toContain("## data.csv");
      expect(indexContent).toContain("A summary of the uploaded document.");
    });

    it("falls back to default description when Haiku fails", async () => {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      vi.mocked(Anthropic).mockImplementationOnce(() => ({
        messages: { create: vi.fn().mockRejectedValue(new Error("API error")) },
      }) as any);

      const fallbackService = new FileService(db, uploadsDir);
      const buffer = Buffer.from("content");
      const result = await fallbackService.saveFile("u-1", "fail.txt", "text/plain", buffer);

      expect(result.description).toBe("No description available.");
    });
  });

  describe("deleteFile", () => {
    it("removes file from disk, DB, and regenerates index", async () => {
      const buffer = Buffer.from("to delete");
      const file = await service.saveFile("u-1", "temp.txt", "text/plain", buffer);

      await service.deleteFile(file.id, "u-1");

      expect(db.getFileById(file.id)).toBeUndefined();
      const diskPath = path.join(uploadsDir, "u-1", `${file.id}-temp.txt`);
      expect(fs.existsSync(diskPath)).toBe(false);
    });

    it("succeeds even if disk file is already missing", async () => {
      const buffer = Buffer.from("ghost");
      const file = await service.saveFile("u-1", "ghost.txt", "text/plain", buffer);

      // Delete disk file manually
      const diskPath = path.join(uploadsDir, "u-1", `${file.id}-ghost.txt`);
      fs.unlinkSync(diskPath);

      // Should not throw
      await service.deleteFile(file.id, "u-1");
      expect(db.getFileById(file.id)).toBeUndefined();
    });
  });

  describe("generateIndex", () => {
    it("generates index with multiple files", async () => {
      await service.saveFile("u-1", "a.txt", "text/plain", Buffer.from("aaa"));
      await service.saveFile("u-1", "b.csv", "text/csv", Buffer.from("bbb"));

      const indexPath = path.join(uploadsDir, "u-1", "index.md");
      const content = fs.readFileSync(indexPath, "utf-8");
      expect(content).toContain("## a.txt");
      expect(content).toContain("## b.csv");
    });

    it("writes empty index when no files exist", async () => {
      const buffer = Buffer.from("temp");
      const file = await service.saveFile("u-1", "temp.txt", "text/plain", buffer);
      await service.deleteFile(file.id, "u-1");

      const indexPath = path.join(uploadsDir, "u-1", "index.md");
      const content = fs.readFileSync(indexPath, "utf-8");
      expect(content).toBe("# File Library\n\nNo files uploaded yet.\n");
    });
  });

  describe("readIndex", () => {
    it("returns index content for user with files", async () => {
      await service.saveFile("u-1", "doc.md", "text/markdown", Buffer.from("# Hello"));
      const index = service.readIndex("u-1");
      expect(index).toContain("## doc.md");
    });

    it("returns 'No files in library.' when user has no directory", () => {
      expect(service.readIndex("u-nonexistent")).toBe("No files in library.");
    });
  });

  describe("readFileContent", () => {
    it("reads text file content", async () => {
      const file = await service.saveFile("u-1", "hello.txt", "text/plain", Buffer.from("Hello World"));
      const content = await service.readFileContent(file.id);
      expect(content).toBe("Hello World");
    });

    it("returns error for unknown file id", async () => {
      const content = await service.readFileContent("nonexistent");
      expect(content).toContain("Error");
    });
  });
});
