import { Answers, ResultContract, percentage, policyText } from './index.ts';
import type { ResultType } from './index.ts';

export function resultCsv(result: ResultType): string {
  const fields = Object.entries(ResultContract.parse(result));
  const cell = (text: string) => '"' + text.replaceAll('"', '""') + '"';
  return 'field,json_value\r\n' + fields.map(([key, value]) => cell(key) + ',' + cell(JSON.stringify(value))).join('\r\n') + '\r\n';
}

function xml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;');
}

// Fixed monospace columns; non-Latin/Cyrillic characters reserve two columns.
// Splitting changes visual line placement only. Metadata keeps the exact contract.
function lines(text: string, columns: number): string[] {
  const output: string[] = [];
  let line = '', width = 0;
  const characterWidth = (character: string) => /^[\u0020-\u052F]$/u.test(character) ? 1 : 2;
  for (const character of text) {
    const size = characterWidth(character);
    if (character === '\n' || character === '\r') { output.push(line); line = ''; width = 0; continue; }
    if (width + size > columns) {
      const space = line.lastIndexOf(' ');
      const end = space < 0 ? line.length : space + 1;
      output.push(line.slice(0, end)); line = line.slice(end);
      width = Array.from(line).reduce((sum, value) => sum + characterWidth(value), 0);
    }
    line += character; width += size;
  }
  output.push(line);
  return output;
}

export function resultSvg(input: ResultType): string {
  const result = ResultContract.parse(input), elements: string[] = [];
  let y = 66;
  function paragraph(text: string, size = 22, weight = 400, color = '#202c32') {
    const rows = lines(text, Math.floor(920 / (size * 0.65)));
    elements.push(`<text fill="${color}" font-size="${size}" font-weight="${weight}" xml:space="preserve">${rows.map(row => {
      y += size * 1.45;
      return `<tspan x="64" y="${y}">${xml(row)}</tspan>`;
    }).join('')}</text>`);
    y += 16;
  }
  paragraph('ВІДКРИТИЙ ГОЛОС · ТЕСТОВІ ДАНІ', 20, 700, '#28583e');
  paragraph(result.question, 30, 700);
  paragraph(`Версія ${result.version} · ${result.pollId}`, 20);
  paragraph(`N = ${result.acceptedVotes} учасників цього голосування`, 28, 700);
  for (const [index, count] of result.counts.entries()) paragraph(`${Answers[index]}: ${count} · ${percentage(count, result.acceptedVotes)}%`, 26, 700);
  paragraph('Усі три відповіді входять у N. Округлення до 0,1%; сума відсотків може відрізнятися від 100%.', 20);
  paragraph('Правила участі: ' + policyText(result.policy));
  paragraph(`Політика ${result.policy.id} · версія ${result.policy.version}`, 20);
  paragraph('Відкриття (UTC): ' + result.opensAt, 20);
  paragraph('Закриття (UTC): ' + result.closesAt, 20);
  paragraph('Результат опубліковано (Published). Підрахунок перевірено Belenios 3.3.0 (ReferenceVerified). Це не зовнішній аудит.', 20);
  paragraph(result.representativenessWarning, 22, 700, '#28583e');
  paragraph('Картка не замінює незалежну перевірку аудит-пакета. Сторонні копії та скриншоти можуть бути змінені.', 20);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${Math.ceil(y + 48)}" viewBox="0 0 1080 ${Math.ceil(y + 48)}" role="img" aria-labelledby="title description"><title id="title">${xml(result.question)}</title><desc id="description">${xml(`Результат серед ${result.acceptedVotes} учасників. ` + result.representativenessWarning)}</desc><metadata id="result-contract">${xml(JSON.stringify(result))}</metadata><rect width="100%" height="100%" fill="#f4f7f3"/><rect x="0" y="0" width="12" height="100%" fill="#28583e"/><g font-family="monospace">${elements.join('')}</g></svg>`;
}
