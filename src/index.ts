import { Lesson, WebUntis } from 'webuntis'
import 'dotenv/config'
const fs = require('fs');
import { EmbedBuilder, TextChannel } from 'discord.js';
import { Client } from 'discord.js';
import { diff, Diff } from 'deep-diff';

import { mergeLessons, untisDateToDateString, untisTimeToTimeString, subjectName, teacherName, untisDateToDate } from './utils/untis';
import { discordTimestamp, getMentionsForLesson } from './utils/discord';

const SCHOOL = process.env.WEBUNTIS_SCHOOL || '';
const USERNAME = process.env.WEBUNTIS_USERNAME || '';
const PASSWORD = process.env.WEBUNTIS_PASSWORD || '';
const BASEURL = process.env.WEBUNTIS_BASEURL || '';

const TOKEN = process.env.CLIENT_TOKEN || '';

const untis = new WebUntis(
  SCHOOL,
  USERNAME,
  PASSWORD,
  BASEURL
);

const client = new Client({
  intents: ["Guilds", "GuildMembers", "GuildMessages", "MessageContent"],
});

client.once('ready', () => {
  console.log('Discord ready!');
});

let previousState: any = null;

export async function watchForChanges(untisClient = untis, discordClient = client, interval = 30 * 1000) {
  await untisClient.login();

  const intervalId = setInterval(async () => {
    if (await untisClient.validateSession()) {
      console.log('Still valid session');
    } else {
      console.error('Session invalid');
      await untisClient.login();
    }

    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 1));
    const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 7));
    const currentState = mergeLessons(await untisClient.getOwnClassTimetableForRange(startOfWeek, endOfWeek)); // * For production
    // const currentState = JSON.parse(fs.readFileSync('timetable_changing.json', 'utf8')); // * For testing
    // previousState = JSON.parse(fs.readFileSync('timetable_static.json', 'utf8')); // * For testing

    const differences = diff(previousState, currentState);

    if (differences) {
      console.log('Changes detected:', differences);

      const changesMap: { [key: string]: string } = {};

      differences.forEach((change: Diff<any, any>) => {
        if (change.kind === 'E' || change.kind === 'N' || change.kind === 'A') {
          let lessonIndex: number | undefined;

          // Handle array changes
          if (change.kind === 'A') {
            lessonIndex = (change as any).index;
          } else {
            // Handle edit/new changes
            const path = change.path ?? [];
            if (path.length > 0) {
              lessonIndex = path[0];
            }
          }

          if (lessonIndex !== undefined) {
            const lesson = currentState[lessonIndex];
            if (lesson && lesson.te && lesson.te[0] && lesson.te[0].orgname && lesson.te[0].orgid) {
              const lessonKey = `${lesson.su[0].id}-${lesson.te[0].orgid}-${lesson.date}-${lesson.startTime}-${lesson.endTime}`;
              if (!changesMap[lessonKey]) {

                const mentions: any[] = getMentionsForLesson(lesson);
                const mentionsString = Array.isArray(mentions) ? mentions.join(' ') : String(mentions);
                if (mentionsString && mentionsString.trim().length > 0) {
                  changesMap[lessonKey] = `**${subjectName(lesson.su[0].name)}** • ${teacherName(lesson.te[0].orgid, true)}\n📆 ${discordTimestamp(untisDateToDate(lesson.date), 'long date')} ⏰ ${untisTimeToTimeString(lesson.startTime)} - ${untisTimeToTimeString(lesson.endTime)}\n💬 ${lesson.substText}\n\n👥 ${mentionsString}`;
                }
              }
            }
          }
        }
      });

      const changesDescription = Object.values(changesMap).join('\n\n');

      if (changesDescription) {
        const channelId = process.env.CHANNEL_ID || '';
        const channel = discordClient.channels.cache.get(channelId) as TextChannel;
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle("📅 Stundenplanänderung")
            .setDescription(changesDescription)
            .setTimestamp()
            .setColor("#9b59b6") // Purple color in hex
            .setFooter({ text: "WebUntis • Stundenplan-Bot" })
            .setAuthor({
              name: "Neue Änderung erkannt",
              iconURL: "https://cdn-icons-png.flaticon.com/512/1828/1828490.png" // Bell icon
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

export function resetPreviousState() {
  previousState = null;
}

if (require.main === module) {
  client.login(TOKEN);
  watchForChanges();
}

