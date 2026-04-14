import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database } from "../services/database.js";
import { FileService } from "../services/file-service.js";
import { createSearchFilesTool } from "../services/tools/search-files.js";
import { createReadUserFileTool } from "../services/tools/read-user-file.js";
import type { ToolContext } from "../services/tools/types.js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A summary." }],
      }),
    },
  })),
}));

describe("search_files tool", () => {
  let db: Database;
  let dbPath: string;
  let uploadsDir: string;
  let fileService: FileService;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-ft-${Date.now()}.db`);
    uploadsDir = path.join(os.tmpdir(), `test-ft-uploads-${Date.now()}`);
    db = new Database(dbPath);
    fileService = new FileService(db, uploadsDir);
    db.createUser("u-1", "test@example.com", "pw");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  it("returns index content when user has files", async () => {
    await fileService.saveFile("u-1", "report.txt", "text/plain", Buffer.from("quarterly data"));

    const tool = createSearchFilesTool();
    const context = { userId: "u-1", fileService } as unknown as ToolContext;
    const result = await tool.execute({ query: "quarterly report" }, context);

    expect(result).toContain("## report.txt");
    expect(result).toContain("A summary.");
  });

  it("returns 'No files in library.' when user has no files", async () => {
    const tool = createSearchFilesTool();
    const context = { userId: "u-1", fileService } as unknown as ToolContext;
    const result = await tool.execute({ query: "anything" }, context);

    expect(result).toBe("No files in library.");
  });

  it("returns error when no userId in context", async () => {
    const tool = createSearchFilesTool();
    const context = { fileService } as unknown as ToolContext;
    const result = await tool.execute({ query: "test" }, context);

    expect(result).toContain("Error");
  });
});

describe("read_user_file tool", () => {
  let db: Database;
  let dbPath: string;
  let uploadsDir: string;
  let fileService: FileService;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-ruf-${Date.now()}.db`);
    uploadsDir = path.join(os.tmpdir(), `test-ruf-uploads-${Date.now()}`);
    db = new Database(dbPath);
    fileService = new FileService(db, uploadsDir);
    db.createUser("u-1", "test@example.com", "pw");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  it("returns file content for valid file id", async () => {
    const file = await fileService.saveFile("u-1", "hello.txt", "text/plain", Buffer.from("Hello World"));

    const tool = createReadUserFileTool();
    const context = { userId: "u-1", fileService } as unknown as ToolContext;
    const result = await tool.execute({ file_id: file.id }, context);

    expect(result).toBe("Hello World");
  });

  it("returns error for unknown file id", async () => {
    const tool = createReadUserFileTool();
    const context = { userId: "u-1", fileService } as unknown as ToolContext;
    const result = await tool.execute({ file_id: "nonexistent" }, context);

    expect(result).toContain("Error");
  });

  it("returns error when no userId in context", async () => {
    const tool = createReadUserFileTool();
    const context = { fileService } as unknown as ToolContext;
    const result = await tool.execute({ file_id: "any" }, context);

    expect(result).toContain("Error");
  });
});
