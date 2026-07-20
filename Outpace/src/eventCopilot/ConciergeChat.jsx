import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Upload, CheckCircle2 } from 'lucide-react';

// ─── Suggested questions ──────────────────────────────────────────────────────
const SUGGESTED = [
  'What time does registration begin?',
  'Where is parking?',
  'Who is speaking after lunch?',
  'Can I transfer my ticket?',
];

// ─────────────────────────────────────────────────────────────────────────────
// ConciergeChat — Page 3 of Event Copilot
// Chat history in local state only (no persistence)
// Answers are grounded in the organizer's indexed event document by the
// supplied FAISS/BM25 RAG service running on port 8001.
// ─────────────────────────────────────────────────────────────────────────────
export default function ConciergeChat({ eventData }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: eventData?.name
        ? `Hi! I'm the AI concierge for ${eventData.name}. Ask me anything about the event — schedule, venue, speakers, and more.`
        : "Hi! I'm the AI event concierge. Once you've created an event, I'll be able to answer attendee questions about it.",
    },
  ]);
  const [input, setInput]       = useState('');
  const [typing, setTyping]     = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadMessage, setUploadMessage] = useState('Upload an event PDF, DOCX, or TXT file to ground answers.');
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const hasEvent = Boolean(eventData?.name);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('loading');
    const body = new FormData(); body.append('file', file);
    try {
      const response = await fetch('http://127.0.0.1:8001/upload', { method: 'POST', body });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.detail); }
      const data = await response.json();
      setUploadStatus('ready'); setUploadMessage(`${data.filename} indexed — ${data.num_chunks} knowledge chunks ready.`);
    } catch (error) {
      setUploadStatus('error'); setUploadMessage(error?.message || 'Could not index document. Start the RAG service on port 8001.');
    }
  }

  // ── Send a message ────────────────────────────────────────────────────────
  async function sendMessage(text) {
    const q = text.trim();
    if (!q) return;

    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setTyping(true);

    let answer;
    if (!hasEvent) {
      answer = 'Please create an event first so I can answer questions based on your event details.';
    } else {
      try {
        const response = await fetch('http://127.0.0.1:8001/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.detail || 'The RAG service could not answer this question.');
        }
        const data = await response.json();
        answer = data.answer || "I couldn't find that information. Please contact the organizer.";
      } catch (error) {
        console.error('RAG answer failed:', error);
        answer = 'I can’t reach the event knowledge base. Please make sure the RAG service is running on port 8001.';
      }
    }

    setTyping(false);
    setMessages(prev => [...prev, { role: 'ai', text: answer }]);
    inputRef.current?.focus();
  }

  function handleSend() {
    if (!typing) sendMessage(input);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleChip(q) {
    if (!typing) sendMessage(q);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ec-chat-wrap">
      {/* Event banner */}
      {hasEvent && (
        <div className="ec-chat-banner">
          <Bot size={13} />
          <span>Concierge for <strong>{eventData.name}</strong></span>
        </div>
      )}

      <label className="ec-file-drop" style={{ marginBottom: 16 }}>
        <input type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} onChange={handleUpload} />
        {uploadStatus === 'loading' ? <Loader2 size={20} className="ec-spin" /> : uploadStatus === 'ready' ? <CheckCircle2 size={20} className="ec-file-check" /> : <Upload size={20} className="ec-file-icon" />}
        <span className="ec-file-label">{uploadStatus === 'loading' ? 'Indexing event document…' : 'Upload Event Knowledge Base'}</span>
        <span className="ec-file-hint">{uploadMessage}</span>
      </label>

      {/* Message list */}
      <div className="ec-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`ec-msg ec-msg--${msg.role}`}>
            <div className="ec-msg-avatar">
              {msg.role === 'ai'
                ? <Bot size={14} />
                : <User size={14} />
              }
            </div>
            <div className="ec-msg-bubble">
              <p className="ec-msg-text">{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
          <div className="ec-msg ec-msg--ai">
            <div className="ec-msg-avatar">
              <Bot size={14} />
            </div>
            <div className="ec-msg-bubble ec-msg-bubble--typing">
              <span className="ec-dot" />
              <span className="ec-dot" />
              <span className="ec-dot" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggested question chips */}
      <div className="ec-chips-wrap">
        {SUGGESTED.map(q => (
          <button
            key={q}
            className="ec-chip"
            onClick={() => handleChip(q)}
            disabled={typing}
            title={q}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="ec-chat-input-wrap">
        <input
          ref={inputRef}
          className="ec-chat-input"
          type="text"
          placeholder={hasEvent ? 'Ask a question about the event…' : 'Create an event first…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={typing}
          id="ec-chat-input"
          autoComplete="off"
        />
        <button
          className="ec-chat-send"
          onClick={handleSend}
          disabled={!input.trim() || typing}
          id="ec-chat-send-btn"
          title="Send message"
        >
          {typing ? <Loader2 size={16} className="ec-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
