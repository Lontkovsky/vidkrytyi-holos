import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ProviderCatalogue } from '../../../packages/domain/src/providers.ts';
import type { ProviderCatalogueType, MockProviderIdType } from '../../../packages/domain/src/providers.ts';
import type { Auth } from './App.tsx';
import { ApiFailure, request } from './api.ts';

const capabilityLabels = { subject: 'Унікальна особа', rnokppOwner: 'Власник РНОКПП', age: 'Вік', citizenship: 'Громадянство', freshness: 'Свіжість', signatureValidation: 'Перевірка доказу', prerequisites: 'Необхідні доступи' };
const identityErrors: Record<string, string> = {
  PROVIDER_UNAVAILABLE: 'Провайдер недоступний. Можна повторити цю саму спробу або явно вибрати іншого доступного провайдера.',
  PROVIDER_ATTRIBUTES_CONFLICT: 'Провайдери повернули суперечливі атрибути. Допуск і попередні сесії заблоковано; нове право голосу не створюється.',
  IDENTITY_RETURN_EXPIRED: 'Строк повернення від провайдера минув. Почніть нову ідентифікацію; це не створить додаткового права голосу.',
  ATTESTATION_REJECTED: 'Підтвердження не відповідає цій спробі або вимогам свіжості. Допуск не надано.',
  INVALID_SIGNATURE: 'Підпис провайдера не пройшов перевірку. Допуск не надано.',
};
export function Identity({ onSignedIn }: { onSignedIn: (auth: Auth) => void }) {
  const [catalogue, setCatalogue] = useState<ProviderCatalogueType | null>(null), [subject, setSubject] = useState<string | null>(null);
  const [provider, setProvider] = useState<MockProviderIdType>('A'), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null), [attempt, setAttempt] = useState<string | null>(null), [tries, setTries] = useState(0), [terminal, setTerminal] = useState(false);
  const mounted = useRef(false);
  async function refresh() {
    setLoading(true); setError(null);
    try { const value = ProviderCatalogue.parse(await request('identity', '/v1/providers')); if (mounted.current) setCatalogue(value); }
    catch (e) { if (mounted.current) { setCatalogue(null); setError(e instanceof ApiFailure ? e.message : 'Сервіс допуску недоступний. Відновіть мережу й оновіть стан.'); } }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; }; }, []);
  function restart() { setAttempt(null); setTries(0); setTerminal(false); setError(null); }
  async function confirm() {
    if (subject === null || busy || tries >= 3 || terminal) return;
    setBusy(true); setError(null); setTries(n => n + 1);
    try {
      let currentAttempt = attempt;
      if (currentAttempt === null) {
        const start = z.object({ attempt: z.string() }).parse(await request('identity', '/v1/auth/start', 'POST', { provider, subject }));
        if (!mounted.current) return;
        currentAttempt = start.attempt; setAttempt(currentAttempt);
      }
      const auth = z.object({ token: z.string(), role: z.string(), expiresAt: z.string() }).parse(await request('identity', '/v1/auth/finish', 'POST', { attempt: currentAttempt }));
      if (mounted.current) onSignedIn(auth);
    } catch (e) {
      if (mounted.current) {
        if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) setTerminal(true);
        setError(e instanceof ApiFailure ? (identityErrors[e.message] ?? e.message) : 'Підтвердження не отримано. Перевірте мережу; повтор використає ту саму відому спробу.');
      }
    } finally { if (mounted.current) setBusy(false); }
  }
  const selected = catalogue?.providers.find(p => p.provider === provider);
  return <section className="identity-panel"><p className="eyebrow">ДОПУСК ДО УЧАСТІ</p><h1>Підтвердьте тестову особу</h1><p className="lead">Цей режим працює лише із заздалегідь визначеними синтетичними особами. Не вводьте справжній РНОКПП чи документи.</p>
    {loading && <p role="status">Перевірка доступності провайдерів…</p>}
    <button className="secondary" disabled={busy || loading} onClick={() => void refresh()}>Оновити стан провайдерів</button>
    <p className="muted">Доступність показано на момент останньої перевірки. Стан може змінитися до підтвердження особи.</p>
    {catalogue !== null && <>
      <fieldset disabled={busy}><legend>Провайдер</legend><div className="inline-options">{catalogue.providers.map(p => <div key={p.provider}><label><input type="radio" name="provider" checked={provider === p.provider} onChange={() => { setProvider(p.provider); restart(); }} />{p.name}</label><p>{p.name}: {p.available ? 'доступний' : 'недоступний'}{p.observation === 'TransportUnavailable' ? ' — відповідь не отримано' : ''}</p></div>)}</div></fieldset>
      {catalogue.providers.every(p => !p.available) && <p className="notice" role="status">Обидва тестові провайдери недоступні. Нове підтвердження участі зараз неможливе. Дедлайни голосувань не переносяться.</p>}
      <fieldset disabled={busy}><legend>Синтетична особа</legend><div className="person-grid">{catalogue.syntheticPersons.map(p => <label key={p}><input type="radio" name="person" checked={subject === p} onChange={() => { setSubject(p); restart(); }} />{p}</label>)}</div></fieldset>
    </>}
    <div className="notice"><strong>Вибір не захищений від примусу.</strong> Передавання credential, демонстрація екрана та шкідливий пристрій можуть порушити приватність.</div>
    {error !== null && <p className="notice error" role="alert">{error}</p>}
    {attempt !== null && !terminal && <p>Незавершена спроба зберігається лише на цій сторінці. Повтор повернення не створює нової особи чи другого права голосу.</p>}
    <button className="primary" disabled={subject === null || busy || loading || selected?.available !== true || tries >= 3 || terminal} onClick={() => void confirm()}>{busy ? 'Підтвердження…' : attempt === null ? 'Підтвердити тестову особу' : `Повторити цю спробу (${tries}/3)`}</button>
    {tries >= 3 && <p role="status">Ліміт трьох спроб вичерпано. Автоматичних повторів немає.</p>}
    {terminal && <button className="secondary" disabled={busy} onClick={restart}>Розпочати нову ідентифікацію</button>}
    <p className="muted">Зміна провайдера — явна дія. Вже видане право чинне до зафіксованого закриття за політикою цього голосування; збій провайдера сам по собі не відкликає його. Перезавантаження сторінки вимагає нової ідентифікації й не змінює право голосу.</p>
    {catalogue !== null && <section className="provider-contracts"><h2>Можливості та межі інтеграцій</h2><p>Непідключений провайдер не є каналом відновлення. Два банки BankID залежать від спільного центрального вузла; КЕП і Дія.Підпис можуть мати спільні залежності довіри. Незалежність перевіряється за конкретними контрактами.</p>
      {[...catalogue.providers, ...catalogue.production].map(p => <details key={p.provider}><summary>{p.name} — {p.state === 'SyntheticImplemented' ? 'тестова інтеграція' : 'Очікує контракту інтеграції (AwaitingProviderContract)'}</summary><dl>{Object.entries(capabilityLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{Reflect.get(p.capabilities, key)}</dd></div>)}</dl></details>)}
      <p><a href="https://github.com/Lontkovsky/vidkrytyi-holos/blob/main/docs/IDENTITY_PROVIDERS.md" target="_blank" rel="noreferrer">Матриця й офіційні джерела ↗</a></p>
    </section>}
  </section>;
}
