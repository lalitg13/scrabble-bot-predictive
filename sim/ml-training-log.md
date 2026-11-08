# ML policy training log

All win rates are from the simulator. "Fitted field" = opponents fitted to real casual-lobby matches (the hard field). "Easy practice field" = Cheapskate/ValueBidder/Aggressive sims + FieldA + FieldB; it is NOT live accuracy.

## Run 11/7/2026, 8:26:35 PM CST — 25 min, batch 1000, eval 4000 games/policy every 5000, lr 0.02, shaping {"place":0.15,"score":0.2,"leftover":0}, selfPlay 0.2
- start | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 19.1% | place 3.17 | score 74.7 | leftover 22.2
- 6000 train games, 0.4 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 19.9% | place 3.12 | score 75.3 | leftover 23.2 | Δwin 0.8 pts **new best** | sd 0.34,0.57
- 12000 train games, 0.7 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 18.7% | place 3.21 | score 74.0 | leftover 24.4 | Δwin -0.4 pts | sd 0.34,0.57
- 18000 train games, 0.9 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 23.9% | place 2.93 | score 78.2 | leftover 23.5 | Δwin 4.9 pts **new best** | sd 0.35,0.57
- 24000 train games, 1.2 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 31.3% | place 2.56 | score 83.5 | leftover 21.0 | Δwin 12.2 pts **new best** | sd 0.36,0.57
- 30000 train games, 1.5 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 31.2% | place 2.58 | score 83.4 | leftover 23.5 | Δwin 12.1 pts | sd 0.37,0.55
- 36000 train games, 1.8 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 36.4% | place 2.36 | score 87.0 | leftover 22.9 | Δwin 17.3 pts **new best** | sd 0.39,0.53
- 42000 train games, 2.1 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 38.9% | place 2.29 | score 88.3 | leftover 24.1 | Δwin 19.9 pts **new best** | sd 0.40,0.51
- 48000 train games, 2.4 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 38.1% | place 2.33 | score 87.6 | leftover 27.2 | Δwin 19.0 pts | sd 0.41,0.50
- 54000 train games, 2.7 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 40.7% | place 2.21 | score 89.4 | leftover 27.6 | Δwin 21.7 pts **new best** | sd 0.43,0.49
- 60000 train games, 3.0 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 40.4% | place 2.24 | score 88.8 | leftover 29.0 | Δwin 21.4 pts | sd 0.43,0.48
- 66000 train games, 3.3 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 38.3% | place 2.34 | score 87.6 | leftover 30.5 | Δwin 19.2 pts | sd 0.44,0.47
- 72000 train games, 3.6 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 44.8% | place 2.08 | score 91.1 | leftover 23.7 | Δwin 25.7 pts **new best** | sd 0.45,0.46
- 78000 train games, 14.9 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 43.6% | place 2.07 | score 89.4 | leftover 19.1 | Δwin 24.6 pts | sd 0.45,0.46
- 84000 train games, 15.2 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 45.0% | place 2.09 | score 90.5 | leftover 22.8 | Δwin 26.0 pts **new best** | sd 0.45,0.47
- 90000 train games, 15.5 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 35.0% | place 2.45 | score 85.4 | leftover 32.1 | Δwin 16.0 pts | sd 0.44,0.48
- 96000 train games, 15.9 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 32.5% | place 2.57 | score 83.7 | leftover 33.6 | Δwin 13.5 pts | sd 0.44,0.49
- 102000 train games, 16.2 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 34.0% | place 2.50 | score 84.4 | leftover 32.5 | Δwin 15.0 pts | sd 0.43,0.49
- 108000 train games, 16.5 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 39.1% | place 2.29 | score 88.1 | leftover 26.9 | Δwin 20.1 pts | sd 0.43,0.50
- 114000 train games, 16.9 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 44.9% | place 2.08 | score 90.9 | leftover 20.9 | Δwin 25.9 pts | sd 0.44,0.50
- 120000 train games, 17.2 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 45.6% | place 2.04 | score 90.7 | leftover 17.6 | Δwin 26.6 pts **new best** | sd 0.44,0.50
- 126000 train games, 17.5 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 42.6% | place 2.08 | score 89.2 | leftover 16.1 | Δwin 23.6 pts | sd 0.44,0.51
- 132000 train games, 17.8 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 44.9% | place 2.03 | score 90.5 | leftover 16.9 | Δwin 25.9 pts | sd 0.44,0.51
- 138000 train games, 18.1 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 44.9% | place 2.08 | score 90.7 | leftover 19.3 | Δwin 25.8 pts | sd 0.44,0.52
- 144000 train games, 18.4 min | heuristic: win 19.1% | place 3.17 | score 74.7 | leftover 22.2 | ML: win 38.6% | place 2.30 | score 87.7 | leftover 25.1 | Δwin 19.5 pts | sd 0.43,0.52
- **held-out eval 11/7/2026, 8:46:13 PM CST, 10000 games each, fresh seeds** fitted field — heuristic: win 19.6% | place 3.15 | score 75.0 | leftover 22.5 | ML: win 45.1% | place 2.05 | score 90.3 | leftover 17.7
- easy practice field (NOT live accuracy) — heuristic: win 95.6% | place 1.04 | score 154.5 | leftover 20.9 | ML: win 96.7% | place 1.03 | score 163.4 | leftover 18.5

## Run 11/7/2026, 9:47:07 PM CST — 10 min, batch 1000, eval 2000 games/policy every 4000, lr 0.02, shaping {"place":0.15,"score":0.2,"leftover":0.1}, selfPlay 0.2, resumed
- start | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 34.7% | place 2.43 | score 85.1 | leftover 15.3
- 4000 train games, 0.4 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 22.6% | place 3.18 | score 74.5 | leftover 28.6 | Δwin 10.4 pts | sd 0.43,0.52
- 8000 train games, 0.6 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 25.9% | place 2.91 | score 78.2 | leftover 25.2 | Δwin 13.7 pts | sd 0.43,0.52
- 12000 train games, 0.8 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 24.3% | place 2.99 | score 76.8 | leftover 26.5 | Δwin 12.1 pts | sd 0.42,0.52
- 16000 train games, 1.0 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 26.8% | place 2.81 | score 79.7 | leftover 23.5 | Δwin 14.6 pts | sd 0.42,0.53
- 20000 train games, 1.3 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 30.6% | place 2.60 | score 82.5 | leftover 21.6 | Δwin 18.4 pts | sd 0.41,0.54
- 24000 train games, 1.5 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 32.0% | place 2.55 | score 82.8 | leftover 19.6 | Δwin 19.9 pts | sd 0.41,0.54
- 28000 train games, 1.7 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 32.3% | place 2.54 | score 83.0 | leftover 19.9 | Δwin 20.1 pts | sd 0.41,0.54
- 32000 train games, 1.9 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 29.5% | place 2.64 | score 81.8 | leftover 20.0 | Δwin 17.3 pts | sd 0.41,0.55
- 36000 train games, 2.2 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 30.2% | place 2.63 | score 82.1 | leftover 19.2 | Δwin 18.0 pts | sd 0.41,0.55
- 40000 train games, 2.4 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 30.8% | place 2.58 | score 82.3 | leftover 18.2 | Δwin 18.6 pts | sd 0.42,0.54
- 44000 train games, 2.6 min | heuristic: win 12.2% | place 3.59 | score 68.6 | leftover 27.8 | ML: win 29.3% | place 2.55 | score 82.7 | leftover 17.2 | Δwin 17.1 pts | sd 0.42,0.54
