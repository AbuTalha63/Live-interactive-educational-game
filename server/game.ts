import { Server, Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  Phase,
  BadgeId,
  PublicQuestion,
  PlayerSummary,
  RoomState,
  YouState,
  Quiz,
  HostCreatePayload,
  HostCreateResponse,
  HostActionPayload,
  HostActionResponse,
  PlayerJoinPayload,
  PlayerJoinResponse,
  PlayerAnswerPayload,
  PlayerAnswerResponse,
} from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InternalAnswer {
  choice: number;
  answeredAt: number; // epoch ms
}

interface InternalPlayer {
  id: string; // playerId
  name: string;
  socketId: string;
  score: number;
  connected: boolean;
  streak: number;
  currentAnswer: InternalAnswer | null;
  correctCount: number;
  fastestAnswerSec: number;
  highestStreak: number;
  lastResult: {
    correct: boolean;
    points: number;
    streakBonus: number;
    answerStreak: number;
  } | null;
  final: {
    xpEarned: number;
    badges: BadgeId[];
    correctCount: number;
  } | null;
}

interface Room {
  code: string;
  hostKey: string;
  hostSocketId: string;
  quiz: Quiz;
  phase: Phase;
  currentQuestionIndex: number;
  questionStartedAt: number | null;
  endsAt: number | null;
  timer: NodeJS.Timeout | null;
  players: Map<string, InternalPlayer>; // playerId -> InternalPlayer
  lastReveal: { correctIndex: number; counts: number[] } | null;
}

export class GameManager {
  private io: Server;
  private rooms: Map<string, Room> = new Map(); // roomCode -> Room
  private socketToPlayer: Map<string, { code: string; playerId: string }> = new Map();
  private socketToHost: Map<string, { code: string; hostKey: string }> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  public init() {
    this.io.on('connection', (socket: Socket) => {
      this.handleSocketConnection(socket);
    });
  }

  private loadQuiz(quizId: string = 'demo'): Quiz {
    const quizPath = path.join(__dirname, 'quizzes', `${quizId}.json`);
    if (fs.existsSync(quizPath)) {
      const data = fs.readFileSync(quizPath, 'utf-8');
      return JSON.parse(data) as Quiz;
    }
    // Fallback to demo
    const fallbackPath = path.join(__dirname, 'quizzes', 'demo.json');
    const fallbackData = fs.readFileSync(fallbackPath, 'utf-8');
    return JSON.parse(fallbackData) as Quiz;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  private handleSocketConnection(socket: Socket) {
    // Host creates room
    socket.on('host:create', (payload: HostCreatePayload, ack: (res: HostCreateResponse) => void) => {
      try {
        const quiz = this.loadQuiz(payload?.quizId);
        const code = this.generateRoomCode();
        const hostKey = crypto.randomUUID();

        const room: Room = {
          code,
          hostKey,
          hostSocketId: socket.id,
          quiz,
          phase: 'lobby',
          currentQuestionIndex: -1,
          questionStartedAt: null,
          endsAt: null,
          timer: null,
          players: new Map(),
          lastReveal: null,
        };

        this.rooms.set(code, room);
        this.socketToHost.set(socket.id, { code, hostKey });
        socket.join(code);

        if (typeof ack === 'function') {
          ack({ ok: true, code, hostKey });
        }
        this.broadcastRoomState(room);
      } catch (err: any) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: err?.message || 'Failed to create room' });
        }
      }
    });

    // Host reconnect / attach
    socket.on('host:attach', (payload: HostActionPayload, ack?: (res: HostActionResponse) => void) => {
      const room = this.rooms.get(payload?.code?.toUpperCase());
      if (!room || room.hostKey !== payload?.hostKey) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid room or host key' });
        return;
      }
      room.hostSocketId = socket.id;
      this.socketToHost.set(socket.id, { code: room.code, hostKey: room.hostKey });
      socket.join(room.code);
      if (typeof ack === 'function') ack({ ok: true });
      this.broadcastRoomState(room);
    });

    // Host starts / advances game
    socket.on('host:start', (payload: HostActionPayload, ack?: (res: HostActionResponse) => void) => {
      this.handleHostAdvance(socket, payload, ack, true);
    });

    socket.on('host:next', (payload: HostActionPayload, ack?: (res: HostActionResponse) => void) => {
      this.handleHostAdvance(socket, payload, ack, false);
    });

    // Host reveals early
    socket.on('host:reveal', (payload: HostActionPayload, ack?: (res: HostActionResponse) => void) => {
      const room = this.rooms.get(payload?.code?.toUpperCase());
      if (!room || room.hostKey !== payload?.hostKey) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Unauthorized' });
        return;
      }
      if (room.phase === 'question') {
        this.revealQuestion(room);
        if (typeof ack === 'function') ack({ ok: true });
      } else {
        if (typeof ack === 'function') ack({ ok: false, error: 'Not in question phase' });
      }
    });

    // Player joins
    socket.on('player:join', (payload: PlayerJoinPayload, ack: (res: PlayerJoinResponse) => void) => {
      const code = payload?.code?.trim()?.toUpperCase();
      const rawName = payload?.name || '';
      const trimmedName = rawName.trim();
      const playerId = payload?.playerId?.trim();

      if (!code || !this.rooms.has(code)) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Room not found' });
        return;
      }

      if (!playerId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Missing playerId' });
        return;
      }

      if (trimmedName.length < 1 || trimmedName.length > 16) {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Name must be between 1 and 16 characters' });
        }
        return;
      }

      const room = this.rooms.get(code)!;
      const existingPlayer = room.players.get(playerId);

      if (existingPlayer) {
        // Player reconnecting
        existingPlayer.name = trimmedName;
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
      } else {
        // Brand new player joining
        if (room.phase !== 'lobby') {
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'Game has already started' });
          }
          return;
        }

        // Check unique name within room
        const nameDuplicate = Array.from(room.players.values()).some(
          (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (nameDuplicate) {
          if (typeof ack === 'function') {
            ack({ ok: false, error: 'That name is already taken in this room' });
          }
          return;
        }

        const newPlayer: InternalPlayer = {
          id: playerId,
          name: trimmedName,
          socketId: socket.id,
          score: 0,
          connected: true,
          streak: 0,
          currentAnswer: null,
          correctCount: 0,
          fastestAnswerSec: 9999,
          highestStreak: 0,
          lastResult: null,
          final: null,
        };
        room.players.set(playerId, newPlayer);
      }

      this.socketToPlayer.set(socket.id, { code: room.code, playerId });
      socket.join(room.code);

      if (typeof ack === 'function') {
        ack({ ok: true });
      }

      // Sync room state to all and send private you state to this player
      this.broadcastRoomState(room);
      this.sendYouState(room, playerId);
    });

    // Player answers
    socket.on('player:answer', (payload: PlayerAnswerPayload, ack: (res: PlayerAnswerResponse) => void) => {
      const code = payload?.code?.trim()?.toUpperCase();
      const playerId = payload?.playerId?.trim();
      const questionIndex = payload?.questionIndex;
      const choice = payload?.choice;

      const room = this.rooms.get(code);
      if (!room || room.phase !== 'question') {
        if (typeof ack === 'function') ack({ ok: false, error: 'Question not active' });
        return;
      }

      if (room.currentQuestionIndex !== questionIndex) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Question index mismatch' });
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Player not found in room' });
        return;
      }

      const now = Date.now();
      if (room.endsAt && now > room.endsAt) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Time has expired' });
        return;
      }

      if (player.currentAnswer !== null) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Already answered this question' });
        return;
      }

      if (typeof choice !== 'number' || choice < 0 || choice > 3) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Invalid choice' });
        return;
      }

      player.currentAnswer = {
        choice,
        answeredAt: now,
      };

      if (typeof ack === 'function') {
        ack({ ok: true });
      }

      // Notify player of locked answer
      this.sendYouState(room, playerId);

      // Check if all connected players have answered
      const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected);
      const allAnswered = connectedPlayers.length > 0 && connectedPlayers.every((p) => p.currentAnswer !== null);

      if (allAnswered) {
        this.revealQuestion(room);
      } else {
        this.broadcastRoomState(room);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const playerInfo = this.socketToPlayer.get(socket.id);
      if (playerInfo) {
        this.socketToPlayer.delete(socket.id);
        const room = this.rooms.get(playerInfo.code);
        if (room) {
          const player = room.players.get(playerInfo.playerId);
          if (player && player.socketId === socket.id) {
            player.connected = false;
            this.broadcastRoomState(room);
          }
        }
      }

      const hostInfo = this.socketToHost.get(socket.id);
      if (hostInfo) {
        this.socketToHost.delete(socket.id);
      }
    });
  }

  private handleHostAdvance(
    _socket: Socket,
    payload: HostActionPayload,
    ack?: (res: HostActionResponse) => void,
    _isStart: boolean = false
  ) {
    const room = this.rooms.get(payload?.code?.toUpperCase());
    if (!room || room.hostKey !== payload?.hostKey) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Unauthorized' });
      return;
    }

    if (room.phase === 'lobby') {
      if (room.players.size < 1) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Needs at least 1 player to start' });
        return;
      }
      this.startQuestion(room, 0);
      if (typeof ack === 'function') ack({ ok: true });
      return;
    }

    if (room.phase === 'reveal') {
      // Advance to leaderboard
      room.phase = 'leaderboard';
      if (typeof ack === 'function') ack({ ok: true });
      this.broadcastRoomState(room);
      return;
    }

    if (room.phase === 'leaderboard') {
      const nextIndex = room.currentQuestionIndex + 1;
      if (nextIndex < room.quiz.questions.length) {
        this.startQuestion(room, nextIndex);
      } else {
        this.reachPodium(room);
      }
      if (typeof ack === 'function') ack({ ok: true });
      return;
    }

    if (typeof ack === 'function') ack({ ok: false, error: `Cannot advance from phase ${room.phase}` });
  }

  private startQuestion(room: Room, index: number) {
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    const question = room.quiz.questions[index];
    if (!question) return;

    room.phase = 'question';
    room.currentQuestionIndex = index;
    room.lastReveal = null;

    // Reset current answers for all players
    for (const player of room.players.values()) {
      player.currentAnswer = null;
    }

    const now = Date.now();
    const durationMs = question.timeLimitSec * 1000;
    room.questionStartedAt = now;
    room.endsAt = now + durationMs;

    // Auto-reveal timer
    room.timer = setTimeout(() => {
      this.revealQuestion(room);
    }, durationMs);

    this.broadcastRoomState(room);
    for (const player of room.players.values()) {
      this.sendYouState(room, player.id);
    }
  }

  private revealQuestion(room: Room) {
    if (room.phase !== 'question') return;

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    room.phase = 'reveal';
    const qIndex = room.currentQuestionIndex;
    const currentQ = room.quiz.questions[qIndex];
    if (!currentQ) return;

    const counts = [0, 0, 0, 0];
    const correctIndex = currentQ.correctIndex;
    const timeLimitSec = currentQ.timeLimitSec;
    const qStartedAt = room.questionStartedAt || Date.now() - timeLimitSec * 1000;

    for (const player of room.players.values()) {
      if (player.currentAnswer !== null) {
        const choice = player.currentAnswer.choice;
        if (choice >= 0 && choice < 4) counts[choice]++;

        const isCorrect = choice === correctIndex;
        if (isCorrect) {
          const elapsedSec = Math.max(0, Math.min(timeLimitSec, (player.currentAnswer.answeredAt - qStartedAt) / 1000));
          // Kahoot scoring: Math.round((1 - (elapsedSec / timeLimitSec) / 2) * 1000)
          const basePoints = Math.round((1 - (elapsedSec / timeLimitSec) / 2) * 1000);
          player.streak += 1;
          const streakBonus = player.streak >= 2 ? Math.min(100 * (player.streak - 1), 500) : 0;
          const totalPoints = basePoints + streakBonus;

          player.score += totalPoints;
          player.correctCount += 1;
          if (elapsedSec < player.fastestAnswerSec) {
            player.fastestAnswerSec = elapsedSec;
          }
          if (player.streak > player.highestStreak) {
            player.highestStreak = player.streak;
          }

          player.lastResult = {
            correct: true,
            points: basePoints,
            streakBonus,
            answerStreak: player.streak,
          };
        } else {
          // Wrong answer
          player.streak = 0;
          player.lastResult = {
            correct: false,
            points: 0,
            streakBonus: 0,
            answerStreak: 0,
          };
        }
      } else {
        // Did not answer
        player.streak = 0;
        player.lastResult = {
          correct: false,
          points: 0,
          streakBonus: 0,
          answerStreak: 0,
        };
      }
    }

    room.lastReveal = { correctIndex, counts };

    this.broadcastRoomState(room);
    for (const player of room.players.values()) {
      this.sendYouState(room, player.id);
    }
  }

  private reachPodium(room: Room) {
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
    room.phase = 'podium';

    // Calculate podium final rewards
    const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
    const totalQuestions = room.quiz.questions.length;

    sorted.forEach((player, idx) => {
      const rank = idx + 1;
      const isTop3 = rank <= 3;
      // XP: round(score / 100) + 10 for finishing, +20 for top 3
      const xpEarned = Math.round(player.score / 100) + 10 + (isTop3 ? 20 : 0);

      const badges: BadgeId[] = [];
      badges.push('first_game');
      if (player.correctCount === totalQuestions && totalQuestions > 0) {
        badges.push('perfect_game');
      }
      if (player.fastestAnswerSec < 2.0) {
        badges.push('speed_demon');
      }
      if (player.highestStreak >= 5) {
        badges.push('on_fire');
      }
      if (isTop3) {
        badges.push('podium');
      }

      player.final = {
        xpEarned,
        badges,
        correctCount: player.correctCount,
      };
    });

    this.broadcastRoomState(room);
    for (const player of room.players.values()) {
      this.sendYouState(room, player.id);
    }
  }

  private getPlayerRank(room: Room, playerId: string): number {
    const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
    const index = sorted.findIndex((p) => p.id === playerId);
    return index >= 0 ? index + 1 : 1;
  }

  private buildRoomState(room: Room): RoomState {
    const sortedPlayers: PlayerSummary[] = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
      }));

    let publicQuestion: PublicQuestion | null = null;
    if (
      (room.phase === 'question' || room.phase === 'reveal') &&
      room.currentQuestionIndex >= 0 &&
      room.currentQuestionIndex < room.quiz.questions.length
    ) {
      const q = room.quiz.questions[room.currentQuestionIndex];
      publicQuestion = {
        index: room.currentQuestionIndex,
        total: room.quiz.questions.length,
        prompt: q.prompt,
        options: q.options,
        timeLimitSec: q.timeLimitSec,
      };
    }

    const answeredCount = Array.from(room.players.values()).filter((p) => p.currentAnswer !== null).length;

    return {
      code: room.code,
      phase: room.phase,
      players: sortedPlayers,
      question: publicQuestion,
      endsAt: room.phase === 'question' ? room.endsAt : null,
      serverNow: Date.now(),
      answeredCount,
      reveal: room.phase === 'reveal' || room.phase === 'leaderboard' || room.phase === 'podium' ? room.lastReveal : null,
    };
  }

  public broadcastRoomState(room: Room) {
    const state = this.buildRoomState(room);
    this.io.to(room.code).emit('room:state', state);
  }

  public sendYouState(room: Room, playerId: string) {
    const player = room.players.get(playerId);
    if (!player) return;

    const rank = this.getPlayerRank(room, playerId);
    const you: YouState = {
      playerId: player.id,
      score: player.score,
      rank,
      answeredCurrent: player.currentAnswer !== null,
      lastResult: player.lastResult,
      final: player.final,
    };

    this.io.to(player.socketId).emit('you', you);
  }
}
