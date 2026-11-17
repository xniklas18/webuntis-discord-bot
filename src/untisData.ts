import { Lesson, WebUntis } from 'webuntis';
import { LinkedAccount, decryptPassword } from './userStore';
import { subjectName } from './utils/untis';

/** Runs fn with a logged-in WebUntis session of the linked account and always logs out. */
export async function withUntis<T>(account: LinkedAccount, fn: (untis: WebUntis) => Promise<T>): Promise<T> {
  const untis = new WebUntis(account.school, account.username, decryptPassword(account.encryptedPassword), account.baseUrl);
  await untis.login();
  try {
    return await fn(untis);
  } finally {
    await untis.logout().catch(() => undefined);
  }
}

// --- Dates (the container runs in Europe/Berlin, see compose.yaml) ---
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86400000);
/** WebUntis day number, e.g. 20261118 */
export const dayNumber = (d: Date = new Date()): number => Number(ymd.format(d).replaceAll('-', ''));
export const berlinTime = (d: Date = new Date()): string => hm.format(d);
export const timeString = (t: number): string => `${String(Math.floor(t / 100)).padStart(2, '0')}:${String(t % 100).padStart(2, '0')}`;

export function dayLabel(n: number): string {
  const s = String(n);
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short' }).format(d);
  return `${wd}, ${s.slice(6, 8)}.${s.slice(4, 6)}.`;
}

// --- Timetable ---
export async function getLessons(untis: WebUntis, from: Date, to: Date): Promise<Lesson[]> {
  const lessons = await untis.getOwnTimetableForRange(from, to);
  return lessons.sort((a, b) => a.date - b.date || a.startTime - b.startTime);
}

/** First day after `after` (a day number) with a lesson that does not take place as cancelled. */
export function nextSchoolDay(lessons: Lesson[], after: number): number | undefined {
  return lessons.find((l) => l.date > after && l.code !== 'cancelled')?.date;
}

// Klausuren: WebUntis marks them in the timetable (lstype "ex") or in the activity text.
// ponytail: heuristic, there is no student-facing exam endpoint; refine if a school marks them differently.
export function isExam(l: Lesson): boolean {
  const raw = l as unknown as { lstype?: string };
  return raw.lstype === 'ex' || /klausur|klassenarbeit/i.test(`${l.activityType || ''} ${l.lstext || ''} ${l.info || ''}`);
}

// --- Homework ---
export interface Hw { id: number; subject: string; text: string; due: number }

export async function getHomework(untis: WebUntis, from: Date, to: Date): Promise<Hw[]> {
  const raw = (await untis.getHomeWorksFor(from, to, false)) as unknown as
    | { homeworks?: Array<{ id: number; lessonId: number; text: string; dueDate: number }>; lessons?: Array<{ id: number; subject?: string }> }
    | Array<{ id: number; lessonId: number; text: string; dueDate: number }>;
  const homeworks = Array.isArray(raw) ? raw : raw.homeworks ?? [];
  const lessons = new Map((Array.isArray(raw) ? [] : raw.lessons ?? []).map((l) => [l.id, l]));
  return homeworks
    .map((h) => ({
      id: h.id,
      subject: subjectName(lessons.get(h.lessonId)?.subject || 'Sonstiges'),
      text: (h.text || '').replace(/\s+/g, ' ').trim(),
      due: h.dueDate,
    }))
    .filter((h) => h.text)
    .sort((a, b) => a.due - b.due || a.subject.localeCompare(b.subject, 'de'));
}

/** Homework due from today on that the user has not ticked off. */
export async function getOpenHomework(untis: WebUntis, done: Set<number>): Promise<Hw[]> {
  const today = new Date();
  const all = await getHomework(untis, addDays(today, -28), addDays(today, 28));
  const t = dayNumber(today);
  return all.filter((h) => h.due >= t && !done.has(h.id));
}

// --- Absences ---
export interface Absence { id: number; date: number; minutes: number; excused: boolean; late: boolean }

export async function getAbsences(untis: WebUntis): Promise<Absence[]> {
  const now = new Date();
  const start = new Date(now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1, 7, 1);
  const data = await untis.getAbsentLesson(start, now, -1, false);
  const mins = (t: number) => Math.floor(t / 100) * 60 + (t % 100);
  return ((data as unknown as { absences?: Array<Record<string, unknown>> }).absences ?? []).map((a) => ({
    id: Number(a.id),
    date: Number(a.startDate),
    minutes: a.startDate === a.endDate ? Math.max(0, mins(Number(a.endTime)) - mins(Number(a.startTime))) : 0,
    excused: !!a.isExcused,
    late: /versp[äa]t/i.test(`${a.reason || ''} ${a.text || ''}`),
  }));
}
