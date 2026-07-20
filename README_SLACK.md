# Slack Integration — OutPace HQ

Three slash commands that surface the existing backend services directly in Slack.

| Command | What it does |
|---|---|
| `/ask-event <question>` | Queries the RAG knowledge base (FAISS + Claude) and returns the answer with citations |
| `/generate-marketing <channel>` | Generates marketing copy for the latest event on the given channel |
| `/regenerate <channel> <tone>` | Regenerates copy with a different tone |

Supported channels: `linkedin`, `x`, `instagram`, `email`, `whatsapp`  
Supported tones: `professional`, `friendly`, `corporate`, `student`, `fun`

---

## 1. Create the Slack App

1. Go to **https://api.slack.com/apps** → **Create New App** → **From scratch**
2. Name it "OutPace HQ", pick your workspace, click **Create App**

### OAuth scopes (Bot Token Scopes)

Under **OAuth & Permissions → Scopes → Bot Token Scopes**, add:

| Scope | Why |
|---|---|
| `chat:write` | Post messages |
| `commands` | Receive slash commands |
| `app_mentions:read` | Optional: respond to @mentions |

Click **Install to Workspace**, approve, and copy the **Bot User OAuth Token** (`xoxb-...`).

### Signing secret

Under **Basic Information → App Credentials**, copy the **Signing Secret**.

---

## 2. Configure environment variables

Add to `.env` in the project root:

```
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
```

---

## 3. Expose the backend with ngrok

Slack requires a public HTTPS URL. Start ngrok in a separate terminal:

```bash
ngrok http 8000
```

Copy the forwarding URL, e.g. `https://abc123.ngrok-free.app`.

---

## 4. Register the slash commands

In your Slack app dashboard, go to **Slash Commands** and create three commands:

| Command | Request URL | Short description |
|---|---|---|
| `/ask-event` | `https://<ngrok-url>/slack/events` | Ask a question about the event |
| `/generate-marketing` | `https://<ngrok-url>/slack/events` | Generate marketing content |
| `/regenerate` | `https://<ngrok-url>/slack/events` | Regenerate with a different tone |

For each, set **Escape channels, users, and links** to **off** and enable **Show in slash command list**.

> Every time ngrok restarts you get a new URL — update all three Request URLs.

---

## 5. Run the backend

Make sure both services are running:

```bash
# Event backend (port 8000)
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# RAG backend (port 8001) — required for /ask-event
cd rag-backend && bash run.sh
```

The Slack endpoint is mounted automatically at startup if `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` are set. You'll see:

```
INFO: Slack slash commands registered: /ask-event, /generate-marketing, /regenerate
```

---

## 6. Test in Slack

```
/ask-event Where is the parking?
/generate-marketing linkedin
/regenerate linkedin friendly
```

Each command ACKs within 3 seconds (Slack's hard limit) then sends the real answer asynchronously.

---

## One-time Luma login (required for event creation)

Before creating events from the Luma Copilot tab, save a browser session:

```bash
python3 luma_bot.py --login
```

A visible browser opens. Log in, complete any magic-link flow, then press Enter in the terminal. The session is saved to `.luma_session.json` and reused for all future event creations.

---

## Architecture

```
Slack workspace
      │  slash command (HTTP POST)
      ▼
/slack/events  (FastAPI, main.py)
      │
      ▼
slack/bot.py   → AsyncApp (slack_bolt)
slack/commands.py → registers /ask-event, /generate-marketing, /regenerate
slack/handlers.py → calls existing endpoints:
      │
      ├── POST http://127.0.0.1:8001/answer        (RAG — FAISS + Claude)
      └── POST http://127.0.0.1:8000/events/{id}/marketing  (Event backend)
```

Slack is purely a client — no new AI logic lives here.
