-- הוקי מרקט — every player bettable in the season-long player markets.
--
-- The three player futures (מלך השערים, כרטיסים אדומים, כרטיסים כחולים) were
-- seeded by hand with exactly twenty runners: the top twenty by last season's
-- goals. That made 61 of the league's 81 field players — and ALL 16 goalkeepers —
-- literally impossible to bet on, even though a goalkeeper both scored and was
-- carded last season. The cut-off was also arbitrary at the margin: בארי אוליאל
-- missed the scorer market by a single goal.
--
-- This script rebuilds all three on the full field: every player on an active
-- roster, plus one אחר runner so a mid-season signing who wins does not force a
-- void. Nobody is unbettable any more.
--
-- Liquidity moves 900 → 2000. With ~98 runners every price opens near 1%, and at
-- b=900 a single 100-coin stake would take a runner from 1% to 10%. b=2000 keeps
-- a typical stake moving the price a few points instead of an order of magnitude.
-- (The LMSR's worst case is b·ln(N) ≈ 9,200 play coins — the "house" is
-- imaginary, so this only bounds how much a single correct longshot can mint.)
--
-- Two of the three had never traded, so they are rebuilt in place. מלך השערים had
-- two open bets: adding runners under them would silently re-price shares they
-- already paid for, so it is voided (a full cost-basis refund), notified, and
-- reopened as a fresh market.
--
-- Run once, as a privileged session. The market_admin_* RPCs are deliberately NOT
-- used: they guard on is_admin(), which raises for a direct/MCP session with no
-- email claim, and market_admin_add_outcome refuses any market that has traded.
--
-- One statement on purpose — every step below lands together or not at all.

do $mig$
declare
  v_red    uuid := 'd95bd629-92bb-46d1-b92c-60aafeebfa6c'; -- הכי הרבה כרטיסים אדומים
  v_blue   uuid := '5639d57b-b130-41ef-808d-b676c9779571'; -- הכי הרבה כרטיסים כחולים
  v_old    uuid := 'd881f3b4-b851-4d44-9d95-e3a2ff1d3c2b'; -- מלך השערים, the traded one
  v_scorer uuid := '8f3a1c62-4d7e-4b95-9a10-2c6b58e4f701'; -- מלך השערים, its replacement
begin

-- ── The full field, labelled ────────────────────────────────────────────────
-- Two different people are named עידו ריכטר. In a 98-row picker two identical
-- rows is a coin flip, so a name shared by more than one player carries its club.
create temporary table market_field on commit drop as
with named as (
  select p.id, p.team_id,
         regexp_replace(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')),
                        '\s+', ' ', 'g') as nm
  from players p
  join teams t on t.id = p.team_id and t.status = 'active'
),
dupes as (select nm from named group by nm having count(*) > 1),
tallies as (
  select player_id,
         sum(goals)      as goals,
         sum(red_cards)  as red_cards,
         sum(blue_cards) as blue_cards
  from game_stats group by player_id
)
select n.id,
       n.nm || case when d.nm is not null
                    then ' (' || (select name from teams where id = n.team_id) || ')'
                    else '' end as label,
       coalesce(tl.goals, 0)      as goals,
       coalesce(tl.red_cards, 0)  as red_cards,
       coalesce(tl.blue_cards, 0) as blue_cards
from named n
left join dupes d on d.nm = n.nm
left join tallies tl on tl.player_id = n.id;

-- ── 1. The two untraded card markets, rebuilt in place ─────────────────────

delete from market_outcomes where market_id in (v_red, v_blue);

insert into market_outcomes (market_id, ord, label, player_id)
select v_red,
       (row_number() over (order by f.red_cards desc, f.blue_cards desc, f.label))::smallint - 1,
       f.label, f.id
from market_field f;

insert into market_outcomes (market_id, ord, label, player_id)
select v_blue,
       (row_number() over (order by f.blue_cards desc, f.red_cards desc, f.label))::smallint - 1,
       f.label, f.id
from market_field f;

update markets set b = 2000 where id in (v_red, v_blue);

-- ── 2. מלך השערים: void the old book, open a new one on the full field ─────

-- Refunds every trader exactly what they put in, and closes the old market.
perform market_void(v_old, 'השוק נפתח מחדש עם כל שחקני הליגה — כל ההימורים הוחזרו במלואם');

-- market_void is silent (unlike market_settle), and coins that reappear in a
-- wallet with no explanation read as a bug. Tell everyone who was in it.
insert into notifications (user_id, type, entity_type, entity_id, data)
select pos.user_id, 'market_coins', 'market', null,
       jsonb_build_object(
         'delta', round(sum(pos.cost_basis), 2),
         'reason', 'מלך השערים נפתח מחדש עם כל שחקני הליגה — ההימור הקודם הוחזר',
         'balance', (select w.balance from market_wallets w where w.user_id = pos.user_id))
from market_positions pos
join market_outcomes o on o.id = pos.outcome_id
where o.market_id = v_old and pos.shares > 0
group by pos.user_id;

insert into markets (id, kind, title, subtitle, status, b, closes_at)
values (v_scorer, 'futures', 'מלך השערים 2026-27',
        'מי יסיים כמלך השערים של העונה? כל שחקני הליגה', 'open', 2000,
        '2027-06-30 21:00:00+00');

insert into market_outcomes (market_id, ord, label, player_id)
select v_scorer,
       (row_number() over (order by f.goals desc, f.label))::smallint - 1,
       f.label, f.id
from market_field f;

-- ── 3. One אחר runner per market ───────────────────────────────────────────
-- okey is CHECK-constrained to home/draw/away, so the catch-all is identified by
-- carrying no player rather than by a key of its own.

insert into market_outcomes (market_id, ord, label)
select m.id, (select max(o.ord) + 1 from market_outcomes o where o.market_id = m.id),
       'אחר — שחקן שאינו ברשימה'
from markets m
where m.id in (v_red, v_blue, v_scorer);

end
$mig$;
