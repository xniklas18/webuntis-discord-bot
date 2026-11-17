import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Prefs {
  morning?: boolean;
  reminder?: boolean;
}

export interface LinkedAccount {
  discordUserId: string;
  school: string;
  baseUrl: string;
  username: string;
  encryptedPassword: { iv: string; tag: string; data: string };
  connectedAt: string;
  completedHomeworkIds?: number[];
  courseModes?: Record<string, 'oral' | 'written'>;
  /** DM switches, both off by default */
  prefs?: Prefs;
}

const dataFile = process.env.USER_DATA_FILE || '/app/data/users.json';
let writeChain: Promise<void> = Promise.resolve();

function encryptionKey(): Buffer {
  const value = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured');
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY must encode exactly 32 bytes');
  return key;
}

async function readAccounts(): Promise<LinkedAccount[]> {
  try {
    const content = await readFile(dataFile, 'utf8');
    const accounts = JSON.parse(content) as LinkedAccount[];
    return Array.isArray(accounts) ? accounts : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAccounts(accounts: LinkedAccount[]): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true, mode: 0o700 });
  const temporary = `${dataFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(accounts), { encoding: 'utf8', mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, dataFile);
  await chmod(dataFile, 0o600);
}

export function encryptPassword(password: string): LinkedAccount['encryptedPassword'] {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptPassword(encrypted: LinkedAccount['encryptedPassword']): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(encrypted.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function getLinkedAccount(discordUserId: string): Promise<LinkedAccount | undefined> {
  return (await readAccounts()).find((account) => account.discordUserId === discordUserId);
}

export async function listLinkedAccounts(): Promise<LinkedAccount[]> {
  return readAccounts();
}

export async function saveLinkedAccount(account: LinkedAccount): Promise<void> {
  const operation = writeChain.then(async () => {
    const accounts = await readAccounts();
    const index = accounts.findIndex((entry) => entry.discordUserId === account.discordUserId);
    if (index >= 0) accounts[index] = { ...accounts[index], ...account, courseModes: accounts[index].courseModes };
    else accounts.push(account);
    await writeAccounts(accounts);
  });
  writeChain = operation.catch(() => undefined);
  await operation;
}

export async function getCompletedHomeworkIds(discordUserId: string): Promise<Set<number>> {
  const account = await getLinkedAccount(discordUserId);
  return new Set(account?.completedHomeworkIds || []);
}

export async function setHomeworkCompleted(
  discordUserId: string,
  homeworkId: number,
  completed: boolean
): Promise<void> {
  const operation = writeChain.then(async () => {
    const accounts = await readAccounts();
    const account = accounts.find((entry) => entry.discordUserId === discordUserId);
    if (!account) throw new Error('Linked account not found');
    const completedIds = new Set(account.completedHomeworkIds || []);
    if (completed) completedIds.add(homeworkId);
    else completedIds.delete(homeworkId);
    account.completedHomeworkIds = [...completedIds];
    await writeAccounts(accounts);
  });
  writeChain = operation.catch(() => undefined);
  await operation;
}

export async function removeLinkedAccount(discordUserId: string): Promise<void> {
  const operation = writeChain.then(async () => {
    const accounts = (await readAccounts()).filter((entry) => entry.discordUserId !== discordUserId);
    await writeAccounts(accounts);
  });
  writeChain = operation.catch(() => undefined);
  await operation;
}

export async function setPrefs(discordUserId: string, prefs: Prefs): Promise<void> {
  const operation = writeChain.then(async () => {
    const accounts = await readAccounts();
    const account = accounts.find((entry) => entry.discordUserId === discordUserId);
    if (!account) throw new Error('Linked account not found');
    account.prefs = { ...account.prefs, ...prefs };
    await writeAccounts(accounts);
  });
  writeChain = operation.catch(() => undefined);
  await operation;
}
