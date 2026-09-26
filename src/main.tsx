import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { loadCompany } from './company';
import { supabase } from './supabase';
import { SignIn } from './SignIn';
import { JobsList } from './JobsList';
import { JobView } from './JobView';
import { NewJob } from './NewJob';
import { ProjectsScreen } from './ProjectsScreen';
import { ownsACompany } from './projects';
import './styles.css';

/** Where we are lives in the address (#jobs, #job/<id>, #new; nothing = Projects), so Back and a bookmark both work. */
type Place = { kind: 'projects' } | { kind: 'jobs' } | { kind: 'new' } | { kind: 'job'; id: string };
function placeInHash(): Place {
  if (location.hash === '#new') return { kind: 'new' };
  if (location.hash === '#jobs') return { kind: 'jobs' };
  const id = /^#job\/([0-9a-f-]{36})$/.exec(location.hash)?.[1];
  return id ? { kind: 'job', id } : { kind: 'projects' };
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [place, setPlace] = useState(placeInHash);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  // minimalDASH is the owner's own, across all their companies: undefined while asking
  const [owner, setOwner] = useState<boolean | undefined>(undefined);
  // the jobs (the earlier part of DASH) still live in one company: only asked for on those pages
  const [company, setCompany] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    const onHash = () => setPlace(placeInHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    setOwner(undefined);
    if (userId) ownsACompany(userId).then(setOwner, (e: Error) => setError(e.message));
  }, [userId]);
  const onJobs = place.kind !== 'projects';
  useEffect(() => {
    if (userId && onJobs && company === undefined) loadCompany(userId).then(setCompany, (e: Error) => setError(e.message));
  }, [userId, onJobs, company]);

  const open = useCallback((id: string, problem?: string) => {
    setNotice(problem);
    location.hash = `job/${id}`;
  }, []);
  const startNew = useCallback(() => (location.hash = 'new'), []);
  const back = useCallback(() => (location.hash = 'jobs'), []);

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  if (error) return <p class="message error">{error}</p>;
  if (owner === undefined) return null;
  if (!owner)
    return (
      <div class="auth">
        <div class="auth-card">
          <h1>minimalDASH</h1>
          <p>minimalDASH is for the owner of the books. {session.user.email} does not own a minimalERP company.</p>
          <button class="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  return (
    <>
      <header class="topbar">
        <span class="brand">minimalDASH</span>
        <nav class="tabs">
          <a href="#" class={place.kind === 'projects' ? 'here' : ''}>
            Projects
          </a>
          <a href="#jobs" class={onJobs ? 'here' : ''}>
            Jobs
          </a>
        </nav>
        <span class="spacer" />
        <span class="who">{session.user.email}</span>
        <button class="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        {place.kind === 'projects' ? (
          <ProjectsScreen />
        ) : company === undefined ? null : company === null ? (
          <p class="muted">The jobs live in a minimalERP company, and this sign-in has none.</p>
        ) : place.kind === 'new' ? (
          <NewJob onCreated={open} onBack={back} />
        ) : place.kind === 'job' ? (
          <JobView key={place.id} id={place.id} mailbox={session.user.email ?? ''} notice={notice} onBack={back} />
        ) : (
          <JobsList onOpen={open} onNew={startNew} />
        )}
      </main>
    </>
  );
}

render(<App />, document.getElementById('app')!);
