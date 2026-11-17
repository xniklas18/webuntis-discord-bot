import { Lesson, WebUntis } from 'webuntis';
import dotenv from 'dotenv';
dotenv.config();
import { AttachmentBuilder, EmbedBuilder, TextChannel, Client } from 'discord.js';
import { diff, Diff } from 'deep-diff';

import {
  mergeLessons,
  untisTimeToTimeString,
  subjectName,
  teacherName,
  untisDateToDate,
} from './utils/untis';
import { discordTimestamp } from './utils/discord';
import { findCourseParticipants, isEigenverantwortlichesArbeiten } from './participants';
import { getLinkedAccount } from './userStore';
import { NotifyPayload, startUserManagementWeb } from './web';

// Environment variables
const SCHOOL = process.env.WEBUNTIS_SCHOOL || '';
const USERNAME = process.env.WEBUNTIS_USERNAME || '';
const PASSWORD = process.env.WEBUNTIS_PASSWORD || '';
const BASEURL = process.env.WEBUNTIS_BASEURL || '';
const TOKEN = process.env.CLIENT_TOKEN || '';

// WebUntis client
const untis = new WebUntis(SCHOOL, USERNAME, PASSWORD, BASEURL);

// Discord client
const client = new Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent'],
});

client.once('ready', () => {
  console.log('Discord ready!');
});

// State for change detection
let previousState: Lesson[] | null = null;

/**
 * Watches for timetable changes and sends Discord notifications.
 * @param untisClient WebUntis client instance
 * @param discordClient Discord client instance
 * @param interval Polling interval in ms
 */
export async function watchForChanges(
  untisClient = untis,
  discordClient = client,
  interval = 30 * 1000
) {
  await untisClient.login();

  const intervalId = setInterval(async () => {
    // Validate session
    if (await untisClient.validateSession()) {
      console.log('Still valid session');
    } else {
      console.error('Session invalid');
      await untisClient.login();
    }

    // Calculate week range
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() - today.getDay() + 7);

    // Get current timetable state
    const currentState = mergeLessons(
      await untisClient.getOwnClassTimetableForRange(startOfWeek, endOfWeek)
    );

    // Detect changes (the first poll only records the state)
    const differences = previousState === null ? undefined : diff(previousState, currentState);

    if (differences) {
      console.log('Changes detected:', differences.length);

      // Changed lessons, one entry per lesson
      const changed = new Map<string, { details: string; lesson: Lesson }>();
      differences.forEach((change: Diff<Lesson[] | null, Lesson[]>) => {
        if (!['E', 'N', 'A'].includes(change.kind)) return;
        const lessonIndex =
          change.kind === 'A'
            ? (change as { kind: 'A'; index: number }).index
            : (change.path?.[0] as number | undefined);
        if (lessonIndex === undefined) return;

        const lesson = currentState[lessonIndex];
        if (!lesson?.te?.[0]?.orgname || !lesson.te[0].orgid) return;
        const key = `${lesson.su[0].id}-${lesson.te[0].orgid}-${lesson.date}-${lesson.startTime}-${lesson.endTime}`;
        if (changed.has(key)) return;
        changed.set(key, {
          lesson,
          details:
            `**${subjectName(lesson.su[0].name)}** • ${teacherName(lesson.te[0].orgid, true)}\n` +
            `📆 ${discordTimestamp(untisDateToDate(lesson.date), 'long date')} ` +
            `⏰ ${untisTimeToTimeString(lesson.startTime)} - ${untisTimeToTimeString(lesson.endTime)}\n` +
            `💬 ${lesson.substText || 'Änderung im Stundenplan'}`,
        });
      });

      const channel = discordClient.channels.cache.get(process.env.CHANNEL_ID || '') as TextChannel | undefined;
      if (channel && changed.size) {
        // Only changes that affect at least one linked user are reported; only
        // "Eigenverantwortliches Arbeiten" mentions them.
        const usersByLesson = await findCourseParticipants(
          [...changed.entries()].map(([key, change]) => ({ key, lesson: change.lesson })),
          startOfWeek,
          endOfWeek
        );
        const relevant = [...changed.entries()].filter(([key]) => (usersByLesson.get(key) || []).length > 0);
        const mentionIds = [
          ...new Set(
            relevant
              .filter(([, change]) => isEigenverantwortlichesArbeiten(change.lesson))
              .flatMap(([key]) => usersByLesson.get(key) || [])
          ),
        ].slice(0, 100);
        const mentionAllowlist = new Set(mentionIds);

        const descriptions = relevant.map(([key, change]) => {
          const users = isEigenverantwortlichesArbeiten(change.lesson)
            ? (usersByLesson.get(key) || []).filter((id) => mentionAllowlist.has(id))
            : [];
          return change.details + (users.length ? `\n\n👥 ${users.map((id) => `<@${id}>`).join(' ')}` : '');
        });

        if (descriptions.length) {
          const embed = new EmbedBuilder()
            .setTitle('📅 Stundenplanänderung')
            .setDescription(descriptions.join('\n\n').slice(0, 4000))
            .setTimestamp()
            .setColor('#9b59b6') // Purple
            .setFooter({ text: 'WebUntis • Stundenplan-Bot' })
            .setAuthor({
              name: 'Neue Änderung erkannt',
              iconURL: 'https://cdn-icons-png.flaticon.com/512/1828/1828490.png', // Bell icon
            });

          await channel.send({ embeds: [embed], allowedMentions: { parse: [], users: mentionIds } });
        }
      }

      previousState = currentState;
    } else {
      if (previousState === null) previousState = currentState;
      console.log('No changes detected');
    }
  }, interval);

  return intervalId;
}

/**
 * Sends a notification from the Schulassistent website as a direct message.
 * With payload.userId it goes to that user (only if linked), otherwise to NOTIFY_USER_ID.
 */
async function sendOwnerNotification(payload: NotifyPayload): Promise<void> {
  const userId = payload.userId || process.env.NOTIFY_USER_ID;
  if (!userId) throw new Error('Kein Empfänger');
  if (payload.userId && !(await getLinkedAccount(payload.userId))) throw new Error('Empfänger nicht verbunden');
  const user = await client.users.fetch(userId);
  const embed = new EmbedBuilder()
    .setTitle(payload.title)
    .setDescription(payload.text)
    .setColor('#5865f2')
    .setTimestamp();
  if (payload.link) embed.setURL(payload.link);
  await user.send({
    embeds: [embed],
    files: payload.pdf
      ? [new AttachmentBuilder(payload.pdf, { name: payload.filename || 'datei.pdf' })]
      : [],
    allowedMentions: { parse: [] },
  });
}

/**
 * Resets the previous state for change detection.
 */
export function resetPreviousState() {
  previousState = null;
}

// Run bot if executed directly
if (require.main === module) {
  client.login(TOKEN);
  void startUserManagementWeb(sendOwnerNotification);
  watchForChanges().catch(() => console.error('WebUntis-Überwachung konnte nicht gestartet werden.'));
}
