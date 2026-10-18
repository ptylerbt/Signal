import { redirect } from 'next/navigation';

// Teacher profiles became People profiles; keep old links working.
export default function TeacherRedirect({ params }) {
  redirect(`/people/${params.id}`);
}
