import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import { Content, ResultContract, representativenessWarning } from '../packages/domain/src/index.ts';
import { resultCsv, resultSvg } from '../packages/domain/src/result-exports.ts';

const result = ResultContract.parse({ apiVersion: 'v1', question: 'Чи підтримуєте точний публічний підрахунок?', version: 2, pollId: 'ABCDEFGHIJKLMN',
  policy: { id: 'verified-rnokpp-owner', version: 1, minimumAge: 18, citizenship: 'UA' }, acceptedVotes: 3, counts: [1, 1, 1],
  opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-09-02T00:00:00.000Z', state: 'Published', verification: 'ReferenceVerified', selfSelected: true, representativenessWarning });
function parse(format: 'csv' | 'svg', text: string): unknown {
  return JSON.parse(execFileSync('python3', ['tests/support/read-exports.py'], { input: JSON.stringify({ format, text }), encoding: 'utf8' }));
}

describe('one public result contract', () => {
  it('rejects inconsistent totals, missing methodology, invalid question text and deadlines', () => {
    for (const change of [{ acceptedVotes: 2 }, { version: 0 }, { counts: [2, 1] }, { selfSelected: false }, { representativenessWarning: '' },
      { closesAt: result.opensAt }, { question: 'Питання з нулем\u0000' }, { question: 'Питання з lone surrogate \ud800' }]) {
      expect(ResultContract.safeParse({ ...result, ...change }).success).toBe(false);
    }
    expect(Content.shape.question.safeParse('Питання з нулем\u0000').success).toBe(false);
  });

  it('round-trips CSV without changing text, policy, numbers or types', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('ї', ' ', '"', ',', '\n', '\r', '\t', '&', '<', '>', '=', '+', '@', '-', '🙂', '漢'), { minLength: 12, maxLength: 100 }), characters => {
      const expected = ResultContract.parse({ ...result, question: characters.join('') });
      const csv = resultCsv(expected);
      const decoded = z.object({ contract: ResultContract, cells: z.array(z.string()) }).parse(parse('csv', csv));
      expect(decoded.contract).toEqual(expected);
      expect(decoded.cells.some(cell => /^[=+\-@\t\r\n＝＋－＠]/u.test(cell))).toBe(false);
      expect(csv.endsWith('\r\n')).toBe(true);
    }), { seed: 20260906, numRuns: 100 });
  });

  it('keeps malicious formula text literal within the declared JSON-valued CSV cell', () => {
    const question = '=HYPERLINK("https://example.invalid/","Тест"),\r\n";=1+1';
    const decoded = z.object({ contract: ResultContract, cells: z.array(z.string()) }).parse(parse('csv', resultCsv({ ...result, question })));
    expect(decoded.contract.question).toBe(question);
    expect(decoded.cells[1]).toBe(JSON.stringify(question));
    expect(decoded.cells[1]?.startsWith('"=')).toBe(true);
  });

  it('escapes SVG text and embeds the exact contract without scripts, events or external resources', () => {
    const question = 'Чи підтримуєте <script>alert("тест")</script> & "джерела"?\r\n🙂';
    const expected = { ...result, question };
    const decoded = z.object({ contract: ResultContract, title: z.string(), text: z.string(), tags: z.array(z.string()), attributes: z.array(z.string()) }).parse(parse('svg', resultSvg(expected)));
    expect(decoded.contract).toEqual(expected);
    expect(decoded.title).toBe(question);
    expect(decoded.tags.every(tag => ['svg', 'title', 'desc', 'metadata', 'rect', 'g', 'text', 'tspan'].some(allowed => tag === '{http://www.w3.org/2000/svg}' + allowed))).toBe(true);
    expect(decoded.attributes.some(key => /^(on|href|src)/.test(key))).toBe(false);
    for (const text of ['N = 3', 'Підтримую: 1 · 33,3%', 'Не підтримую: 1 · 33,3%', 'Утримуюсь: 1 · 33,3%', 'Published', 'ReferenceVerified', result.opensAt, result.closesAt]) expect(decoded.text).toContain(text);
  });

  it('renders zero and unanimous totals without losing N or abstentions', () => {
    for (const counts of [[0, 0, 0], [12, 0, 0], [0, 0, 12]]) {
      const expected = ResultContract.parse({ ...result, counts, acceptedVotes: counts.reduce((sum, count) => sum + count, 0) });
      const svg = z.object({ contract: ResultContract, text: z.string() }).parse(parse('svg', resultSvg(expected)));
      expect(svg.contract).toEqual(expected);
      expect(svg.text).toContain('N = ' + expected.acceptedVotes);
      expect(svg.text).toContain('Утримуюсь: ' + counts[2]);
      expect(svg.text).not.toMatch(/NaN|Infinity/);
      expect(svg.text).toContain(expected.acceptedVotes === 0 ? '0,0%' : '100,0%');
      expect(z.object({ contract: ResultContract }).parse(parse('csv', resultCsv(expected))).contract).toEqual(expected);
    }
  });
});
