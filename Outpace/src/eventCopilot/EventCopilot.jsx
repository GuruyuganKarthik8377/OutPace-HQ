import { useState, Component } from 'react';
import { FileEdit, Megaphone, AlertTriangle } from 'lucide-react';
import CreateEventForm from './CreateEventForm';
import MarketingGenerator from './MarketingGenerator';
import './EventCopilot.css';

// ─── Sub-tab definitions ──────────────────────────────────────────────────────
const TABS = [
  { id: 'create',    label: 'Create Event',  Icon: FileEdit       },
  { id: 'marketing', label: 'Marketing',      Icon: Megaphone      },
];

// ─── Inline error boundary (scoped to Event Copilot only) ────────────────────
class EventCopilotBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message ?? 'Unknown error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="ec-error-boundary">
          <AlertTriangle size={28} className="ec-error-icon" />
          <h3 className="ec-error-title">Something went wrong in Event Copilot</h3>
          <p className="ec-error-msg">{this.state.message}</p>
          <button
            className="ec-btn-secondary"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EventCopilotPage — Luma Copilot workspace. The attendee concierge is mounted
// as its own primary view by App.jsx so organizers have a focused RAG workspace.
// ─────────────────────────────────────────────────────────────────────────────
export default function EventCopilotPage({ eventData, onEventCreated }) {
  const [subTab, setSubTab]     = useState('create');

  function handleEventCreated(data) {
    onEventCreated(data);
  }

  function handleAdvanceToMarketing() {
    setSubTab('marketing');
  }

  return (
    <EventCopilotBoundary>
      <div className="ec-root">
        {/* ── Sub-tab nav ── */}
        <div className="ec-subnav">
          {TABS.map(({ id, label, Icon }, idx) => {
            const isActive  = subTab === id;
            const isDone    = idx < TABS.findIndex(t => t.id === subTab);
            const isLocked  = id === 'marketing' && !eventData;
            return (
              <button
                key={id}
                className={`ec-subnav-tab${isActive ? ' ec-subnav-tab--active' : ''}${isDone ? ' ec-subnav-tab--done' : ''}`}
                onClick={() => !isLocked && setSubTab(id)}
                disabled={isLocked}
                title={isLocked ? 'Create an event first' : label}
                id={`ec-subnav-${id}`}
              >
                <span className="ec-subnav-step">{isDone ? '✓' : idx + 1}</span>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Content area ── */}
        <div className="ec-content">
          {subTab === 'create' && (
            <CreateEventForm
              onEventCreated={handleEventCreated}
              onAdvance={handleAdvanceToMarketing}
            />
          )}
          {subTab === 'marketing' && (
            <MarketingGenerator eventData={eventData} />
          )}
        </div>
      </div>
    </EventCopilotBoundary>
  );
}
