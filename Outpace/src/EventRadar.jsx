import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Radio, Scan, AlertTriangle, CheckCircle2, Zap, Brain,
  MapPin, Calendar, Users, Globe2, ExternalLink, X,
  ChevronRight, Rocket, Cpu, FileCheck, Copy, Loader2,
  Target, ShieldAlert, Sparkles, CalendarPlus,
} from 'lucide-react';
import './EventRadar.css';

// ─── Design tokens ───────────────────────────────────────────────────────────
const THREAT_COLORS = {
  LOW:    { color: '#4ade80', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.35)'  },
  MEDIUM: { color: '#ff9500', bg: 'rgba(255,149,0,0.12)',   border: 'rgba(255,149,0,0.35)'   },
  HIGH:   { color: '#ff3b30', bg: 'rgba(255,59,48,0.12)',   border: 'rgba(255,59,48,0.35)'   },
};

const FORMAT_COLORS = {
  'in-person': { color: '#22d3ee', bg: 'rgba(34,211,238,0.10)',  border: 'rgba(34,211,238,0.25)' },
  'virtual':   { color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  border: 'rgba(168,85,247,0.25)' },
  'hybrid':    { color: '#00e5ff', bg: 'rgba(0,229,255,0.10)',   border: 'rgba(0,229,255,0.25)'  },
};

// ─── Mock dataset ────────────────────────────────────────────────────────────
const EVENT_RADAR_DATA = [
  {
    id: 'ev-001',
    competitor: 'LinkedIn',
    initials: 'LI',
    accentColor: '#0077b5',
    eventTitle: 'LinkedIn B2B Growth Summit — India',
    date: '2026-07-25',
    city: 'Bangalore',
    format: 'in-person',
    attendeeEstimate: 420,
    threatLevel: 'HIGH',
    whyItMatters: 'LinkedIn is assembling top-tier B2B decision makers in your primary ICP city. This creates direct mindshare capture and pipeline interception risk before your Q3 outbound motion.',
    insights: [
      'Targeting HR tech and SaaS buyers — exact ICP overlap with your enterprise segment',
      'Co-sponsored by 3 direct competitors in the talent intelligence space',
      'Speakers include 2 recently churned enterprise accounts from your ACV bracket',
      'Registration page lists "data-driven recruitment" as the core theme — a head-on narrative battle',
    ],
    lumaUrl: 'https://lu.ma/linkedin-b2b-india-2026',
    impactScore: 88,
    counterEventDraft: {
      title: 'Bangalore B2B GTM Playbook — Independent Practitioner Summit',
      suggestedDate: '2026-07-23',
      inviteCopy: 'Join 100+ B2B GTM leaders for a practitioner-first deep dive on pipeline generation, ICP targeting, and competitive positioning. No vendor pitches. Real playbooks from operators who have done it. Bangalore, July 23.',
      targetSegments: ['At-risk enterprise accounts', 'Churned SMB — Q1', 'Local ICP leads', 'Active pipeline — Stage 2+'],
    },
  },
  {
    id: 'ev-002',
    competitor: 'Zepto',
    initials: 'ZP',
    accentColor: '#9333ea',
    eventTitle: 'Quick Commerce & Dark Store Ops Meetup',
    date: '2026-07-28',
    city: 'Mumbai',
    format: 'in-person',
    attendeeEstimate: 180,
    threatLevel: 'MEDIUM',
    whyItMatters: 'Zepto is seeding an operator community around quick commerce infrastructure — a direct play to own the narrative in a segment where your platform competes for logistics tech budgets.',
    insights: [
      'Targeting ops leads and category managers — adjacent to your supply chain buyer persona',
      'Zepto engineering talks on real-time inventory and dark store micro-fulfillment',
      'Event positions Zepto as a thought leader, not just a retailer — brand elevation play',
    ],
    lumaUrl: 'https://lu.ma/zepto-qc-ops-mumbai',
    impactScore: 62,
    counterEventDraft: {
      title: 'Mumbai Logistics & Commerce Tech Roundtable',
      suggestedDate: '2026-07-26',
      inviteCopy: 'An intimate roundtable for 40 logistics and commerce operators. Peer-to-peer benchmarking on fulfilment velocity, inventory intelligence, and last-mile tech. Mumbai, July 26. Application-only.',
      targetSegments: ['Commerce ops buyers', 'Logistics tech evaluators', 'Mid-market retail — Mumbai', 'At-risk accounts'],
    },
  },
  {
    id: 'ev-003',
    competitor: 'Notion',
    initials: 'NO',
    accentColor: '#e0e0e0',
    eventTitle: 'Notion x Creators: Build in Public Night SF',
    date: '2026-08-02',
    city: 'San Francisco',
    format: 'in-person',
    attendeeEstimate: 310,
    threatLevel: 'MEDIUM',
    whyItMatters: 'Notion is building creator-community lock-in among product teams and indie builders — an influential segment that shapes tooling decisions upstream in PLG companies and startup ecosystems.',
    insights: [
      'Targeting product managers, indie hackers, and early-stage founders',
      'Notion AI and database features will be live-demoed to 300+ high-influence users',
      'Community activation strategy — creates organic advocacy that is hard to counter post-event',
      'Overlaps with your PLG segment acquisition motion in the SF Bay Area',
    ],
    lumaUrl: 'https://lu.ma/notion-build-sf-2026',
    impactScore: 58,
    counterEventDraft: {
      title: 'San Francisco: Product Builders Happy Hour — Tools for the Modern Team',
      suggestedDate: '2026-07-31',
      inviteCopy: 'An early-evening gathering for SF-based product builders, PMs, and indie creators. Demos, peer discussion, and honest takes on the modern productivity stack. No pitch decks. Just product people.',
      targetSegments: ['PLG trial users — SF', 'Indie hackers list', 'Product team buyers', 'Churned prosumer segment'],
    },
  },
  {
    id: 'ev-004',
    competitor: 'Salesforce',
    initials: 'SF',
    accentColor: '#00a1e0',
    eventTitle: 'Dreamforce World Tour — London',
    date: '2026-08-10',
    city: 'London',
    format: 'in-person',
    attendeeEstimate: 2800,
    threatLevel: 'HIGH',
    whyItMatters: 'Salesforce World Tour London is a pipeline-accelerating event with dedicated CRM migration workshops. This directly threatens existing accounts being evaluated for renewal in the EMEA region.',
    insights: [
      'Sessions include "Migrating from legacy CRM to Salesforce in 90 days" — displacement blueprint',
      '2,800 registered — highest-volume competitor event in EMEA this quarter',
      'Salesforce is offering free Data Cloud trials at the event — aggressive land play',
      '6 of your top 20 EMEA accounts have registered employees attending',
    ],
    lumaUrl: 'https://lu.ma/sf-worldtour-london-2026',
    impactScore: 94,
    counterEventDraft: {
      title: 'London CRM Leadership Roundtable — Total Cost of Ownership Reality Check',
      suggestedDate: '2026-08-08',
      inviteCopy: 'An executive-only roundtable for RevOps and CRO leaders in London. We are running the numbers on CRM TCO, migration complexity, and team velocity — with real benchmarks. 20 seats. By invitation only.',
      targetSegments: ['EMEA top 20 accounts', 'At-risk renewal — Q3', 'CRO and RevOps buyers', 'London-based enterprise ICP'],
    },
  },
  {
    id: 'ev-005',
    competitor: 'HubSpot',
    initials: 'HS',
    accentColor: '#ff7a59',
    eventTitle: 'INBOUND Satellite: Singapore',
    date: '2026-08-15',
    city: 'Singapore',
    format: 'hybrid',
    attendeeEstimate: 650,
    threatLevel: 'HIGH',
    whyItMatters: 'HubSpot INBOUND Satellite events have historically accelerated SMB pipeline by 40% in host markets. Singapore is your highest-growth APAC market and this creates direct funnel competition.',
    insights: [
      'HubSpot is subsidising attendance for SEA-based startups — aggressive SMB land motion',
      'Full suite demos targeting teams under 50 — your core SMB ICP in APAC',
      'Partner agency ecosystem activation — creates a competing channel referral network',
      'Hybrid format extends reach to 1,200+ virtual attendees across APAC',
    ],
    lumaUrl: 'https://lu.ma/hubspot-inbound-sg-2026',
    impactScore: 82,
    counterEventDraft: {
      title: 'Singapore GTM Leaders Dinner — Scaling Revenue in Southeast Asia',
      suggestedDate: '2026-08-13',
      inviteCopy: 'A private dinner for 30 GTM leaders scaling revenue across SEA markets. Agenda: ICP definition in emerging markets, channel strategy, and what actually works in Singapore, Indonesia, and Vietnam. By invitation only.',
      targetSegments: ['APAC SMB pipeline — Stage 1-2', 'Singapore ICP leads', 'APAC partner prospects', 'At-risk APAC accounts'],
    },
  },
  {
    id: 'ev-006',
    competitor: 'Slack',
    initials: 'SL',
    accentColor: '#e01e5a',
    eventTitle: 'Slack Developer Conference — Virtual',
    date: '2026-08-20',
    city: 'Virtual',
    format: 'virtual',
    attendeeEstimate: 5400,
    threatLevel: 'MEDIUM',
    whyItMatters: 'Slack is deepening developer ecosystem lock-in through API and integration announcements. Workflow and integration superiority is a key churn trigger cited in recent loss analyses.',
    insights: [
      'Salesforce + Slack unified platform demos — deeper CRM integration narrative',
      'New Slack automation APIs announced — potential feature gap expansion',
      'Developer audience cross-pollinates into technical buyer decisions at your accounts',
    ],
    lumaUrl: 'https://lu.ma/slack-devconf-virtual-2026',
    impactScore: 55,
    counterEventDraft: {
      title: 'Virtual: Async-First Teams — Workflows That Actually Work',
      suggestedDate: '2026-08-19',
      inviteCopy: 'A virtual session for ops and product teams exploring modern async workflows. Live Q&A, workflow demos, and a real comparison of integration approaches. 60 minutes. No fluff.',
      targetSegments: ['Technical buyers', 'Product-led accounts', 'Dev-adjacent personas', 'Integration evaluators'],
    },
  },
  {
    id: 'ev-007',
    competitor: 'Intercom',
    initials: 'IC',
    accentColor: '#1f8ded',
    eventTitle: 'New World of Customer Service Summit — NYC',
    date: '2026-08-28',
    city: 'New York',
    format: 'in-person',
    attendeeEstimate: 480,
    threatLevel: 'MEDIUM',
    whyItMatters: 'Intercom is positioning its AI-first support narrative to enterprise CS leaders in the US financial corridor — a key vertical for your upcoming enterprise GTM push.',
    insights: [
      'Target audience: VP Customer Success and CS Ops in fintech and SaaS',
      'Intercom Fin AI product will be the centrepiece demo — aggressive AI differentiation play',
      'Event is invite-only, signals Intercom is curating enterprise relationships',
    ],
    lumaUrl: 'https://lu.ma/intercom-cs-summit-nyc-2026',
    impactScore: 67,
    counterEventDraft: {
      title: 'NYC CS Leadership Breakfast — AI in Customer Success: Reality vs Hype',
      suggestedDate: '2026-08-27',
      inviteCopy: 'A curated breakfast for CS leaders in New York. We cut through the AI noise with real benchmarks, customer stories, and an honest look at what actually reduces ticket volume and churn. 25 seats.',
      targetSegments: ['US enterprise CS buyers', 'Fintech vertical ICP', 'At-risk — CS-adjacent use case', 'NYC pipeline — Stage 3+'],
    },
  },
  {
    id: 'ev-008',
    competitor: 'Rippling',
    initials: 'RP',
    accentColor: '#f4a516',
    eventTitle: 'HR & People Ops Forward — Sydney',
    date: '2026-09-05',
    city: 'Sydney',
    format: 'in-person',
    attendeeEstimate: 290,
    threatLevel: 'LOW',
    whyItMatters: 'Rippling is establishing an APAC footprint through thought leadership events targeting People Ops leaders — an early-stage threat to watch as they expand their ANZ GTM.',
    insights: [
      'Rippling is new to the APAC market — this is a beachhead community event',
      'Target audience overlaps with HR tech buyers you are pursuing in ANZ',
      'Low urgency now but signals a 6-12 month APAC GTM commitment from Rippling',
    ],
    lumaUrl: 'https://lu.ma/rippling-hr-sydney-2026',
    impactScore: 38,
    counterEventDraft: {
      title: 'Sydney People Ops Breakfast — Modern HR Stack for Growing Teams',
      suggestedDate: '2026-09-04',
      inviteCopy: 'A peer breakfast for People Ops and HR leaders in Sydney. We cover the modern HR stack, what local companies are actually using, and how to evaluate vendors without the enterprise sales cycle.',
      targetSegments: ['ANZ HR tech buyers', 'Mid-market ANZ ICP', 'Sydney pipeline leads', 'People Ops decision makers'],
    },
  },
];

// ─── Log builder ─────────────────────────────────────────────────────────────
const EVENT_LOG_INIT = [
  { icon: 'radio', text: 'Event Radar ready — scanning public Luma calendar.', color: '#6b7280' },
];

function buildEventLogs(events) {
  const logs = [
    { icon: 'scan',  text: 'Scanning Luma for competitor public events…',  color: '#00e5ff' },
    { icon: 'cpu',   text: 'Parsing event metadata and attendee signals…', color: '#00e5ff' },
  ];
  events.slice(0, 4).forEach(ev => {
    logs.push({
      icon: 'alert',
      text: `Detected: ${ev.competitor} — ${ev.eventTitle.split(' — ')[0]} — ${new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      color: THREAT_COLORS[ev.threatLevel].color,
    });
  });
  logs.push({ icon: 'brain', text: 'Classifying GTM threat levels…',              color: '#a855f7' });
  logs.push({ icon: 'check', text: `${events.length} competitor events surfaced.`, color: '#4ade80' });
  return logs;
}

const ICON_MAP = {
  radio: Radio, scan: Scan, alert: AlertTriangle, check: CheckCircle2,
  zap: Zap, brain: Brain, cpu: Cpu, file: FileCheck, rocket: Rocket,
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({ event, isSelected, onClick }) {
  const threat = THREAT_COLORS[event.threatLevel];
  const fmt    = FORMAT_COLORS[event.format] ?? FORMAT_COLORS['in-person'];
  return (
    <div
      className={`event-card${isSelected ? ' event-card--selected' : ''}`}
      style={{ '--accent': event.accentColor, '--threat-color': threat.color }}
      onClick={() => onClick(event)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(event)}
      id={`event-card-${event.id}`}
    >
      <div className="event-card__header">
        <div className="event-card__initials" style={{ background: event.accentColor + '22', borderColor: event.accentColor + '55', color: event.accentColor }}>
          {event.initials}
        </div>
        <div className="event-card__meta">
          <span className="event-card__competitor">{event.competitor}</span>
          <div className="event-card__pills">
            <span className="threat-pill" style={{ color: threat.color, background: threat.bg, borderColor: threat.border }}>
              {event.threatLevel}
            </span>
            <span className="format-pill" style={{ color: fmt.color, background: fmt.bg, borderColor: fmt.border }}>
              {event.format}
            </span>
          </div>
        </div>
        <ExternalLink size={11} style={{ color: '#4b5563', flexShrink: 0 }} />
      </div>
      <h3 className="event-card__title">{event.eventTitle}</h3>
      <div className="event-card__footer">
        <span className="event-card__detail">
          <Calendar size={11} />
          {new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <span className="event-card__detail">
          <MapPin size={11} />
          {event.city}
        </span>
        {event.attendeeEstimate && (
          <span className="event-card__detail">
            <Users size={11} />
            ~{event.attendeeEstimate.toLocaleString()} attending
          </span>
        )}
      </div>
      <div className="event-card__impact-bar-wrap">
        <div
          className="event-card__impact-bar"
          style={{ width: `${event.impactScore}%`, background: `linear-gradient(90deg, ${threat.color}44, ${threat.color})` }}
        />
      </div>
    </div>
  );
}

// ─── CounterEventModal ────────────────────────────────────────────────────────
function CounterEventModal({ event, onClose }) {
  const draft = event.counterEventDraft;
  const [title,      setTitle]      = useState(draft.title);
  const [date,       setDate]       = useState(draft.suggestedDate);
  const [copy,       setCopy]       = useState(draft.inviteCopy);
  const [segments,   setSegments]   = useState([...draft.targetSegments]);
  const [newSeg,     setNewSeg]     = useState('');
  const [phase,      setPhase]      = useState('edit');
  const [copied,     setCopied]     = useState(false);

  const toggleSeg = s => setSegments(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  const addSeg    = () => { const s = newSeg.trim(); if (s && !segments.includes(s)) setSegments(p => [...p, s]); setNewSeg(''); };

  const handleCreate = async () => {
    setPhase('loading');
    await delay(2600);
    setPhase('success');
  };

  const handleCopy = () => {
    const text = `${title}\n\nDate: ${date}\n\nInvite Copy:\n${copy}\n\nTarget Segments:\n${segments.map(s => `- ${s}`).join('\n')}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const mockUrl = `https://lu.ma/counter-${event.id}-${date}`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalendarPlus size={15} style={{ color: '#ff2d6d' }} />
            <span className="modal-header__title">Generate Counter-Event on Luma</span>
          </div>
          <button className="modal-close" onClick={onClose} id="modal-close-btn"><X size={14} /></button>
        </div>

        {phase === 'edit' && (
          <div className="modal-body">
            <p className="modal-subtitle">
              Auto-drafted brief for <strong style={{ color: '#ff2d6d' }}>{event.competitor}</strong> — {event.eventTitle.split(' — ')[0]}. Edit before publishing.
            </p>
            <div className="modal-field">
              <label className="modal-label">EVENT TITLE</label>
              <input className="modal-input" value={title} onChange={e => setTitle(e.target.value)} id="counter-event-title" />
            </div>
            <div className="modal-field">
              <label className="modal-label">SUGGESTED DATE</label>
              <input className="modal-input" type="date" value={date} onChange={e => setDate(e.target.value)} id="counter-event-date" />
            </div>
            <div className="modal-field">
              <label className="modal-label">INVITE COPY</label>
              <textarea className="modal-textarea" value={copy} onChange={e => setCopy(e.target.value)} rows={5} id="counter-event-copy" />
            </div>
            <div className="modal-field">
              <label className="modal-label">TARGET SEGMENTS</label>
              <div className="segment-chips">
                {draft.targetSegments.map(s => (
                  <button key={s} className={`segment-chip${segments.includes(s) ? ' segment-chip--active' : ''}`} onClick={() => toggleSeg(s)}>
                    {s}
                  </button>
                ))}
                {segments.filter(s => !draft.targetSegments.includes(s)).map(s => (
                  <button key={s} className="segment-chip segment-chip--active segment-chip--custom" onClick={() => setSegments(p => p.filter(x => x !== s))}>
                    {s} <X size={9} />
                  </button>
                ))}
              </div>
              <div className="segment-add-row">
                <input className="modal-input modal-input--sm" placeholder="Add custom segment…" value={newSeg} onChange={e => setNewSeg(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSeg()} id="custom-segment-input" />
                <button className="segment-add-btn" onClick={addSeg}>Add</button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="create-btn" onClick={handleCreate} id="create-on-luma-btn">
                <Rocket size={14} /> Create on Luma
              </button>
              <button className="copy-btn" onClick={handleCopy} id="copy-brief-btn">
                <Copy size={13} /> {copied ? 'Copied!' : 'Copy brief'}
              </button>
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div className="modal-loading">
            <Loader2 size={36} className="modal-spinner" style={{ color: '#ff2d6d' }} />
            <p className="modal-loading__text">Drafting counter-event on Luma…</p>
            <div className="modal-loading__steps">
              <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={12} /> Event brief validated
              </span>
              <span style={{ color: '#00e5ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} className="modal-spinner" /> Publishing to Luma…
              </span>
            </div>
          </div>
        )}

        {phase === 'success' && (
          <div className="modal-success">
            <div className="success-icon-ring">
              <CheckCircle2 size={30} style={{ color: '#4ade80' }} />
            </div>
            <h3 className="success-title">Counter-event drafted</h3>
            <p className="success-subtitle">Ready to publish on Luma</p>
            <div className="success-card">
              <div className="success-card__label">EVENT BRIEF</div>
              <p className="success-card__title">{title}</p>
              <div className="success-card__row"><Calendar size={12} style={{ color: '#9ca3af' }} /><span>{formatDate(date)}</span></div>
              <div className="success-card__row"><Users size={12} style={{ color: '#9ca3af' }} /><span>{segments.slice(0, 2).join(', ')}{segments.length > 2 ? ` +${segments.length - 2} more` : ''}</span></div>
              <a className="success-luma-link" href={mockUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.preventDefault()} id="success-luma-link">
                <ExternalLink size={12} />{mockUrl}
              </a>
            </div>
            <button className="create-btn" style={{ marginTop: 8 }} onClick={onClose} id="success-done-btn">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EventDetailPanel ─────────────────────────────────────────────────────────
function EventDetailPanel({ event, onGenerateCounter, onClose }) {
  if (!event) {
    return (
      <div className="er-panel er-panel--right er-panel--empty">
        <div className="er-panel__placeholder">
          <Target size={28} style={{ color: '#374151', marginBottom: 12 }} />
          <p>Select an event to view threat analysis and generate a counter-event.</p>
        </div>
      </div>
    );
  }
  const threat = THREAT_COLORS[event.threatLevel];
  return (
    <div className="er-panel er-panel--right">
      <div className="er-panel__header">
        <span className="er-panel__dot" style={{ background: threat.color, boxShadow: `0 0 8px ${threat.color}` }} />
        EVENT DETAIL
        <button className="panel-close-btn" onClick={onClose} id="event-detail-close"><X size={12} /></button>
      </div>
      <div className="event-detail__top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="event-detail__initials" style={{ background: event.accentColor + '22', borderColor: event.accentColor + '55', color: event.accentColor }}>
            {event.initials}
          </div>
          <div>
            <p className="event-detail__competitor">{event.competitor}</p>
            <span className="threat-pill" style={{ color: threat.color, background: threat.bg, borderColor: threat.border }}>
              {event.threatLevel} THREAT
            </span>
          </div>
        </div>
        <h3 className="event-detail__title">{event.eventTitle}</h3>
      </div>
      <div className="event-detail__meta-row">
        <div className="event-detail__meta-item"><Calendar size={12} /><span>{formatDate(event.date)}</span></div>
        <div className="event-detail__meta-item"><MapPin size={12} /><span>{event.city}</span></div>
        <div className="event-detail__meta-item"><Globe2 size={12} /><span style={{ textTransform: 'capitalize' }}>{event.format}</span></div>
        {event.attendeeEstimate && (
          <div className="event-detail__meta-item"><Users size={12} /><span>~{event.attendeeEstimate.toLocaleString()} attending</span></div>
        )}
      </div>
      <div className="event-detail__section">
        <div className="er-section-label">WHY IT MATTERS</div>
        <p className="event-detail__body">{event.whyItMatters}</p>
      </div>
      <div className="event-detail__section">
        <div className="er-section-label">KEY INSIGHTS</div>
        <ul className="er-insight-list">
          {event.insights.map((ins, i) => (
            <li key={i} className="er-insight-item">
              <ChevronRight size={11} style={{ color: threat.color, flexShrink: 0, marginTop: 2 }} />
              {ins}
            </li>
          ))}
        </ul>
      </div>
      <div className="event-detail__impact">
        <div className="er-section-label">THREAT SCORE</div>
        <div className="er-impact-bar-wrap">
          <div className="er-impact-bar" style={{ width: `${event.impactScore}%`, background: `linear-gradient(90deg, ${threat.color}44, ${threat.color})` }} />
        </div>
        <span className="er-impact-score" style={{ color: threat.color }}>
          {event.impactScore}<span style={{ color: '#6b7280', fontSize: 10 }}>/100</span>
        </span>
      </div>
      <div className="event-detail__cta">
        <button className="generate-btn" onClick={() => onGenerateCounter(event)} id={`generate-counter-${event.id}`}>
          <Sparkles size={14} /> Generate Counter-Event on Luma
        </button>
        <a className="luma-link-btn" href={event.lumaUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.preventDefault()} id={`view-luma-${event.id}`}>
          <ExternalLink size={12} /> View on Luma
        </a>
      </div>
    </div>
  );
}

// ─── EventRadarPage ───────────────────────────────────────────────────────────
export default function EventRadarPage({ company }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [counterEvent,  setCounterEvent]  = useState(null);
  const [logs,          setLogs]          = useState(EVENT_LOG_INIT);
  const [hasScanned,    setHasScanned]    = useState(false);
  const logRef = useRef(null);

  const filteredEvents = company.trim()
    ? EVENT_RADAR_DATA.filter(ev =>
        ev.competitor.toLowerCase().includes(company.trim().toLowerCase()) ||
        ev.eventTitle.toLowerCase().includes(company.trim().toLowerCase())
      )
    : EVENT_RADAR_DATA;

  useEffect(() => {
    if (hasScanned) return;
    setHasScanned(true);
    const seq = buildEventLogs(EVENT_RADAR_DATA);
    let i = 0;
    const tick = () => {
      if (i >= seq.length) return;
      setLogs(prev => [...prev.slice(-120), seq[i]]);
      i++;
      setTimeout(tick, 480 + Math.random() * 260);
    };
    setTimeout(tick, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const handleSelectEvent = useCallback(event => {
    setSelectedEvent(prev => prev?.id === event.id ? null : event);
    setLogs(prev => [
      ...prev.slice(-120),
      { icon: 'alert', text: `Selected: ${event.competitor} — ${event.eventTitle.split(' — ')[0]}`, color: THREAT_COLORS[event.threatLevel].color },
      { icon: 'brain', text: `Threat score: ${event.impactScore}/100 (${event.threatLevel})`,       color: THREAT_COLORS[event.threatLevel].color },
    ]);
  }, []);

  const handleGenerateCounter = useCallback(event => {
    setCounterEvent(event);
    setLogs(prev => [
      ...prev.slice(-120),
      { icon: 'zap',    text: 'Drafting counter-event brief…',           color: '#ff9500' },
      { icon: 'rocket', text: 'Counter-event generator ready for review.', color: '#ff9500' },
    ]);
  }, []);

  const counts = {
    HIGH:   filteredEvents.filter(e => e.threatLevel === 'HIGH').length,
    MEDIUM: filteredEvents.filter(e => e.threatLevel === 'MEDIUM').length,
    LOW:    filteredEvents.filter(e => e.threatLevel === 'LOW').length,
  };

  return (
    <div className="er-root">
      {/* Left log panel */}
      <div className="er-panel er-panel--left">
        <div className="er-panel__header">
          <span className="er-panel__dot er-panel__dot--pulse" />
          AGENT LOG
        </div>
        <div className="er-log-scroll" ref={logRef}>
          {logs.map((entry, i) => {
            if (!entry) return null;
            const IconComp = ICON_MAP[entry.icon] ?? Radio;
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div key={i} className="er-log-line">
                <span className="er-log-time">{time}</span>
                <span style={{ color: entry.color, marginTop: 2 }}><IconComp size={12} /></span>
                <span className="er-log-text" style={{ color: entry.color }}>{entry.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Center timeline */}
      <div className="er-center">
        <div className="er-center__header">
          <div className="er-center__header-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert size={18} style={{ color: '#ff2d6d' }} />
              <h2 className="er-center__title">Event Radar</h2>
            </div>
            <div className="er-center__summary-pills">
              {['HIGH','MEDIUM','LOW'].map(level => (
                <span key={level} className="summary-pill" style={{ color: THREAT_COLORS[level].color, background: THREAT_COLORS[level].bg, borderColor: THREAT_COLORS[level].border }}>
                  {counts[level]} {level}
                </span>
              ))}
            </div>
          </div>
          <p className="er-center__caption">
            Public Event Radar — Showing publicly listed Luma events only. Private and unlisted events are not covered.
          </p>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="er-empty-state">
            <Scan size={32} style={{ color: '#374151', marginBottom: 12 }} />
            <p>No events found for <strong style={{ color: '#ff2d6d' }}>{company}</strong>.</p>
            <p style={{ fontSize: 12, color: '#4b5563', marginTop: 6 }}>Try a different name or clear the search to see all events.</p>
          </div>
        ) : (
          <div className="event-timeline">
            {filteredEvents.map(event => (
              <EventCard key={event.id} event={event} isSelected={selectedEvent?.id === event.id} onClick={handleSelectEvent} />
            ))}
          </div>
        )}
      </div>

      {/* Right detail panel */}
      <EventDetailPanel event={selectedEvent} onGenerateCounter={handleGenerateCounter} onClose={() => setSelectedEvent(null)} />

      {/* Counter-event modal */}
      {counterEvent && <CounterEventModal event={counterEvent} onClose={() => setCounterEvent(null)} />}
    </div>
  );
}
