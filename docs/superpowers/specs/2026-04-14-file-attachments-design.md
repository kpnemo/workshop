# File Attachments Design

Users attach document files to their chat, which are saved to a per-user library and indexed in a markdown catalog. Agents access files via tools — reading the index to find relevant files, then reading file content on demand.

## Decisions

- **File types:** Documents only (PDF, text, markdown, CSV, JSON, code files). No images/audio/video.
- **Scope:** Per-user library. All files a user uploads are in one global library, accessible from any conversation with any agent.
- **Indexing:** A single `index.md` file per user acts as a catalog. Each entry has the filename, ID, upload date, size, and an auto-generated description.
- **Description generation:** On upload, Haiku generates a short summary of the file content. No user input required.
- **Agent access:** Via two tools (`search_files`, `read_user_file`). Agents are not given file context automatically — they invoke tools when the conversation warrants it.
- **File content size:** No truncation. Claude's context window is the natural limit.
- **Upload UX:** Inline in chat via a paperclip button. No separate file manager panel.
- **Architecture:** Filesystem-only. Files on disk, markdown index on disk, minimal DB table for metadata/ownership.

## Storage

### Filesystem layout

```
packages/data/uploads/
└── {userId}/
    ├── index.md              ← auto-generated catalog
    ├── {fileId}-report.pdf
    ├── {fileId}-data.csv
    └── {fileId}-notes.md
```

Files are stored as `{fileId}-{originalName}` to avoid name collisions. `fileId` is generated via `crypto.randomUUID()`.

### Index file format

```markdown
# File Library

## report.pdf
- **ID:** abc123
- **Uploaded:** 2026-04-14
- **Size:** 45KB
- **Description:** Quarterly revenue report for Q1 2026 covering sales by region, year-over-year growth, and projections for Q2.

## data.csv
- **ID:** def456
- **Uploaded:** 2026-04-13
- **Size:** 12KB
- **Description:** Customer satisfaction survey results with NPS scores broken down by product line.
```

The index is a derived artifact, regenerated whenever files are added or deleted.

### Database table

```sql
CREATE TABLE files (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  size_bytes    INTEGER,
  mime_type     TEXT,
  description   TEXT,
  created_at    TEXT
);

CREATE INDEX idx_files_user ON files(user_id);
```

The DB is the source of truth for ownership and metadata. The index.md is derived from it.

## API Endpoints

### POST /files (auth required)

Upload a file. Accepts multipart form data. Saves to disk, inserts DB row, calls Haiku for description, regenerates index.md. Returns file metadata.

**Request:** `multipart/form-data` with a `file` field.

**Response (201):**
```json
{
  "id": "abc123",
  "filename": "report.pdf",
  "size_bytes": 46080,
  "mime_type": "application/pdf",
  "description": "Quarterly revenue report for Q1 2026...",
  "created_at": "2026-04-14T10:30:00.000Z"
}
```

**Errors:**
- 400: File too large (>10MB) or unsupported type.
- 401: Not authenticated.
- 500: Disk write or DB failure.

### GET /files (auth required)

List all files for the authenticated user.

**Response (200):**
```json
[
  {
    "id": "abc123",
    "filename": "report.pdf",
    "size_bytes": 46080,
    "mime_type": "application/pdf",
    "description": "Quarterly revenue report for Q1 2026...",
    "created_at": "2026-04-14T10:30:00.000Z"
  }
]
```

### DELETE /files/:id (auth required)

Delete a file. Removes DB row, regenerates index.md, deletes file from disk.

**Response:** 204 No Content.

**Errors:**
- 404: File not found or not owned by user.

## Agent Tools

Two new tools, registered alongside existing tools like `browse_url`.

### search_files

Agent reads the user's index.md to find relevant files by analyzing their descriptions.

- **Input:** `{ query: string }` — what the agent is looking for.
- **Output:** Full contents of the user's index.md file.
- **Empty library:** Returns `"No files in library."`

The query is included so Claude knows what to look for in the index, but the tool always returns the full index content. Claude reasons over the descriptions to decide which files are relevant.

### read_user_file

Agent reads the full content of a specific file identified by its ID.

- **Input:** `{ file_id: string }` — the file ID found via search_files.
- **Output:** The file's text content.
- **PDF files:** Text extracted via pdf-parse.
- **Missing file:** Returns an error message as the tool result.

### Tool registration

Both tools require the `userId` from the authenticated request context. The tool executor receives userId and resolves file paths via DB lookup, ensuring users can only access their own files.

Agents that should have file access list `search_files` and `read_user_file` in their `tools` frontmatter. The agent system prompt should mention that the user may have files in their library.

## Data flow: agent answering a file question

1. User asks: "What did the Q1 report say about growth?"
2. Claude decides to call `search_files` with `{ query: "Q1 report growth" }`
3. Tool returns the full index.md content
4. Claude reads the index, identifies `report.pdf` (ID: abc123) as relevant
5. Claude calls `read_user_file` with `{ file_id: "abc123" }`
6. Tool returns the full text content of report.pdf
7. Claude answers the question using the file content

## Upload flow

1. User clicks the paperclip button in ChatInput or drags a file onto the chat area.
2. Frontend shows a file preview chip (name, size) in the input area. User can remove it before sending.
3. Frontend sends `POST /files` with multipart form data. Upload is separate from the chat message.
4. Backend saves file to `packages/data/uploads/{userId}/`.
5. Backend calls Haiku with file content to generate a short description.
6. Backend updates DB with description, regenerates index.md.
7. Backend returns file metadata to frontend.
8. Frontend sends the chat message via normal `POST /conversations/:id/messages`. The frontend automatically prepends `[Attached file: report.pdf]` to the user's message text so the agent knows a file was just uploaded. If the user typed no message, the text is just the attachment note.

## Frontend changes

### ChatInput component

- Add a paperclip button (📎) to the left of the text input.
- Clicking opens a native file picker filtered to allowed types.
- Support drag-and-drop onto the chat area.
- Show a file chip above the input when a file is staged (filename, size, remove button).
- Disable send button during upload.

### Upload states

- **Uploading:** Show progress indicator on the chip. Send disabled.
- **Ready:** Show filename, size, and a remove (✕) button. Send enabled.
- **Error:** Show crossed-out filename with error text. Allow removal.

### API layer

Add `uploadFile(file: File)` and `listFiles()` and `deleteFile(id: string)` to the API module.

## Error handling

| Scenario | Behavior |
|---|---|
| File too large (>10MB) | Multer rejects before saving. 400 response. Frontend shows error chip. |
| Unsupported file type | Multer file filter rejects. 400 response with allowed types list. |
| Haiku description fails | File is still saved. Description falls back to "No description available." Index regenerated with fallback. |
| Disk write fails | 500 error. No DB row inserted (disk write happens first). |
| Delete: file missing on disk | DB row still deleted, index regenerated. Log warning but don't fail. |
| Agent tool: file not found | `read_user_file` returns error message as tool result. Claude tells user. |
| Agent tool: empty library | `search_files` returns "No files in library." Claude tells user. |

## Operation ordering

**Upload:** Save file to disk → insert DB row → call Haiku → update DB with description → regenerate index.md. If Haiku fails, steps 4-5 still run with fallback description.

**Delete:** Delete DB row → regenerate index.md → delete file from disk. DB first so index is immediately consistent. Disk cleanup is best-effort.

## Constraints

- **Max file size:** 10MB
- **Allowed types:** `.pdf`, `.txt`, `.md`, `.csv`, `.json`, `.js`, `.ts`, `.py`, `.html`, `.css`, `.xml`, `.yaml`, `.yml`, `.log`
- **Files per upload:** 1 at a time
- **Multipart parsing:** multer (Express middleware)

## New dependencies

- **multer** — multipart form data parsing for Express file uploads.
- **pdf-parse** — extract text content from PDF files for indexing and agent reading.

`crypto.randomUUID()` is used for file IDs (built-in, no dependency needed).

## Testing

### Backend (vitest)

- Upload route: happy path, size limit rejection, type rejection.
- List route: returns only the authenticated user's files.
- Delete route: removes from DB, regenerates index, handles missing disk file.
- Index generation: correct markdown format, handles empty library, handles multiple files.
- Description generation: Haiku call mocked, fallback on API failure.
- `search_files` tool: returns index content, handles empty library.
- `read_user_file` tool: returns file content, handles missing file, extracts PDF text.
- Auth gating: cannot access another user's files via any endpoint.

### Frontend (vitest + testing-library)

- Paperclip button opens file picker.
- File chip renders with name, size, remove button.
- Upload states: loading, ready, error.
- Send button disabled during upload.
- Drag-and-drop triggers upload.
- Remove chip clears pending file.
