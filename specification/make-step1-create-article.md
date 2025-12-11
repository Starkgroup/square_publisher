# Make Scenario: "Step 1 - Create Article - for dev"

## Purpose
This Make scenario pulls a random financial RSS feed, selects the most newsworthy article via GPT (Chatbase), generates a LinkedIn-style article, and ingests it into Square Publisher via `/ingest/text`.

## High-level flow
1) Init variables (`chosen`, `randomRSS`).
2) Pick a random RSS URL from a predefined list.
3) Fetch up to 5 RSS items.
4) **Route A (Scoring):** Aggregate items → JSON → GPT scores news value → store best article URL in `chosen`.
5) **Route B (Generation + Ingest):** Aggregate items with details → iterate → filter by `chosen` URL → GPT generates article text → build `IngestTextRequest` → HTTP POST to Square Publisher.

---
## Scenario settings
- Roundtrips: 1, maxErrors: 3, autoCommit: true, sequential: false.
- Zone: `eu2.make.com`.
- Variables: `chosen` is roundtrip-scoped; `randomRSS` is execution-scoped.

---
## Modules in order (outside router)

### 63 – Set variable `chosen`
- **Type:** `util:SetVariable2` (scope: `roundtrip`).
- **Value:** `"undefined"` (placeholder, later overwritten).
- **Purpose:** Predeclare `chosen` so both router routes can read/write it.

### 3 – Set variables (`randomRSS`)
- **Type:** `util:SetVariables` (scope: `execution`).
- **Value:** picks a random RSS URL:
  ```make
  {{first(shuffle(add(emptyarray;
    "https://www.dasinvestment.com/api?subjects=52";
    "https://www.dasinvestment.com/api?subjects=46";
    "https://www.dasinvestment.com/api?subjects=44";
    "https://www.pfefferminzia.de/gesundheit/feed";
    "https://www.pfefferminzia.de/arbeit-kat/feed";
    "https://www.pfefferminzia.de/vorsorge/feed"
  )))}}
  ```
- **Output:** `randomRSS` used by RSS module.

### 6 – RSS: Retrieve RSS feed items
- **Type:** `rss:ActionReadArticles`.
- **Mapper:** `url={{3.randomRSS}}`, `maxResults=5`, `gzip=true`; no auth, no date filters.
- **Outputs (per item):** `title`, `description`, `summary`, `url`, `author`, `dateCreated/Updated`, `image.{title,url}`, `categories[]`, `source.{title,url}`, `rssFields` (guid, link, pubdate, etc.).
- **Feeds router Module 39.**

### 39 – Basic Router
Splits processing into **Route A (scoring)** and **Route B (generation + ingest)**, both fed by Module 6.

---
## Route A – Score and choose best article

### 36 – Basic Aggregator
- Collects all RSS items (from 6) into `array` with fields: `id`, `url`, `title`, `categories`.

### 38 – Transform to JSON
- Converts `36.array` → JSON string (no indentation). Output: `json`.

### 9 – Chatbase: score relevance
- **Type:** `chatbase:sendAMessage` (model `gpt-4o`, chatbotId `ldCP4GQKeHHwtpg88LkBZ`).
- **Messages:**
  - Assistant prompt: long instruction (German private investor audience; news-value criteria; ignore ads; return only the URL with highest news value, no extra text).
  - User: `{{38.json}}` (array of items).
- **Output:** `text` → expected to be a single URL string.

### 50 – Set variable `chosen`
- **Type:** `util:SetVariables` (scope `roundtrip`).
- **Sets:** `chosen = {{9.text}}` (the best article URL).

Result: `chosen` now holds the selected article URL for Route B.

---
## Route B – Generate article and ingest

### 53 – Basic Aggregator (rich items)
- Collects RSS items into `array` with: `id`, `url`, `image`, `title`, `categories`, `description`.

### 64 – Get variable `chosen`
- Reads roundtrip variable `chosen` (selected URL).

### 54 – Basic Feeder
- Iterates `53.array`, emitting each item.

### Filter (on Module 61)
- **Condition:** `{{54.url}} == {{64.chosen}}` (keep only the chosen article).

### 61 – Chatbase: generate LinkedIn-style article
- **Type:** `chatbase:sendAMessage` (model `gpt-4o`, chatbotId `ldCP4GQKeHHwtpg88LkBZ`).
- **Messages:**
  - Assistant prompt (German): instructions for neutral, informative LinkedIn article with emojis around headings; structure: headline, intro, body with subheads, conclusion; no CTA/ads.
  - User: `{{54.title}}: {{54.description}}` (chosen article data).
- **Output:** `text` – the generated article body.

### 66 – Create JSON (IngestTextRequest)
- **Type:** `json:CreateJSON`, data structure ID `IngestTextRequest` (udt 494638).
- **Mapper:**
  - `text = {{61.text}}` (generated article)
  - `source = "rss+chatbase+linkedin"`
  - `ext_id = {{54.image.url}}` (uses image URL as external ID)
  - `link = {{64.chosen}}` (selected article URL)
  - `client_key = "squarecc_alex"`
- **Note:** currently no `title` field is mapped here; backend now supports optional `title` (<=200 chars) if you want to add it.

### 65 – HTTP POST to Square Publisher
- **Type:** `http:ActionSendData`.
- **URL:** `https://square_publisher.stxk.de/ingest/text`
- **Method:** `POST`, `bodyType=raw`, `contentType=application/json`, `gzip=true`.
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <INGEST_TOKEN>` (redacted here; replace with actual token)
- **Body:** `{{66.json}}` (JSON produced above).
- **TLS:** `rejectUnauthorized=true`; `followRedirect=true`; `handleErrors=true`; `parseResponse=false` (response not parsed).

---
## Data payload sent to /ingest/text

Example (as built by Module 66):
```json
{
  "text": "<LLM-generated LinkedIn-style article>",
  "source": "rss+chatbase+linkedin",
  "ext_id": "<54.image.url>",
  "link": "<chosen article URL>",
  "client_key": "squarecc_alex"
  // Optional: "title": "<add if mapped>"
}
```

Backend expectations (current):
- `text`: required, string.
- `source`: required, string.
- `ext_id`: optional string.
- `link`: optional string.
- `client_key`: optional string (used to map posts/users; required for non-admin users in UI logic).
- `title`: optional string (<= 200 chars) — supported in backend now, but not yet mapped here.

---
## Notes and possible adjustments
- **Random feed pool:** defined in Module 3; update the list there to change sources.
- **Scoring vs generation:** Route A only returns a URL; Route B filters by that URL to generate content.
- **Title support:** To send `title` to backend, add it in Module 66 mapper, e.g. `"title": {{54.title}}` (trim/shorten in Make or rely on backend validation).
- **client_key:** currently hardcoded to `squarecc_alex`; align with `/admin/users` → `client_key` for each user.
- **ext_id:** currently uses `image.url`; can be switched to another stable ID (e.g., RSS guid) if needed.
- **Environment:** Production URL `https://square_publisher.stxk.de/ingest/text`; for local testing use tunnel + `http://127.0.0.1:3025/ingest/text` with the appropriate token.
