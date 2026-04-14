# File Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload document files to a per-user library, auto-index them in a markdown catalog, and give agents tools to search and read those files.

**Architecture:** Files stored on disk under `packages/data/uploads/{userId}/`. A `files` table in SQLite tracks metadata/ownership. An `index.md` file per user is a derived artifact regenerated on every add/delete. Two agent tools (`search_files`, `read_user_file`) let agents reason over the catalog and read file content. Frontend adds a paperclip button to ChatInput with drag-and-drop support.

**Tech Stack:** Express + multer (multipart uploads), better-sqlite3 (metadata), pdf-parse (PDF text extraction), Anthropic SDK / Haiku (auto-description), React + Tailwind (frontend).

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/agent-service/src/services/file-service.ts` | File storage, index.md generation, description generation via Haiku |
| `packages/agent-service/src/services/tools/search-files.ts` | `search_files` agent tool |
| `packages/agent-service/src/services/tools/read-user-file.ts` | `read_user_file` agent tool |
| `packages/agent-service/src/routes/files.ts` | Express routes: POST/GET/DELETE /files |
| `packages/agent-service/src/__tests__/file-service.test.ts` | Tests for file-service |
| `packages/agent-service/src/__tests__/file-routes.test.ts` | Tests for file routes |
| `packages/agent-service/src/__tests__/file-tools.test.ts` | Tests for search_files and read_user_file tools |
| `packages/web-client/src/components/file-chip.tsx` | File attachment chip UI (uploading/ready/error states) |

### Modified files

| File | Change |
|------|--------|
| `packages/agent-service/src/services/database.ts` | Add `files` table + CRUD methods |
| `packages/agent-service/src/types.ts` | Add `FileRecord` interface |
| `packages/agent-service/src/services/tool-service.ts` | Register `search_files` and `read_user_file` |
| `packages/agent-service/src/index.ts` | Mount `/files` route, pass uploadsDir to services |
| `packages/agent-service/package.json` | Add `multer`, `pdf-parse`, `@types/multer` dependencies |
| `packages/web-client/src/types.ts` | Add `FileInfo` interface |
| `packages/web-client/src/lib/api.ts` | Add `uploadFile()`, `listFiles()`, `deleteFile()` |
| `packages/web-client/src/components/chat-input.tsx` | Add paperclip button, file chip, drag-drop, upload state |
| `packages/web-client/src/hooks/use-chat.ts` | Prepend `[Attached file: ...]` to message text on send |

---

### Task 1: Install backend dependencies

**Files:**
- Modify: `packages/agent-service/package.json`

- [ ] **Step 1: Install multer and pdf-parse**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service add multer pdf-parse
```

- [ ] **Step 2: Install type definitions**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service add -D @types/multer
```

- [ ] **Step 3: Verify installation**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service exec -- node -e "require('multer'); require('pdf-parse'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add packages/agent-service/package.json pnpm-lock.yaml
git commit -m "chore(agent-service): add multer and pdf-parse dependencies"
```

---

### Task 2: Add FileRecord type and database methods

**Files:**
- Modify: `packages/agent-service/src/types.ts`
- Modify: `packages/agent-service/src/services/database.ts`
- Test: `packages/agent-service/src/__tests__/database.test.ts`

- [ ] **Step 1: Add FileRecord interface to types.ts**

Add after the `User` interface (line 63):

```typescript
export interface FileRecord {
  id: string;
  userId: string;
  filename: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  description: string | null;
  createdAt: Date;
}
```

- [ ] **Step 2: Write failing tests for database file methods**

Add to `packages/agent-service/src/__tests__/database.test.ts`, after the last `describe` block:

```typescript
describe("File methods", () => {
  it("addFile inserts a file record and getFilesByUser returns it", () => {
    db.createUser("u-1", "test@example.com", "pw");
    db.addFile({
      id: "f-1",
      userId: "u-1",
      filename: "report.pdf",
      storagePath: "/uploads/u-1/f-1-report.pdf",
      sizeBytes: 1024,
      mimeType: "application/pdf",
    });

    const files = db.getFilesByUser("u-1");
    expect(files).toHaveLength(1);
    expect(files[0].id).toBe("f-1");
    expect(files[0].filename).toBe("report.pdf");
    expect(files[0].sizeBytes).toBe(1024);
    expect(files[0].mimeType).toBe("application/pdf");
    expect(files[0].description).toBeNull();
    expect(files[0].createdAt).toBeInstanceOf(Date);
  });

  it("getFilesByUser returns only that user's files", () => {
    db.createUser("u-1", "a@example.com", "pw");
    db.createUser("u-2", "b@example.com", "pw");
    db.addFile({ id: "f-1", userId: "u-1", filename: "a.txt", storagePath: "/a", sizeBytes: 10, mimeType: "text/plain" });
    db.addFile({ id: "f-2", userId: "u-2", filename: "b.txt", storagePath: "/b", sizeBytes: 20, mimeType: "text/plain" });

    expect(db.getFilesByUser("u-1")).toHaveLength(1);
    expect(db.getFilesByUser("u-2")).toHaveLength(1);
  });

  it("getFilesByUser returns empty array when user has no files", () => {
    db.createUser("u-1", "a@example.com", "pw");
    expect(db.getFilesByUser("u-1")).toEqual([]);
  });

  it("getFileById returns the file record", () => {
    db.createUser("u-1", "a@example.com", "pw");
    db.addFile({ id: "f-1", userId: "u-1", filename: "data.csv", storagePath: "/data", sizeBytes: 500, mimeType: "text/csv" });

    const file = db.getFileById("f-1");
    expect(file).toBeDefined();
    expect(file!.filename).toBe("data.csv");
  });

  it("getFileById returns undefined for unknown id", () => {
    expect(db.getFileById("nonexistent")).toBeUndefined();
  });

  it("updateFileDescription sets the description", () => {
    db.createUser("u-1", "a@example.com", "pw");
    db.addFile({ id: "f-1", userId: "u-1", filename: "report.pdf", storagePath: "/r", sizeBytes: 100, mimeType: "application/pdf" });
    db.updateFileDescription("f-1", "A quarterly report.");

    const file = db.getFileById("f-1");
    expect(file!.description).toBe("A quarterly report.");
  });

  it("deleteFile removes the record and returns true", () => {
    db.createUser("u-1", "a@example.com", "pw");
    db.addFile({ id: "f-1", userId: "u-1", filename: "old.txt", storagePath: "/old", sizeBytes: 50, mimeType: "text/plain" });

    expect(db.deleteFile("f-1")).toBe(true);
    expect(db.getFileById("f-1")).toBeUndefined();
    expect(db.getFilesByUser("u-1")).toEqual([]);
  });

  it("deleteFile returns false for unknown id", () => {
    expect(db.deleteFile("nonexistent")).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -30
```

Expected: Failures — `db.addFile is not a function`.

- [ ] **Step 4: Add files table to database init()**

In `packages/agent-service/src/services/database.ts`, add inside the `init()` method's `this.db.exec()` call, after the `CREATE INDEX IF NOT EXISTS idx_messages_conversation` line (line 41):

```sql
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
```

- [ ] **Step 5: Add file CRUD methods to Database class**

Add the following import to `database.ts` line 2:

```typescript
import type { Conversation, ConversationSummary, FileRecord, Message } from "../types.js";
```

Add the following methods to the `Database` class, before the `close()` method:

```typescript
  addFile(params: { id: string; userId: string; filename: string; storagePath: string; sizeBytes: number; mimeType: string }): void {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO files (id, user_id, filename, storage_path, size_bytes, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(params.id, params.userId, params.filename, params.storagePath, params.sizeBytes, params.mimeType, now);
  }

  getFilesByUser(userId: string): FileRecord[] {
    const rows = this.db
      .prepare("SELECT id, user_id, filename, storage_path, size_bytes, mime_type, description, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as Array<{ id: string; user_id: string; filename: string; storage_path: string; size_bytes: number; mime_type: string; description: string | null; created_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      filename: r.filename,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
      mimeType: r.mime_type,
      description: r.description,
      createdAt: new Date(r.created_at),
    }));
  }

  getFileById(id: string): FileRecord | undefined {
    const row = this.db
      .prepare("SELECT id, user_id, filename, storage_path, size_bytes, mime_type, description, created_at FROM files WHERE id = ?")
      .get(id) as { id: string; user_id: string; filename: string; storage_path: string; size_bytes: number; mime_type: string; description: string | null; created_at: string } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      storagePath: row.storage_path,
      sizeBytes: row.size_bytes,
      mimeType: row.mime_type,
      description: row.description,
      createdAt: new Date(row.created_at),
    };
  }

  updateFileDescription(id: string, description: string): void {
    this.db.prepare("UPDATE files SET description = ? WHERE id = ?").run(description, id);
  }

  deleteFile(id: string): boolean {
    const result = this.db.prepare("DELETE FROM files WHERE id = ?").run(id);
    return result.changes > 0;
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass, including the new "File methods" describe block.

- [ ] **Step 7: Commit**

```bash
git add packages/agent-service/src/types.ts packages/agent-service/src/services/database.ts packages/agent-service/src/__tests__/database.test.ts
git commit -m "feat(agent-service): add files table and CRUD methods to database"
```

---

### Task 3: Create file-service (storage, index generation, description)

**Files:**
- Create: `packages/agent-service/src/services/file-service.ts`
- Test: `packages/agent-service/src/__tests__/file-service.test.ts`

- [ ] **Step 1: Write failing tests for FileService**

Create `packages/agent-service/src/__tests__/file-service.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database } from "../services/database.js";
import { FileService } from "../services/file-service.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A summary of the uploaded document." }],
      }),
    };
  },
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
      const mockCreate = vi.fn().mockRejectedValue(new Error("API error"));
      vi.mocked(Anthropic).mockImplementationOnce(() => ({
        messages: { create: mockCreate },
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-service.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: Failure — cannot find module `../services/file-service.js`.

- [ ] **Step 3: Implement FileService**

Create `packages/agent-service/src/services/file-service.ts`:

```typescript
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

    const storageName = `${fileId}-${filename}`;
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

  async readFileContent(fileId: string): Promise<string> {
    const file = this.db.getFileById(fileId);
    if (!file) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-service.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/agent-service/src/services/file-service.ts packages/agent-service/src/__tests__/file-service.test.ts
git commit -m "feat(agent-service): add FileService with storage, indexing, and description generation"
```

---

### Task 4: Create agent tools (search_files and read_user_file)

**Files:**
- Create: `packages/agent-service/src/services/tools/search-files.ts`
- Create: `packages/agent-service/src/services/tools/read-user-file.ts`
- Modify: `packages/agent-service/src/services/tools/types.ts`
- Modify: `packages/agent-service/src/services/tool-service.ts`
- Test: `packages/agent-service/src/__tests__/file-tools.test.ts`

- [ ] **Step 1: Add userId to ToolContext**

In `packages/agent-service/src/services/tools/types.ts`, add `userId` and `fileService` to the `ToolContext` interface:

```typescript
import type Anthropic from "@anthropic-ai/sdk";
import type { Response } from "express";
import type { Database } from "../database.js";
import type { AgentConfig } from "../../types.js";
import type { FileService } from "../file-service.js";

export interface ToolContext {
  conversationId: string;
  res: Response;
  db: Database;
  agents: Map<string, AgentConfig>;
  userId?: string;
  fileService?: FileService;
}

export interface Tool {
  name: string;
  definition: Anthropic.Messages.Tool;
  execute(input: unknown, context?: ToolContext): Promise<string>;
}
```

- [ ] **Step 2: Write failing tests for file tools**

Create `packages/agent-service/src/__tests__/file-tools.test.ts`:

```typescript
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
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A summary." }],
      }),
    };
  },
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-tools.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: Failure — cannot find module `../services/tools/search-files.js`.

- [ ] **Step 4: Implement search_files tool**

Create `packages/agent-service/src/services/tools/search-files.ts`:

```typescript
import type { Tool, ToolContext } from "./types.js";

export function createSearchFilesTool(): Tool {
  return {
    name: "search_files",
    definition: {
      name: "search_files",
      description: "Search the user's file library. Returns a catalog of all uploaded files with descriptions. Use this to find relevant files before reading them with read_user_file.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "What you are looking for in the user's files",
          },
        },
        required: ["query"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      if (!context?.userId || !context?.fileService) {
        return "Error: File search requires an authenticated user context.";
      }
      return context.fileService.readIndex(context.userId);
    },
  };
}
```

- [ ] **Step 5: Implement read_user_file tool**

Create `packages/agent-service/src/services/tools/read-user-file.ts`:

```typescript
import type { Tool, ToolContext } from "./types.js";

export function createReadUserFileTool(): Tool {
  return {
    name: "read_user_file",
    definition: {
      name: "read_user_file",
      description: "Read the full content of a file from the user's library. Use the file ID obtained from search_files.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_id: {
            type: "string",
            description: "The ID of the file to read (from the search_files catalog)",
          },
        },
        required: ["file_id"],
      },
    },
    async execute(input: unknown, context?: ToolContext): Promise<string> {
      if (!context?.userId || !context?.fileService) {
        return "Error: File reading requires an authenticated user context.";
      }
      const { file_id } = (input ?? {}) as { file_id?: string };
      if (!file_id || typeof file_id !== "string") {
        return "Error: A valid file_id string is required.";
      }
      return context.fileService.readFileContent(file_id);
    },
  };
}
```

- [ ] **Step 6: Register tools in ToolService**

In `packages/agent-service/src/services/tool-service.ts`, add imports and register the new tools:

Add to imports (after line 8):

```typescript
import { createSearchFilesTool } from "./tools/search-files.js";
import { createReadUserFileTool } from "./tools/read-user-file.js";
```

Add to `registerDefaults()` method (after line 36):

```typescript
    this.register(createSearchFilesTool());
    this.register(createReadUserFileTool());
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-tools.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 8: Run full test suite**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/agent-service/src/services/tools/search-files.ts packages/agent-service/src/services/tools/read-user-file.ts packages/agent-service/src/services/tools/types.ts packages/agent-service/src/services/tool-service.ts packages/agent-service/src/__tests__/file-tools.test.ts
git commit -m "feat(agent-service): add search_files and read_user_file agent tools"
```

---

### Task 5: Create file upload routes

**Files:**
- Create: `packages/agent-service/src/routes/files.ts`
- Modify: `packages/agent-service/src/index.ts`
- Test: `packages/agent-service/src/__tests__/file-routes.test.ts`

- [ ] **Step 1: Write failing tests for file routes**

Create `packages/agent-service/src/__tests__/file-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Database } from "../services/database.js";
import { FileService } from "../services/file-service.js";
import { createFilesRouter } from "../routes/files.js";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A file summary." }],
      }),
    };
  },
}));

function createTestApp(db: Database, fileService: FileService, userId: string) {
  const app = express();
  app.use(express.json());
  // Fake auth middleware
  app.use((req, _res, next) => {
    req.userId = userId;
    next();
  });
  app.use("/files", createFilesRouter(db, fileService));
  return app;
}

describe("File routes", () => {
  let db: Database;
  let dbPath: string;
  let uploadsDir: string;
  let fileService: FileService;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-fr-${Date.now()}.db`);
    uploadsDir = path.join(os.tmpdir(), `test-fr-uploads-${Date.now()}`);
    db = new Database(dbPath);
    fileService = new FileService(db, uploadsDir);
    db.createUser("u-1", "test@example.com", "pw");
    app = createTestApp(db, fileService, "u-1");
  });

  afterEach(() => {
    db.close();
    try { fs.unlinkSync(dbPath); } catch {}
    try { fs.unlinkSync(dbPath + "-wal"); } catch {}
    try { fs.unlinkSync(dbPath + "-shm"); } catch {}
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  describe("POST /files", () => {
    it("uploads a file and returns metadata", async () => {
      const res = await request(app)
        .post("/files")
        .attach("file", Buffer.from("hello world"), "notes.txt");

      expect(res.status).toBe(201);
      expect(res.body.filename).toBe("notes.txt");
      expect(res.body.sizeBytes).toBe(11);
      expect(res.body.description).toBe("A file summary.");
      expect(res.body.id).toBeDefined();
    });

    it("rejects files over 10MB", async () => {
      const bigBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const res = await request(app)
        .post("/files")
        .attach("file", bigBuffer, "huge.bin");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("10MB");
    });

    it("rejects unsupported file types", async () => {
      const res = await request(app)
        .post("/files")
        .attach("file", Buffer.from("data"), "image.png");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unsupported");
    });

    it("rejects requests without a file", async () => {
      const res = await request(app).post("/files");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No file");
    });
  });

  describe("GET /files", () => {
    it("returns list of user's files", async () => {
      await request(app)
        .post("/files")
        .attach("file", Buffer.from("content"), "a.txt");

      const res = await request(app).get("/files");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].filename).toBe("a.txt");
    });

    it("returns empty array when no files", async () => {
      const res = await request(app).get("/files");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("DELETE /files/:id", () => {
    it("deletes a file and returns 204", async () => {
      const upload = await request(app)
        .post("/files")
        .attach("file", Buffer.from("bye"), "temp.txt");

      const res = await request(app).delete(`/files/${upload.body.id}`);
      expect(res.status).toBe(204);

      const list = await request(app).get("/files");
      expect(list.body).toEqual([]);
    });

    it("returns 404 for unknown file id", async () => {
      const res = await request(app).delete("/files/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("Auth isolation", () => {
    it("user cannot delete another user's file", async () => {
      // Upload as u-1
      const upload = await request(app)
        .post("/files")
        .attach("file", Buffer.from("private"), "secret.txt");

      // Create app for u-2
      db.createUser("u-2", "other@example.com", "pw");
      const app2 = createTestApp(db, fileService, "u-2");

      const res = await request(app2).delete(`/files/${upload.body.id}`);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Install supertest for route testing**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service add -D supertest @types/supertest
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-routes.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: Failure — cannot find module `../routes/files.js`.

- [ ] **Step 4: Implement files router**

Create `packages/agent-service/src/routes/files.ts`:

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import type { Database } from "../services/database.js";
import type { FileService } from "../services/file-service.js";

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".txt", ".md", ".csv", ".json",
  ".js", ".ts", ".py", ".html", ".css",
  ".xml", ".yaml", ".yml", ".log",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`));
    }
  },
});

export function createFilesRouter(db: Database, fileService: FileService): Router {
  const router = Router();

  // POST /files — upload a file
  router.post("/", (req: Request, res: Response) => {
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "File too large. Maximum size is 10MB." });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No file provided." });
        return;
      }

      try {
        const file = await fileService.saveFile(
          req.userId!,
          req.file.originalname,
          req.file.mimetype,
          req.file.buffer
        );

        console.log(`[files] Uploaded ${file.filename} (${file.sizeBytes} bytes) for user ${req.userId}`);

        res.status(201).json({
          id: file.id,
          filename: file.filename,
          sizeBytes: file.sizeBytes,
          mimeType: file.mimeType,
          description: file.description,
          createdAt: file.createdAt.toISOString(),
        });
      } catch (error) {
        console.error("[files] Upload error:", error);
        res.status(500).json({ error: "Failed to upload file." });
      }
    });
  });

  // GET /files — list user's files
  router.get("/", (req: Request, res: Response) => {
    const files = db.getFilesByUser(req.userId!);
    res.json(
      files.map((f) => ({
        id: f.id,
        filename: f.filename,
        sizeBytes: f.sizeBytes,
        mimeType: f.mimeType,
        description: f.description,
        createdAt: f.createdAt.toISOString(),
      }))
    );
  });

  // DELETE /files/:id — delete a file
  router.delete("/:id", async (req: Request, res: Response) => {
    const file = db.getFileById(req.params.id);
    if (!file || file.userId !== req.userId) {
      res.status(404).json({ error: "File not found." });
      return;
    }

    await fileService.deleteFile(file.id, req.userId!);
    console.log(`[files] Deleted ${file.filename} for user ${req.userId}`);
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 5: Mount files router in index.ts**

In `packages/agent-service/src/index.ts`, add the import (after line 16):

```typescript
import { createFilesRouter } from "./routes/files.js";
import { FileService } from "./services/file-service.js";
```

Add after the `const toolService` block (around line 62), before the Routes section:

```typescript
// File service
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(__dirname, "../../../packages/data/uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const fileService = new FileService(db, UPLOADS_DIR);
console.log(`[startup] File service initialized, uploads at ${UPLOADS_DIR}`);
```

Add the route mount (after the `/conversations` route, around line 67):

```typescript
app.use("/files", authMiddleware(JWT_SECRET), createFilesRouter(db, fileService));
```

Also pass `fileService` to the conversation router so tools have access. Update the conversation route line to:

```typescript
app.use("/conversations", authMiddleware(JWT_SECRET), createConversationRouter(agents, db, toolService, fileService));
```

- [ ] **Step 6: Update createConversationRouter to accept fileService**

In `packages/agent-service/src/routes/conversations.ts`, update the function signature (line 18):

```typescript
import type { FileService } from "../services/file-service.js";

export function createConversationRouter(
  agents: Map<string, AgentConfig>,
  db: Database,
  toolService?: ToolService,
  fileService?: FileService
): Router {
```

Then where the tool context is created (search for `toolContext` or where `toolService.execute` is called), ensure `userId` and `fileService` are passed. Find the line that creates the tool context object and add:

```typescript
userId: req.userId,
fileService,
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- src/__tests__/file-routes.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 8: Run full backend test suite**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -40
```

Expected: All tests pass (existing + new).

- [ ] **Step 9: Commit**

```bash
git add packages/agent-service/src/routes/files.ts packages/agent-service/src/routes/conversations.ts packages/agent-service/src/index.ts packages/agent-service/src/__tests__/file-routes.test.ts packages/agent-service/package.json pnpm-lock.yaml
git commit -m "feat(agent-service): add file upload/list/delete routes"
```

---

### Task 6: Add frontend API functions and types

**Files:**
- Modify: `packages/web-client/src/types.ts`
- Modify: `packages/web-client/src/lib/api.ts`
- Test: `packages/web-client/src/__tests__/api.test.ts`

- [ ] **Step 1: Add FileInfo type**

In `packages/web-client/src/types.ts`, add after the `CreateAgentInput` interface (end of file):

```typescript
export interface FileInfo {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  description: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write failing tests for file API functions**

Add to `packages/web-client/src/__tests__/api.test.ts`, at the end of the file:

```typescript
import { uploadFile, listFiles, deleteFile } from "../lib/api";

describe("uploadFile", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends multipart POST to /api/files and returns file info", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "f-123",
          filename: "notes.txt",
          sizeBytes: 100,
          mimeType: "text/plain",
          description: "A text file.",
          createdAt: "2026-04-14T10:00:00Z",
        }),
    });

    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    const result = await uploadFile(file);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/files",
      expect.objectContaining({ method: "POST" })
    );
    // Should use FormData, not JSON
    const call = mockFetch.mock.calls[0][1];
    expect(call.body).toBeInstanceOf(FormData);
    expect(result.id).toBe("f-123");
    expect(result.filename).toBe("notes.txt");
  });

  it("throws on non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "File too large" }),
    });

    const file = new File(["x"], "big.txt", { type: "text/plain" });
    await expect(uploadFile(file)).rejects.toThrow("File too large");
  });
});

describe("listFiles", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends GET to /api/files and returns file list", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "f-1", filename: "a.txt", sizeBytes: 10, mimeType: "text/plain", description: null, createdAt: "2026-04-14T10:00:00Z" }]),
    });

    const files = await listFiles();
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("a.txt");
  });
});

describe("deleteFile", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends DELETE to /api/files/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await deleteFile("f-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/files/f-123",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/web-client test -- --reporter=verbose 2>&1 | tail -20
```

Expected: Failure — `uploadFile` is not exported from `../lib/api`.

- [ ] **Step 4: Add API functions to api.ts**

Add to the end of `packages/web-client/src/lib/api.ts`:

```typescript
import type { FileInfo } from "../types";

export async function uploadFile(file: File): Promise<FileInfo> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/files`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to upload file");
  }

  return res.json();
}

export async function listFiles(): Promise<FileInfo[]> {
  const res = await fetch(`${BASE_URL}/api/files`, {
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error || "Failed to list files");
  }

  return res.json();
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/files/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });

  if (!res.ok) {
    throw new Error("Failed to delete file");
  }
}
```

- [ ] **Step 5: Update api.ts import**

Add `FileInfo` to the existing import at the top of `api.ts` (line 1):

```typescript
import type {
  ConversationResponse,
  ConversationDetail,
  ConversationSummary,
  FileInfo,
  SendMessageCallbacks,
} from "../types";
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/web-client test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web-client/src/types.ts packages/web-client/src/lib/api.ts packages/web-client/src/__tests__/api.test.ts
git commit -m "feat(web-client): add file upload/list/delete API functions and FileInfo type"
```

---

### Task 7: Add file chip component

**Files:**
- Create: `packages/web-client/src/components/file-chip.tsx`

- [ ] **Step 1: Create FileChip component**

Create `packages/web-client/src/components/file-chip.tsx`:

```tsx
interface FileChipProps {
  filename: string;
  sizeBytes: number;
  status: "uploading" | "ready" | "error";
  errorMessage?: string;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.ceil(bytes / 1024)}KB`;
}

export function FileChip({ filename, sizeBytes, status, errorMessage, onRemove }: FileChipProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
        status === "error"
          ? "border-red-500/50 bg-red-500/10 text-red-400"
          : "border-border bg-surface text-foreground"
      }`}
    >
      {status === "uploading" ? (
        <span className="text-muted animate-pulse">⏳</span>
      ) : status === "error" ? (
        <span>⚠️</span>
      ) : (
        <span className="text-primary">📄</span>
      )}

      <span className={status === "error" ? "line-through" : ""}>
        {filename}
      </span>

      {status !== "error" && (
        <span className="text-muted text-xs">{formatSize(sizeBytes)}</span>
      )}

      {status === "error" && errorMessage && (
        <span className="text-xs">{errorMessage}</span>
      )}

      <button
        onClick={onRemove}
        className="ml-1 text-muted hover:text-red-400 transition-colors"
        aria-label="Remove file"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web-client/src/components/file-chip.tsx
git commit -m "feat(web-client): add FileChip component with upload states"
```

---

### Task 8: Update ChatInput with file attachment support

**Files:**
- Modify: `packages/web-client/src/components/chat-input.tsx`
- Modify: `packages/web-client/src/hooks/use-chat.ts`

- [ ] **Step 1: Update ChatInput with paperclip button and file upload**

Replace the full content of `packages/web-client/src/components/chat-input.tsx`:

```tsx
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { FileChip } from "./file-chip";
import { uploadFile } from "../lib/api";
import type { FileInfo } from "../types";

const ALLOWED_EXTENSIONS = [
  ".pdf", ".txt", ".md", ".csv", ".json",
  ".js", ".ts", ".py", ".html", ".css",
  ".xml", ".yaml", ".yml", ".log",
];

interface PendingFile {
  file: File;
  status: "uploading" | "ready" | "error";
  info?: FileInfo;
  errorMessage?: string;
}

interface ChatInputProps {
  onSend: (message: string, attachment?: FileInfo) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [disabled]);

  const handleFileSelect = useCallback(async (file: File) => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setPendingFile({ file, status: "error", errorMessage: "Unsupported type" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPendingFile({ file, status: "error", errorMessage: "Over 10MB limit" });
      return;
    }

    setPendingFile({ file, status: "uploading" });

    try {
      const info = await uploadFile(file);
      setPendingFile({ file, status: "ready", info });
    } catch (err) {
      setPendingFile({
        file,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    const hasText = trimmed.length > 0;
    const hasFile = pendingFile?.status === "ready" && pendingFile.info;

    if ((!hasText && !hasFile) || disabled) return;

    onSend(trimmed, hasFile ? pendingFile.info : undefined);
    setValue("");
    setPendingFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend, pendingFile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const isUploading = pendingFile?.status === "uploading";
  const canSend = !disabled && !isUploading && (value.trim().length > 0 || pendingFile?.status === "ready");

  return (
    <div
      className="border-t border-border bg-background px-4 py-3"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {pendingFile && (
        <div className="mb-2">
          <FileChip
            filename={pendingFile.file.name}
            sizeBytes={pendingFile.file.size}
            status={pendingFile.status}
            errorMessage={pendingFile.errorMessage}
            onRemove={() => setPendingFile(null)}
          />
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          aria-label="Attach file"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Waiting..." : "Type a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder-muted outline-none focus:border-primary disabled:opacity-50"
          style={{ maxHeight: "120px" }}
        />
        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update useChat to handle file attachments**

In `packages/web-client/src/hooks/use-chat.ts`, update the `sendMessage` function signature and implementation.

First, add the import at the top (line 10):

```typescript
import type { Message, ChatState, FileInfo } from "../types";
```

Then update the `sendMessage` callback (line 189). Change:

```typescript
  const sendMessage = useCallback(
    (text: string) => {
```

To:

```typescript
  const sendMessage = useCallback(
    (text: string, attachment?: FileInfo) => {
```

And update the message content construction. After `if (!state.conversationId || state.isStreaming) return;` (line 191), add:

```typescript
      // Prepend attachment note if a file was attached
      let messageText = text;
      if (attachment) {
        const prefix = `[Attached file: ${attachment.filename}]`;
        messageText = text ? `${prefix}\n${text}` : prefix;
      }
```

Then replace `content: text` with `content: messageText` in the `userMessage` object, and replace `apiSendMessage(state.conversationId, text,` with `apiSendMessage(state.conversationId, messageText,`.

- [ ] **Step 3: Update ChatContainer to pass new onSend signature**

Find where `ChatInput` is rendered in `packages/web-client/src/components/chat-container.tsx`. The `onSend` prop should already work since `sendMessage` now accepts an optional second parameter. Verify the prop type matches — `ChatInputProps.onSend` accepts `(message: string, attachment?: FileInfo)` and `useChat.sendMessage` now accepts `(text: string, attachment?: FileInfo)`. If `ChatContainer` passes `sendMessage` directly, no change is needed.

- [ ] **Step 4: Run frontend tests**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/web-client test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass (existing tests should still work since the new parameter is optional).

- [ ] **Step 5: Run full backend tests to check for regressions**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service test -- --reporter=verbose 2>&1 | tail -30
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-client/src/components/chat-input.tsx packages/web-client/src/hooks/use-chat.ts
git commit -m "feat(web-client): add file attachment to ChatInput with paperclip button and drag-drop"
```

---

### Task 9: Add Vite proxy for /api/files

**Files:**
- Modify: `packages/web-client/vite.config.ts`

- [ ] **Step 1: Verify proxy config covers /api/files**

The existing Vite proxy already rewrites `/api` to the backend:

```typescript
proxy: {
  "/api": {
    target: "http://localhost:3000",
    rewrite: (path) => path.replace(/^\/api/, ""),
  },
},
```

This means `/api/files` is already proxied to `http://localhost:3000/files`. **No change needed.** Verify by reading the config.

- [ ] **Step 2: Commit (skip if no changes needed)**

No commit needed — proxy already handles the new route.

---

### Task 10: Manual integration test

- [ ] **Step 1: Start backend**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/agent-service dev
```

- [ ] **Step 2: Start frontend**

```bash
cd /home/pavloi/code/workshop && pnpm --filter @new-workshop/web-client dev
```

- [ ] **Step 3: Test in browser**

Open `http://localhost:5173`. Log in or sign up. Then:

1. Click the paperclip button — file picker should open
2. Select a `.txt` or `.csv` file — chip should show "uploading" then "ready"
3. Type a message and send — message should include `[Attached file: ...]`
4. Ask the agent about the file — if the agent has `search_files` and `read_user_file` in its tools, it should be able to find and read the file
5. Drag a file onto the chat area — should trigger upload

- [ ] **Step 4: Update an agent to use file tools**

Add `search_files` and `read_user_file` to the `tools` list of at least one agent (e.g., `agents/main-agent.md`):

```yaml
tools:
  - browse_url
  - search_files
  - read_user_file
```

- [ ] **Step 5: Test file tool usage**

Upload a text file, then ask the agent "What files do I have?" or "What's in the file I uploaded?" The agent should call `search_files`, read the index, then optionally call `read_user_file` to read content.

- [ ] **Step 6: Commit agent update**

```bash
git add agents/main-agent.md
git commit -m "feat: enable file tools on main agent"
```
