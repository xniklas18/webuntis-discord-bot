import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Interaction, MessageFlags, SlashCommandBuilder,
} from 'discord.js';
import { Prefs, getLinkedAccount, setHomeworkCompleted, setPrefs } from './userStore';
import { addDays, dayLabel, dayNumber, getAbsences, getLessons, getOpenHomework, withUntis } from './untisData';
import { dayText, homeworkText, hwButtons } from './features';

export const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Prüft, ob der Bot erreichbar ist.'),
  new SlashCommandBuilder()
    .setName('stundenplan')
    .setDescription('Dein Stundenplan')
    .addStringOption((o) =>
      o.setName('tag').setDescription('Welcher Tag').addChoices({ name: 'heute', value: '0' }, { name: 'morgen', value: '1' })
    ),
  new SlashCommandBuilder().setName('hausaufgaben').setDescription('Deine offenen Hausaufgaben'),
  new SlashCommandBuilder().setName('fehlzeiten').setDescription('Deine Fehlzeiten und offene Entschuldigungen'),
  new SlashCommandBuilder().setName('einstellungen').setDescription('Morgen-Zusammenfassung und Erinnerung ein- oder ausschalten'),
];

const EPHEMERAL = MessageFlags.Ephemeral;
const connectHint = () => `Verbinde zuerst dein WebUntis-Konto: ${process.env.PUBLIC_BASE_URL || ''}/bot-settings`;

function prefsMessage(prefs: Prefs) {
  const button = (key: keyof Prefs, label: string) =>
    new ButtonBuilder()
      .setCustomId(`pref:${key}`)
      .setLabel(`${label}: ${prefs[key] ? 'an' : 'aus'}`)
      .setStyle(prefs[key] ? ButtonStyle.Success : ButtonStyle.Secondary);
  return {
    content: 'Direktnachrichten, standardmäßig aus:',
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button('morning', 'Morgen-Zusammenfassung 6:30'),
        button('reminder', 'Hausaufgaben-Erinnerung 17:00')
      ),
    ],
  };
}

export async function handleInteraction(interaction: Interaction, client: Client): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const name = interaction.commandName;
    if (name === 'ping') {
      const roundTrip = Date.now() - interaction.createdTimestamp;
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🏓 Pong!').setDescription(`Bot-Latenz: **${roundTrip} ms**\nGateway: **${client.ws.ping} ms**`).setColor('#2ecc71')],
        flags: EPHEMERAL,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const account = await getLinkedAccount(interaction.user.id);
    if (!account) {
      await interaction.reply({ content: connectHint(), flags: EPHEMERAL });
      return;
    }
    if (name === 'einstellungen') {
      await interaction.reply({ ...prefsMessage(account.prefs || {}), flags: EPHEMERAL });
      return;
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const now = new Date();
      const embed = new EmbedBuilder().setColor('#5865f2');
      let components: ActionRowBuilder<ButtonBuilder>[] = [];
      await withUntis(account, async (untis) => {
        if (name === 'stundenplan') {
          const day = addDays(now, Number(interaction.options.getString('tag') || 0));
          const n = dayNumber(day);
          embed.setTitle(`Stundenplan ${dayLabel(n)}`).setDescription(dayText((await getLessons(untis, day, day)).filter((l) => l.date === n)));
        } else if (name === 'hausaufgaben') {
          const open = await getOpenHomework(untis, new Set(account.completedHomeworkIds || []));
          embed.setTitle('Offene Hausaufgaben').setDescription(homeworkText(open).slice(0, 4000));
          components = hwButtons(open);
        } else if (name === 'fehlzeiten') {
          const list = (await getAbsences(untis)).filter((a) => !a.late);
          const sum = (x: typeof list) => Math.round(x.reduce((s, a) => s + a.minutes, 0) / 45);
          const open = list.filter((a) => !a.excused);
          embed
            .setTitle('Fehlzeiten')
            .setDescription(`Fehlstunden: **${sum(list)}**\nDavon unentschuldigt: **${sum(open)}**`)
            .setFooter({ text: open.length ? 'Die Entschuldigung erstellst du auf der Website.' : 'Alles entschuldigt.' });
        }
      });
      await interaction.editReply({ embeds: [embed], components });
    } catch {
      await interaction.editReply('WebUntis ist gerade nicht erreichbar.');
    }
    return;
  }

  if (!interaction.isButton()) return;
  const id = interaction.customId;

  if (id.startsWith('pref:')) {
    const key = id.slice(5);
    if (key !== 'morning' && key !== 'reminder') return;
    const account = await getLinkedAccount(interaction.user.id);
    if (!account) {
      await interaction.reply({ content: connectHint(), flags: EPHEMERAL });
      return;
    }
    const prefs = { ...account.prefs, [key]: !account.prefs?.[key] };
    await setPrefs(account.discordUserId, prefs);
    await interaction.update(prefsMessage(prefs));
    return;
  }

  if (id.startsWith('hwdone:')) {
    const hwId = Number(id.slice(7));
    if (!Number.isInteger(hwId) || !(await getLinkedAccount(interaction.user.id))) {
      await interaction.reply({ content: connectHint(), flags: EPHEMERAL });
      return;
    }
    await setHomeworkCompleted(interaction.user.id, hwId, true);
    // Remove the clicked button, keep the others
    const rows = interaction.message.components
      .map((row) => {
        const kept = (row as unknown as { components: Array<{ customId?: string; label?: string; style: number }> }).components
          .filter((c) => c.customId !== id)
          .map((c) => new ButtonBuilder().setCustomId(c.customId || '').setLabel(c.label || '').setStyle(c.style));
        return kept.length ? new ActionRowBuilder<ButtonBuilder>().addComponents(kept) : null;
      })
      .filter((r): r is ActionRowBuilder<ButtonBuilder> => r !== null);
    await interaction.update({ components: rows });
  }
}
