import { useEffect, useState } from 'react';
import { generatePassword, generatorEntropyBits } from '@/lib/password';
import { DEFAULT_GENERATOR, type GeneratorOptions } from '@/lib/types';
import { ColoredPassword, Icon, useCopy } from '../ui';

const CHIPS: { key: keyof GeneratorOptions; label: string }[] = [
  { key: 'upper', label: 'ABC' },
  { key: 'lower', label: 'abc' },
  { key: 'digits', label: '123' },
  { key: 'symbols', label: '#$&' },
];

export function GeneratorView() {
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [pw, setPw] = useState('');
  const [spin, setSpin] = useState(0);
  const copy = useCopy();
  const regenerate = () => {
    setPw(generatePassword(opts));
    setSpin((s) => s + 1);
  };
  useEffect(regenerate, [opts]);

  const bits = generatorEntropyBits(opts);
  const enabled = CHIPS.filter((c) => opts[c.key]).length;

  return (
    <div className="fade-in flex h-full flex-col px-4 pt-4">
      <div className="flex min-h-36 flex-col justify-center rounded-2xl bg-surface px-5 py-6">
        <ColoredPassword value={pw} className="text-center text-[17px] leading-relaxed tracking-wide" />
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted">
        <span>{bits} bits of entropy</span>
        <span className={bits >= 80 ? 'text-ok' : bits >= 60 ? 'text-amber-500' : 'text-danger'}>
          {bits >= 80 ? 'Very strong' : bits >= 60 ? 'Strong' : 'Weak'}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="btn btn-secondary size-10 !px-0" title="Regenerate" onClick={regenerate}>
          <Icon name="refresh" className="size-4 transition-transform duration-300" key={spin} />
        </button>
        <button className="btn btn-primary h-10 flex-1" onClick={() => copy(pw, 'Password')}>
          <Icon name="copy" /> Copy password
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-medium text-muted">Length</span>
          <span className="font-mono tabular-nums">{opts.length}</span>
        </div>
        <input type="range" min={8} max={64} value={opts.length} className="w-full" onChange={(e) => setOpts({ ...opts, length: +e.target.value })} />
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {CHIPS.map((c) => {
          const on = opts[c.key] as boolean;
          return (
            <button
              key={c.key}
              disabled={on && enabled === 1}
              onClick={() => setOpts({ ...opts, [c.key]: !on })}
              className={`h-9 cursor-pointer rounded-xl border font-mono text-xs transition disabled:cursor-default ${
                on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-faint hover:text-muted'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 px-1 text-xs text-muted">
        <input type="checkbox" className="accent-[var(--color-accent)]" checked={opts.avoidAmbiguous} onChange={(e) => setOpts({ ...opts, avoidAmbiguous: e.target.checked })} />
        Avoid look-alike characters (l 1 I O 0)
      </label>
    </div>
  );
}
