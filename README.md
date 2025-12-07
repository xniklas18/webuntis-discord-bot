# WebUntis Discord Bot

A Discord bot that monitors WebUntis (school timetable system) for schedule changes and sends automatic notifications to a Discord channel.

## Features

- 🔄 Automatic monitoring of timetable changes
- 📢 Real-time Discord notifications for schedule updates
- 👥 Mentions relevant students/teachers when changes occur
- ⏰ Displays date, time, and details of changed lessons
- 🔐 Secure authentication with WebUntis and Discord

## Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- WebUntis account with API access
- Discord bot token and channel access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/xniklas18/webuntis-discord-bot.git
cd webuntis-discord-bot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.template .env
# Edit .env with your credentials
```

4. Build the project:
```bash
npm run build
```

5. Start the bot:
```bash
npm start
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Environment Variables

Create a `.env` file based on `.env.template`:

- `WEBUNTIS_SCHOOL` - Your school name in WebUntis
- `WEBUNTIS_USERNAME` - Your WebUntis username
- `WEBUNTIS_PASSWORD` - Your WebUntis password
- `WEBUNTIS_BASEURL` - WebUntis API base URL
- `CLIENT_TOKEN` - Discord bot token
- `CHANNEL_ID` - Discord channel ID for notifications
- `TESTING_CHANNEL_ID` - Discord channel ID for testing

## Automated Deployment

This project includes a GitHub Actions workflow for automatic deployment to an external server.

### Quick Start

1. Set up your external server (see detailed instructions in `.github/workflows/README.md`)
2. Configure GitHub Secrets in your repository settings:
   - `SERVER_HOST` - Your server's IP or hostname
   - `SERVER_USERNAME` - SSH username
   - `SSH_PRIVATE_KEY` - Private SSH key for authentication
   - `SERVER_PORT` - SSH port (optional, defaults to 22)
   - `PROJECT_PATH` - Absolute path to the project on your server

3. Push to the `main` branch or manually trigger the workflow

The workflow will automatically:
- Connect to your server via SSH
- Pull the latest code
- Install dependencies
- Build the project
- Restart the bot service

For detailed setup instructions, see [.github/workflows/README.md](.github/workflows/README.md)

## Project Structure

```
webuntis-discord-bot/
├── src/
│   ├── index.ts              # Main bot entry point
│   ├── data/                 # Data storage
│   └── utils/                # Utility functions
│       ├── discord.ts        # Discord-related utilities
│       └── untis.ts          # WebUntis utilities
├── tests/                    # Test files
├── .github/
│   └── workflows/            # GitHub Actions workflows
│       ├── deploy.yml        # Deployment workflow
│       └── README.md         # Deployment documentation
├── dist/                     # Compiled JavaScript (generated)
└── package.json              # Project dependencies and scripts
```

## How It Works

1. The bot logs into WebUntis using your credentials
2. Every 30 seconds (configurable), it fetches the current week's timetable
3. It compares the current state with the previous state
4. If changes are detected, it formats a notification message
5. The notification is sent to the configured Discord channel with:
   - Subject name and teacher
   - Date and time of the lesson
   - Substitution text
   - Mentions for affected students

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
