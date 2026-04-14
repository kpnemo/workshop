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
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "A file summary." }],
      }),
    },
  })),
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
