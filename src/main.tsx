import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SignIn } from './SignIn';
import { JobsList } from './JobsList';
import { JobView } from './JobView';
import { NewJob } from './NewJob';
import './styles.css';

/** Where we are lives in the address (#job/<id>, #new), so Back and a bookmark both work. */
function jobInHash(): string | null {
  if (location.hash === '#new') return 'new';
  return /^#job\/([0-9a-f-]{36})$/.exec(location.hash)?.[1] ?? null;
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [jobId, setJobId] = useState(jobInHash);
  const [notice, setNotice] = useState<string | undefined>(undefined);

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

  const open = useCallback((id: string, problem?: string) => {
    setNotice(problem);
    location.hash = `job/${id}`;
  }, []);
  const startNew = useCallback(() => (location.hash = 'new'), []);
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
      <main>
        {jobId === 'new' ? (
          <NewJob onCreated={open} onBack={back} />
        ) : jobId ? (
          <JobView key={jobId} id={jobId} mailbox={session.user.email ?? ''} notice={notice} onBack={back} />
        ) : (
          <JobsList onOpen={open} onNew={startNew} />
        )}
      </main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
