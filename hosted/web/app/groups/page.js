import { redirect } from 'next/navigation';

// Lists replaced Groups in the simplified redesign; keep old links working.
export default function Redirect() {
  redirect('/lists');
}
