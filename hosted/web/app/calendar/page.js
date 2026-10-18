'use client';

import { useEffect, useMemo, useState } from 'react';
import DetailOverlay from '../components/DetailOverlay.js';
import HelpBubble from '../components/HelpBubble.js';

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

// The month calendar that used to sit on the dashboard, now its own page
// under "More" so Home can stay simple.
export default function CalendarPage() {
  const [sends, setSends] = useState([]);
  const [statusChanges, setStatusChanges] = useState([]);

  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);
  const [detailItem, setDetailItem] = useState(null);

  async function loadAll() {
    try {
      const calendarRes = await fetch('/api/dashboard/calendar');
      if (calendarRes.ok) {
        const data = await calendarRes.json();
        setSends(data.sends);
        setStatusChanges(data.statusChanges);
      }
    } catch {
      // Leave the calendar empty rather than stuck.
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const today = new Date();
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  const sendsByDay = useMemo(() => {
    const map = new Map();
    for (const s of sends) {
      const key = new Date(s.generated_at).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [sends]);

  const statusByDay = useMemo(() => {
    const map = new Map();
    for (const s of statusChanges) {
      const key = new Date(s.updated_at).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [statusChanges]);

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startDay = firstOfMonth.getDay();
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - startDay);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    const out = [];
    for (let i = 0; i < 6; i++) out.push(days.slice(i * 7, i * 7 + 7));
    return out;
  }, [viewMonth]);

  const selectedSends = selectedDate ? sendsByDay.get(selectedDate) || [] : [];
  const selectedStatusChanges = selectedDate ? statusByDay.get(selectedDate) || [] : [];

  return (
    <div className="signal-calendar-page">
    <div className="signal-dashboard-col">
      <div className="signal-panel signal-panel-grow signal-calendar-panel">
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h1 style={titleStyle}>
            Calendar <HelpBubble text="Dots show the days you emailed people (blue) and marked a reply (green). Click a day to see what happened." />
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setMonthOffset((m) => m - 1)} style={ghostBtnStyle} aria-label="Previous month">← Prev</button>
            <strong style={{ fontSize: 16, color: '#1F3864' }}>
              {viewMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </strong>
            <button onClick={() => setMonthOffset((m) => m + 1)} style={ghostBtnStyle} aria-label="Next month">Next →</button>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          <span style={legendDotStyle('#1F3864')} /> Sent &nbsp;&nbsp;
          <span style={legendDotStyle('#1e6e34')} /> Reply marked
        </div>

        <div className="signal-calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} style={{ fontSize: 12.5, fontWeight: 700, color: '#888', textAlign: 'center', padding: '4px 0' }}>{d}</div>
          ))}
          {weeks.flat().map((d, i) => {
            const key = dateKey(d);
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const daySends = sendsByDay.get(key) || [];
            const dayStatus = statusByDay.get(key) || [];
            const isSelected = key === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(key)}
                style={{
                  ...dayCellStyle,
                  opacity: inMonth ? 1 : 0.35,
                  background: isSelected ? '#e8f0fb' : '#fff',
                  borderColor: isSelected ? '#1F3864' : '#eee',
                }}
              >
                <span style={{ fontWeight: 600 }}>{d.getDate()}</span>
                <span style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {daySends.length > 0 && <span style={dotStyle('#1F3864')} title={`${daySends.length} sent`} />}
                  {dayStatus.length > 0 && <span style={dotStyle('#1e6e34')} title={`${dayStatus.length} status change(s)`} />}
                </span>
              </button>
            );
          })}
        </div>

      </div>

      {selectedDate && (
        <div className="signal-panel signal-calendar-detail-panel">
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <h3 style={{ fontSize: 17, color: '#1F3864', margin: 0 }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} style={ghostBtnStyle}>Close</button>
          </div>

          {selectedSends.length === 0 && selectedStatusChanges.length === 0 && (
            <p style={{ color: '#666', fontSize: 15, margin: 0 }}>Nothing recorded this day.</p>
          )}

          {selectedSends.map((s, i) => (
            <button
              key={`send-${i}`}
              onClick={() => setDetailItem({ ...s, kind: 'send' })}
              style={dayDetailRowStyle}
            >
              <span style={dayDetailDotStyle('#1F3864')} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.first_name} {s.last_name}</strong>
                {s.school ? ` · ${s.school}` : ''}
                <span style={dayDetailMetaStyle}>
                  {s.template_name || 'Message'}{s.list_name ? ` · ${s.list_name}` : ''} · {new Date(s.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
              <span style={dayDetailArrowStyle} aria-hidden="true">›</span>
            </button>
          ))}

          {selectedStatusChanges.map((s, i) => (
            <button
              key={`status-${i}`}
              onClick={() => setDetailItem({ ...s, kind: 'status' })}
              style={dayDetailRowStyle}
            >
              <span style={dayDetailDotStyle('#1e6e34')} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong>{s.first_name} {s.last_name}</strong> marked <strong>{s.status}</strong>
                <span style={dayDetailMetaStyle}>
                  {s.list_name} · {new Date(s.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </span>
              <span style={dayDetailArrowStyle} aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
    </div>

    <DetailOverlay item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}

function legendDotStyle(color) {
  return { display: 'inline-block', width: 10, height: 10, borderRadius: 'var(--radius-pill)', background: color, marginRight: 4 };
}
function dotStyle(color) {
  return { display: 'inline-block', width: 8, height: 8, borderRadius: 'var(--radius-pill)', background: color };
}

const titleStyle = { color: '#1F3864', fontSize: 20, margin: 0 };
const ghostBtnStyle = { padding: '8px 14px', background: 'transparent', color: '#1F3864', border: '1px solid var(--card-border)', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontSize: 14, fontWeight: 600 };
const dayCellStyle = {
  // No fixed height: the grid distributes the panel's leftover space across
  // its six rows, so the whole month always fits without scrolling.
  minHeight: 0,
  overflow: 'hidden',
  border: '1px solid #eee',
  borderRadius: 'var(--radius-lg)',
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
};
// Day-detail and note entries are buttons (clickable -> DetailOverlay), so
// they need the surrounding text styling reset off the native button.
const dayDetailRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  padding: '14px 12px',
  marginBottom: 8,
  background: '#fff',
  border: '1px solid var(--card-border)',
  borderRadius: 'var(--radius-xl)',
  fontSize: 15,
  fontFamily: 'inherit',
  color: '#1a1a1a',
  cursor: 'pointer',
  lineHeight: 1.5,
};

const dayDetailMetaStyle = {
  display: 'block',
  fontSize: 13.5,
  color: '#888',
  marginTop: 4,
};

const dayDetailArrowStyle = {
  color: '#1F3864',
  fontSize: 22,
  lineHeight: 1,
  flexShrink: 0,
  alignSelf: 'center',
};

function dayDetailDotStyle(color) {
  return {
    width: 10,
    height: 10,
    borderRadius: 'var(--radius-pill)',
    background: color,
    flexShrink: 0,
    marginTop: 7,
  };
}
