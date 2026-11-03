import { useState, useEffect } from 'react';
import { RoomState, HostActionResponse } from '../../../shared/types';
import { socket } from '../lib/socket';

interface HostGameProps {
  roomState: RoomState;
  hostKey: string;
}

const OPTION_SHAPES = ['▲', '◆', '●', '■'];

export function HostGame({ roomState, hostKey }: HostGameProps) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Timer countdown computed from endsAt and server clock offset
  useEffect(() => {
    if (roomState.phase !== 'question' || !roomState.endsAt) {
      setTimeLeft(null);
      return;
    }

    const clockOffset = roomState.serverNow - Date.now();

    const updateTimer = () => {
      const nowEstimatedServer = Date.now() + clockOffset;
      const remainingMs = Math.max(0, roomState.endsAt! - nowEstimatedServer);
      const remainingSec = Math.ceil(remainingMs / 1000);
      setTimeLeft(remainingSec);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);
    return () => clearInterval(interval);
  }, [roomState.phase, roomState.endsAt, roomState.serverNow]);

  const handleReveal = () => {
    setError(null);
    socket.emit('host:reveal', { code: roomState.code, hostKey }, (res?: HostActionResponse) => {
      if (res && !res.ok) {
        setError(res.error || 'Failed to reveal answer');
      }
    });
  };

  const handleNext = () => {
    setError(null);
    socket.emit('host:next', { code: roomState.code, hostKey }, (res?: HostActionResponse) => {
      if (res && !res.ok) {
        setError(res.error || 'Failed to advance game');
      }
    });
  };

  const q = roomState.question;
  const totalConnected = roomState.players.filter((p) => p.connected).length;
  const answered = roomState.answeredCount;
  const totalAnswerCount = roomState.reveal?.counts.reduce((sum, count) => sum + count, 0) ?? 0;

  return (
    <div className="host-container">
      {/* Top Bar */}
      <header className="host-header" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>
            {roomState.phase === 'question' || roomState.phase === 'reveal'
              ? `Question ${(q?.index ?? 0) + 1} of ${q?.total ?? 0}`
              : roomState.phase === 'leaderboard'
              ? 'Leaderboard'
              : 'Podium'}
          </h2>
          {roomState.phase === 'question' && timeLeft !== null && (
            <div
              style={{
                background: timeLeft <= 5 ? 'var(--color-red)' : 'var(--accent-purple)',
                color: 'white',
                fontWeight: 900,
                fontSize: '2rem',
                padding: '0.4rem 1.4rem',
                borderRadius: 'var(--radius-full)',
                minWidth: '80px',
                textAlign: 'center',
                boxShadow: varCssShadow(timeLeft),
              }}
            >
              {timeLeft}s
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="room-pin-pill" style={{ padding: '0.5rem 1.25rem' }}>
            <span className="room-pin-label">PIN</span>
            <span className="room-pin-code" style={{ fontSize: '1.8rem' }}>
              {roomState.code}
            </span>
          </div>

          {roomState.phase === 'question' && (
            <button
              onClick={handleReveal}
              style={{
                background: 'var(--surface)',
                border: '2px solid var(--surface-border)',
                color: 'white',
                fontSize: '1.1rem',
                fontWeight: 700,
                padding: '0.65rem 1.5rem',
                borderRadius: 'var(--radius-full)',
              }}
            >
              End Early
            </button>
          )}

          {(roomState.phase === 'reveal' || roomState.phase === 'leaderboard') && (
            <button
              onClick={handleNext}
              className="btn-start"
              style={{ fontSize: '1.2rem', padding: '0.65rem 2rem' }}
            >
              Next ➔
            </button>
          )}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {/* PHASE 1 & 2: Question & Reveal */}
      {(roomState.phase === 'question' || roomState.phase === 'reveal') && q && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Question Prompt Card */}
          <div
            className="card"
            style={{
              padding: '2.5rem 2rem',
              textAlign: 'center',
              boxShadow: 'var(--shadow-lg)',
              border: '2px solid var(--surface-border)',
            }}
          >
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.3 }}>
              {q.prompt}
            </h1>
            <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '1.25rem', fontWeight: 600 }}>
              {answered} of {totalConnected} answered
            </div>
          </div>

          {roomState.phase === 'reveal' && roomState.reveal ? (
            <section className="answer-distribution" aria-labelledby="distribution-title">
              <div className="distribution-heading">
                <h2 id="distribution-title">Answer distribution</h2>
                <span>{totalAnswerCount} responses</span>
              </div>
              <div className="distribution-rows">
                {q.options.map((optionText, idx) => {
                  const count = roomState.reveal?.counts[idx] || 0;
                  const percentage = totalAnswerCount ? Math.round((count / totalAnswerCount) * 100) : 0;
                  const isCorrect = roomState.reveal?.correctIndex === idx;

                  return (
                    <div className="distribution-row" key={idx}>
                      <div className="distribution-label">
                        <span className={`distribution-shape option-${idx}`}>{OPTION_SHAPES[idx]}</span>
                        <span className="distribution-option">{optionText}</span>
                        {isCorrect && <span className="distribution-correct" aria-label="Correct answer">✓</span>}
                      </div>
                      <div
                        className="distribution-track"
                        role="progressbar"
                        aria-label={`${optionText}: ${count} answers, ${percentage}%`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <div
                          className={`distribution-fill option-${idx}`}
                          style={{ width: `${percentage}%`, animationDelay: `${idx * 100}ms` }}
                        />
                      </div>
                      <span className="distribution-count">{count} <small>({percentage}%)</small></span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="options-grid">
              {q.options.map((optionText, idx) => (
                <div key={idx} className={`option-tile option-${idx}`}>
                  <span className="shape-icon">{OPTION_SHAPES[idx]}</span>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, flex: 1 }}>{optionText}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PHASE 3: Leaderboard */}
      {roomState.phase === 'leaderboard' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ maxWidth: '800px', width: '100%' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 900, textAlign: 'center', marginBottom: '2rem' }}>
              Top Scores 🏆
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {roomState.players.slice(0, 5).map((player, idx) => (
                <div
                  key={player.id}
                  style={{
                    background: idx === 0 ? 'rgba(251, 191, 36, 0.15)' : 'var(--surface)',
                    border: idx === 0 ? '2px solid var(--xp-gold)' : '1px solid var(--surface-border)',
                    padding: '1.25rem 2rem',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <span
                      style={{
                        fontSize: '1.75rem',
                        fontWeight: 900,
                        color: idx === 0 ? 'var(--xp-gold)' : 'var(--text-muted)',
                        minWidth: '40px',
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '1.75rem', fontWeight: 800 }}>{player.name}</span>
                  </div>
                  <span style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>
                    {player.score.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4: Podium */}
      {roomState.phase === 'podium' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 36 }, (_, index) => (
              <span
                key={index}
                className="confetti-piece"
                style={{
                  left: `${(index * 37) % 100}%`,
                  animationDelay: `${(index % 12) * 0.11}s`,
                  animationDuration: `${2.8 + (index % 5) * 0.25}s`,
                  backgroundColor: ['#fbbf24', '#a78bfa', '#f472b6', '#38bdf8', '#4ade80'][index % 5],
                  transform: `rotate(${(index * 47) % 360}deg)`,
                }}
              />
            ))}
          </div>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: '3rem', letterSpacing: '-0.02em' }}>
            🎉 Quiz Winners!
          </h1>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: '2rem',
              width: '100%',
              maxWidth: '900px',
              height: '380px',
            }}
          >
            {/* 2nd Place */}
            {roomState.players[1] && (
              <PodiumColumn
                place={2}
                name={roomState.players[1].name}
                score={roomState.players[1].score}
                height="220px"
                color="#94a3b8"
                medal="🥈"
              />
            )}

            {/* 1st Place */}
            {roomState.players[0] && (
              <PodiumColumn
                place={1}
                name={roomState.players[0].name}
                score={roomState.players[0].score}
                height="300px"
                color="#fbbf24"
                medal="🥇"
              />
            )}

            {/* 3rd Place */}
            {roomState.players[2] && (
              <PodiumColumn
                place={3}
                name={roomState.players[2].name}
                score={roomState.players[2].score}
                height="160px"
                color="#b45309"
                medal="🥉"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PodiumColumn({
  place,
  name,
  score,
  height,
  color,
  medal,
}: {
  place: number;
  name: string;
  score: number;
  height: string;
  color: string;
  medal: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        justifyContent: 'flex-end',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '3rem' }}>{medal}</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 900, marginTop: '0.25rem' }}>{name}</div>
        <div style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 700 }}>
          {score.toLocaleString()} pts
        </div>
      </div>

      <div
        style={{
          width: '100%',
          height,
          background: color,
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#000',
          fontSize: '3rem',
          fontWeight: 900,
          boxShadow: 'var(--shadow-lg)',
          animation: 'popIn 0.5s ease',
        }}
      >
        {place}
      </div>
    </div>
  );
}

function varCssShadow(sec: number) {
  return sec <= 5 ? '0 0 20px rgba(226, 27, 60, 0.6)' : '0 4px 15px rgba(124, 58, 237, 0.4)';
}
