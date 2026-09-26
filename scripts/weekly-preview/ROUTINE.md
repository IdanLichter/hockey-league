# Friday match-day preview — routine instructions

A Claude cloud routine runs this every **Friday morning** (Israel time) and posts one preview
of Saturday's league games to the feed (המגרש) on rinkhockeyil.com and both apps.

The routine prompt only says "follow ROUTINE.md", so this file is the real prompt. Edit it here.

## Steps

Work from the repo root, **on `main`** (the clone may default to `dev`, which lacks these files):
`git fetch origin main && git checkout -B main origin/main`.

1. **Install** — `npm ci --no-audit --no-fund`. The cloud image ships Chromium at
   `/opt/pw-browsers/chromium`; if that exists, `export CHROME_PATH=/opt/pw-browsers/chromium`.
   Otherwise use any Chrome/Chromium on the machine (`which chromium chromium-browser google-chrome`).
   If the facts call fails with `HTTP 403, non-JSON body` / `CONNECT tunnel failed`, the
   environment's network allowlist is blocking `*.supabase.co` — stop and say so; it's a
   setting, not a code bug.
2. **Facts** — `node scripts/weekly-preview/preview.mjs facts > /tmp/facts.json`
   (with a date argument only when the prompt gives one). Read the whole file.
   - If `games` is empty: **stop. Post nothing.** Say "no league games this Saturday" and end.
3. **Poster** — `node scripts/weekly-preview/render-poster.mjs /tmp/facts.json /tmp/poster.png`.
   Open the PNG and look at it. If it failed or looks wrong (missing crest, cut-off name),
   stop and report — never publish a broken poster.
4. **Text** — write the post to `/tmp/text.txt` following the rules below.
5. **Publish** — `node scripts/weekly-preview/preview.mjs publish <saturday> /tmp/text.txt /tmp/poster.png`
   (add `--dry-run` if the prompt says DRY RUN). Report the JSON it prints.
   Running it again the same week *updates* that week's post instead of adding a second one.
   If a moderator deleted this week's post the function refuses — respect that, don't work around it.

Do not commit, push, or edit any file in the repo. The only outputs are the post and your report.

## Writing the text

Hebrew, for the league's players, families and fans. Warm, lively, a little bit of hype, never cringe.

**Hard rules — the function rejects a post that breaks the first two:**
- **No blank lines.** Feed cards show only the text before the first blank line. Use single line
  breaks between lines.
- 40–1200 characters. Aim for ~500–800.
- **Only facts from facts.json.** Never invent a score, streak, injury, quote, player or stat.
  If a field is empty or null, don't mention it. If unsure, leave it out.
- Team names exactly as in facts.json (e.g. "גבעת עדה איחוד", not "חלוצים").
- Scores written winner-first as plain digits, e.g. "ניצחון 5:3". Times as HH:MM.
- The sport is **הוקי גלגיליות** — never "הוקי קרח" or "רולר הוקי". The ball is a כדור, not a דיסקית.
- Gender-neutral or plural phrasing for fans ("בואו לעודד").
- No hashtags, no @mentions, at most 3–4 emoji in the whole post.

**Shape:**
1. A one-line headline (e.g. "🏑 מחזור השבת: שלושה משחקים בקריית ביאליק ובקריית מוצקין").
   If `is_opening_round` is true, it's the season opener — say so.
2. One line per game, in kickoff order, in EXACTLY this order:
   **teams first, joined by "vs" (never "נגד"), then the time, then 📍 and the venue**, then a dash
   and ONE interesting true fact:
   `בלג נוער vs בלג בוגרים · 16:30 · 📍 קריית ביאליק – <fact>`
   Home team first (it's listed as `home`). Facts to choose from: last season's finish, the
   head-to-head, a last-season top scorer, recent form.
   `head_to_head_from_home_view` results are from the HOME team's point of view.
   Last-season facts must be framed as last season ("בעונה שעברה"). This season's table only
   matters once `league_games_played_this_season` > 0.
   The poster shows the players in `featured_player_image` / `matchup_image`; you may name them
   in the fact, but only with a real stat of theirs from facts.json.
3. A closing line inviting people to come / follow live on the site.

Don't include URLs in the text — the card already links to the games page.
