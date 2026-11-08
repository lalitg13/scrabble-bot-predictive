# Cumulative learning — CasualThinker bot 203

## Review coverage
Reviewed completed post-rewrite matches 43252, 43259, 43266, 43273, 43340, 45056, 45063, 45070, and first trained match 45085. All results, words, payments, and submitted bids come from live public scrabblebot SQL and the local client logs. Match 45070 ended 6th, 15 points, 66 coins after the process stopped acting. Starting rack is five tiles, not an empty rack; auctions have 68 tiles after initial dealing.

Balances are replenished by word rewards. The reviewed strategy did not merely spend 100 coins: total purchasing power is 100 plus points scored. Replay applies this exactly and reconciles final balances. No secret, token, JWT, or nonce is stored in these reports.

## Repeated losing patterns
1. **All-vowel and duplicate accumulation:** EIIOU in 43252, AAIO in 43340, starting EEEIT worsened by I/O in 45056. Generic letter floors and spend-down swamped rack shape.
2. **Unfunded rebuilds / isolated singleton blunders:** 43266 spent all 14 remaining coins on E with 42 auctions left; 45063 spent 12 of 14 on lone O with 33 left; 45056 finished with unplayable RS. These are blunders, not evidence that the later forced 2-point salvage words were wrong.
3. **Cashing cheap fives instead of real funded sixes:** ELOIN (10), LASSO (10), EOSIN (10), NERTS (10) had dictionary-proven one-tile six-letter continuations and enough time/coins to fish. Treat hooks as options, not guaranteed auction wins.
4. **Weak fours too early:** AUTO (6) with 46 auctions left dismantled the building rack. ETUI (6) with 13 left was a lesser timing inaccuracy.
5. **Reliability:** client froze with high CPU/RSS while subscribed to every historical table. This is a plausible data-volume issue, not a proven memory-leak diagnosis.
6. **Transaction/word timing:** first trained match 45085 won I for 17 immediately after ARGENT emptied its rack; the 21 bid was valued during preceding settlement. Spending on an obsolete completion is a mistake. Cache callbacks must settle before the next decision, and an in-flight cash-out must use the projected leave.

## Strong patterns to preserve
- Great E→TOGGED (22), O→TOMATO (20): one acquired tile converted a real six immediately and replenished funds.
- Useful vowels that repair consonant-heavy racks and useful consonants that repair vowel-heavy racks; price the missing resource rather than treating all common letters alike.
- Nice immediate WELLY/BYTES/CAVIE opening capital; no Brilliant label assigned without exceptional evidence.
- Correct late OE/EN/AA/SIS salvage. The prior acquisition/financing decision often deserves the blame, not the final low word.
- First trained match held GRANT (12) and reached ARGENT (17), but finished last at 35, so this is evidence of policy execution, not proof of improved win rate.

## Implemented heuristic training (strategy.ts)
- Four-letter hold rack threshold 6→9, bag release 15→8. Removed early short-word release based on the old six-tile threshold; a reachable rack below four can still liquidate.
- Before playing a <=5-letter word, search 26 one-tile continuations. Hold only with >18 bag tiles, >=12 coins, and <9 rack tiles. Low words (<18 reward) need >=4 tiles of standard-bag hook frequency; stronger words need >=8 and >=8 reward gain. Every hook must be a real >=6-letter dictionary word and gain >=5. These frequencies are priors, NOT reconstructed unseen bag contents. Release late/unfunded/crowded positions. Sixes still cash immediately.
- Shape discounts: adding another vowel to a rack with >=2 vowels and >=55% vowels multiplies speculative demand by 0.25; adding a fifth consonant with no vowels by 0.55; duplicates by 0.6, third+ copies by 0.3. Repairing the deficient vowel/consonant side adds 3 to its letter floor. Genuine tactical reward gains are retained.
- More than 18 tiles left: keep min(18, ceil(25% of balance)) for follow-up, waived for a real >=6-letter completion with >=5 reward gain. Non-improving speculative tiles are additionally capped at max(2, floor(balance / max(3, 6-rackTiles))). This is a rolling follow-up budget, not permanent coin hoarding.
- With <=8 tiles left, skip tiles not improving an actual word using the NEW copy. A last-tile immediate scoring improvement can still use all remaining coins. Removed blind all-in on a late empty N.
- Added pure rackAfterWord() helper to value an immediate/in-flight cash-out's leave, not the consumed tiles.
- Original Q/Z/J/X no-hook refusal and Vickrey semantics retained; casual.ts tournament refusal unchanged.

## Small client reliability/consistency changes (index.ts)
- Replaced subscribeToAllTables() with nine narrowly relevant queries: bot 203, credential/rack views, own participant/history rows, active-match auctions/results, open-lobbies view, own lobby membership. Avoids hydrating millions of historical auctions, bids, tournament and other irrelevant rows.
- Pass live balance into chooseWord() so holding requires financing.
- Clear completed match decision caches.
- Defer auction decisions 25 ms to let auction-close transaction callbacks settle; project the rack after a cashing/in-flight word before valuing the next tile. The previous I/ARGENT incident motivated this; no claim that all asynchronous cases are solved.

## Validation
npm test: 10/10 pass. npm run build: pass. Tests cover power skips, saturated/duplicate vowels, early follow-up funds, late useless singleton refusal, last useful tile all-in, funded six-letter fishing, bounded liquidation, weak four timing, six-letter cashing, tournament refusal including empty setting, and projected-leave bidding.

At balance 100 / bag 68, empty E/A/S/R bids are 15/15/16/15; Q/Z/X = 0; HAT+E = 15. Empty late N, balance 80 / bag 6 = 0 rather than the previous blind 80. Last-tile HAT+E with balance 20 = 20 because it immediately scores.

## Limits / next feedback
These are heuristic parameter/policy updates, not neural-network training. Qualitative move grades are not an engine accuracy percentage. Future auctions are not guaranteed wins, and no counterfactual improvement is claimed as realized points. One initial tile remains unidentified in 43273 and 45070; reviews explicitly mark it as ?. Review cutoff is match 45085; later games belong to the next review cycle. No ongoing review scheduler was created or changed here.

## Cycle after 45085 (matches 45091, 45097, 45103, 45109)

Reviewed 45091 (6th, 43 pts, 15 coins), 45097 (3rd, 65 pts, 21 coins), 45103 (4th, 53 pts, 33 coins), 45109 (5th, 60 pts, 41 coins), 45115 (6th, 45 pts, 19 coins), 45121 (4th, 44 pts, 14 coins), 45127 (6th, 35 pts, 6 coins), and 45133 (5th, 64 pts, 21 coins). All words, payments, and standings from live public SQL and local logs.

### New repeating leak
- **Paying a core-letter price to complete a weak four, then running out of follow-up coins.** In 45091, R cost 13 of 22 coins to turn AIT (3) into AIRT (6). That left 9 coins; bids of 3–9 won nothing, and AIRT sat until the bag was almost empty. Related: 45097 paid 15 for a T that never entered INSOUL.

### Strong patterns from this cycle (preserve)
- Brilliant XYLENE (40) after bidding 31 / paying 13 for E; Brilliant DIOPTASE (33, eight letters) after paying 17 for P; Great AMNIOTE (27, seven letters) and TWIBIL (27).
- Immediate six-letter cash-outs continue to work: LIPIDE (22), LUTIST (15), INSOUL (15), FLEETS (22).
- Funded five-letter hold correctly released TOTES at 11 coins; late MU/AIRT salvage was fine.

### Heuristic change
- If a tile only creates or completes a word of length 4 or less and more than 16 tiles remain in the bag, cap the bid at 8 when it improves a word and at min(6, buildingCap) otherwise. Last-tile and bag<=8 logic is unchanged, so HAT+E with 1 tile left can still go all-in. Six-letter and longer completions are not capped by this rule.
- 45115 added INTONE (15) and GOLDEN (20) as more funded sixes, then spent 53 coins assembling STOAE (10). Same expensive five-letter rebuild as TOTES and FLEETS; existing reserve and building-cap rules already bound that spend, so no extra rewrite this cycle.
- 45121 added GALEAS (17, held GALES for the extra A) and OUSTED (17), then spent 45 coins on INTRO (10). Same expensive five-letter rebuild; the GALEAS hold is a pattern to keep.
- 45127 added ANURIA (15) and RATLIN (15), then dumped TET (3) and paid 13 for S to make US (2). That last buy is the short-word overpay leak again, this time as a two-letter endgame dump.
- 45133 added VIDEOS (25) and FIGURE (25), then ROBIN (14). Keep cashing funded high-value sixes immediately. B at 16 to finish ROBIN is still a bit rich for a five, but this was one of the stronger nets this cycle.
