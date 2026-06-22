import { useEffect, useState } from 'react';

/**
 * Hero terminal that types itself out, demonstrating the real KWS AI:
 * a plain-English ticket is decomposed into a priced proforma. Pure
 * front-end animation (no backend) - the numbers are an illustrative
 * example, framed as an estimate, not a live quote.
 */
type Line =
  | { kind: 'cmd'; arg: string }
  | { kind: 'ok'; text: string; mut?: string }
  | { kind: 'rule' }
  | { kind: 'row'; label: string; amt: string; em?: boolean }
  | { kind: 'note'; text: string }
  | { kind: 'gap' };

const SCRIPT: Line[] = [
  { kind: 'cmd', arg: '"5-page website + email for my salon"' },
  { kind: 'ok', text: 'request understood', mut: '(Nairobi · SME)' },
  { kind: 'ok', text: 'decomposed into 4 tasks' },
  { kind: 'rule' },
  { kind: 'row', label: 'website · 5 pages', amt: 'KES 18,000' },
  { kind: 'row', label: 'business email setup', amt: 'KES 3,500' },
  { kind: 'row', label: 'on-page SEO', amt: 'KES 6,000' },
  { kind: 'row', label: 'hosting · 12 months', amt: 'KES 9,600' },
  { kind: 'rule' },
  { kind: 'row', label: 'estimate', amt: 'KES 37,100', em: true },
  { kind: 'gap' },
  { kind: 'note', text: '→ proforma sent for your approval' },
  { kind: 'note', text: 'nothing is built until you say yes' },
];

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderLine(line: Line, key: number, partialArg?: number) {
  switch (line.kind) {
    case 'cmd': {
      const arg = partialArg == null ? line.arg : line.arg.slice(0, partialArg);
      const typing = partialArg != null && partialArg < line.arg.length;
      return (
        <div key={key}>
          <span className="pr">▸</span> kpkrn <b>quote</b> {arg}
          {typing && <span className="lp-term-cursor" />}
        </div>
      );
    }
    case 'ok':
      return (
        <div key={key}>
          <span className="ok">✓</span> {line.text}
          {line.mut && <> <span className="mut">{line.mut}</span></>}
        </div>
      );
    case 'rule':
      return <div key={key} className="lp-trule" />;
    case 'row':
      return (
        <div key={key} className={`lp-trow${line.em ? ' em' : ''}`}>
          <span>{line.label}</span><span>{line.amt}</span>
        </div>
      );
    case 'note':
      return <div key={key} className="mut">{line.text}</div>;
    case 'gap':
      return <div key={key} style={{ height: 10 }} />;
  }
}

export function ProformaTerminal() {
  const [step, setStep] = useState(reduceMotion() ? SCRIPT.length : 0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (step >= SCRIPT.length) return;
    const line = SCRIPT[step];
    if (!line) return;
    if (line.kind === 'cmd' && typed < line.arg.length) {
      const t = setTimeout(() => setTyped((n) => n + 1), 32);
      return () => clearTimeout(t);
    }
    const delay = line.kind === 'cmd' ? 420 : line.kind === 'rule' || line.kind === 'gap' ? 80 : 180;
    const t = setTimeout(() => { setStep((s) => s + 1); setTyped(0); }, delay);
    return () => clearTimeout(t);
  }, [step, typed]);

  const current = step < SCRIPT.length ? SCRIPT[step] : null;

  return (
    <div className="lp-term">
      <div className="lp-term-bar">
        <span className="lp-tl r" /><span className="lp-tl y" /><span className="lp-tl g" />
        <span className="lp-term-title">~ / KIPKIREN - PROFORMA</span>
        <span className="lp-term-size">AI · live</span>
      </div>
      <div className="lp-term-body">
        {SCRIPT.slice(0, step).map((l, i) => renderLine(l, i))}
        {current && current.kind === 'cmd' && renderLine(current, step, typed)}
        {step >= SCRIPT.length && (
          <div style={{ marginTop: 8 }}><span className="pr">▸</span> <span className="lp-term-cursor" /></div>
        )}
      </div>
    </div>
  );
}
