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

export async function watchForChanges() {
  await untis.login();

  setInterval(async () => {
    if (await untis.validateSession()) {
      console.log('Still valid session');
    } else {
      console.error('Session invalid');
      await untis.login();
    }

    const today = new Date();
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 1));
    const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 7));
    const currentState = mergeLessons(await untis.getOwnClassTimetableForRange(startOfWeek, endOfWeek)); // * For production
    // const currentState = JSON.parse(fs.readFileSync('timetable_changing.json', 'utf8')); // * For testing
    // previousState = JSON.parse(fs.readFileSync('timetable_static.json', 'utf8')); // * For testing

    const differences = diff(previousState, currentState);

    if (differences) {
      console.log('Changes detected:', differences);

      const changesMap: { [key: string]: string } = {};

      differences.forEach((change: Diff<any, any>) => {
        if (change.kind === 'E' || change.kind === 'N') {
          const path = change.path ?? [];
          if (path) {
            const lesson = currentState[path[0]];
            if (lesson && lesson.te && lesson.te[0] && lesson.te[0].orgname && lesson.te[0].orgid) {
              const lessonKey = `${lesson.su[0].id}-${lesson.te[0].orgid}-${lesson.date}-${lesson.startTime}-${lesson.endTime}`;
              if (!changesMap[lessonKey]) {

                const mentions = getMentionsForLesson(lesson);
                changesMap[lessonKey] = `${subjectName(lesson.su[0].name)} von ${teacherName(lesson.te[0].orgid, true)}\n${discordTimestamp(untisDateToDate(lesson.date), 'long date')} ${untisTimeToTimeString(lesson.startTime)} - ${untisTimeToTimeString(lesson.endTime)}\n${lesson.substText}\n${mentions}`;
              }
            }
          }
        }
      });

      const changesDescription = Object.values(changesMap).join('\n\n');

      if (changesDescription) {
        const channelId = process.env.CHANNEL_ID || '';
        const channel = client.channels.cache.get(channelId) as TextChannel;
        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle("Stundenplanänderung")
            .setDescription(changesDescription)
            .setTimestamp()
            .setColor("Purple");
          channel.send({ embeds: [embed] });
        }
      }

      previousState = currentState;
    } else {
      console.log('No changes detected');
    }
  }, 30 * 1000);
}

client.login(TOKEN);
watchForChanges();

