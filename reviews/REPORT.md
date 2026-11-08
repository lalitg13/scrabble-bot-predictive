# CasualThinker — game reviews and adaptation

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


# Match 43252 — chess-style review

Finished Nov 07, 2026, 06:13:37 PM CST. CasualThinker (203): **6 / 6, 36 points, 4 coins left**.

Field (bot id: score): 207: 82, 165: 77, 215: 74, 206: 67, 185: 39, 203: 36.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: ELLWY (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:12:27 PM | Played WELLY for 22 | **Nice** | Rack ELLWY → empty; coins 100 → 122. Best available 22-point five; sensible immediate capital. YELLOW (30) needed an O and another auction, so this was not an obvious missed word. |
| 06:12:29 PM | Bid 19 on U; paid 17 (auction 2842408) | **Mistake** | Rack empty → U; coins 122 → 105. 17 for an empty-rack U was an expensive speculative start with no immediate word. |
| 06:12:34 PM | Bid 17 on O; paid 16 (auction 2842443) | **Mistake** | Rack U → OU; coins 105 → 89. U→OU spent another 16 on an all-vowel rack; a consonant was the missing resource. |
| 06:12:37 PM | Bid 16 on D; paid 13 (auction 2842464) | **Good** | Rack OU → DOU; coins 89 → 76. D repaired OU into DOU and made DUO available while retaining building potential. |
| 06:12:38 PM | Bid 14 on I; paid 12 (auction 2842471) | **Inaccuracy** | Rack DOU → DIOU; coins 76 → 64. DIOU became three vowels to one consonant for 12, without improving the 4-point maximum. |
| 06:12:39 PM | Bid 16 on A; paid 12 (auction 2842477) | **Nice** | Rack DIOU → ADIOU; coins 64 → 52. A completed AUDIO (12); correct tactical completion, though the route was costly. |
| 06:12:39 PM | Played AUDIO for 12 | **Inaccuracy** | Rack ADIOU → empty; coins 52 → 64. Correct current maximum, but 52 coins and 56 auctions remained; S would make AUDIOS (17). Small missed building option, not a guaranteed gain. |
| 06:12:47 PM | Bid 14 on O; paid 13 (auction 2842533) | **Inaccuracy** | Rack empty → O; coins 64 → 51. Restarting with O cost 13 from only 64 coins; no immediate word. |
| 06:12:48 PM | Bid 14 on I; paid 13 (auction 2842540) | **Mistake** | Rack O → IO; coins 51 → 38. O→IO spent 13 more without a consonant or word. |
| 06:12:50 PM | Bid 14 on I; paid 13 (auction 2842554) | **Mistake** | Rack IO → IIO; coins 38 → 25. IO→IIO duplicated I for 13 and still could not score. |
| 06:12:55 PM | Bid 14 on E; paid 13 (auction 2842580) | **Mistake** | Rack IIO → EIIO; coins 25 → 12. IIO→EIIO cost 13 for only OE (2), leaving 12 coins and no consonants. |
| 06:13:05 PM | Bid 11 on U; paid 10 (auction 2842640) | **Blunder** | Rack EIIO → EIIOU; coins 12 → 2. EIIO→EIIOU spent 10 of the last 12 coins with 31 auctions still left; the maximum remained OE (2), effectively locking out a recovery. |
| 06:13:30 PM | Played OE for 2 | **Good** | Rack EIIOU → IIU; coins 2 → 4. Best available salvage from EIIOU with 2 coins and only 7 auctions left. The preceding purchases, not this 2-point cash-out, caused the damage. |

## Verdict
Several vowel-overbuying mistakes culminated in an early funding blunder; the final OE was correct salvage.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 43259 — chess-style review

Finished Nov 07, 2026, 06:14:47 PM CST. CasualThinker (203): **5 / 6, 50 points, 5 coins left**.

Field (bot id: score): 207: 103, 165: 71, 215: 69, 206: 59, 203: 50, 202: 47.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: DGGHK (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:13:40 PM | Bid 13 on T; paid 11 (auction 2842869) | **Good** | Rack DGGHK → DGGHKT; coins 100 → 89. Added a useful consonant to DGGHK while waiting for the essential vowel. |
| 06:13:43 PM | Bid 22 on E; paid 15 (auction 2842890) | **Nice** | Rack DGGHKT → DEGGHKT; coins 89 → 74. E unlocked KHET (16) and several live six-letter continuations for 15. |
| 06:13:43 PM | Played KHET for 16 | **Inaccuracy** | Rack DEGGHKT → DGG; coins 74 → 90. KHET was the current maximum, but DEGGHKT had several affordable one-tile sixes: O→HOGGED (30), I→KITHED (35). 74 coins remained; the next won O cost 11. This is a missed option, not proof holding would win. |
| 06:13:44 PM | Bid 26 on O; paid 11 (auction 2842897) | **Good** | Rack DGG → DGGO; coins 90 → 79. O repaired DGG into a playable balanced base; later contributed to TOGGED. |
| 06:13:48 PM | Bid 11 on T; paid 11 (auction 2842925) | **Nice** | Rack DGGO → DGGOT; coins 79 → 68. T created DGGOT, exactly one E from TOGGED (22). |
| 06:13:52 PM | Bid 29 on E; paid 14 (auction 2842952) | **Great** | Rack DGGOT → DEGGOT; coins 68 → 54. 14 purchased the E completing TOGGED (22), the game’s best conversion. |
| 06:13:52 PM | Played TOGGED for 22 | **Great** | Rack DEGGOT → empty; coins 54 → 76. Converted DGGOT + E into the highest available six-letter word, 22 points, refreshing the budget from 54 to 76. |
| 06:13:53 PM | Bid 24 on L; paid 11 (auction 2842959) | **Good** | Rack empty → L; coins 76 → 65. Routine L acquisition; no immediate word, but a usable new base. |
| 06:13:56 PM | Bid 13 on N; paid 11 (auction 2842973) | **Inaccuracy** | Rack L → LN; coins 65 → 54. LN still had no vowel or word after another 11; modest speculative overspend. |
| 06:13:57 PM | Bid 14 on I; paid 11 (auction 2842980) | **Good** | Rack LN → ILN; coins 54 → 43. I repaired LN to playable LIN (3), with longer potential. |
| 06:13:58 PM | Bid 14 on O; paid 14 (auction 2842987) | **Inaccuracy** | Rack ILN → ILNO; coins 43 → 29. 14 for O improved only to LINO (6), leaving 29 before the five-letter completion. |
| 06:14:13 PM | Bid 12 on E; paid 10 (auction 2843092) | **Nice** | Rack ILNO → EILNO; coins 29 → 19. 10 completed ELOIN (10) and created many six-letter continuations; correct tile, questionable subsequent cash-out. |
| 06:14:14 PM | Played ELOIN for 10 | **Mistake** | Rack EILNO → empty; coins 19 → 29. EILNO was cashed for 10 with 19 coins and 33 auctions left. F→OLEFIN (22), P→PINOLE (20), D→INDOLE (17) were concrete funded six-letter routes. |
| 06:14:20 PM | Bid 14 on E; paid 14 (auction 2843134) | **Mistake** | Rack empty → E; coins 29 → 15. 14 of 29 coins bought a singleton E from an empty rack with no immediate word. |
| 06:14:24 PM | Bid 12 on N; paid 11 (auction 2843161) | **Mistake** | Rack E → EN; coins 15 → 4. EN cost another 11 of the last 15 coins for just 2 points; left 4 with 23 auctions remaining. |
| 06:14:39 PM | Played EN for 2 | **Good** | Rack EN → empty; coins 4 → 6. EN was the maximum from EN with only 4 coins and 8 auctions left. Correct salvage; the 25-coin rebuild was the mistake. |
| 06:14:47 PM | Bid 6 on L; paid 1 (auction 2843321) | **Mistake** | Rack empty → L; coins 6 → 5. Final auction: even a 1-coin singleton L could not form a word after EN was gone. Coins were worthless, but this bid had no scoring purpose. |

## Verdict
One Great six-letter conversion, then a weak-five cash-out and an unaffordable rebuild spoiled the endgame.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 43266 — chess-style review

Finished Nov 07, 2026, 06:15:58 PM CST. CasualThinker (203): **5 / 6, 48 points, 0 coins left**.

Field (bot id: score): 187: 100, 207: 96, 165: 83, 206: 73, 203: 48, 202: 0.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: BDSTY (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:14:51 PM | Bid 20 on E; paid 17 (auction 2843345) | **Nice** | Rack BDSTY → BDESTY; coins 100 → 83. 17 bought E to complete BYTES (20), a useful positive scoring conversion. |
| 06:14:52 PM | Played BYTES for 20 | **Nice** | Rack BDESTY → D; coins 83 → 103. Best available 20-point word from BDESTY, leaving D and restoring the budget to 103. Six-letter continuations existed but required another win. |
| 06:14:57 PM | Bid 18 on I; paid 13 (auction 2843384) | **Good** | Rack D → DI; coins 103 → 90. I gave D a vowel and kept a path toward a longer word. |
| 06:14:58 PM | Bid 16 on A; paid 16 (auction 2843391) | **Inaccuracy** | Rack DI → ADI; coins 90 → 74. 16 for A made ADI, only a 4-point word, while increasing vowel saturation. |
| 06:14:59 PM | Bid 14 on O; paid 14 (auction 2843398) | **Mistake** | Rack ADI → ADIO; coins 74 → 60. 14 more for O made ADIO, three vowels to one consonant with no maximum-score improvement. |
| 06:15:01 PM | Bid 10 on L; paid 9 (auction 2843412) | **Nice** | Rack ADIO → ADILO; coins 60 → 51. 9 bought L, repairing the vowel-heavy shape and making DIAL (7) plus live six-letter hooks. |
| 06:15:05 PM | Bid 19 on V; paid 14 (auction 2843439) | **Nice** | Rack ADILO → ADILOV; coins 51 → 37. 14 bought V to complete AVOID (18), also opening VALGOID/OVOIDAL routes. |
| 06:15:05 PM | Played AVOID for 18 | **Inaccuracy** | Rack ADILOV → L; coins 37 → 55. Current maximum 18, but ADILOV had funded six/seven-letter routes (G→VALGOID 36, O→OVOIDAL 33, E→VAILED 25) with 37 coins and 52 auctions left. |
| 06:15:08 PM | Bid 12 on N; paid 11 (auction 2843460) | **Inaccuracy** | Rack L → LN; coins 55 → 44. 11 bought a second consonant LN without a vowel; no current word. |
| 06:15:09 PM | Bid 16 on S; paid 13 (auction 2843467) | **Inaccuracy** | Rack LN → LNS; coins 44 → 31. 13 for S left LNS and just 31 coins; strong tile but still no scoring vowel. |
| 06:15:11 PM | Bid 14 on O; paid 13 (auction 2843481) | **Good** | Rack LNS → LNOS; coins 31 → 18. O supplied the essential vowel to LNS and created playable NOS. |
| 06:15:12 PM | Bid 15 on I; paid 14 (auction 2843488) | **Mistake** | Rack LNOS → ILNOS; coins 18 → 4. 14 of 18 coins bought I for LINOS (10), leaving 4 before cash-out and almost no follow-up budget. |
| 06:15:12 PM | Played LINOS for 10 | **Good** | Rack ILNOS → empty; coins 4 → 14. Current maximum from ILNOS; only 4 coins remained before the play. Banking 10 restored 14 coins. Holding for a six without funding was not clearly better. |
| 06:15:15 PM | Bid 14 on E; paid 14 (auction 2843509) | **Blunder** | Rack empty → E; coins 14 → 0. Spent every remaining coin (14) on singleton E after LINOS. Rack E could not score; 42 auctions remained, all subsequent bids were skipped. |

## Standout misses
**Mistake — forced skips after auction 2843509:** the log shows every following tile skipped with zero coins. This is the consequence of the already-graded E Blunder, not evidence each individual pass was a separate decision error.

## Verdict
The decisive blunder was spending the last 14 coins on an unplayable singleton with most of the bag left.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 43273 — chess-style review

Finished Nov 07, 2026, 06:17:49 PM CST. CasualThinker (203): **6 / 6, 32 points, 17 coins left**.

Field (bot id: score): 187: 105, 207: 103, 165: 77, 178: 75, 206: 49, 203: 32.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: FIMS plus 1 unidentified tile(s).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:15:59 PM | Bid 12 on U; paid 11 (auction 2843812) | **Good** | Rack FIMS? → FIMSU?; coins 100 → 89. U added vowel support to known FIMS; T would make MUFTIS (27). Unknown starting tile limits exact comparison. |
| 06:16:00 PM | Bid 22 on R; paid 15 (auction 2843819) | **Nice** | Rack FIMSU? → FIMRSU?; coins 89 → 74. 15 bought R to unlock FIRMS (20) and several six-letter routes. |
| 06:16:00 PM | Played FIRMS for 20 | **Inaccuracy** | Rack FIMRSU? → U?; coins 74 → 94. 20 was a solid current word, but the known FIMRSU subset had T→MUFTIS (27), E→FEMURS (27), P→FRUMPS (32), with 74 coins. The very next T was won for 15. One starting tile remains unidentified. |
| 06:16:01 PM | Bid 19 on T; paid 15 (auction 2843826) | **Inaccuracy** | Rack U? → TU?; coins 94 → 79. 15 bought T just after FIRMS was dissolved; had the rack been held, T would have completed MUFTIS (27). |
| 06:16:05 PM | Bid 14 on O; paid 10 (auction 2843851) | **Good** | Rack TU? → OTU?; coins 79 → 69. O added useful development to known TU plus an unknown tile. |
| 06:16:15 PM | Bid 11 on A; paid 10 (auction 2843913) | **Good** | Rack OTU? → AOTU?; coins 69 → 59. A made AUTO available; keep it as a building option rather than cashing for 6. |
| 06:16:21 PM | Bid 11 on U; paid 11 (auction 2843955) | **Mistake** | Rack AOTU? → AOTUU?; coins 59 → 48. 11 bought a second U; AUTO was already possible before this win, and the duplicate did not improve the known maximum. |
| 06:16:22 PM | Played AUTO for 6 | **Mistake** | Rack AOTUU? → U?; coins 48 → 54. Cashed only 6 with 46 auctions and 48 coins left, from known AOTUU plus one unknown tile. No better same-rack word is established, but dissolving the four instead of fishing retained no meaningful scoring engine. |
| 06:16:23 PM | Bid 11 on I; paid 11 (auction 2843962) | **Inaccuracy** | Rack U? → IU?; coins 54 → 43. I added another vowel to known U plus an unknown tile without a substantial scoring word. |
| 06:16:30 PM | Bid 14 on E; paid 12 (auction 2844011) | **Inaccuracy** | Rack IU? → EIU?; coins 43 → 31. E continued vowel-heavy collection rather than fixing the missing consonants. |
| 06:16:36 PM | Bid 11 on I; paid 10 (auction 2846732) | **Mistake** | Rack EIU? → EIIU?; coins 31 → 21. Duplicated I for 10; known EIIU had no new higher-reward word. |
| 06:17:07 PM | Bid 11 on T; paid 10 (auction 2846850) | **Good** | Rack EIIU? → EIITU?; coins 21 → 11. T finally supplied the consonant enabling ETUI (6); low yield, but a genuine salvage completion. |
| 06:17:16 PM | Played ETUI for 6 | **Inaccuracy** | Rack EIITU? → I?; coins 11 → 17. Best known salvage for 6, but 13 auctions and 11 coins remained; the blanket <=15 cash-out ended development early. Unknown fifth starting tile limits alternative certainty. |

## Verdict
A promising opening was dismantled too early; duplicate vowels and 6-point fours dominated the rest.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 43340 — chess-style review

Finished Nov 07, 2026, 06:29:03 PM CST. CasualThinker (203): **6 / 6, 32 points, 9 coins left**.

Field (bot id: score): 171: 142, 167: 90, 215: 75, 208: 60, 204: 41, 203: 32.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: AMOTT (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:27:56 PM | Bid 23 on O; paid 14 (auction 2851001) | **Great** | Rack AMOTT → AMOOTT; coins 100 → 86. O completed TOMATO (20) from the starting rack for 14, a strong six-letter conversion. |
| 06:27:56 PM | Played TOMATO for 20 | **Great** | Rack AMOOTT → empty; coins 86 → 106. O completed AMOOTT into the maximum six-letter TOMATO (20); purchase 14, then score restored balance to 106. |
| 06:27:59 PM | Bid 17 on S; paid 16 (auction 2851022) | **Good** | Rack empty → S; coins 106 → 90. S was a useful flexible opening tile, though 16 was not cheap. |
| 06:28:00 PM | Bid 14 on O; paid 10 (auction 2851029) | **Good** | Rack S → OS; coins 90 → 80. 10 bought the required vowel O to go with S. |
| 06:28:04 PM | Bid 14 on A; paid 13 (auction 2851057) | **Inaccuracy** | Rack OS → AOS; coins 80 → 67. 13 for A made AOS but did not improve beyond a short word. |
| 06:28:07 PM | Bid 16 on S; paid 15 (auction 2851077) | **Inaccuracy** | Rack AOS → AOSS; coins 67 → 52. A second S cost 15, leaving 52; useful for LASSO, but a pricey duplicate. |
| 06:28:11 PM | Bid 12 on L; paid 11 (auction 2851105) | **Nice** | Rack AOSS → ALOSS; coins 52 → 41. 11 bought L to complete LASSO and open several stronger six-letter hooks. |
| 06:28:11 PM | Played LASSO for 10 | **Mistake** | Rack ALOSS → empty; coins 41 → 51. Cashed ALOSS for 10 with 41 coins and 50 auctions left. K→SKOALS (25), H→SHOALS (22), V→SALVOS (22) were concrete one-tile sixes. |
| 06:28:13 PM | Bid 14 on O; paid 10 (auction 2851119) | **Inaccuracy** | Rack empty → O; coins 51 → 41. Spent 10 restarting an empty rack with O, now with only 41 coins left. |
| 06:28:14 PM | Bid 14 on A; paid 13 (auction 2851126) | **Mistake** | Rack O → AO; coins 41 → 28. 13 bought A to form all-vowel AO, no word. |
| 06:28:18 PM | Bid 14 on I; paid 10 (auction 2851154) | **Mistake** | Rack AO → AIO; coins 28 → 18. 10 for I turned AO into AIO; only 2-point AI, still no consonant. |
| 06:28:19 PM | Bid 14 on A; paid 11 (auction 2851161) | **Blunder** | Rack AIO → AAIO; coins 18 → 7. 11 of the last 18 coins bought duplicate A into AAIO; maximum stayed 2 and 42 auctions remained. Follow-up consonants were then unaffordable. |
| 06:28:55 PM | Played AA for 2 | **Good** | Rack AAIO → IO; coins 7 → 9. Maximum available 2 from AAIO at 8 auctions remaining and only 7 coins. Correct salvage after vowel-overbuying, not itself a blunder. |

## Verdict
Great TOMATO opening, then a premature five-letter liquidation and an all-vowel funding blunder.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 45056 — chess-style review

Finished Nov 07, 2026, 06:30:14 PM CST. CasualThinker (203): **6 / 6, 35 points, 1 coins left**.

Field (bot id: score): 167: 96, 215: 88, 171: 80, 208: 71, 204: 60, 203: 35.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: EEEIT (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:29:07 PM | Bid 13 on I; paid 11 (auction 2851478) | **Mistake** | Rack EEEIT → EEEIIT; coins 100 → 89. 11 bought a duplicate I into starting EEEIT, worsening an already vowel-heavy rack without improving TEE (3). |
| 06:29:09 PM | Bid 12 on O; paid 8 (auction 2851484) | **Mistake** | Rack EEEIIT → EEEIIOT; coins 89 → 81. 8 for O further overloaded EEEIIT with vowels; still only TEE (3). |
| 06:29:16 PM | Bid 21 on V; paid 18 (auction 2851533) | **Nice** | Rack EEEIIOT → EEEIIOTV; coins 81 → 63. 18 bought V, a needed consonant and direct EVITE (16) completion; expensive but useful repair. |
| 06:29:16 PM | Played EVITE for 16 | **Inaccuracy** | Rack EEEIIOTV → EIO; coins 63 → 79. Best available 16 from EEEIIOTV, but 63 coins and 57 auctions left could fund N→INVITEE (30), V→VOTIVE (30), C→EVICTEE (36). The next won N cost 11. |
| 06:29:20 PM | Bid 15 on N; paid 11 (auction 2851560) | **Nice** | Rack EIO → EINO; coins 79 → 68. N was a useful hook; if EVITE had been retained it would make INVITEE (30). |
| 06:29:22 PM | Bid 15 on S; paid 14 (auction 2851574) | **Nice** | Rack EINO → EINOS; coins 68 → 54. S completed EOSIN and opened six-letter continuations; correct tactical tile. |
| 06:29:22 PM | Played EOSIN for 10 | **Mistake** | Rack EINOS → empty; coins 54 → 64. Cashed EINOS for 10 with 54 coins and 51 auctions left. The next won P (16) would instead make OPINES (20), a concrete six-letter route. |
| 06:29:23 PM | Bid 22 on P; paid 16 (auction 2851581) | **Mistake** | Rack empty → P; coins 64 → 48. 16 bought a singleton P from the freshly emptied rack; holding EINOS would instead have made OPINES (20). |
| 06:29:26 PM | Bid 14 on O; paid 12 (auction 2851602) | **Inaccuracy** | Rack P → OP; coins 48 → 36. 12 for O made only OP (4), consuming a substantial share of 48 coins. |
| 06:29:35 PM | Bid 14 on I; paid 13 (auction 2854932) | **Mistake** | Rack OP → IOP; coins 36 → 23. 13 for I improved OP (4) to POI (5) while leaving only 23 coins. |
| 06:29:38 PM | Bid 16 on S; paid 13 (auction 2854953) | **Inaccuracy** | Rack IOP → IOPS; coins 23 → 10. 13 for S completed PISO (9) but left only 10 coins for further building. |
| 06:30:00 PM | Played PISO for 9 | **Good** | Rack IOPS → empty; coins 10 → 19. Best available 9 from IOPS with 10 coins and 14 auctions left. Sensible salvage; repeated expensive purchases had already narrowed the options. |
| 06:30:01 PM | Bid 17 on S; paid 10 (auction 2855098) | **Mistake** | Rack empty → S; coins 19 → 9. 10 of 19 remaining coins bought singleton S with just 12 auctions left and no word. |
| 06:30:02 PM | Bid 9 on R; paid 8 (auction 2855104) | **Blunder** | Rack S → RS; coins 9 → 1. 8 of the last 9 coins bought R into RS, no vowel and no word, with 11 auctions left. Final rack RS never scored. |

## Verdict
Repeated vowel mistakes, premature low fives, and a dead RS endgame; no Brilliant move established.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 45063 — chess-style review

Finished Nov 07, 2026, 06:31:24 PM CST. CasualThinker (203): **6 / 6, 40 points, 2 coins left**.

Field (bot id: score): 215: 137, 171: 119, 208: 65, 167: 52, 204: 51, 203: 40.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: ACEIV (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:30:16 PM | Played CAVIE for 20 | **Nice** | Rack ACEIV → empty; coins 100 → 120. Starting ACEIV immediately scored its maximum 20 and freed 120 coins. No acquired tile was required; this was useful capital, not a rare brilliant find. |
| 06:30:20 PM | Bid 19 on N; paid 11 (auction 2855216) | **Good** | Rack empty → N; coins 120 → 109. Routine core-letter opening with ample budget. |
| 06:30:22 PM | Bid 17 on E; paid 13 (auction 2855230) | **Good** | Rack N → EN; coins 109 → 96. E supplied the vowel for EN and future building. |
| 06:30:26 PM | Bid 17 on R; paid 13 (auction 2855258) | **Good** | Rack EN → ENR; coins 96 → 83. R kept the rack flexible, though 13 was not cheap. |
| 06:30:27 PM | Bid 15 on T; paid 12 (auction 2855265) | **Good** | Rack ENR → ENRT; coins 83 → 71. T made RENT (6) and left a clear path to longer scoring. |
| 06:30:28 PM | Bid 14 on S; paid 13 (auction 2855272) | **Nice** | Rack ENRT → ENRST; coins 71 → 58. S completed NERTS and opened funded six-letter hooks; the later immediate cash-out was the problem. |
| 06:30:29 PM | Played NERTS for 10 | **Mistake** | Rack ENRST → empty; coins 58 → 68. ENRST was cashed for 10 with 58 coins and 55 auctions left. Y→SENTRY (22), W→STREWN (22), B→BRENTS (20) were funded sixes. |
| 06:30:34 PM | Bid 13 on R; paid 12 (auction 2855308) | **Inaccuracy** | Rack empty → R; coins 68 → 56. 12 restarted an empty rack with R rather than preserving the prior five. |
| 06:30:35 PM | Bid 16 on S; paid 14 (auction 2855314) | **Inaccuracy** | Rack R → RS; coins 56 → 42. 14 bought S into RS, still no vowel, leaving 42. |
| 06:30:38 PM | Bid 14 on O; paid 14 (auction 2855332) | **Good** | Rack RS → ORS; coins 42 → 28. O repaired RS into a playable vowel/consonant rack. |
| 06:30:39 PM | Bid 14 on U; paid 12 (auction 2855338) | **Mistake** | Rack ORS → ORSU; coins 28 → 16. 12 bought U, making ORSU (OURS 6), leaving just 16 to finish the word and continue. |
| 06:30:43 PM | Bid 12 on L; paid 12 (auction 2855362) | **Inaccuracy** | Rack ORSU → LORSU; coins 16 → 4. 12 completed LOURS (10) but consumed all except 4 coins before cash-out. |
| 06:30:44 PM | Played LOURS for 10 | **Good** | Rack LORSU → empty; coins 4 → 14. Maximum 10 from LORSU with only 4 coins before play. Cashing replenished to 14; poor earlier purchasing made the promising six-letter hooks unaffordable. |
| 06:30:50 PM | Bid 14 on O; paid 12 (auction 2855404) | **Blunder** | Rack empty → O; coins 14 → 2. Spent 12 of the last 14 coins on lone O from an empty rack with 33 auctions left. No follow-up word could be financed. |

## Verdict
Good opening capital was spent rebuilding low fives; the final O repeated the isolated-singleton blunder.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 45070 — chess-style review

Finished Nov 07, 2026, 06:32:38 PM CST. CasualThinker (203): **6 / 6, 15 points, 66 coins left**.

Field (bot id: score): 18: 119, 167: 96, 215: 93, 114: 84, 202: 80, 203: 15.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: BMPU plus 1 unidentified tile(s).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:31:34 PM | Bid 13 on O; paid 11 (auction 2855661) | **Good** | Rack BMPU? → BMOPU?; coins 100 → 89. O added development to known BMPU plus an unknown tile; not enough public evidence for a stronger judgment. |
| 06:31:35 PM | Played BUMP for 15 | **Good** | Rack BMOPU? → O?; coins 89 → 104. 15 was the maximum established from known BMOPU plus one unknown starting tile. Recovered useful capital; no better complete word is demonstrated. |
| 06:31:36 PM | Bid 18 on A; paid 15 (auction 2855673) | **Inaccuracy** | Rack O? → AO?; coins 104 → 89. 15 bought A into O plus an unknown tile; speculative vowel acquisition, no demonstrated high-value word. |
| 06:31:48 PM | Bid not logged on A; paid 9 (auction 2855745) | **Mistake** | Rack AO? → AAO?; coins 89 → 80. Another A cost 9, compounding known all-vowel AAO without a demonstrated completion. |
| 06:31:49 PM | Bid not logged on E; paid 14 (auction 2855751) | **Mistake** | Rack AAO? → AAEO?; coins 80 → 66. 14 bought E into known AAO, further saturating vowels; no demonstrated strong word, then the client stopped acting. |

## Reliability move
**Blunder — stopped acting / missed the rest of the game:** after the last logged bid on K, live SQL records two more vowel wins but no more word plays. The process later showed about 201% CPU and 4.2 GB RSS before restart. It finished at 15 points / 66 coins. The exact stall mechanism is not proved; historical all-table hydration is a plausible contributor, so subscriptions were bounded. No private rack assumption is needed to grade the prolonged sit-out.

## Verdict
Reliability blunder: the client stopped submitting actions, finishing on 15 with 66 useless coins.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.


---

# Match 45085 — chess-style review

Finished Nov 07, 2026, 06:35:41 PM CST. CasualThinker (203): **6 / 6, 35 points, 8 coins left**.

Field (bot id: score): 179: 88, 194: 80, 195: 74, 188: 58, 168: 47, 203: 35.

## Evidence and limitations
Public scrabblebot SQL: match_state, match_participant, word_play, auction, auction_result, auction_top_bid_archive; local bid logs cross-checked. Points are also credited as coins: replay balance = 100 + scored points − prices paid. Auctions remaining are from 68 auction tiles (98 minus six starting racks of five). Bids are submitted amounts from logs, not necessarily timely/accepted; paid is authoritative. No invented private losing bids.
Initial rack reconstructed by prefix tile conservation: AARTU (all five tiles determined).
Single-tile alternatives are real dictionary words, not guaranteed future auction wins. Grades are qualitative judgments, not a numeric engine accuracy or proven counterfactual win rate.

## Graded actions
| Time (CST) | Action | Grade | Position and reason |
|---|---|---|---|
| 06:34:37 PM | Bid 21 on E; paid 12 (auction 2859249) | **Nice** | Rack AARTU → AAERTU; coins 100 → 88. 12 bought E to complete AURATE (15), a funded six-letter conversion. |
| 06:34:37 PM | Played AURATE for 15 | **Nice** | Rack AAERTU → empty; coins 88 → 103. AURATE converted the starting AARTU plus E into a six-letter word and refreshed funds from 88 to 103. Only 15 points, so not an exceptional find. |
| 06:34:41 PM | Bid 17 on T; paid 14 (auction 2859273) | **Good** | Rack empty → T; coins 103 → 89. Core T restarted a flexible rack with 103 coins, without overcommitting the budget. |
| 06:34:45 PM | Bid 16 on A; paid 14 (auction 2859297) | **Good** | Rack T → AT; coins 89 → 75. A supplied the essential vowel to T. |
| 06:34:46 PM | Bid 15 on G; paid 15 (auction 2859303) | **Inaccuracy** | Rack AT → AGT; coins 75 → 60. 15 for G improved AT (2) only to GAT (4); a costly building tile. |
| 06:34:54 PM | Bid 13 on R; paid 12 (auction 2859350) | **Good** | Rack AGT → AGRT; coins 60 → 48. R developed AGT to GRAT (7), preserving a balanced scoring path. |
| 06:34:55 PM | Bid 13 on N; paid 12 (auction 2859356) | **Nice** | Rack AGRT → AGNRT; coins 48 → 36. N enabled GRANT (12) and one-tile sixes; the new hold correctly did not cash the five immediately. |
| 06:34:58 PM | Bid 17 on E; paid 15 (auction 2859374) | **Nice** | Rack AGNRT → AEGNRT; coins 36 → 21. E completed ARGENT (17) for 15, a reasonable long-word completion with follow-up capital. |
| 06:34:58 PM | Played ARGENT for 17 | **Nice** | Rack AEGNRT → empty; coins 21 → 38. The revised hold preserved GRANT (12) until E made ARGENT (17). Correct six-letter conversion, although future seven-letter hooks were still possible. |
| 06:34:59 PM | Bid 21 on I; paid 17 (auction 2859380) | **Mistake** | Rack empty → I; coins 38 → 21. I cost 17 but landed just after ARGENT emptied the rack. A bid of 21 had been submitted during the preceding auction-close sequence; the expensive completion was no longer relevant. Bought lone I and cut 38 coins to 21. |
| 06:35:06 PM | Bid 15 on S; paid 13 (auction 2859416) | **Mistake** | Rack I → IS; coins 21 → 8. 13 bought S into IS (2), leaving 8 coins with 34 auctions remaining. Too much follow-up capital spent for a short-word base. |
| 06:35:33 PM | Bid 8 on S; paid 3 (auction 2859586) | **Good** | Rack IS → ISS; coins 8 → 5. Late second S cost only 3 and converted IS into SIS (3); a modest correct salvage, not an overpay. |
| 06:35:33 PM | Played SIS for 3 | **Good** | Rack ISS → empty; coins 5 → 8. SIS was the maximum from ISS; only 7 auctions remained and 5 coins were left before the play. Correct late salvage. |

## Verdict
First trained game produced two six-letter words and no early all-in singleton, but stale-position bidding after ARGENT still consumed the recovery budget. Added a transaction-settle delay and projected-leave bidding in response.

## Training response
Use shape-aware acquisition prices and follow-up funding; retain promising cheap fives for concrete six-letter hooks; delay weak fours only with a bounded endgame release. Preserve immediate six-letter cash-outs and skip unhooked power tiles. See LEARNINGS.md for cross-game calibration.
