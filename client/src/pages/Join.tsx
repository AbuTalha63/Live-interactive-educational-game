import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { getOrCreateProfile, saveProfile } from '../lib/profile';
import { PlayerJoinResponse } from '../../../shared/types';

export function Join() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  const [code, setCode] = useState(urlCode ? urlCode.toUpperCase() : '');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const profile = getOrCreateProfile();
    if (profile.name) {
      setName(profile.name);
    }
    if (urlCode) {
      setCode(urlCode.toUpperCase());
    }
  }, [urlCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanCode) {
      setError('Please enter a room code');
      return;
    }
    if (cleanName.length < 1 || cleanName.length > 16) {
      setError('Name must be between 1 and 16 characters');
      return;
    }

    setIsJoining(true);
    setError(null);

    const profile = getOrCreateProfile();

    socket.emit(
      'player:join',
      {
        code: cleanCode,
        name: cleanName,
        playerId: profile.playerId,
      },
      (res: PlayerJoinResponse) => {
        setIsJoining(false);
        if (res?.ok) {
          // Persist chosen name into profile
          profile.name = cleanName;
          saveProfile(profile);
          navigate(`/play/${cleanCode}`);
        } else {
          setError(res?.error || 'Could not join room');
        }
      }
    );
  };

  return (
    <div className="player-container" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
          Live Quiz <span style={{ color: 'var(--accent-purple)' }}>Game</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Enter room code to join the game</p>
      </div>

      <div className="card">
        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="roomCode">
              Room Code
            </label>
            <input
              id="roomCode"
              type="text"
              className="input-text"
              placeholder="e.g. ABCD"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck="false"
              autoFocus={!urlCode}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" htmlFor="nickname">
              Your Nickname
            </label>
            <input
              id="nickname"
              type="text"
              className="input-text"
              placeholder="e.g. SpeedRacer"
              maxLength={16}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!!urlCode}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={isJoining}
            style={{ fontSize: '1.3rem', padding: '1.1rem' }}
          >
            {isJoining ? 'Joining Room...' : 'Enter Game'}
          </button>
        </form>
      </div>
    </div>
  );
}
