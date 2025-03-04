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

export { getUserMention };