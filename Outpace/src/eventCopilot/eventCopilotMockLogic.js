// ─── eventCopilotMockLogic.js ────────────────────────────────────────────────
// All mock AI functions are isolated here.
// To wire in real backend (FastAPI + Gemini), replace the function bodies —
// the call sites in MarketingGenerator and ConciergeChat do not change.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tone adjectives / phrasing maps ──────────────────────────────────────────
const TONE_META = {
  professional: {
    opener:   'We are pleased to invite you to',
    sign:     'We look forward to your distinguished presence.',
    adjective:'industry-leading',
    instagram_opener: 'Proud to announce',
    whatsapp_opener:  'Dear professional,',
    energy:   'insightful',
  },
  friendly: {
    opener:   "You're invited to",
    sign:     "Can't wait to see you there!",
    adjective:'fantastic',
    instagram_opener: 'Big news',
    whatsapp_opener:  'Hey there!',
    energy:   'exciting',
  },
  corporate: {
    opener:   'On behalf of our organisation, we cordially invite you to',
    sign:     'We trust you will find this event of strategic value.',
    adjective:'high-impact',
    instagram_opener: 'Announcing',
    whatsapp_opener:  'Good day,',
    energy:   'strategic',
  },
  fun: {
    opener:   "Get ready for",
    sign:     "It's going to be legendary. See you there!",
    adjective:'awesome',
    instagram_opener: 'This is going to be EPIC',
    whatsapp_opener:  "Psst...",
    energy:   'electric',
  },
  'student-focused': {
    opener:   "Students — you are invited to",
    sign:     "Great for your CV and even better for your network. See you there!",
    adjective:'career-defining',
    instagram_opener: 'Calling all students',
    whatsapp_opener:  'Hey student,',
    energy:   'hands-on',
  },
};

// ── Format a date string nicely ───────────────────────────────────────────────
function prettyDate(dateStr) {
  if (!dateStr) return 'the event date';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateMockContent
// ─────────────────────────────────────────────────────────────────────────────
// @param  eventData   { name, description, date, venue }
// @param  contentType One of the CONTENT_TYPES keys
// @param  tone        One of: professional | friendly | corporate | fun | student-focused
// @returns string     Generated mock copy
// ─────────────────────────────────────────────────────────────────────────────
export function generateMockContent(eventData, contentType, tone) {
  const t = TONE_META[tone] ?? TONE_META.professional;
  const { name = 'the event', description = '', date = '', venue = 'the venue' } = eventData;
  const d = prettyDate(date);
  const desc = description.trim() || 'a premier gathering for professionals';

  switch (contentType) {
    case 'linkedin':
      return [
        `Thrilled to share that ${name} is happening on ${d} at ${venue}.`,
        '',
        `${desc}`,
        '',
        `This ${t.adjective} event brings together the best minds for an ${t.energy} day of learning, networking, and real conversations that move the needle.`,
        '',
        `Whether you are looking to build your network, discover new ideas, or sharpen your skills — this is the event for you.`,
        '',
        `Seats are limited. Register now and be part of something ${t.adjective}.`,
        '',
        `#${name.replace(/\s+/g, '')} #Events #Networking #Innovation`,
      ].join('\n');

    case 'instagram':
      return [
        `${t.instagram_opener} — ${name} is LIVE! 🎉`,
        '',
        `📅 ${d}`,
        `📍 ${venue}`,
        '',
        `${desc}`,
        '',
        `Join us for a ${t.energy} experience unlike any other. Spots are going fast — link in bio to register.`,
        '',
        `#${name.replace(/\s+/g, '')} #Event #MustAttend #Community`,
      ].join('\n');

    case 'email':
      return [
        `Subject: ${t.opener} ${name} — ${d}`,
        '',
        `Dear [Name],`,
        '',
        `${t.opener} ${name}, taking place on ${d} at ${venue}.`,
        '',
        `${desc}`,
        '',
        `This ${t.adjective} event is designed to deliver ${t.energy} sessions, meaningful connections, and actionable insights you can apply immediately.`,
        '',
        `We would be delighted to have you join us.`,
        '',
        `To register, click the link below:`,
        `[Register Now →]`,
        '',
        `${t.sign}`,
        '',
        `Warm regards,`,
        `The ${name} Team`,
      ].join('\n');

    case 'whatsapp':
      return [
        `${t.whatsapp_opener}`,
        '',
        `You are invited to *${name}* — a ${t.adjective} event happening on *${d}* at *${venue}*.`,
        '',
        `${desc}`,
        '',
        `Register now and secure your spot before seats fill up.`,
        `${t.sign}`,
      ].join('\n');

    case 'speaker':
      return [
        `Meet Our Speakers — ${name}`,
        '',
        `We are thrilled to introduce the ${t.adjective} speaker lineup for ${name} on ${d} at ${venue}.`,
        '',
        `Our speakers are practitioners, builders, and thought leaders who bring real-world ${t.energy} insights to every session.`,
        '',
        `${desc}`,
        '',
        `Stay tuned for full speaker bios and session schedules — coming soon.`,
        '',
        `Reserve your seat today and hear from the best in the field.`,
      ].join('\n');

    case 'reminder':
      return [
        `Reminder: ${name} is almost here!`,
        '',
        `Just a heads-up — ${name} is happening on ${d} at ${venue}, and we cannot wait to see you there.`,
        '',
        `${t.whatsapp_opener} Here is what to expect: ${desc}`,
        '',
        `Make sure you have your registration confirmation handy. Doors open 30 minutes before the first session.`,
        '',
        `${t.sign}`,
      ].join('\n');

    default:
      return `Content for ${contentType} will appear here.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// mockRagResponse
// ─────────────────────────────────────────────────────────────────────────────
// @param  eventData  { name, description, date, venue }
// @param  query      User's question string
// @returns string    Mock answer built from event data
// ─────────────────────────────────────────────────────────────────────────────
export function mockRagResponse(eventData, query) {
  const { name = '', description = '', date = '', venue = '', sourceText = '' } = eventData;
  const q = query.toLowerCase();
  const d = prettyDate(date);

  // Lightweight local retrieval for the MVP: score the uploaded event notes by
  // keyword overlap, then ground the answer in the best matching passage. This
  // keeps the concierge useful without exposing event material to a third party.
  const terms = q.match(/[a-z0-9]{3,}/g) ?? [];
  const passages = sourceText
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map(text => text.trim())
    .filter(text => text.length > 20);
  const bestPassage = passages
    .map(text => ({ text, score: terms.filter(term => text.toLowerCase().includes(term)).length }))
    .sort((a, b) => b.score - a.score)[0];

  if (bestPassage?.score >= 2) {
    const excerpt = bestPassage.text.length > 500
      ? `${bestPassage.text.slice(0, 497)}…`
      : bestPassage.text;
    return `According to the event information: ${excerpt}`;
  }

  // Registration / timing
  if (/(registr|check.?in|sign.?in|start|begin|time|when|schedule|open)/i.test(q)) {
    return `Registration for ${name || 'the event'} begins 30 minutes before the first session on ${d}. Please bring your confirmation email or QR code for check-in at ${venue || 'the venue'}.`;
  }

  // Venue / location
  if (/(where|venue|location|address|place|room|hall|parking|park|directions?)/i.test(q)) {
    if (/(parking|park)/i.test(q)) {
      return `Parking is available at ${venue || 'the event venue'}. We recommend using public transport where possible, as parking spaces are limited. Contact the organizer for reserved parking queries.`;
    }
    return `${name || 'The event'} is taking place at ${venue || 'TBC'}. Please check the event confirmation email for detailed directions and floor maps.`;
  }

  // Date / day
  if (/(date|day|month|when)/i.test(q)) {
    return `${name || 'The event'} is scheduled for ${d}. Mark your calendar and set a reminder!`;
  }

  // Speakers / agenda
  if (/(speaker|talk|session|agenda|schedule|after lunch|panel|keynote|present)/i.test(q)) {
    return `${name || 'The event'} features a curated lineup of speakers and sessions. The full agenda and speaker bios will be shared closer to the event date. ${description ? `Here is a quick overview: ${description}` : ''}`;
  }

  // Ticket / transfer
  if (/(ticket|transfer|cancel|refund|resell|seat)/i.test(q)) {
    return `Ticket transfers may be possible depending on event policy. Please contact the organizer directly for ticket transfer or cancellation requests for ${name || 'this event'}.`;
  }

  // Food / catering
  if (/(food|meal|lunch|dinner|catering|eat|drink|vegetarian|vegan|diet)/i.test(q)) {
    return `Refreshments will be provided at ${name || 'the event'}. Please mention any dietary requirements when registering or contact the organizer in advance.`;
  }

  // WiFi / tech
  if (/(wifi|wi.fi|internet|network|laptop|tech)/i.test(q)) {
    return `WiFi will be available at ${venue || 'the venue'}. Credentials will be shared on the day of the event. Feel free to bring your laptop or device for any hands-on sessions.`;
  }

  // Description keyword match
  if (description) {
    const words = q.split(/\s+/).filter(w => w.length > 3);
    const matched = words.some(w => description.toLowerCase().includes(w));
    if (matched) {
      return `Based on the event details: ${description}. For more specifics, please reach out to the organizer.`;
    }
  }

  // Fallback — as required by spec
  return "I couldn't find that information. Please contact the organizer.";
}
