import { useState } from 'react';
import {
  Calendar, MapPin, FileText, CheckCircle2, ChevronRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// CreateEventForm — Page 1 of Event Copilot
// Stores event data in parent via onEventCreated(data)
// Advances to 'marketing' sub-tab via onAdvance()
// ─────────────────────────────────────────────────────────────────────────────
export default function CreateEventForm({ onEventCreated, onAdvance }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    date: '',
    venue: '',
  });
  const [errors, setErrors]   = useState({});
  const [submitted, setSubmitted] = useState(false);

  function handleField(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setErrors(err => ({ ...err, [e.target.name]: '' }));
  }

  function validate() {
    const e = {};
    if (!form.name.trim())        e.name        = 'Event name is required.';
    if (!form.description.trim()) e.description = 'Description is required.';
    if (!form.date)               e.date        = 'Please select a date.';
    if (!form.venue.trim())       e.venue       = 'Venue is required.';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      const response = await fetch('http://127.0.0.1:8000/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('Unable to create event.');
      onEventCreated(await response.json());
      setSubmitted(true);
    } catch {
      setErrors(err => ({ ...err, form: 'Could not create event. Make sure the API is running on port 8000.' }));
      return;
    }
    // Advance after brief success flash
    setTimeout(onAdvance, 900);
  }

  return (
    <div className="ec-form-wrap">
      <div className="ec-form-header">
        <h2 className="ec-form-title">Create Your Event</h2>
        <p className="ec-form-subtitle">
          Fill in the details below. This data powers your AI-generated marketing content
          and the attendee concierge chatbot.
        </p>
      </div>

      {submitted ? (
        <div className="ec-success-state">
          <CheckCircle2 size={36} className="ec-success-icon" />
          <span className="ec-success-text">Event created — loading Marketing Generator…</span>
        </div>
      ) : (
        <form className="ec-form" onSubmit={handleSubmit} noValidate>
          {/* Event Name */}
          <div className="ec-field">
            <label className="ec-label" htmlFor="ec-name">
              <FileText size={13} /> Event Name
            </label>
            <input
              id="ec-name"
              name="name"
              type="text"
              className={`ec-input${errors.name ? ' ec-input--err' : ''}`}
              placeholder="e.g. Bangalore B2B Growth Summit 2026"
              value={form.name}
              onChange={handleField}
              autoComplete="off"
            />
            {errors.name && <span className="ec-err">{errors.name}</span>}
          </div>

          {/* Description */}
          <div className="ec-field">
            <label className="ec-label" htmlFor="ec-desc">
              <FileText size={13} /> Description
            </label>
            <textarea
              id="ec-desc"
              name="description"
              className={`ec-textarea${errors.description ? ' ec-input--err' : ''}`}
              placeholder="Describe the event — this text powers the AI generator and concierge chatbot."
              value={form.description}
              onChange={handleField}
              rows={4}
            />
            {errors.description && <span className="ec-err">{errors.description}</span>}
          </div>

          {/* Date + Venue — two-column row */}
          <div className="ec-row">
            <div className="ec-field">
              <label className="ec-label" htmlFor="ec-date">
                <Calendar size={13} /> Date
              </label>
              <input
                id="ec-date"
                name="date"
                type="date"
                className={`ec-input${errors.date ? ' ec-input--err' : ''}`}
                value={form.date}
                onChange={handleField}
              />
              {errors.date && <span className="ec-err">{errors.date}</span>}
            </div>

            <div className="ec-field">
              <label className="ec-label" htmlFor="ec-venue">
                <MapPin size={13} /> Venue
              </label>
              <input
                id="ec-venue"
                name="venue"
                type="text"
                className={`ec-input${errors.venue ? ' ec-input--err' : ''}`}
                placeholder="e.g. JW Marriott, Bangalore"
                value={form.venue}
                onChange={handleField}
                autoComplete="off"
              />
              {errors.venue && <span className="ec-err">{errors.venue}</span>}
            </div>
          </div>

          {errors.form && <span className="ec-err">{errors.form}</span>}

          {/* Submit */}
          <button type="submit" className="ec-btn-primary" id="ec-create-event-btn">
            Create Event
            <ChevronRight size={14} />
          </button>
        </form>
      )}
    </div>
  );
}
