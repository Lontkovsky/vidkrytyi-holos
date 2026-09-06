import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Answers, Envelope, Manifest, Poll, ResultContract, percentage, policyText } from '../../../packages/domain/src/index.ts';
import type { PollType, ResultType, EnvelopeType } from '../../../packages/domain/src/index.ts';
import type { Auth } from './App.tsx';
import { ApiFailure, request } from './api.ts';
import { ElectionInfo, encrypt, hash, verifyReceipt } from './crypto.ts';

export const stateNames: Record<string, string> = { Draft: 'Чернетка', Review: 'На перевірці', Scheduled: 'Заплановано', Open: 'Голосування відкрите', Closed: 'Голосування закрите', Tallying: 'Очікує підрахунку', Published: 'Результат опубліковано', Rejected: 'Відхилено', Cancelled: 'Скасовано', Invalidated: 'Результат визнано недійсним', ResultsSuppressed: 'Результат не розкривається' };
export function ErrorMessage({ message }: { message: string | null }) { return message === null ? null : <p className="notice error" role="alert">{message}</p>; }
export function download(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}
export function PollPage({ id, auth }: { id: string; auth: Auth | null }) {
  const [poll, setPoll] = useState<PollType | null>(null), [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<{ kind: string; reason: string }[]>([]), [removed, setRemoved] = useState(false);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [appeal, setAppeal] = useState(''), [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { setPoll(null); setError(null); setRemoved(false);
    request('management', '/v1/polls/' + id, 'GET', undefined, auth?.token).then(value => {
      if (z.object({ contentStatus: z.literal('Removed') }).safeParse(value).success) { setRemoved(true); return; }
      const data = z.object({ poll: Poll, events: z.array(z.object({ kind: z.string(), reason: z.string() })) }).parse(value);
      setPoll(data.poll); setEvents(data.events);
    }).catch((e: Error) => setError(e.message));
  }, [id, auth, revision]);
  async function action(name: string, body: unknown) {
    if (auth === null) return;
    setBusy(true); setError(null); setNotice(null);
    try { await request('management', `/v1/polls/${id}/${name}`, 'POST', body, auth.token); setRevision(r => r + 1); setNotice('Дію виконано й записано.'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (removed) return <section className="reading"><h1>Матеріал вилучено</h1><p>Залишено мінімальне свідчення існування питання. Автоматичне відтворення вилучених матеріалів заборонене.</p><p>Ідентифікатор: {id}</p></section>;
  if (poll === null) return <><ErrorMessage message={error} />{error === null && <p role="status">Завантаження питання…</p>}</>;
  return <><a href="#/">← Усі голосування</a><section className="poll-heading"><div className="card-top"><span className="category">{poll.content.category}</span><span className="state">{stateNames[poll.state]}</span></div><h1>{poll.content.question}</h1><p className="muted">Автор: {poll.content.authorAlias} · Версія {poll.version} · {poll.id}</p></section>
    <div className="detail-layout"><article className="content-paper"><h2>Контекст</h2><p className="preserve">{poll.content.context}</p><h2>Можливі наслідки</h2><p className="preserve">{poll.content.consequences}</p>
      <div className="arguments"><section><h2>Аргументи за</h2>{poll.content.argumentsFor.map((a, i) => <div key={i}><p>{a.text}</p><a href={a.url} target="_blank" rel="noreferrer">Джерело {i + 1} ↗</a></div>)}</section><section><h2>Аргументи проти</h2>{poll.content.argumentsAgainst.map((a, i) => <div key={i}><p>{a.text}</p><a href={a.url} target="_blank" rel="noreferrer">Джерело {i + 1} ↗</a></div>)}</section></div>
      <p className="muted">Зовнішні джерела можуть змінюватися. Офіційний контекст цього питання зафіксований у manifest; джерела не архівуються автоматично.</p>
      {poll.content.relatedPolls.length > 0 && <section><h2>Пов’язані питання</h2><ul>{poll.content.relatedPolls.map(p => <li key={p}><a href={`#/poll/${p}`}>{p}</a></li>)}</ul><p>Голоси різних питань не об’єднуються.</p></section>}
      <h2>Перевірка питання</h2><p>{poll.review === null ? 'Методологічну перевірку ще не завершено.' : poll.review.reason}</p><p className="muted">Модерація не є сертифікатом істинності чи політичної нейтральності.</p>
      {events.length > 0 && <details><summary>Журнал рішень ({events.length})</summary><ol>{events.map((event, i) => <li key={i}>{event.reason}</li>)}</ol></details>}
    </article><aside className="participation"><h2>Правила участі</h2><p>{policyText(poll.content.policy)}</p><dl><dt>Відкриття</dt><dd>{new Date(poll.content.opensAt).toLocaleString('uk-UA')}</dd><dt>Закриття</dt><dd>{new Date(poll.content.closesAt).toLocaleString('uk-UA')}</dd><dt>Поріг публікації</dt><dd>Щонайменше {poll.content.publicationThreshold} учасники</dd></dl><p className="muted">Реєстр тестових учасників зафіксований до відкриття. Нову особу додати після відкриття неможливо.</p>
      {poll.state === 'Draft' && <><a className="button secondary" href={`#/edit/${id}`}>Редагувати чернетку</a><button className="primary" disabled={busy} onClick={() => void action('submit', {})}>Надіслати на перевірку</button></>}
      {poll.state === 'Open' && (auth === null ? <a className="button primary" href={`#/identity?return=${encodeURIComponent(`#/poll/${id}`)}`}>Підтвердити право участі</a> : <Vote poll={poll} auth={auth} />)}
      {poll.state === 'Scheduled' && <p>Голосування почнеться у зазначений час.</p>}
      {poll.state === 'ResultsSuppressed' && <div className="notice">Учасників менше за поріг публікації. Відповіді не розшифровуються й недоступні через API.</div>}
      {['Closed', 'Tallying'].includes(poll.state) && <p>Приймання завершене. Підрахунок очікує перевірки фінального набору та кворуму операторів.</p>}
      <p className="muted">Під час голосування розподіл відповідей і поточна кількість участей приховані.</p>
      {auth?.role === 'moderator' && ['Closed', 'Tallying'].includes(poll.state) && <div className="operator-actions"><h3>Тестовий оператор</h3><button className="secondary" disabled={busy} onClick={() => void action('close', {})}>Зафіксувати закриття</button><button className="primary" disabled={busy} onClick={() => void action('demo-tally', {})}>Запустити тестовий підрахунок</button><p className="muted">Локальна симуляція: обов’язковий trustee + 2 із 3. Це не незалежні організації.</p></div>}
    </aside></div>
    <ErrorMessage message={error} />{notice && <p role="status">{notice}</p>}
    {poll.cryptoId !== null && <Tracker pollId={poll.cryptoId} />}
    {poll.state === 'Published' && poll.cryptoId !== null && <Results pollId={poll.cryptoId} />}
    {auth !== null && <section className="content-paper appeal"><h2>Повідомити про проблему або оскаржити рішення</h2><label>Пояснення<textarea value={appeal} minLength={15} maxLength={2000} onChange={e => setAppeal(e.target.value)} /></label><button className="secondary" disabled={busy || appeal.length < 15} onClick={() => void action('appeals', { reason: appeal })}>Подати звернення</button></section>}
  </>;
}

function Vote({ poll, auth }: { poll: PollType; auth: Auth }) {
  const [choice, setChoice] = useState<number | null>(null), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [pending, setPending] = useState<{ ballot: string; tracker: string } | null>(null);
  const [receipt, setReceipt] = useState<EnvelopeType | null>(null), [attempts, setAttempts] = useState(0);
  const [tracker, setTracker] = useState<string | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  async function submit() {
    if (poll.cryptoId === null || choice === null) return;
    setBusy(true); setError(null);
    try {
      const info = ElectionInfo.parse(await request('ballot', `/v1/elections/${poll.cryptoId}/manifest`));
      const manifest = Manifest.parse(JSON.parse(z.object({ description: z.string() }).parse(JSON.parse(info.electionRaw)).description));
      if (info.electionRaw !== poll.manifestRaw || await hash(info.electionRaw) !== info.manifestHash || !Object.entries(poll.content).every(([key, value]) => JSON.stringify(value) === JSON.stringify(Reflect.get(manifest, key)))) throw new Error('Видимий текст не відповідає manifest. Голосування заблоковано.');
      let encrypted = pending;
      if (encrypted === null) {
        const right = z.object({ credential: z.string(), manifestHash: z.string() }).parse(await request('identity', `/v1/credentials/${poll.cryptoId}`, 'POST', {}, auth.token));
        if (right.manifestHash !== info.manifestHash) throw new Error('Право участі належить іншому manifest.');
        encrypted = await encrypt(info.electionRaw, right.credential, choice);
        setPending(encrypted);
      }
      setAttempts(n => n + 1);
      const accepted = z.object({ accepted: z.literal(true), receipt: Envelope }).parse(await request('ballot', `/v1/elections/${poll.cryptoId}/ballots`, 'POST', { ballot: encrypted.ballot }));
      const verified = await verifyReceipt(accepted.receipt, info.checkpointPublicKey, poll.cryptoId, info.manifestHash, encrypted.tracker);
      setReceipt(accepted.receipt); setTracker(verified.tracker); setChoice(null); setPending(null);
    } catch (e) {
      if (e instanceof ApiFailure && e.message === 'FINAL_VOTE_ALREADY_CAST') { setAlreadyVoted(true); setPending(null); setChoice(null); }
      else { if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) setPending(null); setError(e instanceof Error ? e.message : String(e)); }
    } finally { setBusy(false); }
  }
  if (alreadyVoted) return <div className="notice"><strong>За цим правом участі вже прийнято остаточний голос.</strong><p>Зміна провайдера або пристрою не дає другого голосу. Цей новий бюлетень відхилено. Для перевірки попереднього потрібен збережений tracker; відновлення права не відновлює його автоматично.</p></div>;
  if (receipt !== null && tracker !== null) return <div className="receipt"><h3>Бюлетень прийнято</h3><p>Підпис квитанції перевірено щодо ключа цього сервісу. Збережіть tracker для незалежної перевірки включення.</p><code>{tracker}</code><button className="secondary" onClick={() => download('receipt.json', JSON.stringify(receipt, null, 2), 'application/json')}>Завантажити квитанцію</button><p className="muted">Квитанція не містить вашої відповіді й сама не доводить правильність шифрування вибору.</p></div>;
  return <section className="vote-box"><h3>Ваш остаточний вибір</h3><fieldset disabled={busy || pending !== null}><legend className="visually-hidden">Відповідь</legend>{Answers.map((answer, i) => <label className="choice" key={answer}><input type="radio" name="vote" checked={choice === i} onChange={() => { setChoice(i); setConfirmed(false); }} />{answer}</label>)}</fieldset>
    <div className="notice"><strong>Після прийняття змінити голос не можна.</strong> Передавання credential або демонстрація екрана дозволяють примус. Захист від купівлі голосів і зараженого пристрою не гарантовано.</div>
    {choice !== null && <label className="choice"><input type="checkbox" checked={confirmed} disabled={pending !== null || busy} onChange={e => setConfirmed(e.target.checked)} />Підтверджую остаточний вибір: «{Answers[choice]}»</label>}
    <ErrorMessage message={error} />{error !== null && pending !== null && <p>Підтвердження приймання не отримано. Стан доставки невідомий; повтор надсилає той самий зашифрований бюлетень. Не закривайте сторінку.</p>}
    <button className="primary" disabled={!confirmed || busy || attempts >= 3} onClick={() => void submit()}>{busy ? 'Шифрування та надсилання…' : pending === null ? 'Зашифрувати й остаточно надіслати' : `Повторити той самий запит (${attempts}/3)`}</button>
    {attempts >= 3 && <p>Ліміт трьох спроб вичерпано. Перевірте tracker зашифрованого бюлетеня: <code>{pending?.tracker}</code></p>}
    <p className="muted">Відповідь шифрується в браузері. Секрет участі не зберігається у browser storage. Повторна ідентифікація повертає те саме право, а не новий голос.</p></section>;
}

function Tracker({ pollId }: { pollId: string }) {
  const [tracker, setTracker] = useState(''), [status, setStatus] = useState<string | null>(null), [busy, setBusy] = useState(false);
  async function check() { setBusy(true); setStatus(null); try {
    const info = ElectionInfo.parse(await request('ballot', `/v1/elections/${pollId}/manifest`));
    const result = z.union([z.object({ included: z.literal(false) }), z.object({ included: z.literal(true), receipt: Envelope })]).parse(await request('ballot', `/v1/elections/${pollId}/tracker?tracker=${encodeURIComponent(tracker)}`));
    if (result.included) { await verifyReceipt(result.receipt, info.checkpointPublicKey, pollId, info.manifestHash, tracker); setStatus('Бюлетень включено. Підпис квитанції перевірено. Це перевірка включення, а не доказ змісту відповіді.'); }
    else setStatus('Бюлетень із цим tracker не знайдено. Це не підтвердження приймання.');
  } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }
  return <section className="content-paper tracker"><h2>Перевірити прийнятий бюлетень</h2><p>Вхід не потрібен. Tracker не є іменним доказом конкретної відповіді.</p><label>Tracker<input value={tracker} onChange={e => setTracker(e.target.value)} spellCheck={false} autoComplete="off" /></label><button className="secondary" disabled={tracker.length !== 43 || busy} onClick={() => void check()}>{busy ? 'Перевірка…' : 'Перевірити включення'}</button>{status && <p role="status">{status}</p>}</section>;
}

function Results({ pollId }: { pollId: string }) {
  const [result, setResult] = useState<ResultType | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { request('ballot', `/v1/elections/${pollId}/result`).then(value => setResult(ResultContract.parse(value))).catch((e: Error) => setError(e.message)); }, [pollId]);
  async function audit() { try { const value = await request('ballot', `/v1/elections/${pollId}/audit`); download(`audit-${pollId}.json`, JSON.stringify(value, null, 2), 'application/json'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  if (result === null) return <ErrorMessage message={error} />;
  return <section className="content-paper results"><p className="eyebrow">ПІСЛЯ ЗАКРИТТЯ</p><h2>Результат серед {result.acceptedVotes} учасників цього голосування</h2><p className="notice">{result.representativenessWarning}</p><div>{result.counts.map((count, i) => <div className="result-row" key={i}><div><strong>{Answers[i]}</strong><span>{count} · {percentage(count, result.acceptedVotes)}%</span></div><progress max={result.acceptedVotes} value={count} aria-label={Answers[i]} /></div>)}</div><p className="muted">Усі три відповіді включено в N. Відсотки округлено до одного десяткового знака; їх сума може відрізнятися від 100% через округлення.</p><p>Підрахунок перевірено reference implementation Belenios 3.3.0. Це не зовнішній аудит платформи.</p><div className="action-row"><button className="secondary" onClick={() => download('result-' + pollId + '.json', JSON.stringify(result, null, 2), 'application/json')}>Результат JSON</button><button className="secondary" onClick={() => void audit()}>Аудит-пакет</button></div><p><a href="https://github.com/Lontkovsky/vidkrytyi-holos#verification">Як виконати незалежну перевірку ↗</a></p><ErrorMessage message={error} /></section>;
}
