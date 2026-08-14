// Shared Clerk look-and-feel so its hosted UI (user menu, sign-in/sign-up)
// matches Signal's rounded theme and navy/red palette instead of Clerk's
// default purple. Passed to <ClerkProvider> so every Clerk component
// inherits it; individual components can still override.
//
// NOTE: `elements` values are style OBJECTS, not Tailwind class strings —
// this project doesn't use Tailwind.

const NAVY = '#1F3864';
const NAVY_DARK = '#16294a';
const BORDER = '#dde3ef';
const TEXT = '#1a1a1a';
const TEXT_MUTED = '#666';

const PILL = '9999px';
const SHADOW_SOFT_LG = '0 16px 40px rgba(31, 56, 100, 0.12), 0 4px 10px rgba(31, 56, 100, 0.06)';
const SHADOW_SOFT_SM = '0 1px 2px rgba(31, 56, 100, 0.06), 0 1px 3px rgba(31, 56, 100, 0.08)';

export const clerkAppearance = {
  variables: {
    colorPrimary: NAVY,
    colorText: TEXT,
    colorTextSecondary: TEXT_MUTED,
    colorDanger: '#C1272D',
    colorBackground: '#ffffff',
    borderRadius: '0.75rem',
    fontFamily: "'Segoe UI', Arial, sans-serif",
    // Clerk sizes its own UI off this; keep it near the app's larger base
    // so its text doesn't read noticeably smaller than everything else.
    fontSize: '1rem',
  },

  elements: {
    // ---- Avatars: fully round ----
    avatarBox: {
      borderRadius: PILL,
    },
    userButtonAvatarBox: {
      borderRadius: PILL,
      width: '40px',
      height: '40px',
    },
    userButtonTrigger: {
      borderRadius: PILL,
      padding: '2px',
      '&:focus': { boxShadow: `0 0 0 3px ${NAVY}33` },
    },

    // ---- Dropdown / popover cards: soft rounded, lifted ----
    userButtonPopoverCard: {
      borderRadius: '1rem',
      boxShadow: SHADOW_SOFT_LG,
      border: `1px solid ${BORDER}`,
    },
    userButtonPopoverFooter: {
      borderBottomLeftRadius: '1rem',
      borderBottomRightRadius: '1rem',
    },
    userButtonPopoverActionButton: {
      borderRadius: '0.5rem',
    },

    // ---- Sign-in / sign-up cards ----
    card: {
      borderRadius: '1.5rem',
      boxShadow: SHADOW_SOFT_LG,
      border: `1px solid ${BORDER}`,
    },
    modalContent: {
      borderRadius: '1.5rem',
    },

    // ---- Primary actions: pill ----
    formButtonPrimary: {
      borderRadius: PILL,
      backgroundColor: NAVY,
      boxShadow: SHADOW_SOFT_SM,
      textTransform: 'none',
      fontWeight: 600,
      '&:hover': { backgroundColor: NAVY_DARK },
      '&:focus': { backgroundColor: NAVY_DARK },
    },
    formButtonReset: {
      borderRadius: PILL,
    },
    socialButtonsBlockButton: {
      borderRadius: PILL,
      border: `1px solid ${BORDER}`,
    },
    formFieldInput: {
      borderRadius: '0.75rem',
      border: `1px solid ${BORDER}`,
    },
    footerActionLink: {
      color: NAVY,
      '&:hover': { color: NAVY_DARK },
    },
  },
};
