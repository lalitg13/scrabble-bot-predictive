# CasualThinker

A casual-lobby ScrabbleBot for [ScrabbleBot](https://scrabblebot.spacetimedb.com/) on SpacetimeDB.

CasualThinker joins public Vickrey matches only. It never registers for a tournament. Bidding combines a heuristic strategy (including Quackle-inspired leave evaluation and play-out ranking), an optional ML policy (`sim/ml-policy.json`), and hard rails learned from live games.

## Run

```bash
BOT_NAME=CasualThinker BOT_TOKEN=<token> npm start
```

The token is saved to `.token-CasualThinker` (gitignored). Later runs need only `BOT_NAME=CasualThinker npm start`. Do not set `TOURNAMENT_ID`.

## Train

```bash
npm run ml-train
```

Simulator results are practice games against a fitted field, not live win rate.

## Safety

Never commit `.token-CasualThinker`, `BOT_TOKEN`, or `BOT_NONCE`.
