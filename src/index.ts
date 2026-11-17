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
import { discordTimestamp, getMentionsForLesson } from './utils/discord';
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

    // Detect changes
    const differences = diff(previousState, currentState);

    if (differences) {
      console.log('Changes detected:', differences);

      // Map to store formatted change descriptions
      const changesMap: { [key: string]: string } = {};

      differences.forEach((change: Diff<Lesson[] | null, Lesson[]>) => {
        if (['E', 'N', 'A'].includes(change.kind)) {
          let lessonIndex: number | undefined;

          // Array change
          if (change.kind === 'A') {
            lessonIndex = (change as { kind: 'A'; index: number }).index;
          } else {
            // Edit/new change
            const path = change.path ?? [];
            if (path.length > 0) lessonIndex = path[0] as number;
          }

          if (lessonIndex !== undefined) {
            const lesson = currentState[lessonIndex];
            if (lesson && lesson.te && lesson.te[0] && lesson.te[0].orgname && lesson.te[0].orgid) {
              const lessonKey = `${lesson.su[0].id}-${lesson.te[0].orgid}-${lesson.date}-${lesson.startTime}-${lesson.endTime}`;
              if (!changesMap[lessonKey]) {
                const mentions: string[] = getMentionsForLesson(lesson);
                const mentionsString = Array.isArray(mentions)
                  ? mentions.join(' ')
                  : String(mentions);
                if (mentionsString && mentionsString.trim().length > 0) {
                  changesMap[lessonKey] =
                    `**${subjectName(lesson.su[0].name)}** • ${teacherName(lesson.te[0].orgid, true)}\n` +
                    `📆 ${discordTimestamp(untisDateToDate(lesson.date), 'long date')} ` +
                    `⏰ ${untisTimeToTimeString(lesson.startTime)} - ${untisTimeToTimeString(lesson.endTime)}\n` +
                    `💬 ${lesson.substText}\n\n👥 ${mentionsString}`;
                }
              }
            }
          }
        }
      });

      const changesDescription = Object.values(changesMap).join('\n\n');

      // Send notification if there are changes
      if (changesDescription) {
        const channelId = process.env.CHANNEL_ID || '';
        const channel = discordClient.channels.cache.get(channelId) as TextChannel;
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle('📅 Stundenplanänderung')
            .setDescription(changesDescription)
            .setTimestamp()
            .setColor('#9b59b6') // Purple
            .setFooter({ text: 'WebUntis • Stundenplan-Bot' })
            .setAuthor({
              name: 'Neue Änderung erkannt',
              iconURL: 'https://cdn-icons-png.flaticon.com/512/1828/1828490.png', // Bell icon
            });

          channel.send({ embeds: [embed] });
        }
      }

      previousState = currentState;
    } else {
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
