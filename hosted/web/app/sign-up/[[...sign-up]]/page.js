import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 60 }}>
      <SignUp />
    </div>
  );
}
