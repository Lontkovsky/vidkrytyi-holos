import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import { Categories, Content, Poll, Rubric } from '../../../packages/domain/src/index.ts';
import type { ContentType, PollType } from '../../../packages/domain/src/index.ts';
import type { Auth } from './App.tsx';
import { request } from './api.ts';
import { ErrorMessage, stateNames } from './PollPage.tsx';

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function DraftEditor({ auth, id }: { auth: Auth; id: string | null }) {
  const [initial, setInitial] = useState<ContentType | null>(null), [ready, setReady] = useState(id === null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [forCount, setForCount] = useState(1), [againstCount, setAgainstCount] = useState(1);
  const [similar, setSimilar] = useState<PollType[]>([]), [searchDone, setSearchDone] = useState(false);
  useEffect(() => { if (id === null) return;
    request('management', '/v1/polls/' + id, 'GET', undefined, auth.token).then(value => {
      const { poll } = z.object({ poll: Poll }).parse(value);
      if (poll.state !== 'Draft') throw new Error('Офіційний зміст зафіксовано. Створіть нове пов’язане питання.');
      setInitial(poll.content); setForCount(poll.content.argumentsFor.length); setAgainstCount(poll.content.argumentsAgainst.length); setReady(true);
    }).catch((e: Error) => setError(e.message));
  }, [id, auth.token]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    const form = event.currentTarget, data = new FormData(form);
    const field = (name: string) => z.string().parse(data.get(name));
    const number = (name: string) => { const input = form.elements.namedItem(name); if (!(input instanceof HTMLInputElement)) throw new Error('Поле форми недоступне.'); return input.valueAsNumber; };
    try {
      const policy = { id: 'verified-rnokpp-owner', version: 1,
        ...(field('minimumAge') === '' ? {} : { minimumAge: number('minimumAge') }),
        ...(field('citizenship') === '' ? {} : { citizenship: field('citizenship') }) };
      const content = Content.parse({ question: field('question'), context: field('context'), consequences: field('consequences'),
        argumentsFor: Array.from({ length: forCount }, (_, i) => ({ text: field('for-text-' + i), url: field('for-url-' + i) })),
        argumentsAgainst: Array.from({ length: againstCount }, (_, i) => ({ text: field('against-text-' + i), url: field('against-url-' + i) })),
        category: field('category'), authorAlias: field('authorAlias'), policy,
        opensAt: new Date(field('opensAt')).toISOString(), closesAt: new Date(field('closesAt')).toISOString(),
        publicationThreshold: number('publicationThreshold'), relatedPolls: data.getAll('relatedPolls') });
      const path = id === null ? '/v1/drafts' : '/v1/polls/' + id;
      const { poll } = z.object({ poll: Poll }).parse(await request('management', path, id === null ? 'POST' : 'PATCH', content, auth.token));
      location.hash = '#/poll/' + poll.id;
    } catch (e) { setError(e instanceof z.ZodError ? e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  async function findSimilar(form: HTMLFormElement) {
    const query = z.string().parse(new FormData(form).get('question'));
    setError(null);
    try { const data = z.object({ polls: z.array(Poll) }).parse(await request('management', '/v1/similar?q=' + encodeURIComponent(query))); setSimilar(data.polls); setSearchDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  if (!ready) return <><ErrorMessage message={error} />{error === null && <p role="status">Завантаження чернетки…</p>}</>;
  return <section className="editor"><p className="eyebrow">СТРУКТУРОВАНА ПРОПОЗИЦІЯ</p><h1>{id === null ? 'Створити питання' : 'Редагувати чернетку'}</h1><p className="lead">Одна чітка пропозиція, аргументи з обох боків і відомі наперед правила участі.</p>
    <form onSubmit={e => void save(e)} className="content-paper"><fieldset disabled={busy}><label>Формулювання питання<textarea name="question" required minLength={12} maxLength={240} defaultValue={initial?.question} /></label><p className="muted">Уникайте подвійного заперечення, навідних формулювань і кількох пропозицій в одному питанні.</p>
      <button type="button" className="secondary" onClick={e => { if (e.currentTarget.form !== null) void findSimilar(e.currentTarget.form); }}>Знайти схожі питання</button>
      {searchDone && <section className="similar"><h2>Схожі питання</h2>{similar.length === 0 ? <p>Збігів не знайдено. Пошук не гарантує відсутності дублікатів.</p> : similar.map(p => <label className="choice" key={p.id}><input type="checkbox" name="relatedPolls" value={p.id} />Пов’язати: <a href={`#/poll/${p.id}`} target="_blank" rel="noreferrer">{p.content.question}</a></label>)}<p className="muted">Схожа тема не означає точний дублікат. Альтернативні формулювання зберігають окремі голоси.</p></section>}
      {initial?.relatedPolls.map(p => <label className="choice" key={p}><input type="checkbox" name="relatedPolls" value={p} defaultChecked />Пов’язане питання {p}</label>)}
      <label>Контекст<textarea name="context" required minLength={20} maxLength={8000} rows={5} defaultValue={initial?.context} /></label><label>Можливі наслідки<textarea name="consequences" required minLength={10} maxLength={3000} rows={3} defaultValue={initial?.consequences} /></label>
      <div className="arguments">{['for', 'against'].map(side => { const supporting = side === 'for', count = supporting ? forCount : againstCount; return <section key={side}><h2>{supporting ? 'Аргументи за' : 'Аргументи проти'}</h2>{Array.from({ length: count }, (_, i) => <fieldset key={i}><legend>Аргумент {i + 1}</legend><label>Текст аргументу<textarea name={side + '-text-' + i} required minLength={5} maxLength={1500} defaultValue={(supporting ? initial?.argumentsFor : initial?.argumentsAgainst)?.[i]?.text} /></label><label>HTTPS-посилання на джерело<input name={side + '-url-' + i} type="url" pattern="https://.*" required defaultValue={(supporting ? initial?.argumentsFor : initial?.argumentsAgainst)?.[i]?.url} /></label></fieldset>)}<button type="button" className="secondary" disabled={count >= 5} onClick={() => supporting ? setForCount(c => c + 1) : setAgainstCount(c => c + 1)}>Додати аргумент {supporting ? 'за' : 'проти'}</button>{count > 1 && <button type="button" className="secondary" onClick={() => supporting ? setForCount(c => c - 1) : setAgainstCount(c => c - 1)}>Прибрати останній аргумент</button>}</section>; })}</div>
      <div className="form-grid"><label>Категорія<select name="category" required defaultValue={initial === null ? '' : initial.category}><option value="" disabled>Оберіть категорію</option>{Categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Публічний псевдонім автора<input name="authorAlias" required minLength={3} maxLength={60} defaultValue={initial?.authorAlias} /></label></div>
      <h2>Політика допуску · версія 1</h2><p>Підтверджений власник РНОКПП. Вік і громадянство — окремі необов’язкові критерії, які має підтвердити провайдер.</p><div className="form-grid"><label>Мінімальний вік (необов’язково)<input name="minimumAge" type="number" min={0} max={120} defaultValue={initial?.policy.minimumAge} /></label><label>Код громадянства (необов’язково)<input name="citizenship" pattern="[A-Z]{2}" maxLength={2} defaultValue={initial?.policy.citizenship} /></label></div>
      <div className="form-grid"><label>Відкриття (місцевий час)<input name="opensAt" type="datetime-local" required defaultValue={initial === null ? undefined : localDate(initial.opensAt)} /></label><label>Закриття (місцевий час)<input name="closesAt" type="datetime-local" required defaultValue={initial === null ? undefined : localDate(initial.closesAt)} /></label><label>Мінімум учасників для публікації<input name="publicationThreshold" type="number" min={3} max={10000} required defaultValue={initial === null ? 3 : initial.publicationThreshold} /></label></div><p className="notice">Після модерації офіційні матеріали й дедлайн фіксуються. Для істотної зміни потрібне нове пов’язане питання. Поріг малої групи не гарантує абсолютної приватності.</p>
      <ErrorMessage message={error} /><button className="primary" type="submit">{busy ? 'Збереження…' : 'Зберегти чернетку'}</button></fieldset></form></section>;
}

export function MyPolls({ auth }: { auth: Auth }) {
  const [polls, setPolls] = useState<PollType[] | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { request('management', '/v1/my-drafts', 'GET', undefined, auth.token).then(value => setPolls(z.object({ polls: z.array(Poll) }).parse(value).polls)).catch((e: Error) => setError(e.message)); }, [auth.token]);
  return <section><div className="page-heading"><h1>Мої питання</h1><a className="button primary" href="#/new">Створити питання</a></div><p>Тут показано лише ваше авторство. Історія ваших відповідей не збирається в публічному профілі.</p><ErrorMessage message={error} />{polls === null ? <p role="status">Завантаження…</p> : polls.length === 0 ? <p>Ви ще не створили питань.</p> : <div className="poll-list">{polls.map(p => <article key={p.id} className="poll-card"><span className="state">{stateNames[p.state]}</span><h2><a href={`#/poll/${p.id}`}>{p.content.question}</a></h2><p>Версія {p.version}</p></article>)}</div>}</section>;
}
const rubricLabels = { singleProposal: 'Одна пропозиція без навідного формулювання', noDoubleNegation: 'Без подвійного заперечення', clearTerms: 'Терміни зрозумілі', explicitConsequences: 'Умови й істотні наслідки явні', factsSeparated: 'Факти відокремлені від оцінок' };
export function ReviewQueue({ auth }: { auth: Auth }) {
  const [polls, setPolls] = useState<PollType[] | null>(null), [appeals, setAppeals] = useState<{ id: string; poll_id: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => { request('management', '/v1/review-queue', 'GET', undefined, auth.token).then(value => { const data = z.object({ polls: z.array(Poll), appeals: z.array(z.object({ id: z.string(), poll_id: z.string(), reason: z.string() })) }).parse(value); setPolls(data.polls); setAppeals(data.appeals); }).catch((e: Error) => setError(e.message)); }, [auth.token, revision]);
  async function submit(event: FormEvent<HTMLFormElement>, id: string, appeal: boolean) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { const reason = z.string().parse(data.get('reason'));
      const body = appeal ? { reason, reopen: data.get('reopen') === 'on' } : { reason, action: z.string().parse(data.get('action')),
        rubric: Rubric.parse(Object.fromEntries(Object.keys(rubricLabels).map(key => [key, data.get(key) === 'on']))) };
      await request('management', appeal ? `/v1/appeals/${id}/resolve` : `/v1/polls/${id}/review`, 'POST', body, auth.token); setRevision(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return <section><p className="eyebrow">ПРОЗОРІ РІШЕННЯ</p><h1>Модерація й оскарження</h1><p>Публікація вимагає всіх п’яти критеріїв. Відхилення й позначення дубліката потребують пояснення та можуть бути оскаржені.</p><ErrorMessage message={error} />{polls === null ? <p role="status">Завантаження…</p> : polls.length === 0 ? <p>Питань у черзі немає.</p> : polls.map(p => <form className="content-paper" key={p.id} onSubmit={e => void submit(e, p.id, false)}><h2><a href={`#/poll/${p.id}`}>{p.content.question}</a></h2><p>{p.content.context}</p><fieldset disabled={busy}><legend>Методологічні критерії</legend>{Object.entries(rubricLabels).map(([key, label]) => <label className="choice" key={key}><input type="checkbox" name={key} />{label}</label>)}<label>Рішення<select name="action"><option value="approve">Схвалити</option><option value="reject">Відхилити</option><option value="duplicate">Позначити дублікатом</option></select></label><label>Причина рішення<textarea name="reason" required minLength={15} maxLength={2000} /></label><button className="primary" type="submit">{busy ? 'Перевірка та фіксація…' : 'Зафіксувати рішення'}</button></fieldset></form>)}
    <h2>Відкриті звернення</h2>{appeals.length === 0 ? <p>Відкритих звернень немає.</p> : appeals.map(a => <form className="content-paper" key={a.id} onSubmit={e => void submit(e, a.id, true)}><a href={`#/poll/${a.poll_id}`}>Переглянути питання</a><p className="preserve">{a.reason}</p><fieldset disabled={busy}><label>Обґрунтування відповіді<textarea name="reason" required minLength={15} maxLength={2000} /></label><label className="choice"><input type="checkbox" name="reopen" />Повернути відхилене питання в чернетку</label><button className="secondary" type="submit">Закрити звернення з відповіддю</button></fieldset></form>)}</section>;
}
