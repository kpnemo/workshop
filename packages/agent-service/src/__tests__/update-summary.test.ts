import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createUpdateSummaryTool } from "../services/tools/update-summary.js";
import { Database } from "../services/database.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("update_summary tool", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-summary-tool-${Date.now()}.db`);
    db = new Database(dbPath);
    db.createUser("u-1", "test@example.com", "pw");
    db.createConversation("conv-1", "support-bot", "u-1");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
  });

  it("has correct tool definition", () => {
    const tool = createUpdateSummaryTool();
    expect(tool.name).toBe("update_summary");
    expect(tool.definition.name).toBe("update_summary");
    expect(tool.definition.input_schema.required).toContain("summary");
  });

  it("writes summary to DB and returns success", async () => {
    const tool = createUpdateSummaryTool();
    const result = await tool.execute(
      { summary: "User asked about billing." },
      { conversationId: "conv-1", db } as any
    );

    expect(result).toContain("success");
    const conv = db.getConversation("conv-1")!;
    expect(conv.summary).toBe("User asked about billing.");
  });

  it("returns error when summary is missing", async () => {
    const tool = createUpdateSummaryTool();
    const result = await tool.execute({}, { conversationId: "conv-1", db } as any);
    expect(result).toContain("Error");
  });
});
