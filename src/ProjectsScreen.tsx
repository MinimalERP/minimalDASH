import { useEffect, useRef, useState } from 'preact/hooks';
import { createProject, deleteProject, KIND_LABEL, loadProjects, nameProblem, renameProject, setProjectKind, sortProjects, type Project, type ProjectKind } from './projects';

/**
 * Projects: create, rename, change recurring / one-time, delete. Everything here is DASH's own and disposable — nothing in the books
 * changes. Keys: Alt+N new, ↑/↓ move, F2 rename, Alt+T recurring ⇄ one-time, Delete asks and Delete again deletes, Esc cancels.
 */
export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>('recurring');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const newRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects().then(setProjects, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => renameRef.current?.select(), [renaming?.id]);

  const list = projects ?? [];
  const current = list[active];

  /** Runs one change, shows its refusal, and keeps the list and the cursor where they belong. */
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const put = (p: Project) => {
    const next = sortProjects([...list.filter((x) => x.id !== p.id), p]);
    setProjects(next);
    setActive(next.findIndex((x) => x.id === p.id));
  };

  const create = () =>
    run(async () => {
      const problem = nameProblem(newName, list);
      if (problem) throw new Error(problem);
      put(await createProject(newName, newKind));
      setNewName('');
    });
  const rename = () =>
    run(async () => {
      if (!renaming) return;
      const problem = nameProblem(renaming.name, list, renaming.id);
      if (problem) throw new Error(problem);
      put(await renameProject(renaming.id, renaming.name));
      setRenaming(null);
    });
  const toggleKind = (p: Project) => run(async () => put(await setProjectKind(p.id, p.kind === 'recurring' ? 'one_time' : 'recurring')));
  const remove = (p: Project) =>
    run(async () => {
      await deleteProject(p.id);
      setProjects(list.filter((x) => x.id !== p.id));
      setActive((i) => Math.max(0, Math.min(i, list.length - 2)));
      setDeleting(null);
    });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.altKey && e.key.toLowerCase() === 'n') return e.preventDefault(), newRef.current?.focus();
      if (e.key === 'Escape' && (renaming || deleting)) return e.preventDefault(), setRenaming(null), setDeleting(null);
      if (typing || !current || e.ctrlKey || e.metaKey) return;
      if (e.altKey && e.key.toLowerCase() === 't') void toggleKind(current);
      else if (e.altKey) return;
      else if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, list.length - 1)), setDeleting(null);
      else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0)), setDeleting(null);
      else if (e.key === 'F2') setRenaming({ id: current.id, name: current.name });
      else if (e.key === 'Delete') deleting === current.id ? void remove(current) : setDeleting(current.id);
      else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!projects && !error) return <p class="muted">Loading…</p>;
  return (
    <>
      <div class="title-row">
        <h1>Projects</h1>
      </div>
      <form
        class="project-new"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          ref={newRef}
          class="field"
          value={newName}
          placeholder="New project name"
          aria-label="New project name"
          maxLength={120}
          onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
        />
        <select class="field" value={newKind} aria-label="Type" onChange={(e) => setNewKind((e.target as HTMLSelectElement).value as ProjectKind)}>
          <option value="recurring">{KIND_LABEL.recurring}</option>
          <option value="one_time">{KIND_LABEL.one_time}</option>
        </select>
        <button class="button primary" type="submit" disabled={busy}>
          Create
        </button>
        <span class="hint">
          <kbd>Alt</kbd>+<kbd>N</kbd>
        </span>
      </form>
      {error && <p class="message error">{error}</p>}
      <p class="hint">
        {list.length} project{list.length === 1 ? '' : 's'} · <kbd>↑</kbd> <kbd>↓</kbd> move · <kbd>F2</kbd> rename · <kbd>Alt</kbd>+<kbd>T</kbd> recurring ⇄ one-time ·{' '}
        <kbd>Delete</kbd> twice deletes · nothing here changes your books
      </p>
      {list.length === 0 ? (
        <p class="muted">No projects yet. Name one above and choose Recurring (it comes back: a customer’s monthly parts) or One-time.</p>
      ) : (
        <div class="scroll-x">
          <table class="grid projects">
            <thead>
              <tr>
                <th>Project</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p, i) => (
                <tr key={p.id} class={i === active ? 'active' : ''} onClick={() => setActive(i)}>
                  <td class="wrap">
                    {renaming?.id === p.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void rename();
                        }}
                      >
                        <input
                          ref={renameRef}
                          class="field"
                          value={renaming.name}
                          aria-label="Project name"
                          maxLength={120}
                          onInput={(e) => setRenaming({ id: p.id, name: (e.target as HTMLInputElement).value })}
                          onBlur={() => setRenaming(null)}
                        />
                      </form>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td>
                    <button class={`kind ${p.kind}`} type="button" title="Switch recurring / one-time (Alt+T)" disabled={busy} onClick={() => void toggleKind(p)}>
                      {KIND_LABEL[p.kind]}
                    </button>
                  </td>
                  <td class="actions">
                    {deleting === p.id ? (
                      <>
                        <span class="late">Delete “{p.name}”?</span>{' '}
                        <button class="button danger" type="button" disabled={busy} onClick={() => void remove(p)}>
                          Delete
                        </button>{' '}
                        <button class="button" type="button" onClick={() => setDeleting(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button class="button" type="button" onClick={() => (setActive(i), setRenaming({ id: p.id, name: p.name }))}>
                          Rename
                        </button>{' '}
                        <button class="button" type="button" onClick={() => (setActive(i), setDeleting(p.id))}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
