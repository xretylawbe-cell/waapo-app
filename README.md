# Waapo proxy: free https for your Mini App (while your bot stays on Spaceify)

Browsers refuse to let a secure page (GitHub Pages) call a plain `http://` address. This tiny service
sits on Render (which gives free https) and passes the app's requests to your bot.

```
Telegram app (https, GitHub Pages)  →  this proxy on Render (https)  →  your bot on Spaceify (http)
```

## Before you start: test your bot's API directly
1. In the bot's `.env` on Spaceify add:
```
MINIAPP_URL=https://YOURNAME.github.io/waapo-app/
MINIAPP_ORIGIN=https://YOURNAME.github.io
MINIAPP_PORT=25560
```
(25560 is the port from your Spaceify address. Use your own.) Restart the bot.
2. On your phone open `http://de25.spaceify.eu:25560/api/health` (your address). You should see `{"ok":true,...}`.
   If you do not, the bot is not exposing the port yet. Fix that first (check the three lines above and the bot's log
   for "Mini App API listening").

## Put the proxy on Render
1. Make a **new GitHub repository** (for example `waapo-proxy`) and upload `server.js` and `package.json` from this folder.
2. On render.com: **New → Web Service** → connect that repository.
3. Settings: Language **Node**, Build command `npm install`, Start command `npm start`, Instance type **Free**.
4. Environment variables (Add):

| Name | Value |
|---|---|
| `UPSTREAM` | your bot's API address, e.g. `http://de25.spaceify.eu:25560` |
| `ALLOWED_ORIGINS` | `https://YOURNAME.github.io` (the site only, no folder) |
| `PROXY_KEY` | a long random password you invent (30+ letters and numbers) |

5. Deploy. Render gives you an address like `https://waapo-proxy.onrender.com`.
6. Open `https://waapo-proxy.onrender.com/api/health`. You should see `{"ok":true,...}` (the first time may take a minute).

## Lock your bot so only the proxy can call it
Add this to the bot's `.env` (the SAME password as `PROXY_KEY`) and restart the bot:
```
MINIAPP_PROXY_KEY=the-same-long-random-password
```
After this, opening the Spaceify address directly shows "Forbidden". That is correct: only the proxy may call it.

## Point the app at the proxy
Edit `config.js` in your GitHub Pages repository:
```
window.WAAPO_API = 'https://waapo-proxy.onrender.com';
```
Close and reopen the app from the bot's 📱 Open app button.

## Keep it awake (optional but recommended)
A free Render service sleeps after 15 minutes without visitors, and the next open then takes up to a minute
(the app shows "Waking the server…"). To avoid that, add a free monitor at an uptime service (for example UptimeRobot)
that opens `https://waapo-proxy.onrender.com/` every 5 minutes. Free Render includes about 750 hours a month,
enough for one service running all month.

## Good to know
- The proxy keeps no data and no files, so Render restarting it is harmless.
- The hop from Render to Spaceify is plain http. People's login data for the app is signed and expires after 24 hours,
  but someone watching that hop could reuse it. That is fine for testing and a small group. For customers at scale,
  move the bot to a server with its own https (the Oracle guide, or any small VPS).
