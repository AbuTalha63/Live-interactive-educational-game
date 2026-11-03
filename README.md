# Live Quiz Game

A real-time multiplayer quiz game built with Kahoot-style gameplay and Duolingo-style progression — players join from their phones, answer timed questions, and earn XP, badges, and streaks.

> Built for the **Data Science Club Hackathon @ New York City College of Technology (CUNY)**, in partnership with **Major League Hacking (MLH)**. AI was allowed and encouraged during this hackathon.

---

## Credits

| Contributor | GitHub |
|---|---|
| Muhammad Usman | [@AbuTalha63](https://github.com/AbuTalha63) |
| Ramanpreet Singh | [@Ramanpreet8](https://github.com/Ramanpreet8) |

---

## Features

- **Host a game** — pick a quiz, get a 4-letter room code, and share a QR code for instant mobile joining
- **Join from any device** — players scan a QR code or enter the room code on their phone's browser; no app install needed
- **Real-time gameplay** — Socket.IO keeps every client in sync; answers lock in instantly and the host screen auto-reveals when everyone answers
- **Kahoot-style scoring** — faster correct answers earn more points (up to 1000 per question)
- **Streak bonuses** — consecutive correct answers add up to +500 bonus points per question
- **Leaderboard after every question** — displayed on the host screen between rounds
- **Podium & XP rewards** — game ends with a final podium; players earn XP, level up, and unlock badges
- **Daily streak tracking** — per-player streak counter saved to localStorage
- **Reconnect support** — hosts and players can refresh without losing their session
- **6 built-in quiz categories**: Demo, Science, Geography, Maths, Java Basics, Python Basics

### Badges

| Badge | Condition |
|---|---|
| 🎯 First Game | Complete your first game |
| 👑 Flawless | Answer every question correctly |
| ⚡ Speed Demon | Answer correctly in under 2 seconds |
| 🔥 On Fire | Get a 5-question answer streak |
| 🏆 Podium Finisher | Finish in the top 3 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router v6, Socket.IO client, qrcode.react |
| Backend | Node.js, Express, Socket.IO server |
| Language | TypeScript (shared types across client and server) |
| Build | Vite (client), tsx (server dev runner) |
| Dev tooling | concurrently |

---

## Project Structure

```
live-quiz-game/
├── client/               # React frontend (Vite root)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx       # Quiz selector, host/join buttons, profile card
│   │   │   ├── HostLobby.tsx  # Waiting room with QR code and player list
│   │   │   ├── HostGame.tsx   # Host view during active game
│   │   │   ├── Join.tsx       # Player name + room code entry
│   │   │   └── Play.tsx       # Player view for all game phases
│   │   └── lib/
│   │       ├── socket.ts      # Shared Socket.IO client instance
│   │       └── profile.ts     # XP, level, badge, and streak logic
├── server/
│   ├── index.ts           # Express + Socket.IO server entry point
│   ├── game.ts            # GameManager: all room and game state logic
│   └── quizzes/           # JSON quiz files
│       ├── demo.json
│       ├── science.json
│       ├── geography.json
│       ├── maths.json
│       ├── java.json
│       └── python.json
├── shared/
│   └── types.ts           # Shared TypeScript types (phases, payloads, state)
├── vite.config.ts
└── package.json
```

---

## How It Works

### Game Flow

```
Host creates room → Lobby (players join via QR/code)
    → Host starts game
        → Question (timed, players answer on phone)
        → Reveal (correct answer shown, scores updated)
        → Leaderboard (host screen)
        → [repeat for each question]
    → Podium (final rankings, XP awarded, badges unlocked)
```

### Scoring

- Base points per correct answer: `round((1 - (elapsed / timeLimit) / 2) * 1000)` — up to 1000 pts for instant answers
- Streak bonus: `100 × (streak - 1)`, capped at 500 pts (activates from 2 correct answers in a row)
- XP at game end: `round(score / 100) + 10`, plus +20 for top 3 finishers

### Socket Events

| Event | Direction | Description |
|---|---|---|
| `host:create` | Client → Server | Create a new room with a chosen quiz |
| `host:attach` | Client → Server | Reconnect as host |
| `host:start` / `host:next` | Client → Server | Advance game state |
| `host:reveal` | Client → Server | Force-reveal current question early |
| `player:join` | Client → Server | Join or reconnect to a room |
| `player:answer` | Client → Server | Submit an answer choice (0–3) |
| `room:state` | Server → All | Broadcast public game state to the room |
| `you` | Server → Player | Private state (score, rank, last result, final) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Install

```bash
git clone https://github.com/AbuTalha63/live-quiz-game.git
cd live-quiz-game
npm install
```

### Run in Development

```bash
npm run dev
```

This starts two processes concurrently:
- **Vite dev server** at `http://localhost:5173` (React client with hot reload)
- **Express + Socket.IO server** at `http://localhost:3001`

The Vite config proxies `/socket.io` requests from port 5173 to port 3001 automatically.

Open `http://localhost:5173` to host a game, then open `http://localhost:5173/join` on another device (or tab) to join as a player.

### Build for Production

```bash
npm run build      # Builds the React client into /dist
npm start          # Serves everything from the Express server on port 3001
```

In production, the Express server serves the built client from `/dist` and handles all Socket.IO traffic on a single port (default: **3001**).

---

## Adding a Custom Quiz

Create a JSON file in `server/quizzes/` following this schema:

```json
{
  "id": "my-quiz",
  "title": "My Quiz",
  "questions": [
    {
      "prompt": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "correctIndex": 1,
      "timeLimitSec": 20
    }
  ]
}
```

Then register it in `client/src/pages/Home.tsx` by adding an entry to the `QUIZZES` array:

```ts
{ id: 'my-quiz', title: 'My Quiz', description: 'A short description' },
```

---

## Hosting via ngrok

ngrok lets you share your local server with anyone on the internet — useful for demoing without deploying.

### 1. Install ngrok

Download from [https://ngrok.com/download](https://ngrok.com/download) and authenticate:

```bash
ngrok config add-authtoken <YOUR_TOKEN>
```

### 2. Build and start the production server

```bash
npm run build
npm start
```

The server listens on port 3001.

### 3. Open a tunnel

In a separate terminal:

```bash
ngrok http 3001
```

ngrok will print a public URL like:

```
Forwarding   https://abc123.ngrok-free.app -> http://localhost:3001
```

### 4. Share the URL

- **Host screen**: open the ngrok URL in a browser on the presentation device
- **Players**: share `https://abc123.ngrok-free.app/join` (or the QR code that the lobby auto-generates from `window.location.origin`)

> The QR code on the lobby screen uses `window.location.origin` automatically, so it will reflect the ngrok URL as long as the host opens the app via ngrok.

### Tips

- Use `ngrok http --region=us 3001` to pick a region closer to your players
- The free ngrok tier resets the URL on each restart — keep the tunnel running for the duration of your event
- If players report WebSocket connection issues, ensure your ngrok plan supports WebSocket traffic (all plans do by default)

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the Express + Socket.IO server listens on |

Set it before starting:

```bash
PORT=8080 npm start
```
