import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { Request, Response } from 'express';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { WebUntis } from 'webuntis';
import { encryptPassword, getCompletedHomeworkIds, getLinkedAccount, removeLinkedAccount, saveLinkedAccount, setHomeworkCompleted, setPrefs } from './userStore';

type WebSession = {
  discordUser?: { id: string; username: string };
  oauthState?: string;
  csrfToken?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function secureEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · WebUntisBot</title><link rel="stylesheet" href="/bot-settings/style.css"></head><body><main><h1>${escapeHtml(title)}</h1>${body}<footer>WebUntisBot · Zugangsdaten werden verschlüsselt gespeichert.</footer></main></body></html>`;
}

function formToken(req: Request): string {
  const authSession = req.session as unknown as WebSession;
  authSession.csrfToken ||= randomBytes(32).toString('hex');
  return authSession.csrfToken;
}

function requireUser(req: Request, res: Response): string | undefined {
  const authSession = req.session as unknown as WebSession;
  if (!authSession.discordUser) {
    res.redirect(BASE + '/');
    return undefined;
  }
  return authSession.discordUser.id;
}

function requireCsrf(req: Request, res: Response): boolean {
  const authSession = req.session as unknown as WebSession;
  const submitted = typeof req.body.csrfToken === 'string' ? req.body.csrfToken : '';
  if (!authSession.csrfToken || !secureEquals(authSession.csrfToken, submitted)) {
    res.status(403).send(page('Sitzung abgelaufen', '<p>Bitte lade die Seite neu und versuche es erneut.</p>'));
    return false;
  }
  return true;
}

export interface NotifyPayload {
  title: string;
  text: string;
  link?: string;
  filename?: string;
  pdf?: Buffer;
  userId?: string;
}

const BASE = '/bot-settings';

export async function startUserManagementWeb(onNotify?: (payload: NotifyPayload) => Promise<void>): Promise<void> {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const sessionSecret = process.env.WEB_SESSION_SECRET;
  const encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!publicBaseUrl || !publicBaseUrl.startsWith('https://') || !clientId || !clientSecret ||
      !sessionSecret || sessionSecret.length < 32 || !encryptionKey) {
    console.warn('WebUntis-Nutzerverwaltung deaktiviert: OAuth-, HTTPS- oder Verschlüsselungs-Konfiguration fehlt.');
    return;
  }

  const redirectUri = `${publicBaseUrl}${BASE}/auth/discord/callback`;
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const router = express.Router();
  app.use(helmet());

  // Interner Endpunkt für den Schulassistenten (nicht über den Reverse-Proxy erreichbar machen).
  const notifyToken = process.env.NOTIFY_TOKEN;
  const hasToken = (req: Request): boolean => {
    const header = req.get('authorization') || '';
    return !!notifyToken && header.startsWith('Bearer ') && secureEquals(header.slice(7), notifyToken);
  };
  if (notifyToken) {
    // Haken-Stand der Hausaufgaben: der Bot ist die Wahrheit, die Website liest und schreibt ihn hier.
    const homeworkLimit = rateLimit({ windowMs: 60 * 1000, limit: 120 });
    app.get('/internal/homework-done', homeworkLimit, async (req, res) => {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
      if (!hasToken(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
      if (!/^\d{5,25}$/.test(userId) || !(await getLinkedAccount(userId))) { res.status(404).json({ error: 'unknown user' }); return; }
      res.json({ ids: [...(await getCompletedHomeworkIds(userId))] });
    });
    app.post('/internal/homework-done', homeworkLimit, express.json({ limit: '10kb' }), async (req, res) => {
      if (!hasToken(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
      const { userId, id, done } = (req.body || {}) as { userId?: unknown; id?: unknown; done?: unknown };
      if (typeof userId !== 'string' || !/^\d{5,25}$/.test(userId) || !Number.isInteger(id) || typeof done !== 'boolean' ||
          !(await getLinkedAccount(userId))) {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }
      await setHomeworkCompleted(userId, id as number, done);
      res.json({ ok: true });
    });
  }
  if (notifyToken && onNotify) {
    app.post('/internal/notify', rateLimit({ windowMs: 60 * 1000, limit: 30 }), express.json({ limit: '15mb' }), async (req, res) => {
      if (!hasToken(req)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      const body = req.body as Record<string, unknown>;
      const userId = typeof body.userId === 'string' && /^\d{5,25}$/.test(body.userId) ? body.userId : undefined;
      const title = typeof body.title === 'string' ? body.title.slice(0, 200) : '';
      const text = typeof body.text === 'string' ? body.text.slice(0, 3500) : '';
      const link = typeof body.link === 'string' && body.link.startsWith(publicBaseUrl + '/') ? body.link : undefined;
      const filename = typeof body.filename === 'string' && /^[\w. -]{1,80}$/.test(body.filename) ? body.filename : 'datei.pdf';
      const pdf = typeof body.pdfBase64 === 'string' ? Buffer.from(body.pdfBase64, 'base64') : undefined;
      if (!title || !text || (pdf && pdf.length > 8 * 1024 * 1024)) {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }
      try {
        await onNotify({ title, text, link, filename, pdf, userId });
        res.json({ ok: true });
      } catch {
        console.error('Benachrichtigung konnte nicht gesendet werden.');
        res.status(502).json({ error: 'delivery failed' });
      }
    });
  }

  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(cookieSession({
    name: '__Host-webuntisbot',
    keys: [sessionSecret],
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
  router.use('/auth', authLimiter);
  router.use('/webuntis', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false }));

  router.get('/style.css', (_req, res) => {
    res.type('text/css').send('*{box-sizing:border-box}body{font:16px/1.5 system-ui,sans-serif;background:#10131a;color:#e8ebf2;margin:0;padding:1rem}main{max-width:560px;margin:1rem auto;background:#1b202b;border-radius:16px;padding:1.5rem}h1{font-size:1.6rem;line-height:1.25;margin:0 0 1rem}p{margin:.6rem 0}a{color:#9aa8ff}.btn,button{display:inline-block;font:inherit;line-height:1.2;text-align:center;color:#fff;background:#5865f2;padding:.75rem 1.1rem;border:0;border-radius:10px;text-decoration:none;cursor:pointer}.btn-ghost{background:#2f3748}.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1rem}.actions form{display:contents}.actions .btn,.actions button{width:100%}@media(min-width:480px){.actions .btn,.actions button{width:auto}}input[type=checkbox]{display:inline-block;width:auto;margin:0 .5rem 0 0}input{display:block;width:100%;margin:.4rem 0 1rem;padding:.75rem;border-radius:8px;border:1px solid #586174;background:#10131a;color:#fff;font:inherit}label{display:block}small,footer{color:#aeb6c5}footer{margin-top:1.5rem;font-size:.85rem}.notice{padding:1rem;background:#252c3a;border-radius:10px}.notice p:first-child{margin-top:0}');
  });

  router.get('/', (req, res) => {
    const authSession = req.session as unknown as WebSession;
    if (authSession.discordUser) return res.redirect(BASE + '/konto');
    res.type('html').send(page('WebUntis-Konto verbinden',
      '<p>Verbinde dein WebUntis-Konto sicher mit deinem Discord-Benutzer.</p><div class="actions"><a class="btn" href="/bot-settings/auth/discord">Mit Discord anmelden</a></div>'));
  });

  router.get('/auth/discord', (req, res) => {
    const authSession = req.session as unknown as WebSession;
    authSession.oauthState = randomBytes(32).toString('hex');
    const authorization = new URL('https://discord.com/oauth2/authorize');
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('client_id', clientId);
    authorization.searchParams.set('scope', 'identify');
    authorization.searchParams.set('state', authSession.oauthState);
    authorization.searchParams.set('redirect_uri', redirectUri);
    res.redirect(authorization.toString());
  });

  router.get('/auth/discord/callback', async (req, res) => {
    const authSession = req.session as unknown as WebSession;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const issuer = typeof req.query.iss === 'string' ? req.query.iss : 'https://discord.com';
    if (!authSession.oauthState || !secureEquals(authSession.oauthState, state) ||
        issuer !== 'https://discord.com' || !code) {
      res.status(400).send(page('Anmeldung fehlgeschlagen', '<p>Die Discord-Anmeldung konnte nicht bestätigt werden. Bitte erneut versuchen.</p>'));
      return;
    }
    delete authSession.oauthState;
    let oauthStage = 'Token-Austausch';
    let discordHttpStatus: number | undefined;
    try {
      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });
      discordHttpStatus = tokenResponse.status;
      if (!tokenResponse.ok) throw new Error('OAuth token exchange failed');
      const token = await tokenResponse.json() as { access_token?: string; token_type?: string };
      if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') throw new Error('OAuth token response invalid');
      oauthStage = 'Discord-Profil';
      const profileResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      discordHttpStatus = profileResponse.status;
      if (!profileResponse.ok) throw new Error('Discord profile request failed');
      const profile = await profileResponse.json() as { id?: string; username?: string; global_name?: string };
      if (!profile.id) throw new Error('Discord user ID missing');
      authSession.discordUser = { id: profile.id, username: profile.global_name || profile.username || 'Discord-Nutzer' };
      authSession.csrfToken = randomBytes(32).toString('hex');
      res.redirect(BASE + '/konto');
    } catch {
      const status = discordHttpStatus ? ` HTTP ${discordHttpStatus}` : ' Netzwerkfehler';
      console.error(`Discord OAuth fehlgeschlagen bei ${oauthStage}:${status}.`);
      res.status(502).send(page('Anmeldung fehlgeschlagen', '<p>Discord konnte die Anmeldung gerade nicht bestätigen. Bitte später erneut versuchen.</p>'));
    }
  });

  router.get('/konto', async (req, res) => {
    const discordUserId = requireUser(req, res);
    if (!discordUserId) return;
    try {
      const authSession = req.session as unknown as WebSession;
      const account = await getLinkedAccount(discordUserId);
      const token = formToken(req);
      const linked = account
        ? `<div class="notice"><p>Verbunden mit Discord: <strong>${escapeHtml(authSession.discordUser?.username || '')}</strong></p><p>WebUntis-Schule: ${escapeHtml(account.school)} · Benutzername: ${escapeHtml(account.username)}</p><form method="post" action="/bot-settings/einstellungen"><input type="hidden" name="csrfToken" value="${token}"><p>Direktnachrichten (standardmäßig aus):</p><label><input type="checkbox" name="morning" ${account.prefs?.morning ? 'checked' : ''}> Morgen-Zusammenfassung um 6:30</label><label><input type="checkbox" name="reminder" ${account.prefs?.reminder ? 'checked' : ''}> Hausaufgaben-Erinnerung um 17:00</label><div class="actions"><button type="submit">Speichern</button></div></form><div class="actions"><form method="post" action="/bot-settings/webuntis/trennen"><input type="hidden" name="csrfToken" value="${token}"><button class="btn-ghost" type="submit">WebUntis-Konto trennen</button></form></div></div>`
        : `<p>Angemeldet als Discord: <strong>${escapeHtml(authSession.discordUser?.username || '')}</strong></p><form method="post" action="/bot-settings/webuntis/verbinden"><input type="hidden" name="csrfToken" value="${token}"><label>WebUntis-Schule<input name="school" required maxlength="100" autocomplete="organization" placeholder="Schulname in WebUntis"></label><label>WebUntis-Server<input name="baseUrl" required maxlength="120" placeholder="z. B. xyz.webuntis.com"></label><label>WebUntis-Benutzername<input name="username" required maxlength="120" autocomplete="username"></label><label>WebUntis-Passwort<input type="password" name="password" required maxlength="256" autocomplete="current-password"></label><button type="submit">Anmelden und Konto verbinden</button></form><p class="notice">Dein Passwort wird beim Speichern mit AES-256-GCM verschlüsselt. Es wird nicht im Browser oder in Logs gespeichert.</p>`;
      res.type('html').send(page('Dein WebUntis-Konto', linked + '<div class="actions"><a class="btn btn-ghost" href="/bot-settings/auth/logout">Abmelden</a></div>'));
    } catch {
      res.status(500).send(page('Fehler', '<p>Kontostatus konnte nicht geladen werden.</p>'));
    }
  });

  router.post('/webuntis/verbinden', async (req, res) => {
    const discordUserId = requireUser(req, res);
    if (!discordUserId || !requireCsrf(req, res)) return;
    const school = typeof req.body.school === 'string' ? req.body.school.trim() : '';
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const rawBaseUrl = typeof req.body.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
    const normalizedBaseUrl = rawBaseUrl.replace(/^https?:\/\//i, '').split('/')[0].replace(/:443$/, '').toLowerCase();
    if (!school || !username || !password || school.length > 100 || username.length > 120 ||
        password.length > 256 || !/^(?:[a-z0-9-]+\.)*webuntis\.com$/i.test(normalizedBaseUrl)) {
      res.status(400).send(page('Eingabe prüfen', '<p>Bitte gib Schule, Benutzername und Passwort ein. Der Server muss auf *.webuntis.com liegen.</p><p><a href="/bot-settings/konto">Zurück</a></p>'));
      return;
    }
    try {
      const candidate = new WebUntis(school, username, password, normalizedBaseUrl);
      await candidate.login();
      await saveLinkedAccount({
        discordUserId,
        school,
        baseUrl: normalizedBaseUrl,
        username,
        encryptedPassword: encryptPassword(password),
        connectedAt: new Date().toISOString(),
      });
      res.redirect(BASE + '/konto');
    } catch {
      res.status(401).send(page('WebUntis-Anmeldung fehlgeschlagen', '<p>Die Zugangsdaten konnten nicht bestätigt werden. Prüfe Schule, Server, Benutzername und Passwort.</p><p><a href="/bot-settings/konto">Erneut versuchen</a></p>'));
    }
  });

  router.post('/einstellungen', async (req, res) => {
    const discordUserId = requireUser(req, res);
    if (!discordUserId || !requireCsrf(req, res)) return;
    try {
      if (!(await getLinkedAccount(discordUserId))) return res.redirect(BASE + '/konto');
      await setPrefs(discordUserId, { morning: req.body.morning === 'on', reminder: req.body.reminder === 'on' });
      res.redirect(BASE + '/konto');
    } catch {
      res.status(500).send(page('Fehler', '<p>Die Einstellungen konnten nicht gespeichert werden.</p>'));
    }
  });

  router.post('/webuntis/trennen', async (req, res) => {
    const discordUserId = requireUser(req, res);
    if (!discordUserId || !requireCsrf(req, res)) return;
    try {
      await removeLinkedAccount(discordUserId);
      res.redirect(BASE + '/konto');
    } catch {
      res.status(500).send(page('Fehler', '<p>Das Konto konnte nicht getrennt werden.</p>'));
    }
  });

  router.get('/auth/logout', (req, res) => {
    req.session = null;
    res.redirect(BASE + '/');
  });

  app.use(BASE, router);
  const port = Number(process.env.WEB_PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`WebUntis-Kontoverwaltung hört auf Port ${port}.`));
}
