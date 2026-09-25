import { useState } from 'preact/hooks';
import { supabase } from './supabase';

/** Sign in by an emailed link. Only an existing account gets one: nobody can sign themselves up. */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: Event) {
    e.preventDefault();
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
      <form class="auth-card" onSubmit={send}>
        <h1>minimalDASH</h1>
        <p class="muted">Micro Components control room</p>
        <label for="email">Email</label>
        <input id="email" class="field" type="email" autoFocus required value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
        <button class="button primary" type="submit" disabled={busy}>
          Email me a sign-in link
        </button>
        <p class={message?.error ? 'message error' : 'message'} role="status">
          {message?.text}
        </p>
      </form>
    </div>
  );
}
