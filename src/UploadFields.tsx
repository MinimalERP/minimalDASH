import type { Ref } from 'preact';
import { useState } from 'preact/hooks';
import { VIA } from './upload';

export interface UploadValue {
  via: string;
  text: string;
  files: File[];
}

export const emptyUpload = (): UploadValue => ({ via: VIA[0], text: '', files: [] });

/** How it came, the message (pasted from WhatsApp, or notes of a call), and the files: picked, or dropped on the box. */
export function UploadFields({ value, onChange, textRef }: { value: UploadValue; onChange: (v: UploadValue) => void; textRef?: Ref<HTMLTextAreaElement> }) {
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => list && onChange({ ...value, files: [...value.files, ...Array.from(list)] });

  return (
    <div class="upload">
      <label>
        Came by{' '}
        <select class="field" value={value.via} onChange={(e) => onChange({ ...value, via: e.currentTarget.value })}>
          {VIA.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <textarea
        ref={textRef ?? null}
        class="field"
        rows={5}
        placeholder="Paste the WhatsApp message, or write what was said on the call"
        value={value.text}
        onInput={(e) => onChange({ ...value, text: e.currentTarget.value })}
      />
      <label
        class={over ? 'drop over' : 'drop'}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), add(e.dataTransfer?.files ?? null))}
      >
        <input type="file" multiple onChange={(e) => (add(e.currentTarget.files), (e.currentTarget.value = ''))} />
        Drawings, photos, PDFs, zips: click to choose, or drop them here
      </label>
      {value.files.length > 0 && (
        <ul class="picked">
          {value.files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name} <span class="muted">({Math.ceil(f.size / 1024)} KB)</span>{' '}
              <button type="button" class="button link" onClick={() => onChange({ ...value, files: value.files.filter((_, j) => j !== i) })}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
