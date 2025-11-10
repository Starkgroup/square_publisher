# Square Publisher

Content receiver service with admin editor and RSS publisher.

## Features

- **Text Ingestion API**: Accept text content via HTTP API
- **Admin Interface**: Edit posts and add images
- **Media Management**: Local filesystem storage for images
- **RSS 2.0 Feed**: Publish posts with images to RSS

## Tech Stack

- **Backend**: Node.js + Fastify
- **Database**: SQLite (better-sqlite3)
- **Storage**: Local filesystem

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Start server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Public

- `GET /healthz` - Health check
- `GET /rss.xml` - RSS feed
- `GET /media/:path` - Media files

### Integration

- `POST /ingest/text` - Ingest text content (requires Bearer token)

### Admin

- `GET /admin/posts` - Posts list
- `GET /admin/posts/:id` - Edit post
- `PATCH /admin/posts/:id` - Update post
- `POST /admin/posts/:id/media` - Upload media
- `POST /admin/posts/:id/publish` - Publish post

## Environment Variables

See `.env.example` for all available options.

## Project Structure

```
square-publisher/
├── config/          # Configuration
├── db/              # Database & migrations
├── lib/             # Utilities
├── routes/          # HTTP routes
├── views/           # Templates
├── scripts/         # Maintenance scripts
├── tests/           # Tests
├── data/            # SQLite database (gitignored)
└── uploads/         # Media files (gitignored)
```

## Development Implementation Phases

1. ✅ Bootstrap: Fastify + SQLite setup
2. ⏳ Database schema and migrations
3. ⏳ Ingest text endpoint
4. ⏳ Admin authentication
5. ⏳ Posts list and edit form
6. ⏳ Media upload and management
7. ⏳ Publish/unpublish posts
8. ⏳ RSS generation and caching
9. ⏳ Content sanitization
10. ⏳ Observability and logging
11. ⏳ Configuration and deployment
12. ⏳ Integration tests

## License

MIT
