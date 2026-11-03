import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import {
  getOrCreateProfile,
  calculateLevel,
  applyGameEndProgression,
  BADGE_DETAILS,
} from '../lib/profile';
import {
  RoomState,
  YouState,
  PlayerAnswerResponse,
  PlayerJoinResponse,
  Profile,
  BadgeId,
} from '../../../shared/types';

const SHAPES = ['▲', '◆', '●', '■'];

export function Play() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [youState, setYouState] = useState<YouState | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressionApplied, setProgressionApplied] = useState(false);
  const [endProgression, setEndProgression] = useState<{
    updatedProfile: Profile;
    newBadges: BadgeId[];
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
  } | null>(null);

  const cleanCode = (code || '').toUpperCase();
  const profileRef = useRef(getOrCreateProfile());

  // Connect / Reconnect and Socket Listeners
  useEffect(() => {
    if (!cleanCode) return;

    const profile = profileRef.current;

    // Send player:join to attach/restore session
    const attemptJoin = () => {
      socket.emit(
        'player:join',
        {
          code: cleanCode,
          name: profile.name || 'Player',
          playerId: profile.playerId,
        },
        (res: PlayerJoinResponse) => {
          if (res && !res.ok) {
            setError(res.error || 'Failed to connect to room');
          }
        }
      );
    };

    if (socket.connected) {
      attemptJoin();
    }
    socket.on('connect', attemptJoin);

    const onRoomState = (state: RoomState) => {
      if (state.code.toUpperCase() === cleanCode) {
        setRoomState(state);
      }
    };

    const onYou = (you: YouState) => {
      setYouState(you);
    };

    socket.on('room:state', onRoomState);
    socket.on('you', onYou);

    return () => {
      socket.off('connect', attemptJoin);
      socket.off('room:state', onRoomState);
      socket.off('you', onYou);
    };
  }, [cleanCode]);

  // Reset choice on new question
  useEffect(() => {
    if (roomState?.phase === 'question') {
      setSelectedChoice(null);
      setIsSubmitting(false);
    }
  }, [roomState?.question?.index, roomState?.phase]);

  // Apply progression when reaching podium
  useEffect(() => {
    if (roomState?.phase === 'podium' && youState?.final && !progressionApplied) {
      setProgressionApplied(true);
      const prog = applyGameEndProgression(youState.final);
      setEndProgression(prog);
    }
  }, [roomState?.phase, youState?.final, progressionApplied]);

  const handleSelectAnswer = (choiceIndex: number) => {
    if (
      isSubmitting ||
      youState?.answeredCurrent ||
      selectedChoice !== null ||
      !roomState?.question
    ) {
      return;
    }

    setSelectedChoice(choiceIndex);
    setIsSubmitting(true);
    setError(null);

    const profile = profileRef.current;

    socket.emit(
      'player:answer',
      {
        code: cleanCode,
        playerId: profile.playerId,
        questionIndex: roomState.question.index,
        choice: choiceIndex,
      },
      (res: PlayerAnswerResponse) => {
        setIsSubmitting(false);
        if (res && !res.ok) {
          setError(res.error || 'Failed to submit answer');
          setSelectedChoice(null);
        }
      }
    );
  };

  const phase = roomState?.phase || 'lobby';

  return (
    <div className="player-container">
      {error && <div className="error-banner">{error}</div>}

      {/* LOBBY PHASE */}
      {phase === 'lobby' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>
            You're in!
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', marginBottom: '2rem' }}>
            Watch the screen. The game will start soon!
          </p>

          <div
            className="card"
            style={{ width: '100%', maxWidth: '360px', textAlign: 'center' }}
          >
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Playing as
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', margin: '0.25rem 0' }}>
              {profileRef.current.name || 'Player'}
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--accent-purple)', fontWeight: 700 }}>
              Room {cleanCode}
            </div>
          </div>
        </div>
      )}

      {/* QUESTION PHASE */}
      {phase === 'question' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>
              Q{(roomState?.question?.index ?? 0) + 1} of {roomState?.question?.total ?? 0}
            </span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--xp-gold)' }}>
              {youState?.score ?? 0} pts
            </span>
          </div>

          {/* Locked State or Answer Buttons */}
          {youState?.answeredCurrent || selectedChoice !== null ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '4.5rem', marginBottom: '1rem' }}>🔒</div>
              <h2 style={{ fontSize: '2.2rem', fontWeight: 900, marginBottom: '0.5rem' }}>
                Answer locked in!
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                Hang tight for the reveal on screen...
              </p>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.85rem',
              }}
            >
              {roomState?.question?.options.map((optionText, idx) => (
                <button
                  key={idx}
                  className={`option-btn option-${idx}`}
                  disabled={isSubmitting}
                  onClick={() => handleSelectAnswer(idx)}
                >
                  <span className="shape-icon">{SHAPES[idx]}</span>
                  <span style={{ textAlign: 'center', fontSize: '1.2rem', wordBreak: 'break-word' }}>
                    {optionText}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REVEAL PHASE */}
      {phase === 'reveal' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          {youState?.lastResult?.correct ? (
            <>
              <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🎉</div>
              <h1 style={{ fontSize: '2.75rem', fontWeight: 900, color: '#22c55e', marginBottom: '0.5rem' }}>
                Correct!
              </h1>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fff', marginBottom: '1rem' }}>
                +{youState.lastResult.points + youState.lastResult.streakBonus} pts
              </div>
              {youState.lastResult.streakBonus > 0 && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(249, 115, 22, 0.2)',
                    border: '1px solid var(--streak-orange)',
                    color: 'var(--streak-orange)',
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    marginBottom: '1rem',
                  }}
                >
                  🔥 {youState.lastResult.answerStreak} in a row! (+{youState.lastResult.streakBonus} bonus)
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>❌</div>
              <h1 style={{ fontSize: '2.75rem', fontWeight: 900, color: 'var(--color-red)', marginBottom: '0.5rem' }}>
                Incorrect
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '1rem' }}>
                Keep going! Next question coming up.
              </p>
            </>
          )}

          <div
            className="card"
            style={{ width: '100%', maxWidth: '340px', marginTop: '1rem', textAlign: 'center' }}
          >
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Current Standing
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 900, margin: '0.25rem 0' }}>
              Rank #{youState?.rank ?? '-'}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--xp-gold)' }}>
              {youState?.score ?? 0} total points
            </div>
          </div>
        </div>
      )}

      {/* LEADERBOARD PHASE */}
      {phase === 'leaderboard' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 900, marginBottom: '0.5rem' }}>
            Scoreboard Update
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2rem' }}>
            Check the main screen to see the leaders!
          </p>

          <div className="card" style={{ width: '100%', maxWidth: '340px' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
              Your Rank
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#fff' }}>
              #{youState?.rank ?? '-'}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--xp-gold)' }}>
              {youState?.score ?? 0} pts
            </div>
          </div>
        </div>
      )}

      {/* PODIUM & PROGRESSION PHASE */}
      {phase === 'podium' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            overflowY: 'auto',
            paddingBottom: '2rem',
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>🏆</div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.25rem' }}>
            Game Finished!
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>
            You finished <strong>Rank #{youState?.rank ?? '-'}</strong> with{' '}
            <strong>{youState?.score ?? 0} pts</strong>
          </p>

          {/* XP & Level Progress */}
          {endProgression && (
            <div className="card" style={{ width: '100%', textAlign: 'left', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--xp-gold)' }}>
                  +{youState?.final?.xpEarned ?? 0} XP Earned
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 800, color: 'var(--streak-orange)' }}>
                  🔥 {endProgression.updatedProfile.streakDays} Day Streak!
                </span>
              </div>

              {endProgression.leveledUp && (
                <div
                  style={{
                    background: 'linear-gradient(90deg, #8b5cf6, #d946ef)',
                    padding: '0.65rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    color: 'white',
                    fontWeight: 900,
                    textAlign: 'center',
                    marginBottom: '1rem',
                    fontSize: '1.1rem',
                  }}
                >
                  🚀 LEVEL UP! You reached Level {endProgression.newLevel}!
                </div>
              )}

              {/* Progress bar */}
              {(() => {
                const info = calculateLevel(endProgression.updatedProfile.xp);
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700 }}>Level {info.level}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {endProgression.updatedProfile.xp} XP {info.nextLevelXp ? `/ ${info.nextLevelXp} XP` : '(MAX)'}
                      </span>
                    </div>
                    <div style={{ height: '10px', background: 'var(--bg-darker)', borderRadius: '5px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${info.progressPercent}%`,
                          background: 'linear-gradient(90deg, var(--xp-gold), #f59e0b)',
                          transition: 'width 1s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Badges Earned */}
              {endProgression.newBadges.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    New Badges Unlocked!
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {endProgression.newBadges.map((badgeId) => (
                      <div
                        key={badgeId}
                        style={{
                          background: 'var(--surface-card)',
                          padding: '0.6rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          border: '1px solid var(--xp-gold)',
                        }}
                      >
                        <span style={{ fontSize: '1.8rem' }}>{BADGE_DETAILS[badgeId]?.icon}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1rem' }}>{BADGE_DETAILS[badgeId]?.title}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {BADGE_DETAILS[badgeId]?.description}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
