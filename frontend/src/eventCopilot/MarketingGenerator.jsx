import { useState, useCallback } from 'react';
import {
  Share2, Camera, Mail, MessageSquare, Mic2, Bell,
  Copy, Download, CheckCircle2, Loader2, Zap, ChevronDown,
} from 'lucide-react';

// ─── Content type definitions ─────────────────────────────────────────────────
const CONTENT_TYPES = [
  { id: 'linkedin',  label: 'LinkedIn Post',       Icon: Share2        },
  { id: 'instagram', label: 'Instagram Caption',   Icon: Camera        },
  { id: 'email',     label: 'Email Invitation',    Icon: Mail          },
  { id: 'whatsapp',  label: 'WhatsApp Invite',     Icon: MessageSquare },
  { id: 'speaker',   label: 'Speaker Announcement',Icon: Mic2          },
  { id: 'reminder',  label: 'Reminder Message',    Icon: Bell          },
];

const TONES = [
  { id: 'professional',    label: 'Professional'    },
  { id: 'friendly',        label: 'Friendly'        },
  { id: 'corporate',       label: 'Corporate'       },
  { id: 'fun',             label: 'Fun'             },
  { id: 'student-focused', label: 'Student-focused' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MarketingGenerator — Page 2 of Event Copilot
// ─────────────────────────────────────────────────────────────────────────────
export default function MarketingGenerator({ eventData }) {
  const [selected, setSelected]   = useState(() => new Set(CONTENT_TYPES.map(t => t.id)));
  const [tone, setTone]           = useState('professional');
  const [generating, setGenerating] = useState(false);
  const [loadingSet, setLoadingSet]  = useState(new Set());
  const [outputs, setOutputs]     = useState({});
  const [copied, setCopied]       = useState(null);
  const [error, setError]         = useState('');
  const [publishStatus, setPublishStatus] = useState('');

  const hasEventData = eventData && eventData.name;

  // ── Toggle checkbox ──────────────────────────────────────────────────────
  function toggleType(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!hasEventData || generating) return;
    setGenerating(true);
    setOutputs({}); setError('');

    const types = CONTENT_TYPES.filter(t => selected.has(t.id));

    // Show all selected cards as loading
    setLoadingSet(new Set(types.map(t => t.id)));

    try {
      const response = await fetch(`http://127.0.0.1:8000/events/${eventData.id}/marketing`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types: types.map(type => type.id), tone }),
      });
      if (!response.ok) throw new Error('Generation failed.');
      const data = await response.json();
      setOutputs(data.content || {});
    } catch {
      setError('Could not generate content. Make sure the API is running on port 8000.');
    } finally {
      setLoadingSet(new Set()); setGenerating(false);
    }
  }, [hasEventData, generating, selected, tone, eventData]);

  // ── Copy ─────────────────────────────────────────────────────────────────
  function handleCopy(id, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  function handleDownload(id, text, label) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${(eventData?.name || 'event').replace(/\s+/g, '-')}-${id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handlePublish() {
    if (!eventData?.id || !Object.keys(outputs).length) return;
    setPublishStatus('Checking connected publishing accounts…');
    const channels = Object.keys(outputs).map(id => id === 'whatsapp' ? 'whatsapp' : id);
    try {
      const response = await fetch(`http://127.0.0.1:8000/events/${eventData.id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels, content: outputs }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const entries = Object.entries(data.channels);
      const published = entries.filter(([, value]) => value.status === 'published').map(([key]) => key);
      const failed = entries.filter(([, value]) => value.status === 'failed').map(([key]) => key);
      const pending = entries.filter(([, value]) => value.status === 'needs_connection').map(([key]) => key);
      const parts = [];
      if (published.length) parts.push(`Published to ${published.join(', ')}.`);
      if (failed.length) parts.push(`Failed: ${failed.join(', ')}.`);
      if (pending.length) parts.push(`Connect ${pending.join(', ')} to enable publishing.`);
      setPublishStatus(parts.length ? parts.join(' ') : 'Connected channels are ready to publish.');
    } catch {
      setPublishStatus('Could not check publishing connections.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ec-marketing-wrap">
      {/* ── Config panel ── */}
      <div className="ec-mkt-config">
        <div className="ec-mkt-section">
          <div className="ec-mkt-section-label">Content Types</div>
          <div className="ec-checkbox-grid">
            {CONTENT_TYPES.map(({ id, label, Icon }) => (
              <label key={id} className={`ec-checkbox-item${selected.has(id) ? ' ec-checkbox-item--checked' : ''}`}>
                <input
                  type="checkbox"
                  className="ec-checkbox-native"
                  checked={selected.has(id)}
                  onChange={() => toggleType(id)}
                  id={`ec-chk-${id}`}
                />
                <span className={`ec-checkbox-box${selected.has(id) ? ' ec-checkbox-box--checked' : ''}`} />
                <Icon size={13} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="ec-mkt-section">
          <div className="ec-mkt-section-label">Tone</div>
          <div className="ec-select-wrap">
            <select
              className="ec-select"
              value={tone}
              onChange={e => setTone(e.target.value)}
              id="ec-tone-select"
            >
              {TONES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="ec-select-arrow" />
          </div>
        </div>

        <button
          className="ec-btn-primary"
          onClick={handleGenerate}
          disabled={!hasEventData || generating || selected.size === 0}
          id="ec-generate-btn"
        >
          {generating ? (
            <><Loader2 size={14} className="ec-spin" /> Generating…</>
          ) : (
            <><Zap size={14} /> Generate Content</>
          )}
        </button>

        {!hasEventData && (
          <p className="ec-mkt-hint">
            Create an event first to enable content generation.
          </p>
        )}
        {error && <p className="ec-mkt-hint">{error}</p>}
        {Object.keys(outputs).length > 0 && (
          <>
            <button className="ec-btn-secondary" onClick={handlePublish}>Check & Publish Channels</button>
            {publishStatus && <p className="ec-mkt-hint">{publishStatus}</p>}
          </>
        )}
      </div>

      {/* ── Output cards ── */}
      <div className="ec-mkt-output">
        {CONTENT_TYPES.filter(t => selected.has(t.id)).length === 0 && (
          <div className="ec-mkt-empty">
            Select at least one content type to generate.
          </div>
        )}

        {CONTENT_TYPES.filter(t => selected.has(t.id)).map(({ id, label, Icon }) => {
          const isLoading = loadingSet.has(id);
          const text      = outputs[id];
          const hasOutput = Boolean(text);
          const isCopied  = copied === id;

          return (
            <div key={id} className={`ec-output-card${isLoading ? ' ec-output-card--loading' : ''}`}>
              <div className="ec-output-card-header">
                <div className="ec-output-badge">
                  <Icon size={11} />
                  <span>{label}</span>
                </div>
                {hasOutput && (
                  <div className="ec-output-actions">
                    <button
                      className={`ec-action-btn${isCopied ? ' ec-action-btn--success' : ''}`}
                      onClick={() => handleCopy(id, text)}
                      title="Copy to clipboard"
                      id={`ec-copy-${id}`}
                    >
                      {isCopied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      className="ec-action-btn"
                      onClick={() => handleDownload(id, text, label)}
                      title="Download as .txt"
                      id={`ec-download-${id}`}
                    >
                      <Download size={13} />
                      Download
                    </button>
                  </div>
                )}
              </div>

              {isLoading && (
                <div className="ec-skeleton-wrap">
                  <div className="ec-skeleton" style={{ width: '95%' }} />
                  <div className="ec-skeleton" style={{ width: '85%' }} />
                  <div className="ec-skeleton" style={{ width: '90%' }} />
                  <div className="ec-skeleton" style={{ width: '70%' }} />
                  <div className="ec-skeleton" style={{ width: '80%' }} />
                </div>
              )}

              {!isLoading && hasOutput && (
                <pre className="ec-output-text">{text}</pre>
              )}

              {!isLoading && !hasOutput && (
                <div className="ec-output-placeholder">
                  Click &ldquo;Generate Content&rdquo; to produce {label.toLowerCase()}.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
