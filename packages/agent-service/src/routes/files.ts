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

      const ext = "." + req.file.originalname.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        res.status(400).json({ error: `Unsupported file type: ${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}` });
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
