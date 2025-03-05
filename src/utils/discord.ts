import { Lesson } from "webuntis";
import { subjectName, untisDateToDate } from "./untis";
import * as fs from 'fs';

const userIds: { [key: string]: string } = {
  Niklas: '1189654002456088608',
  Oskar: '751795379737067580',
  Tim: '799952102536773672',
  Oktus: '1179376377590468670'
};

const mentions = JSON.parse(fs.readFileSync('src/data/mentions.json', 'utf8'));

function getUserMention(name: string): string {
  const userId = userIds[name];
  if (userId) {
    return `<@${userId}>`;
  } else {
    return `User ${name} not found.`;
  }
}

type DiscordTimestampFormat = 'relative' | 'short time' | 'long time' | 'short date' | 'long date' | 'long date day short time';

function discordTimestamp(date: Date, format: DiscordTimestampFormat): string {
  const timestamp = date.toISOString();
  const [datePart, timePart] = timestamp.split('T');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = timePart.split(':');

  switch (format) {
    case 'relative':
      return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
    case 'short time':
      return `<t:${Math.floor(date.getTime() / 1000)}:t>`;
    case 'long time':
      return `<t:${Math.floor(date.getTime() / 1000)}:T>`;
    case 'short date':
      return `<t:${Math.floor(date.getTime() / 1000)}:d>`;
    case 'long date':
      return `<t:${Math.floor(date.getTime() / 1000)}:D>`;
    case 'long date day short time':
      return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
  }
}

function getMentionsForLesson(lesson: Lesson): string[] {
  const subject = lesson.su[0].name;
  const teacher = lesson.te[0].orgname || '';
  const day = untisDateToDate(lesson.date).toLocaleString('en-US', { weekday: 'long' });
  if (mentions[subject] && mentions[subject][teacher] && mentions[subject][teacher][day]) {
    return mentions[subject][teacher][day].map(getUserMention);
  } else {
    return [];
  }
}

export { getUserMention, discordTimestamp, getMentionsForLesson };