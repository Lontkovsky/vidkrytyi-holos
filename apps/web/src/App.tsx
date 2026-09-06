import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Categories, Poll, policyText } from '../../../packages/domain/src/index.ts';
import type { PollType } from '../../../packages/domain/src/index.ts';
import { request } from './api.ts';
import { PollPage, stateNames } from './PollPage.tsx';
import { Identity } from './Identity.tsx';
import { DraftEditor, MyPolls, ReviewQueue } from './Workspace.tsx';

export function App() {
  const [route, setRoute] = useState(location.hash);
  const [auth, setAuth] = useState<Auth | null>(null);
  useEffect(() => {
    if (auth === null) return;
    const timer = setTimeout(() => setAuth(null), Math.max(0, Date.parse(auth.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [auth]);
  const [polls, setPolls] = useState<PollType[]>([]), [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(true);
  useEffect(() => { const update = () => setRoute(location.hash); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    setLoading(true); setError(null);
    request('management', '/v1/polls?' + params.toString()).then(value => {
      const result = z.object({ polls: z.array(Poll) }).parse(value);
      if (active) setPolls(result.polls);
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Помилка запиту'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, category, route]);
  return <>
    <a className="skip" href="#main">До основного вмісту</a>
    <div className="environment"><span className="status-dot" /> Синтетичний development-режим <span>Справжні документи не приймаються</span></div>
    <header className="site-header"><a className="brand" href="#/"><span className="brand-mark">вг</span><span>Відкритий голос<small>Незалежна платформа</small></span></a>
      <nav aria-label="Основна навігація"><a href="#/" aria-current={!route || route === '#/' ? 'page' : undefined}>Голосування</a><a href="#/trust">Центр довіри</a><a href="#/help">Довідка</a></nav>
      {auth === null ? <a className="button secondary" href="#/identity">Підтвердити участь</a> : <div className="account-actions"><a href="#/mine">Мої питання</a>{auth.role === 'moderator' && <a href="#/moderation">Модерація</a>}<button className="secondary" onClick={() => { void request('identity', '/v1/session', 'DELETE', undefined, auth.token).then(() => { setAuth(null); location.hash = '#/'; }).catch((e: Error) => setError(e.message)); }}>Вийти</button></div>}</header>
    <main id="main">
      {route === '#/trust' ? <section className="reading"><p className="eyebrow">ВІДКРИТІ ПРАВИЛА</p><h1>Довіра має межі.<br />Ми показуємо їх.</h1><p className="lead">Development-версія використовує справжню криптографію Belenios 3.3.0 та лише синтетичні особи.</p><h2>Що перевіряється</h2><p>Справжність криптографічних доказів і підрахунок можна перевірити з публічного архіву. Пошук tracker підтверджує лише включення бюлетеня.</p>
        <h2>Зовнішні спостерігачі</h2><p>Окрема програма спостерігача читає публічні дані, зберігає підписану історію й перевіряє опублікований підрахунок. Вона потребує заздалегідь перевіреного ключа та manifest і не має доступу до ідентифікації чи права приймати голоси.</p><p>Суперечливі історії виявляються після обміну свідченнями. Повністю ізольовані спостерігачі не гарантують виявлення split-view. Власний збережений стан також потрібно захищати.</p>
        <h2>Від кого залежить приватність</h2><p>Сторона, яка видає право участі, може пов’язати особу із зашифрованим бюлетенем. Змова достатньої кількості власників ключів дозволяє розшифрування. Місцеві оператори є симуляцією незалежності.</p><h2>Чого ця версія не гарантує</h2><p>Захист від примусу, купівлі голосів, шкідливого пристрою та підміни клієнтського коду не гарантовано. Незалежний зовнішній аудит ще не виконано. Реальне політично чутливе використання не відкрито.</p><p><a href="https://github.com/Lontkovsky/vidkrytyi-holos">Код, рішення й перевірки на GitHub ↗</a></p></section>
      : route === '#/help' ? <section className="reading"><p className="eyebrow">ДОВІДКА</p><h1>Як працює участь</h1><ol className="steps"><li><h2>Прочитайте питання й правила</h2><p>Базовий критерій — підтверджений власник РНОКПП. Вік і громадянство враховуються лише тоді, коли це прямо зазначено в політиці.</p></li><li><h2>Підтвердьте тестову особу</h2><p>Провайдери A і B можуть підтвердити ту саму синтетичну особу. Зміна провайдера не дає додаткового голосу.</p></li><li><h2>Зробіть остаточний вибір</h2><p>Браузер шифрує відповідь. Після прийняття змінити її не можна. Зберігайте tracker для перевірки включення.</p></li><li><h2>Перевірте підсумок після закриття</h2><p>До закриття розподіл відповідей прихований. Для малої групи результат не розшифровується.</p></li></ol></section>
      : route.startsWith('#/identity') ? <Identity onSignedIn={signedIn => { setAuth(signedIn); const destination = new URLSearchParams(route.split('?')[1]).get('return'); location.hash = destination !== null && destination.startsWith('#/poll/') ? destination : '#/'; }} />
      : route.startsWith('#/poll/') ? <PollPage key={route} id={route.slice(7)} auth={auth} />
      : route === '#/new' || route.startsWith('#/edit/') ? auth === null ? <Identity onSignedIn={setAuth} /> : <DraftEditor auth={auth} id={route.startsWith('#/edit/') ? route.slice(7) : null} />
      : route === '#/mine' ? auth === null ? <Identity onSignedIn={setAuth} /> : <MyPolls auth={auth} />
      : route === '#/moderation' ? auth === null ? <Identity onSignedIn={setAuth} /> : <ReviewQueue auth={auth} />
      : <><section className="page-heading"><div><p className="eyebrow">ПИТАННЯ, ЯКІ МАЮТЬ ЗНАЧЕННЯ</p><h1>Голосування</h1><p className="lead">Відкрите питання. Приватний вибір. Перевірюваний підсумок.</p></div><a className="button primary" href="#/new">+ Створити питання</a></section>
        <div className="catalog-tools"><label className="search">Пошук питань<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Категорія<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Усі категорії</option>{Categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
        <div className="catalog-layout"><section aria-label="Каталог голосувань"><div className="section-line"><h2>Каталог</h2><span>Новіші спочатку</span></div>{loading ? <p role="status">Завантаження голосувань…</p> : error ? <div className="notice error" role="alert">Не вдалося завантажити каталог: {error}</div> : polls.length === 0 ? <div className="empty"><span className="empty-symbol">+</span><h2>Питань ще немає</h2><p>{query || category ? 'За цими умовами голосувань не знайдено.' : 'Створіть першу пропозицію після підтвердження тестової особи.'}</p></div> : <div className="poll-list">{polls.map(poll => <article className="poll-card" key={poll.id}><div className="card-top"><span className="category">{poll.content.category}</span><span className="state">{stateNames[poll.state]}</span></div><h2><a href={`#/poll/${poll.id}`}>{poll.content.question}</a></h2><p>{poll.content.context}</p><div className="card-bottom"><span>{poll.content.authorAlias}</span><span>{policyText(poll.content.policy)}</span></div></article>)}</div>}</section>
          <aside className="principles"><span className="eyebrow">ПЕРШ НІЖ ГОЛОСУВАТИ</span><h2>Одна людина.<br />Один врахований голос.</h2><p>Зміна пристрою чи провайдера не збільшує вагу учасника.</p><div className="rule" /><h3>Результат про учасників</h3><p>Добровільний самовідбір не робить голосування репрезентативним опитуванням населення.</p><a href="#/trust">Межі гарантій <span aria-hidden="true">↗</span></a></aside></div></>}
    </main><footer><span>Відкритий голос · Відкритий код AGPL-3.0</span><span>Не державний сервіс. Не офіційні вибори.</span><a href="https://github.com/Lontkovsky/vidkrytyi-holos">GitHub ↗</a></footer>
  </>;
}

export type Auth = { token: string; role: string; expiresAt: string };
