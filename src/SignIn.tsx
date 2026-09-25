import { useState } from 'preact/hooks';
import { supabase } from './supabase';

/** Sign in with email and password; an emailed link is the way in when the password is forgotten. Nobody can sign themselves up. */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: Event) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage({ text: error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message, error: true });
  }

  async function sendLink() {
    if (!email.trim()) return setMessage({ text: 'Type your email first.', error: true });
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href },
    });
    setBusy(false);
    setMessage(error ? { text: error.message, error: true } : { text: 'Check your mail: the sign-in link is on its way.', error: false });
  }

  return (
    <div class="auth">
      <form class="auth-card" onSubmit={signIn}>
        <h1>minimalDASH</h1>
        <p class="muted">Micro Components control room</p>
        <label for="email">Email</label>
        <input id="email" class="field" type="email" autoComplete="username" autoFocus required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <label for="password">Password</label>
        <input id="password" class="field" type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
        <button class="button primary" type="submit" disabled={busy}>
          Sign in
        </button>
        <p class={message?.error ? 'message error' : 'message'} role="status">
          {message?.text}
        </p>
        <button class="button link" type="button" disabled={busy} onClick={sendLink}>
          Forgot the password? Email me a sign-in link
        </button>
      </form>
    </div>
  );
}
