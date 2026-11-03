export type Phase = "lobby" | "question" | "reveal" | "leaderboard" | "podium";
export type BadgeId = "first_game" | "perfect_game" | "speed_demon" | "on_fire" | "podium";

export interface PublicQuestion {
  index: number;          // 0-based
  total: number;
  prompt: string;
  options: string[];      // always 4
  timeLimitSec: number;
}

export interface PlayerSummary {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export interface RoomState {
  code: string;
  phase: Phase;
  players: PlayerSummary[];               // sorted by score, highest first
  question: PublicQuestion | null;
  endsAt: number | null;                  // server epoch ms
  serverNow: number;                      // server epoch ms when this state was sent
  answeredCount: number;
  reveal: { correctIndex: number; counts: number[] } | null;  // null before reveal
}

export interface YouState {               // sent privately to one player's socket
  playerId: string;
  score: number;
  rank: number;
  answeredCurrent: boolean;
  lastResult: { correct: boolean; points: number; streakBonus: number; answerStreak: number } | null;
  final: { xpEarned: number; badges: BadgeId[]; correctCount: number } | null;  // set at podium
}

export interface Profile {
  playerId: string;
  name: string;
  xp: number;
  streakDays: number;
  lastPlayedDay: string | null;   // "YYYY-MM-DD", local time
  badges: BadgeId[];
}

export interface QuizQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
}

export interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

// Client -> Server events with Ack
export interface HostCreatePayload {
  quizId?: string;
}

export interface HostCreateResponse {
  ok: boolean;
  code?: string;
  hostKey?: string;
  error?: string;
}

export interface HostActionPayload {
  code: string;
  hostKey: string;
}

export interface HostActionResponse {
  ok: boolean;
  error?: string;
}

export interface PlayerJoinPayload {
  code: string;
  name: string;
  playerId: string;
}

export interface PlayerJoinResponse {
  ok: boolean;
  error?: string;
}

export interface PlayerAnswerPayload {
  code: string;
  playerId: string;
  questionIndex: number;
  choice: number;
}

export interface PlayerAnswerResponse {
  ok: boolean;
  error?: string;
}
