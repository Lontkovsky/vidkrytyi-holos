import { z } from 'zod';
import { Envelope, Receipt } from '../../../packages/domain/src/index.ts';
declare global {
  interface Window {
    belenios: {
      checkCredential(params: unknown, credential: string, callbacks: { success(election: unknown): void; failure(code: string, detail: unknown): void }): void;
      encryptBallot(election: unknown, plaintext: number[][], callbacks: { success(ballot: string, tracker: string): void; failure(error: string): void }): void;
    };
  }
}
export async function hash(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function encrypt(electionRaw: string, credential: string, choice: number) {
  if (window.belenios === undefined) throw new Error('Криптографічний клієнт не завантажено. Голос не надіслано.');
  const election = await new Promise<unknown>((resolve, reject) => window.belenios.checkCredential(JSON.parse(electionRaw), credential,
    { success: resolve, failure: () => reject(new Error('Право участі не пройшло перевірку Belenios.')) }));
  return new Promise<{ ballot: string; tracker: string }>((resolve, reject) => window.belenios.encryptBallot(election,
    [[choice === 0 ? 1 : 0, choice === 1 ? 1 : 0, choice === 2 ? 1 : 0]],
    { success: (ballot, tracker) => resolve({ ballot, tracker }), failure: () => reject(new Error('Шифрування не завершено. Голос не надіслано.')) }));
}
export async function verifyReceipt(value: unknown, publicKey: string, pollId: string, manifestHash: string, expectedTracker?: string) {
  const signed = Envelope.parse(value);
  const der = publicKey.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(der), c => c.charCodeAt(0)), { name: 'Ed25519' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, Uint8Array.from(atob(signed.signature), c => c.charCodeAt(0)), new TextEncoder().encode(signed.payload));
  if (!valid) throw new Error('Підпис квитанції недійсний.');
  const receipt = Receipt.parse(JSON.parse(signed.payload));
  if (receipt.pollId !== pollId || receipt.manifestHash !== manifestHash || (expectedTracker !== undefined && receipt.tracker !== expectedTracker)) throw new Error('Квитанція належить іншому бюлетеню або питанню.');
  return receipt;
}
export const ElectionInfo = z.strictObject({ electionRaw: z.string(), manifestHash: z.string(), environment: z.string(), state: z.string(), checkpointPublicKey: z.string() });
