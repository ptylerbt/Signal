import { ClerkProvider, SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import Sidebar from './components/Sidebar.js';
import AppearanceEffects from './components/AppearanceEffects.js';
import ImpersonationBanner from './components/ImpersonationBanner.js';
import WorkspaceSwitcher from './components/WorkspaceSwitcher.js';
import { clerkAppearance } from './components/clerkAppearance.js';
import './globals.css';

export const metadata = {
  title: 'Signal',
  description: 'Outreach prep, hosted',
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en">
        <body>
          <SignedIn>
            <AppearanceEffects />
            <ImpersonationBanner />
          </SignedIn>
          <div className="signal-shell">
            <SignedIn>
              <Sidebar />
            </SignedIn>
            <div className="signal-main">
              <div className="signal-topbar-wrap">
                <header className="signal-topbar">
                  <SignedIn>
                    <WorkspaceSwitcher />
                  </SignedIn>
                  <SignedOut>
                    <span className="signal-topbar-title">Signal</span>
                  </SignedOut>
                  <SignedIn>
                    <UserButton afterSignOutUrl="/sign-in" />
                  </SignedIn>
                  <SignedOut>
                    <a href="/sign-in" className="signal-signin-link">Sign in</a>
                  </SignedOut>
                </header>
              </div>
              <main className="signal-content">{children}</main>
            </div>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
