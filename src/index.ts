import { Lesson, WebUntis } from 'webuntis'
import 'dotenv/config'
const fs = require('fs');
import { EmbedBuilder, TextChannel } from 'discord.js';
import { Client } from 'discord.js';
import { diff, Diff } from 'deep-diff';

import { mergeLessons, untisDateToDateString, untisTimeToTimeString, subjectNames, teacherName } from './utils/untis';

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

async function watchForChanges() {
  await untis.login();

  setInterval(async () => {
    const today = new Date();
    const nextWednesday = new Date(today.setDate(today.getDate() + ((3 + 7 - today.getDay()) % 7)));
    // TODO: Use the real timetable
    // const currentState = mergeLessons(await untis.getOwnTimetableForRange(nextWednesday, nextWednesday));
    // fs.writeFileSync('timetable.json', JSON.stringify(currentState, null, 2));
    const currentState: Lesson[] = JSON.parse(fs.readFileSync('timetable.json', 'utf8'));
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
                changesMap[lessonKey] = `**${subjectNames(lesson.su[0].name)} von ${teacherName(lesson.te[0].orgname)}**\n${untisDateToDateString(lesson.date)}\n${untisTimeToTimeString(lesson.startTime)} - ${untisTimeToTimeString(lesson.endTime)}\n`;
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
            .setTitle('Änderungen im Stundenplan')
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
  }, 15000); // Check every minute
}

client.login(TOKEN);
watchForChanges();

