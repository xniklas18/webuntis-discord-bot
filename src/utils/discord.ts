
type DiscordTimestampFormat =
  | 'relative'
  | 'short time'
  | 'long time'
  | 'short date'
  | 'long date'
  | 'long date day short time';

function discordTimestamp(date: Date, format: DiscordTimestampFormat): string {
  const unixTimestamp = Math.floor(date.getTime() / 1000);

  switch (format) {
    case 'relative':
      return `<t:${unixTimestamp}:R>`;
    case 'short time':
      return `<t:${unixTimestamp}:t>`;
    case 'long time':
      return `<t:${unixTimestamp}:T>`;
    case 'short date':
      return `<t:${unixTimestamp}:d>`;
    case 'long date':
      return `<t:${unixTimestamp}:D>`;
    case 'long date day short time':
      return `<t:${unixTimestamp}:F>`;
  }
}

export { discordTimestamp };
