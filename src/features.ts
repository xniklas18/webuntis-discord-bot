import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, MessageCreateOptions } from 'discord.js';
import { WebUntis, Lesson } from 'webuntis';
import { LinkedAccount, listLinkedAccounts } from './userStore';
import {
  Hw, addDays, berlinTime, dayLabel, dayNumber, getLessons, getOpenHomework, isExam, nextSchoolDay, timeString, withUntis,
} from './untisData';
import { subjectName } from './utils/untis';

const doneIds = (a: LinkedAccount): Set<number> => new Set(a.completedHomeworkIds || []);

export function lessonLine(l: Lesson): string {
  const status = l.code === 'cancelled' ? ' ❌ entfällt' : l.code === 'irregular' || l.substText ? ` ⚠️ ${l.substText || 'Änderung'}` : '';
  return `${timeString(l.startTime)}–${timeString(l.endTime)} **${subjectName(l.su?.[0]?.name || '?')}** ${l.te?.[0]?.name || ''}${status}`;
}

export const dayText = (lessons: Lesson[]): string =>
  lessons.length ? lessons.map(lessonLine).join('\n') : 'Kein Unterricht.';

export function homeworkText(list: Hw[]): string {
  return list.length
    ? list.map((h) => `• **${h.subject}**, bis ${dayLabel(h.due)}: ${h.text}`.slice(0, 300)).join('\n')
    : 'Keine offenen Hausaufgaben.';
}

export function hwButtons(list: Hw[]): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = list.slice(0, 5).map((h) =>
    new ButtonBuilder().setCustomId(`hwdone:${h.id}`).setLabel(`✔ ${h.subject}`.slice(0, 80)).setStyle(ButtonStyle.Secondary)
  );
  return buttons.length ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}

/** 6:30 summary, or null on a day without lessons. */
export async function morningMessage(untis: WebUntis, account: LinkedAccount): Promise<MessageCreateOptions | null> {
  const now = new Date();
  const today = dayNumber(now);
  const lessons = await getLessons(untis, now, addDays(now, 14));
  const todays = lessons.filter((l) => l.date === today);
  if (!todays.some((l) => l.code !== 'cancelled')) return null;

  const due = (await getOpenHomework(untis, doneIds(account))).filter((h) => h.due === today);
  const exams = lessons.filter((l) => isExam(l) && l.date <= dayNumber(addDays(now, 7)) && l.code !== 'cancelled');
  const embed = new EmbedBuilder().setTitle(`Guten Morgen, ${dayLabel(today)}`).setColor('#5865f2').setDescription(dayText(todays));
  if (due.length) embed.addFields({ name: 'Heute fällig', value: homeworkText(due).slice(0, 1000) });
  if (exams.length) {
    embed.addFields({
      name: 'Klausuren in den nächsten 7 Tagen',
      value: exams.map((l) => `• ${dayLabel(l.date)} ${timeString(l.startTime)} ${subjectName(l.su?.[0]?.name || '?')}`).join('\n').slice(0, 1000),
    });
  }
  return { embeds: [embed], components: hwButtons(due) };
}

/** 17:00 reminder for the next school day, or null if nothing is open. */
export async function reminderMessage(untis: WebUntis, account: LinkedAccount): Promise<MessageCreateOptions | null> {
  const now = new Date();
  const lessons = await getLessons(untis, now, addDays(now, 14));
  const next = nextSchoolDay(lessons, dayNumber(now));
  if (!next) return null;
  const open = (await getOpenHomework(untis, doneIds(account))).filter((h) => h.due === next);
  if (!open.length) return null;
  const embed = new EmbedBuilder()
    .setTitle(`Hausaufgaben für ${dayLabel(next)}`)
    .setColor('#faa61a')
    .setDescription(homeworkText(open))
    .setFooter({ text: 'Mit dem Button haken ab. Der Stand gilt auch auf der Website.' });
  return { embeds: [embed], components: hwButtons(open) };
}

// --- Daily jobs ---
const JOBS = {
  morning: { time: '06:30', build: morningMessage },
  reminder: { time: '17:00', build: reminderMessage },
} as const;
const lastRun: Record<string, string> = {};

async function runJob(client: Client, job: keyof typeof JOBS): Promise<void> {
  for (const account of await listLinkedAccounts()) {
    if (!account.prefs?.[job]) continue;
    try {
      const message = await withUntis(account, (untis) => JOBS[job].build(untis, account));
      if (message) await (await client.users.fetch(account.discordUserId)).send({ ...message, allowedMentions: { parse: [] } });
    } catch {
      console.warn(`Job ${job}: Nachricht an ein Konto konnte nicht erstellt oder gesendet werden.`);
    }
  }
}

export function startJobs(client: Client): void {
  // Every 20 s so no minute is skipped; each job runs once per day at its minute.
  setInterval(() => {
    const t = berlinTime();
    const day = String(dayNumber());
    for (const [job, { time }] of Object.entries(JOBS)) {
      if (t === time && lastRun[job] !== day) {
        lastRun[job] = day;
        void runJob(client, job as keyof typeof JOBS);
      }
    }
  }, 20_000);
}
