# Auto-Publish (Automatische Veröffentlichung) — Specification

## 1. Goal
The **Auto-Publish** feature automatically moderates and (if approved) publishes newly ingested posts for a user.

When enabled for a user:
- Each new incoming post for that user is scheduled to be published **exactly 6 hours** after ingestion.
- Before publishing, the post text is validated by an LLM moderation prompt.
- If moderation fails, the post is not published and is flagged as `warning`.
- The admin receives a notification email about the rejected post.

## 2. Definitions
- **Incoming post**: A post created via `POST /ingest/text`.
- **Owner mapping**: Incoming posts are mapped to users through `client_key` (`posts.client_key` equals `users.client_key`).
- **Auto-Publish toggle**: Per-user setting controlling the auto publish flow.

## 3. User Experience (Admin UI)

### 3.1. Posts page: `/admin/posts`

#### 3.1.1. For `editor` users
- A toggle is shown near the filters:
  - Label: **"Automatische Veröffentlichung"**
  - Controls auto-publish only for the currently logged-in user.

#### 3.1.2. For `admin` users
- The self toggle is **not shown**.
- A mini table is displayed **above the posts table** (full width) listing **only editor users**.
- Columns:
  - **Auto-Publish** (toggle)
  - **Email**
  - **Client Key**

Admin can enable/disable auto-publish for each editor user.

#### 3.1.3. Warning filter
On `/admin/posts` the status filter includes:
- `⚠️ Warning`

This filters posts with `status = 'warning'`.

### 3.2. Moderation prompt editor (admin)
On `/admin/posts` for admin users:
- Button: **"Edit Moderation Prompt"**
- Opens a modal with a textarea containing the current moderation prompt.
- Placeholder available in prompt: `{{text}}`.
- Saving updates the prompt immediately.

## 4. Data Model (SQLite)

### 4.1. `users`
Added:
- `auto_publish_enabled INTEGER NOT NULL DEFAULT 0`

### 4.2. `posts`
Status constraint updated to:
- `draft | published | archived | warning`

Added:
- `publish_at DATETIME`
- `moderation_checked_at DATETIME`
- `moderation_reason TEXT`

### 4.3. Migrations
- `db/migrations/014_add_warning_status_and_moderation_fields.sql`
  - Recreates `posts` table to extend status CHECK constraint.
  - Adds new moderation/scheduling columns.
- `db/migrations/015_add_user_auto_publish.sql`
  - Adds `users.auto_publish_enabled`.

## 5. API Endpoints

### 5.1. Auto-publish toggle: current user
- `GET /admin/auto-publish/status`
  - Auth: required
  - Response:
    ```json
    {"enabled": true}
    ```

- `POST /admin/auto-publish/toggle`
  - Auth: required
  - Body:
    ```json
    {"enabled": true}
    ```
  - Response:
    ```json
    {"success": true, "enabled": true}
    ```

### 5.2. Auto-publish toggle: admin per user
- `POST /admin/users/:id/auto-publish`
  - Auth: admin required
  - Body:
    ```json
    {"enabled": true}
    ```
  - Response:
    ```json
    {"success": true, "enabled": true}
    ```

### 5.3. Moderation prompt
- `GET /admin/moderation-prompt`
  - Auth: required
  - Response:
    ```json
    {"content": "..."}
    ```

- `POST /admin/moderation-prompt`
  - Auth: admin required
  - Body:
    ```json
    {"content": "..."}
    ```
  - Response:
    ```json
    {"success": true}
    ```

## 6. Ingest Flow: `POST /ingest/text`

### 6.1. Post creation
- Always creates a new post with:
  - `status = 'draft'`
  - `client_key = request.body.client_key` (optional)

### 6.2. Auto-publish scheduling
If `client_key` is provided and a user exists with that `client_key` and `user.auto_publish_enabled = 1`:
- The post is scheduled:
  - `publish_at = now + 6 hours`

The endpoint returns additional info:
```json
{
  "auto_publish_scheduled": true,
  "publish_at": "2025-12-12T18:00:00.000Z"
}
```

## 7. Moderation (LLM)

### 7.1. Prompt source
- Default prompt file: `prompts/moderation.txt`
- Editable via admin UI.

### 7.2. Input
- The LLM receives `post.text` (truncated to 3000 characters for seesion safety).

### 7.3. Expected response format
The model must return **only JSON**:
```json
{
  "is_approved": true,
  "reason": "..."
}
```

Rules:
- `reason` is required for `is_approved=false`.
- If JSON parsing fails, the post is treated as rejected with reason:
  - `"Invalid JSON response from moderation LLM"`

## 8. Background Worker

### 8.1. Startup
The worker is started when the server starts.

### 8.2. Interval
Default interval: **60 seconds**.

### 8.3. Moderation step
The worker finds posts:
- `publish_at IS NOT NULL`
- `moderation_checked_at IS NULL`
- `status = 'draft'`

For each:
- Calls LLM moderation.
- If approved:
  - sets `moderation_checked_at = now`
  - sets `moderation_reason = reason || 'Approved'`
- If rejected:
  - sets `status = 'warning'`
  - sets `moderation_checked_at = now`
  - sets `moderation_reason = reason`
  - sets `publish_at = NULL` (cancel scheduled publish)
  - sends admin notification

### 8.4. Publishing step
The worker publishes posts:
- `status = 'draft'`
- `publish_at <= now`
- `moderation_checked_at IS NOT NULL`

Action:
- sets `status = 'published'`
- sets `pub_date` if missing
- updates `updated_at`
- invalidates RSS cache (if available)

### 8.5. Failure handling
If moderation fails with an exception:
- `moderation_checked_at = now`
- `moderation_reason = "Moderation error: <message>"`

This avoids infinite retries.

## 9. Notifications

### 9.1. Email to admin
When a post is rejected:
- Send email to admin.
- Recipient is `ADMIN_USER` from `.env`.
- Email contains:
  - user identifier (resolved from `client_key` if possible)
  - post ID
  - moderation reason
  - truncated post text (first 500 chars)

If SMTP is not configured:
- The system logs a warning and continues.

## 10. Security & Access Control
- `/admin/*` endpoints require authentication.
- Admin-only operations:
  - Set auto-publish for other users.
  - Update moderation prompt.
- Ingest endpoint requires ingest token.

## 11. Implementation References
- UI:
  - `views/admin/posts.ejs`
  - `views/admin/users.ejs`
- Routes:
  - `routes/ingest.js`
  - `routes/admin/posts.js`
  - `routes/admin/auto-publish.js`
- Worker:
  - `lib/auto-publish-worker.js`
- LLM:
  - `lib/openai.js` (`moderatePostContent()`)
- Email:
  - `lib/email.js` (`sendModerationRejectionEmail()`)
