import { redirect } from 'next/navigation';

// People replaced the Roster in the simplified redesign; keep old links working.
export default function Redirect() {
  redirect('/people');
}
