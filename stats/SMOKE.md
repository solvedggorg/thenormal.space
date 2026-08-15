# Stats smoke

1. `cd stats/tail && wrangler deploy`
2. Deploy marketing (`wrangler deploy` at repo root) and shop (`cd store && wrangler deploy`)
3. `cd stats/app && wrangler kv namespace create STATS` if the binding has no id; paste id into `wrangler.jsonc`
4. `cd stats/app && wrangler secret put CF_API_TOKEN` (Zone Analytics Read + Account Analytics Read)
5. `cd stats/app && wrangler deploy`
6. `stats/scripts/tighten-bots.sh --apply`
7. `curl -sI https://thenormal.space/dishwasher` and `curl -sI https://shop.thenormal.space/`
8. Wait 60s. `curl -s 'https://stats.thenormal.space/api/snapshot?range=7d' | head`
9. Open `https://stats.thenormal.space` — visitors/blocked may be non-zero immediately; pages/states fill after the tail writes land (about a minute)

Token scopes: **Zone Analytics Read** and **Account Analytics Read**. Not Zone Settings Write except for the one-time bot PUT (that call needs **Zone Bot Management / Zone Settings Write** or run it from an already-authenticated dashboard session). If the token used by the Worker must stay read-only, run the bot PUT with a separate admin token and do not store that token as `CF_API_TOKEN` on the stats Worker.
