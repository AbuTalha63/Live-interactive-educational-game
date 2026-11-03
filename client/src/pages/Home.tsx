import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getOrCreateProfile, calculateLevel, BADGE_DETAILS } from '../lib/profile';
import { HostCreateResponse, Profile } from '../../../shared/types';

const QUIZZES = [
  { id: 'demo', title: 'Demo Quiz', description: 'HTTP, CSS, and JavaScript basics' },
  { id: 'science', title: 'Science Basics', description: 'Explore physics, biology, and chemistry' },
  { id: 'geography', title: 'World Geography', description: 'Discover countries, landmarks, and oceans' },
  { id: 'maths', title: 'Maths Fundamentals', description: 'Practice arithmetic, fractions, and geometry' },
  { id: 'java', title: 'Java Basics', description: 'Test your knowledge of core Java concepts' },
  { id: 'python', title: 'Python Basics', description: 'Explore Python syntax and fundamentals' },
];

export function Home() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedQuizId, setSelectedQuizId] = useState(QUIZZES[0].id);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(getOrCreateProfile());
  }, []);

  const handleCreateGame = () => {
    setIsCreating(true);
    setError(null);

    socket.emit('host:create', { quizId: selectedQuizId }, (res: HostCreateResponse) => {
      setIsCreating(false);
      if (res?.ok && res.code && res.hostKey) {
        sessionStorage.setItem(`hostKey_${res.code}`, res.hostKey);
        navigate(`/host/${res.code}`);
      } else {
        setError(res?.error || 'Failed to create room. Please try again.');
      }
    });
  };

  const levelInfo = profile ? calculateLevel(profile.xp) : null;

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>
          Live Quiz <span style={{ color: 'var(--accent-purple)' }}>Game</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2.5rem' }}>
          Kahoot-style live quiz with Duolingo-style progression
        </p>

        {error && <div className="error-banner">{error}</div>}

        <div className="quiz-selector">
          <label className="form-label" htmlFor="quiz-select">Choose a quiz</label>
          <select
            id="quiz-select"
            className="quiz-select"
            value={selectedQuizId}
            onChange={(event) => setSelectedQuizId(event.target.value)}
          >
            {QUIZZES.map((quiz) => (
              <option key={quiz.id} value={quiz.id}>{quiz.title}</option>
            ))}
          </select>
          <p className="quiz-description">
            {QUIZZES.find((quiz) => quiz.id === selectedQuizId)?.description}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
          <button
            className="btn-primary"
            style={{ fontSize: '1.4rem', padding: '1.25rem', borderRadius: 'var(--radius-lg)' }}
            onClick={() => navigate('/join')}
          >
            🎮 Join as Player
          </button>

          <button
            className="btn-primary"
            style={{
              fontSize: '1.3rem',
              padding: '1.15rem',
              background: 'var(--surface)',
              border: '2px solid var(--accent-purple)',
              borderRadius: 'var(--radius-lg)',
            }}
            disabled={isCreating}
            onClick={handleCreateGame}
          >
            {isCreating ? 'Creating Room...' : '📺 Host a Game'}
          </button>
        </div>

        {profile && (
          <div className="card" style={{ textAlign: 'left', marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                  Player Profile
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{profile.name || 'Anonymous Player'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1.2rem', fontWeight: 800, color: 'var(--streak-orange)' }}>
                🔥 {profile.streakDays} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>day streak</span>
              </div>
            </div>

            {levelInfo && (
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--xp-gold)' }}>Level {levelInfo.level}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {profile.xp} XP {levelInfo.nextLevelXp ? `/ ${levelInfo.nextLevelXp} XP` : '(MAX)'}
                  </span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-darker)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${levelInfo.progressPercent}%`,
                      background: 'linear-gradient(90deg, var(--xp-gold), #f59e0b)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {profile.badges.length > 0 && (
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Badges Earned ({profile.badges.length}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {profile.badges.map((b) => (
                    <span
                      key={b}
                      title={BADGE_DETAILS[b]?.description}
                      style={{
                        background: 'var(--surface-card)',
                        padding: '0.35rem 0.65rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      {BADGE_DETAILS[b]?.icon} {BADGE_DETAILS[b]?.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
