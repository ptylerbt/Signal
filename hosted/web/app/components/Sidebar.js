'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Four big main buttons (plus Write Email on top). Everything else lives
// under "More" so the everyday choices stay few and obvious.
const MAIN_ITEMS = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/roster', label: 'People', icon: IconPeople },
  { href: '/lists', label: 'Lists', icon: IconList },
];

const MORE_ITEMS = [
  { href: '/templates', label: 'Letters', icon: IconDoc },
  { href: '/notes', label: 'Notes', icon: IconNote },
  { href: '/calendar', label: 'Calendar', icon: IconCalendar },
  { href: '/settings', label: 'Settings', icon: IconSettings },
  { href: '/backup', label: 'Backup', icon: IconBackup },
];

const MORE_OPEN_KEY = 'signal_more_open';

function isActive(pathname, href) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function Sidebar() {
  const pathname = usePathname();
  const composeActive = pathname.startsWith('/compose');
  const [isAdmin, setIsAdmin] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    fetch('/api/me').then((r) => r.ok && r.json()).then((d) => d && setIsAdmin(d.isAdmin));
  }, []);

  const moreItems = isAdmin ? [...MORE_ITEMS, { href: '/admin', label: 'Admin', icon: IconAdmin }] : MORE_ITEMS;
  const onMorePage = moreItems.some((item) => isActive(pathname, item.href));

  // "More" stays open if she's on one of its pages, or if she left it open last time.
  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(MORE_OPEN_KEY) === '1';
    } catch {
      // Storage unavailable; just use the page-based default.
    }
    setMoreOpen(onMorePage || remembered);
  }, [onMorePage]);

  function toggleMore() {
    setMoreOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(MORE_OPEN_KEY, next ? '1' : '0');
      } catch {
        // Ignore — it just won't be remembered.
      }
      return next;
    });
  }

  return (
    <nav className="signal-sidebar" aria-label="Main navigation">
      <div className="signal-sidebar-brand">Signal</div>

      <a
        href="/compose"
        className={`signal-compose-btn${composeActive ? ' active' : ''}`}
        aria-current={composeActive ? 'page' : undefined}
        aria-label="Write Email"
      >
        <IconMail />
        <span>Write Email</span>
      </a>

      <ul className="signal-sidebar-list">
        {MAIN_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        <li>
          <button
            type="button"
            className={`signal-sidebar-link signal-more-toggle${onMorePage && !moreOpen ? ' active' : ''}`}
            onClick={toggleMore}
            aria-expanded={moreOpen}
            aria-controls="signal-more-list"
            aria-label={moreOpen ? 'Hide more options' : 'Show more options'}
          >
            <IconMore />
            <span>More</span>
            <span className="signal-more-caret" aria-hidden="true">{moreOpen ? '▴' : '▾'}</span>
          </button>
        </li>
      </ul>

      {moreOpen && (
        <ul id="signal-more-list" className="signal-sidebar-list signal-sidebar-more">
          {moreItems.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </ul>
      )}
    </nav>
  );
}

function NavLink({ item, active }) {
  const { href, label, icon: Icon } = item;
  return (
    <li>
      <a
        href={href}
        className={`signal-sidebar-link${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
      >
        <Icon />
        <span>{label}</span>
      </a>
    </li>
  );
}

function IconHome() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function IconPeople() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.5.4 4.5 2.6 4.5 5.8" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
function IconNote() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}
function IconBackup() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6v-.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  );
}
function IconAdmin() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" />
      <circle cx="4.5" cy="12" r="1.2" />
      <circle cx="4.5" cy="18" r="1.2" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function IconMore() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}
