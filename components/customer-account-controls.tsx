'use client';

export default function CustomerSignOut() {
  async function signOut() {
    await fetch('/api/customer/session', { method: 'DELETE' });
    window.location.assign('/account');
  }
  return <button className="button" type="button" onClick={() => void signOut()}>Sign out</button>;
}
