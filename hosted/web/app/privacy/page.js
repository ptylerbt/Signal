// Public privacy policy (linked from the Google sign-in consent screen).
// Must stay reachable without signing in — see isPublicRoute in middleware.js.

export const metadata = {
  title: 'Privacy policy · Signal',
};

const UPDATED = 'November 10, 2026';
const CONTACT = 'bouttavongmusic@gmail.com';

export default function PrivacyPage() {
  return (
    <article className="signal-home signal-legal">
      <h1 className="signal-home-title">Privacy policy</h1>
      <p className="signal-home-sub">Last updated {UPDATED}</p>

      <h2>What Signal is</h2>
      <p>
        Signal is a small, private app for organizing contacts into lists and sending emails to them. Only people who have
        been personally invited can use it. Signal only sends an email when you press its Send button, from a Gmail account
        you have chosen to connect.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>Your sign-in details: your name, email address, and profile picture, provided by Google or by the email and password you choose.</li>
        <li>What you add to the app: the people you enter or import (names, email addresses, roles, schools or organizations), your lists, notes, letters, and a record of which emails you sent.</li>
        <li>For each Gmail account you connect: its email address and an encrypted access key from Google that lets Signal send email from it.</li>
        <li>Your settings, such as text size and your email signature.</li>
      </ul>

      <h2>What we use Google for</h2>
      <p>
        If you sign in with Google, Signal only receives your name, email address, and profile picture, and uses them only
        to sign you in and show who is signed in.
      </p>

      <p>
        If you connect a Gmail account, Signal asks Google only for permission to send email from it. Signal uses that
        permission only to send the emails you write in Signal, when you press Send. It cannot read, delete, or change
        anything in your Gmail, and it does not access your contacts, calendar, or files. Signal does not sell this data,
        use it for advertising, or share it with anyone. You can disconnect an account at any time on Signal’s Settings
        page, or in your Google Account under Security, Third-party connections.
      </p>
      <p>
        Signal’s use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        including the Limited Use requirements.
      </p>

      <h2>Who can see your information</h2>
      <p>
        Your information is private to your account. The app’s administrator can view an account in order to help when
        something goes wrong. We do not sell, rent, or share your information with anyone for advertising or any other purpose.
      </p>

      <h2>Where it is kept</h2>
      <p>
        Signal runs on Vercel (hosting), stores data in a Neon database, and uses Clerk to handle sign-in. These services
        keep the data on our behalf and are not allowed to use it for their own purposes.
      </p>

      <h2>Deleting your information</h2>
      <p>
        Things you delete in Signal go to Trash and are removed permanently after 30 days. To have your whole account and
        everything in it deleted, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </article>
  );
}
