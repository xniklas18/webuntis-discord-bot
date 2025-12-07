# GitHub Actions Deployment Workflow

This directory contains GitHub Actions workflows for automating deployment of the WebUntis Discord Bot to an external server.

## Deployment Workflow (`deploy.yml`)

The deployment workflow automatically:
1. Connects to your external server via SSH
2. Pulls the latest changes from the repository
3. Installs/updates dependencies
4. Builds the project
5. Restarts the bot service

### Triggers

- **Automatic**: Runs on every push to the `main` branch
- **Manual**: Can be triggered manually from the GitHub Actions tab using "workflow_dispatch"

## Setup Instructions

### 1. Generate SSH Key Pair

On your local machine or a secure environment:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f github-actions-key
```

This creates two files:
- `github-actions-key` (private key)
- `github-actions-key.pub` (public key)

### 2. Configure Your External Server

1. **Add the public key to your server:**

```bash
# On your external server
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY_CONTENT" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

2. **Clone the repository on your server:**

```bash
cd /path/to/your/projects
git clone https://github.com/xniklas18/webuntis-discord-bot.git
cd webuntis-discord-bot
```

3. **Set up environment variables:**

```bash
cp .env.template .env
# Edit .env with your credentials
nano .env
```

4. **Install dependencies and build:**

```bash
npm install
npm run build
```

5. **Choose a process management method:**

#### Option A: Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the bot
pm2 start dist/index.js --name webuntis-discord-bot

# Save PM2 process list
pm2 save

# Set up PM2 to start on boot
pm2 startup
```

#### Option B: Using systemd

Create a systemd service file `/etc/systemd/system/webuntis-discord-bot.service`:

```ini
[Unit]
Description=WebUntis Discord Bot
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/path/to/webuntis-discord-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable webuntis-discord-bot
sudo systemctl start webuntis-discord-bot
```

#### Option C: Using nohup (Basic)

The workflow will automatically fall back to this method if PM2 and systemd are not available.

### 3. Configure GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add the following secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `SERVER_HOST` | IP address or hostname of your server | `192.168.1.100` or `example.com` |
| `SERVER_USERNAME` | SSH username for your server | `ubuntu` or `root` |
| `SSH_PRIVATE_KEY` | Private SSH key content | Content of `github-actions-key` file |
| `SERVER_PORT` | SSH port (optional, defaults to 22) | `22` |
| `PROJECT_PATH` | Absolute path to project on server | `/home/ubuntu/webuntis-discord-bot` |

### 4. Test the Deployment

You can test the deployment in two ways:

#### Manual Trigger:
1. Go to your repository on GitHub
2. Click on **Actions** tab
3. Select **Deploy to External Server** workflow
4. Click **Run workflow** button
5. Monitor the workflow execution

#### Automatic Trigger:
1. Make a change to your code
2. Commit and push to the `main` branch
3. The workflow will automatically trigger
4. Check the **Actions** tab to monitor progress

## Troubleshooting

### SSH Connection Issues

If the deployment fails with SSH connection errors:

1. Verify your server's SSH configuration allows key-based authentication
2. Check that the public key is correctly added to `~/.ssh/authorized_keys`
3. Ensure the SSH port is correct (default is 22)
4. Verify firewall rules allow SSH connections from GitHub's IP ranges

### Permission Issues

If you get permission errors:

1. Ensure the user has permissions to access the project directory
2. For systemd restart, add the user to sudoers without password for that specific command:
   ```bash
   # Add this line to /etc/sudoers using visudo
   your_username ALL=(ALL) NOPASSWD: /bin/systemctl restart webuntis-discord-bot
   ```

### Build or Installation Failures

If npm install or build fails:

1. Ensure Node.js and npm are installed on the server
2. Check that the server has enough disk space
3. Verify the `.env` file exists and has correct configuration

### Bot Not Restarting

If the bot doesn't restart after deployment:

1. Check which process manager you're using (PM2, systemd, or nohup)
2. Verify the process manager is properly configured
3. Check server logs for errors:
   ```bash
   # For PM2
   pm2 logs webuntis-discord-bot
   
   # For systemd
   sudo journalctl -u webuntis-discord-bot -f
   
   # For nohup
   tail -f bot.log
   ```

## Security Best Practices

1. **Never commit secrets**: Keep all sensitive data in GitHub Secrets
2. **Use limited permissions**: Create a dedicated user with minimal required permissions
3. **Rotate keys regularly**: Update SSH keys periodically
4. **Monitor access logs**: Regularly check server access logs for suspicious activity
5. **Use a non-root user**: Avoid running the bot or deployment as root

## Customization

### Changing the Target Branch

To deploy from a different branch (e.g., `production`), edit `.github/workflows/deploy.yml`:

```yaml
on:
  push:
    branches:
      - production  # Change this
```

### Adding Pre/Post Deployment Steps

You can add additional steps to the workflow, such as:

- Running tests before deployment
- Sending notifications to Discord/Slack
- Creating backups before deployment
- Running database migrations

Example:

```yaml
script: |
  cd ${{ secrets.PROJECT_PATH }}
  
  # Backup before deployment
  tar -czf backup-$(date +%Y%m%d-%H%M%S).tar.gz dist/
  
  # Pull and build
  git pull origin main
  npm install
  npm run build
  
  # Restart service
  pm2 restart webuntis-discord-bot
  
  # Send notification (requires curl and webhook setup)
  curl -X POST "YOUR_WEBHOOK_URL" -d '{"content":"Bot deployed successfully!"}'
```

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [SSH Action Documentation](https://github.com/appleboy/ssh-action)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [systemd Documentation](https://systemd.io/)
