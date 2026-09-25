import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SignIn } from './SignIn';
import { JobsList } from './JobsList';
import { JobView } from './JobView';
import './styles.css';

/** The job being looked at lives in the address (#job/<id>), so Back and a bookmark both work. */
function jobInHash(): string | null {
  return /^#job\/([0-9a-f-]{36})$/.exec(location.hash)?.[1] ?? null;
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [jobId, setJobId] = useState(jobInHash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const onHash = () => setJobId(jobInHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const open = useCallback((id: string) => (location.hash = `job/${id}`), []);
  const back = useCallback(() => {
    history.replaceState(null, '', location.pathname);
    setJobId(null);
  }, []);

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  return (
    <>
      <header class="topbar">
        <span class="brand">minimalDASH</span>
        <span class="spacer" />
        <span class="who">{session.user.email}</span>
        <button class="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>{jobId ? <JobView id={jobId} mailbox={session.user.email ?? ''} onBack={back} /> : <JobsList onOpen={open} />}</main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
