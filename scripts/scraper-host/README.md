# Scraper host — dedicated always-on Mac

Turns a Mac (the 2019 MacBook Pro) into the unattended scrape machine for
TikTok, Instagram, and VK. After this setup there is **nothing to start
manually, ever**: the logged-in browsers come up at boot and restart if
they crash, and the three scrapers run daily at 07:00 and push to
`social.clutch.game`.

What gets installed (all per-user LaunchAgents, no system daemons):

| Agent | What it does |
|---|---|
| `com.clutch.browser-server-tiktok` | Keeps the logged-in TikTok Chrome running (CDP port 9222). `RunAtLoad` + `KeepAlive` — starts at login, restarts on crash. |
| `com.clutch.browser-server-instagram` | Same for Instagram (CDP port 9223). |
| `com.clutch.daily-scrape` | Runs `run-daily-scrape.sh` at 07:00: TikTok → Instagram → VK, logs to `logs/scrape-YYYY-MM-DD.log`. |

---

## 1. Prepare the machine (one time)

On the 2019 MBP:

1. Install **Google Chrome** (chrome.com).
2. Install **Node 20+**: `brew install node` (Intel brew = `/usr/local`) or the
   installer from nodejs.org.
3. System settings for an always-on box:
   - **Auto-login**: System Settings → Users & Groups → Automatic login → your user.
     (Requires FileVault OFF — Settings → Privacy & Security. The LaunchAgents
     run in the GUI session, so the machine must reach the desktop on its own
     after a reboot/power cut.)
   - **Never sleep** (admin terminal):
     ```
     sudo pmset -c sleep 0 disksleep 0 displaysleep 10
     sudo pmset -a disablesleep 1      # also blocks lid-close sleep
     sudo pmset -a autorestart 1       # power back on after a power failure
     ```
   - Keep it on the charger; lid can stay closed once `disablesleep 1` is set.
4. Enable **Screen Sharing** (System Settings → General → Sharing) so you can
   fix logins remotely instead of walking over to it.

## 2. Copy the code, secrets, and logged-in sessions

A plain `git clone` is NOT enough — the `.env` files (API tokens) and
`browser-profile/` dirs (the logged-in Instagram/TikTok sessions) are
gitignored. Copy everything from the old Mac instead. On the **old** Mac:

```bash
rsync -av --exclude node_modules --exclude .next --exclude .thumbnails \
  /Users/silverfox/clutch-social/ <user>@<new-mac>.local:~/clutch-social/
```

(`node_modules` must be excluded — the old Mac is Apple Silicon, the 2019
MBP is Intel; native binaries don't transfer.)

## 3. Install dependencies

On the new Mac:

```bash
cd ~/clutch-social/scripts/tiktok-remote-scraper    && npm install
cd ~/clutch-social/scripts/instagram-remote-scraper && npm install
cd ~/clutch-social/scripts/vk-remote-scraper        && npm install && npx playwright install chromium
```

## 4. Verify the sessions survived the copy

Chrome cookie sessions normally survive a profile copy. Check each:

```bash
cd ~/clutch-social/scripts/tiktok-remote-scraper    && npm run scrape:setup
cd ~/clutch-social/scripts/instagram-remote-scraper && npm run scrape:setup
```

`--setup` pauses at each step so you can see the browser. If a site asks
you to log in, log in once — the persistent profile keeps it from then on.
(VK needs no login.)

## 5. Install the agents

```bash
cd ~/clutch-social/scripts/scraper-host
./install.sh
```

This loads the three LaunchAgents and schedules a 06:58 wake (harmless if
the machine never sleeps). Verify: `launchctl list | grep clutch` — you
should see the two browser-servers running.

## 6. Test end-to-end

```bash
./run-daily-scrape.sh
tail -f logs/scrape-$(date +%Y-%m-%d).log
```

Expect each scraper to log `Success! Posts: N, Metrics: M` and the run to
end with `all scrapers OK`. Then check https://social.clutch.game/settings
— the accounts' "last synced" should be minutes ago.

## 7. Cut over

Once a manual run works on the new machine, disable the old Mac's
automation so the accounts aren't scraped twice a day (harmless, but
wasteful and doubles ban-risk surface):

- The old Mac runs a **Claude scheduled task** named
  `clutch-social-terminal-scraping` (07:04 daily). Disable/delete it there.

## Day-2 operations

- **Logs**: `scripts/scraper-host/logs/scrape-YYYY-MM-DD.log` (30-day retention),
  browser-server logs alongside.
- **Did last night's run work?** `tail -30 logs/scrape-$(date +%Y-%m-%d).log`,
  or just look at "synced X min ago" in the dashboard header.
- **Session expired** (TikTok/IG logged the profile out — happens every few
  months): Screen Share in, `npm run scrape:setup` in that scraper's dir,
  log in, done.
- **Code updates**: `git pull` in `~/clutch-social` (token/profile files are
  untouched by pulls). Re-run `./install.sh` only if the plists changed.
- **Remove everything**: `./uninstall.sh`.

## Notes

- The browser-servers intentionally run **visible** Chrome (not headless):
  the box has its own GUI session, nobody uses it, and a real rendered
  browser trips fewer anti-bot heuristics. The `HEADLESS=true` env flag on
  each scraper exists for other deployment shapes (e.g. a Linux server),
  not needed here.
- All three scrapers push to `/api/sync/ingest` with the `API_TOKEN` from
  their `.env` — no inbound access to this machine is ever needed.
