import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url);
const localDate = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export async function createRunner(tab) {
  const run = JSON.parse(await readFile(new URL('.runtime/e2e-run.json', root), 'utf8'));
  const p = tab.playwright;
  const title = 'Чи підтримуєте перевірку відкритого коду в браузерному сценарії ' + run.runId + '?';
  let pollId = null, firstTracker = null;
  async function state() { return p.domSnapshot(); }
  async function until(test, label) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await state();
      if (await test()) return;
      await p.waitForTimeout(200);
    }
    throw new Error('UI_STATE_DEADLINE: ' + label);
  }
  async function click(role, name) { await p.getByRole(role, { name, exact: true }).click(); await state(); }
  async function check(role, name) { await p.getByRole(role, { name, exact: true }).check(); await state(); }
  async function visible(role, name) { await until(async () => await p.getByRole(role, { name, exact: true }).count() === 1 && await p.getByRole(role, { name, exact: true }).isVisible(), name); }
  async function fill(label, value) { await p.getByRole('textbox', { name: label, exact: true }).fill(value); await state(); }
  async function exported(button, prefix) {
    const before = new Set(await readdir(run.downloadDirectory));
    await click('button', button);
    let path;
    await until(async () => {
      const files = (await readdir(run.downloadDirectory)).filter(name => !before.has(name) && name.startsWith(prefix) && name.endsWith('.json'));
      if (files.length > 1) throw new Error('AMBIGUOUS_DOWNLOADED_ARTIFACT');
      if (files.length === 0) return false;
      path = join(run.downloadDirectory, files[0]); return true;
    }, 'New completed ' + prefix + ' download');
    return JSON.parse(await readFile(path, 'utf8'));
  }
  async function signOut() {
    if (await p.getByRole('button', { name: 'Вийти', exact: true }).count() === 1) await click('button', 'Вийти');
    await visible('link', 'Підтвердити участь');
    await p.waitForURL('http://localhost:5173/#/', { timeoutMs: 30000 });
    await until(async () => await p.locator('h1').innerText() === 'Голосування', 'Signed-out catalog');
  }
  async function signIn(person, provider) {
    await check('radio', 'Mock ' + provider); await check('radio', person); await click('button', 'Підтвердити тестову особу');
    await visible('button', 'Вийти');
  }
  async function openPoll() {
    await click('link', 'Голосування');
    await until(async () => await p.locator('h1').innerText() === 'Голосування', 'Catalog navigation');
    await click('link', title);
    await p.waitForURL('http://localhost:5173/#/poll/' + pollId, { timeoutMs: 30000 });
    await until(async () => await p.locator('h1').innerText() === title, 'Question navigation');
  }
  async function participate(person, provider, answer) {
    await signOut(); await openPoll(); await click('link', 'Підтвердити право участі'); await signIn(person, provider);
    if (await p.getByRole('button', { name: 'Зашифрувати й остаточно надіслати', exact: true }).isEnabled()) throw new Error('FINAL_CONFIRMATION_MISSING');
    await check('radio', answer); await check('checkbox', 'Підтверджую остаточний вибір: «' + answer + '»');
    await click('button', 'Зашифрувати й остаточно надіслати');
  }
  const stages = {
    async create(assertions) {
      await state(); await signOut(); await click('link', 'Голосування'); await click('link', '+ Створити питання');
      await signIn('TEST-PERSON-0005', 'A'); await visible('heading', 'Створити питання');
      await fill('Формулювання питання', title);
      await click('button', 'Знайти схожі питання'); await visible('heading', 'Схожі питання'); assertions.push('Similar search returns visible outcomes without merging votes');
      await fill('Контекст', 'Синтетичне браузерне випробування повного сценарію. Жодне реальне рішення організації цим питанням не ухвалюється.');
      await fill('Можливі наслідки', 'У тестовому сценарії можна перевірити незмінність питання, приватне шифрування та публічний підсумок.');
      const supporting = p.getByRole('heading', { name: 'Аргументи за', exact: true });
      if (!await supporting.isVisible()) throw new Error('ARGUMENTS_NOT_VISIBLE');
      const fields = await p.getByLabel('Текст аргументу', { exact: true }).all();
      if (fields.length !== 2) throw new Error('EXPECTED_TWO_ARGUMENT_SIDES');
      await fields[0].fill('Оцінка тестового автора: відкритий код дозволяє дослідити виконані правила.'); await state();
      await fields[1].fill('Оцінка тестового автора: сама відкритість коду не гарантує його безпеку.'); await state();
      const sources = await p.getByLabel('HTTPS-посилання на джерело', { exact: true }).all();
      await sources[0].fill('https://www.gnu.org/licenses/agpl-3.0.html'); await state();
      await sources[1].fill('https://www.belenios.org/faq.html'); await state();
      await p.getByRole('combobox', { name: 'Категорія', exact: true }).selectOption('Технології'); await state();
      await fill('Публічний псевдонім автора', 'Браузерний тест');
      await fill('Відкриття (місцевий час)', localDate(new Date(Date.now() - 60000).toISOString()));
      await fill('Закриття (місцевий час)', localDate(run.closesAt));
      await click('button', 'Зберегти чернетку'); await visible('heading', title);
      pollId = (await tab.url()).split('#/poll/')[1];
      if (!/^[a-f0-9-]{36}$/.test(pollId)) throw new Error('CREATED_POLL_ID_MISSING');
      await writeFile(new URL('.runtime/e2e-polls.json', root), JSON.stringify([pollId]), { mode: 0o600 });
      await click('link', 'Редагувати чернетку'); await visible('heading', 'Редагувати чернетку');
      await fill('Можливі наслідки', 'Уточнені наслідки синтетичного сценарію: перевірити незмінність питання, клієнтське шифрування і підсумок.');
      await click('button', 'Зберегти чернетку'); await visible('heading', title);
      if (await p.getByText(/Версія 2/).count() !== 1) throw new Error('DRAFT_VERSION_NOT_INCREMENTED');
      await click('button', 'Надіслати на перевірку');
      await p.getByText('На перевірці', { exact: true }).waitFor({ state: 'visible' });
      assertions.push('Verified author creates required structured draft', 'Draft edit increments version before submission', 'Submission enters Review');
    },
    async reviewStart(assertions) {
      await signOut(); await click('link', 'Підтвердити участь'); await signIn('TEST-PERSON-0012', 'A');
      await click('link', 'Модерація');
      const form = p.locator('form').filter({ has: p.getByRole('link', { name: title, exact: true }) });
      if (await form.count() !== 1) throw new Error('REVIEW_CARD_NOT_UNIQUE');
      for (const label of ['Одна пропозиція без навідного формулювання', 'Без подвійного заперечення', 'Терміни зрозумілі', 'Умови й істотні наслідки явні', 'Факти відокремлені від оцінок']) { await form.getByLabel(label, { exact: true }).check(); await state(); }
      await form.getByLabel('Причина рішення', { exact: true }).fill('Синтетична пропозиція відповідає всім п’яти критеріям; твердження автора відокремлено від фактів.'); await state();
      await form.getByRole('button', { name: 'Зафіксувати рішення', exact: true }).click(); await state();
      assertions.push('Moderator completes rubric and submits a reasoned review');
    },
    async review(assertions) {
      await p.getByRole('status').filter({ hasText: 'Рішення зафіксовано.' }).waitFor({ state: 'visible', timeoutMs: 30000 });
      if (await p.getByRole('link', { name: title, exact: true }).count() !== 0) throw new Error('REVIEWED_POLL_STILL_QUEUED');
      await openPoll(); await p.getByText('Голосування відкрите', { exact: true }).waitFor({ state: 'visible' });
      if (await p.getByRole('link', { name: 'Редагувати чернетку', exact: true }).count() !== 0) throw new Error('OPEN_POLL_EDIT_VISIBLE');
      assertions.push('Moderator applies five-point rubric and reason', 'Real ceremony opens immutable poll', 'Draft editing is absent after review');
    },
    async voteOne(assertions) {
      await participate('TEST-PERSON-0005', 'A', 'Підтримую'); await visible('heading', 'Бюлетень прийнято');
      firstTracker = await p.locator('.receipt code').innerText();
      await fill('Tracker', firstTracker); await click('button', 'Перевірити включення');
      await p.getByRole('status').filter({ hasText: 'Бюлетень включено. Підпис квитанції перевірено.' }).waitFor({ state: 'visible' });
      assertions.push('Explicit final confirmation required', 'Original browser cryptography produces accepted ballot', 'Signed receipt and inclusion checked');
    },
    async voteTwo(assertions) { await participate('TEST-PERSON-0006', 'B', 'Не підтримую'); await visible('heading', 'Бюлетень прийнято'); assertions.push('Second synthetic person casts encrypted opposing vote through B'); },
    async voteThree(assertions) { await participate('TEST-PERSON-0007', 'A', 'Утримуюсь'); await visible('heading', 'Бюлетень прийнято'); assertions.push('Abstention is accepted as the third choice'); },
    async duplicate(assertions) {
      await participate('TEST-PERSON-0005', 'B', 'Не підтримую');
      await p.getByText('За цим правом участі вже прийнято остаточний голос.', { exact: true }).waitFor({ state: 'visible', timeoutMs: 30000 });
      assertions.push('Same person through another provider cannot change final vote');
    },
    async tallyStart(assertions) {
      if (Date.now() < Date.parse(run.closesAt)) throw new Error('FIXED_DEADLINE_NOT_REACHED; run this stage after ' + run.closesAt);
      await signOut(); await click('link', 'Підтвердити участь'); await signIn('TEST-PERSON-0012', 'A'); await openPoll();
      await click('button', 'Зафіксувати закриття');
      await visible('button', 'Запустити тестовий підрахунок');
      await click('button', 'Запустити тестовий підрахунок');
      assertions.push('Operator closes at the fixed deadline and requests threshold tally');
    },
    async publish(assertions) {
      await visible('heading', 'Результат серед 3 учасників цього голосування');
      const counts = await p.locator('.result-row span').allTextContents({ timeoutMs: 10000 });
      if (JSON.stringify(counts) !== JSON.stringify(['1 · 33,3%', '1 · 33,3%', '1 · 33,3%'])) throw new Error('VISIBLE_RESULT_NOT_1_1_1');
      assertions.push('Fixed close enforced without deadline extension', 'Separate test trustees tally the browser ciphertexts', 'Published exact 1/1/1 counts and N=3 include abstention');
    },
    async exports(assertions) {
      const result = await exported('Результат JSON', 'result-');
      if (result.question !== title || result.version !== 2 || result.acceptedVotes !== 3 || JSON.stringify(result.counts) !== '[1,1,1]' || !result.selfSelected || result.state !== 'Published' || result.closesAt !== run.closesAt) throw new Error('DOWNLOADED_RESULT_CONTRACT_MISMATCH');
      const audit = await exported('Аудит-пакет', 'audit-');
      if (JSON.stringify(audit.result) !== JSON.stringify(result) || JSON.parse(audit.electionRaw).uuid !== result.pollId || audit.checkpoints.length !== 3) throw new Error('DOWNLOADED_AUDIT_MISMATCH');
      await mkdir(new URL('artifacts/e2e', root), { recursive: true });
      await writeFile(new URL('artifacts/e2e/election.bel', root), Buffer.from(audit.archive, 'base64'));
      await writeFile(new URL('artifacts/e2e/result.json', root), JSON.stringify(result, null, 2) + '\n');
      await fill('Tracker', firstTracker); await click('button', 'Перевірити включення');
      await p.getByRole('status').filter({ hasText: 'Бюлетень включено. Підпис квитанції перевірено.' }).waitFor({ state: 'visible' });
      if (!(await p.getByText('Добровільна участь із самовідбором.', { exact: false }).count() >= 1)) throw new Error('SELF_SELECTION_WARNING_MISSING');
      assertions.push('New JSON and audit files downloaded by the browser match the displayed result and fixed deadline', 'Native archive extracted unchanged from the downloaded audit for offline verification', 'Tracker still included after publication', 'Self-selection and representativeness warning stays visible');
    },
  };
  return {
    runId: run.runId, closesAt: run.closesAt, title,
    async step(name) {
      if (!(name in stages)) throw new Error('UNKNOWN_E2E_STAGE');
      const assertions = [];
      try {
        await stages[name](assertions);
        const response = await fetch(run.endpoint + '/event', { method: 'POST', headers: { authorization: 'Bearer ' + run.token }, body: JSON.stringify({ step: name, status: 'Passed', assertions }) });
        if (!response.ok) throw new Error('E2E_REPORT_REJECTED');
        return { step: name, status: 'Passed', assertions, pollId };
      } catch (error) {
        await fetch(run.endpoint + '/event', { method: 'POST', headers: { authorization: 'Bearer ' + run.token }, body: JSON.stringify({ step: name, status: 'Failed', assertions: [...assertions, 'Stage did not complete'], error: error instanceof Error ? error.message : String(error) }) });
        throw error;
      }
    },
  };
}
