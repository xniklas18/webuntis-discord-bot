const userIds: { [key: string]: string } = {
  Niklas: '751795379737067580',
  Oskar: '751795379737067580',
  Tim: '799952102536773672',
  Oktus: '1179376377590468670'
};

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
      return `<t:${Math.floor(date.getTime() / 1000)}:F>`
  }
}

export { getUserMention, discordTimestamp };