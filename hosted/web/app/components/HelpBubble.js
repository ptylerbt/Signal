'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// A round (?) button that shows one plain sentence explaining what's on
// screen. Click or tap to open; click anywhere else, or press Escape, to close.
export default function HelpBubble({ text, label = 'What is this?' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const popRef = useRef(null);
  const [shift, setShift] = useState(0);
  const id = useId();

  // Keep the bubble fully on screen: if it would run past the right edge,
  // slide it left by just enough.
  useLayoutEffect(() => {
    if (!open || !popRef.current) {
      setShift(0);
      return;
    }
    const rect = popRef.current.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - 12);
    if (overflow > 0) setShift(-overflow);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <span className="signal-help" ref={ref}>
      <button
        type="button"
        className={`signal-help-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
      >
        ?
      </button>
      {open && (
        <span id={id} role="note" className="signal-help-pop" ref={popRef} style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
          {text}
        </span>
      )}
    </span>
  );
}
