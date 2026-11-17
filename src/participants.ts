import { Lesson, WebUntis } from 'webuntis';
import { decryptPassword, listLinkedAccounts } from './userStore';
import { displayName } from './utils/untis';

type Entity = { id?: number; orgid?: number; name?: string; longname?: string; orgname?: string };

export function isEigenverantwortlichesArbeiten(lesson: Lesson): boolean {
  return /eigenverantwortliches\s+arbeiten/i.test(lesson.substText || '');
}

function minutes(time: number): number {
  return Math.floor(time / 100) * 60 + (time % 100);
}

function sameEntity(left?: Entity, right?: Entity): boolean {
  if (!left || !right) return false;
  const leftId = left.orgid ?? left.id;
  const rightId = right.orgid ?? right.id;
  if (leftId !== undefined && rightId !== undefined) return leftId === rightId;
  return (
    displayName(left).trim().toLocaleLowerCase('de-DE') ===
    displayName(right).trim().toLocaleLowerCase('de-DE')
  );
}

/** True if the lesson from a user's own timetable is the changed lesson (same event, or same subject and teacher at an overlapping time). */
export function belongsToCourse(accountLesson: Lesson, changedLesson: Lesson): boolean {
  if (accountLesson.date !== changedLesson.date) return false;
  if (String(accountLesson.id) === String(changedLesson.id)) return true;

  const overlaps =
    minutes(accountLesson.startTime) < minutes(changedLesson.endTime) &&
    minutes(accountLesson.endTime) > minutes(changedLesson.startTime);
  if (!overlaps || !sameEntity(accountLesson.su?.[0], changedLesson.su?.[0])) return false;

  const accountTeacher = accountLesson.te?.[0];
  const changedTeacher = changedLesson.te?.[0];
  if (accountTeacher && changedTeacher) return sameEntity(accountTeacher, changedTeacher);
  return false;
}

/**
 * Finds, for each changed lesson, the Discord users who linked a WebUntis account
 * (same school as the notification account) whose own timetable contains that lesson.
 */
export async function findCourseParticipants(
  lessons: Array<{ key: string; lesson: Lesson }>,
  start: Date,
  end: Date
): Promise<Map<string, string[]>> {
  const participants = new Map<string, string[]>();
  for (const { key } of lessons) participants.set(key, []);

  const school = (process.env.WEBUNTIS_SCHOOL || '').trim().toLocaleLowerCase('de-DE');
  const host = (process.env.WEBUNTIS_BASEURL || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/:443$/, '')
    .toLocaleLowerCase('de-DE');

  for (const account of await listLinkedAccounts()) {
    if (
      account.school.trim().toLocaleLowerCase('de-DE') !== school ||
      account.baseUrl.trim().toLocaleLowerCase('de-DE') !== host
    ) {
      continue;
    }
    try {
      const userUntis = new WebUntis(
        account.school,
        account.username,
        decryptPassword(account.encryptedPassword),
        account.baseUrl
      );
      await userUntis.login();
      const userLessons = await userUntis.getOwnTimetableForRange(start, end);
      for (const { key, lesson } of lessons) {
        if (userLessons.some((entry) => belongsToCourse(entry, lesson))) {
          participants.get(key)?.push(account.discordUserId);
        }
      }
    } catch {
      // Skip this account rather than risk mentioning the wrong person.
      console.warn('Ein verknüpftes WebUntis-Konto konnte nicht auf Kursteilnahme geprüft werden.');
    }
  }
  return participants;
}
