# Waapo Mini App: how to put it online

The Mini App is a page that opens inside Telegram. It lives on GitHub Pages (free). It talks to your bot's
server through a small secure API that is already inside the bot (`api.js`).

You need two things on the internet:

1. **The page** → GitHub Pages (this folder)
2. **The server address (https)** → where your bot runs

## Step 1. Try the page right now (no server needed)
1. Create a free GitHub account and a **public** repository called `waapo-app`.
2. Upload `index.html` and `config.js` from this folder (Add file → Upload files).
3. Settings → Pages → Source: **Deploy from a branch**, branch **main**, folder **/(root)** → Save.
4. After a minute your page is at `https://YOURNAME.github.io/waapo-app/`.
5. Open `https://YOURNAME.github.io/waapo-app/?demo` in any browser to see the app with sample data.

## Step 2. Give your bot server a secure address
Mini Apps only work with https. Pick one:
- **Oracle server:** follow the Oracle guide, section 13 (DuckDNS + Caddy). Caddy line: `waapo.duckdns.org { reverse_proxy localhost:3000 }`
- **Spaceify panel:** ask support for "a free https address or proxy for my server port".

Check it works: open `https://YOUR-ADDRESS/api/health` in a browser. You should see `{"ok":true,...}`.

## Step 3. Connect the page to the server
1. Edit `config.js` on GitHub: set `window.WAAPO_API = 'https://YOUR-ADDRESS';` (no slash at the end).
2. In your bot's `.env` add (use your real names):
```
MINIAPP_URL=https://YOURNAME.github.io/waapo-app/
MINIAPP_ORIGIN=https://YOURNAME.github.io
MINIAPP_PORT=3000
```
`MINIAPP_ORIGIN` is only the site name, with no folder. It is the one website allowed to call your server.
3. Restart the bot. It prints "Mini App API listening on 3000".

## Step 4. Open it from the bot
Send any message to the bot. A **📱 Open app** button appears at the top of your menu. Tap it.

## How it stays safe
- Every request carries Telegram's signed login data. The server checks the signature with your bot token.
  Nobody can open another person's account, and old login data expires after 24 hours.
- Each person only ever sees and changes their own posts, messages and sends.
- Parts you switch off for a user in the bot (Features) are switched off in the app too.
- Only the website in `MINIAPP_ORIGIN` can call the API from a browser.
- Limits: 120 requests a minute per person, 300 per address, 20 KB per request.

## If something fails
| What you see | Fix |
|---|---|
| "Open Waapo from Telegram" | The page only works inside the bot. Use the 📱 Open app button. |
| "Almost ready" | `config.js` still has the placeholder address. |
| "Cannot reach the server" | The https address is wrong or the bot is not running. Check `/api/health`. |
| "Open the bot and send /start first" | That Telegram account has never started the bot. |
| Button missing | `MINIAPP_URL` is not in `.env`, or the bot was not restarted. |

## Updating the page
Upload the new `index.html` to the repository. Pages updates by itself in a minute. Close and reopen the app.

## What the app can do (version 2)
- **Home:** next post, 24-hour line, usage, plan, counts
- **Posts:** write a status with a live preview, post now or schedule, edit or cancel scheduled posts
- **Messages:** write a message to a saved list, a group list, picked groups, typed numbers or a channel; send now or schedule; edit or cancel
- **Sending:** follow what is going out and stop it
- **More:** plan and payment (pay online or see bank details), insights (best hours, loyal viewers, best posts), lists

Still done in the bot: photos and videos, creating and editing lists, polls and the admin tools.

## Updating from version 1
1. Replace `api.js` on your bot server and restart the bot. Nothing else changes there.
2. Replace `index.html` in your GitHub Pages repository (keep your own `config.js`).
3. The Render proxy needs no change.
4. Close and reopen the app.
