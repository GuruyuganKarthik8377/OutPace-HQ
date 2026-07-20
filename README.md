# OutPace HQ 

OutPace HQ is a comprehensive event management and marketing automation backend. It seamlessly integrates event creation, multi-channel marketing, and intelligent concierges into a unified platform.

## Features

- **Automated Event Creation (Luma):** Automatically mirrors events created in OutPace HQ to Luma using Playwright automation.
- **RAG-powered Knowledge Base:** Answer queries about events instantly using FAISS and Claude. 
- **Slack Integration:** Expose backend services to Slack via slash commands (`/ask-event`, `/generate-marketing`, `/regenerate`).
- **Multi-channel Publishing:** Programmatically publish marketing content across LinkedIn, X (Twitter), Instagram, and Email.
- **WhatsApp/Email Concierge Bot:** AI concierge that answers event questions directly on WhatsApp and via email.
- **Supabase Backend:** Scalable Postgres database with Row-Level Security for event data storage.

## Architecture Overview

```
Slack / WhatsApp / Web 
         │  
         ▼
    backend/core/main.py (FastAPI) ────────► Supabase (Database)
         │
         ├──► backend/core/slack_bot.py / concierge_bot.py
         ├──► backend/core/luma_bot.py (Browser Automation)
         ├──► backend/core/publishers.py (Social Media & Email APIs)
         └──► backend/rag/ (FAISS + Anthropic Claude)
```

## Getting Started

### Prerequisites

- Python 3.9+
- A [Supabase](https://supabase.com/) project
- [Anthropic API Key](https://console.anthropic.com/) (Claude)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/outpace-hq.git
   cd outpace-hq
   ```

2. **Set up a virtual environment and install dependencies:**
   ```bash
   cd backend/core
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env` and fill in the required keys.
   ```bash
   cp .env.example .env
   ```

4. **Initialize Database:**
   Run the SQL provided in `backend/supabase_schema.sql` in your Supabase SQL Editor to set up the necessary tables and RLS policies.

### Running the Services

1. **Run the main FastAPI backend:**
   ```bash
   cd backend/core
   python -m uvicorn main:app --host 127.0.0.1 --port 8000
   ```

2. **Run the RAG backend (required for answering queries):**
   ```bash
   cd backend/rag
   bash run.sh
   ```

## Integrations

### Slack Setup
See the detailed [Slack Integration Guide](README_SLACK.md) for configuring the bot and setting up `/ask-event`, `/generate-marketing`, and `/regenerate` slash commands.

### Luma Automation
Before creating events via the Luma integration, log in and save your session locally:
```bash
cd backend/core
python luma_bot.py --login
```
This saves the session to `.luma_session.json` which is used for headless event creation.

## License

This project is licensed under the [MIT License](LICENSE).
