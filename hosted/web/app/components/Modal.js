'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Every pop-up window goes through this. It renders into <body> via a
// portal because an ancestor with backdrop-filter (the frosted top bar)
// turns position:fixed into "fixed to that ancestor", which made modals
// opened from the top bar overflow the page instead of centering on it.
export default function Modal({ onClose, labelledBy, children, as: Tag = 'div', className = 'signal-modal', ...rest }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="signal-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Tag className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy} {...rest}>
        {children}
      </Tag>
    </div>,
    document.body
  );
}
