import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../lib/socket';
import { RoomState, HostActionResponse } from '../../../shared/types';
import { HostGame } from './HostGame';

export function HostLobby() {
  const { code } = useParams<{ code: string }>();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const cleanCode = (code || '').toUpperCase();
  const hostKey = sessionStorage.getItem(`hostKey_${cleanCode}`);

  useEffect(() => {
    if (!cleanCode) return;

    // Attach host socket
    if (hostKey) {
      socket.emit('host:attach', { code: cleanCode, hostKey }, (res?: HostActionResponse) => {
        if (res && !res.ok) {
          setError(res.error || 'Failed to authenticate as host');
        }
      });
    }

    const onRoomState = (state: RoomState) => {
      if (state.code.toUpperCase() === cleanCode) {
        setRoomState(state);
      }
    };

    socket.on('room:state', onRoomState);

    return () => {
      socket.off('room:state', onRoomState);
    };
  }, [cleanCode, hostKey]);

  // If game moves past lobby, show HostGame view
  if (roomState && roomState.phase !== 'lobby') {
    return <HostGame roomState={roomState} hostKey={hostKey || ''} />;
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${cleanCode}` : `/join/${cleanCode}`;

  const players = roomState?.players || [];
  const canStart = players.length >= 1;

  const handleStartGame = () => {
    if (!hostKey) {
      setError('Missing host authentication key');
      return;
    }
    setIsStarting(true);
    setError(null);

    socket.emit('host:start', { code: cleanCode, hostKey }, (res?: HostActionResponse) => {
      setIsStarting(false);
      if (res && !res.ok) {
        setError(res.error || 'Failed to start game');
      }
    });
  };

  return (
    <div className="host-container">
      <header className="host-header">
        <h1 className="host-title">Live Quiz Game</h1>
        <div className="room-pin-pill">
          <span className="room-pin-label">Join Code</span>
          <span className="room-pin-code">{cleanCode}</span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="lobby-main">
        {/* Left: QR Code & Instructions */}
        <section className="lobby-qr-card">
          <h2 className="join-instruction">Scan with phone to join:</h2>
          <div className="qr-wrapper">
            <QRCodeSVG value={joinUrl} size={220} level="M" />
          </div>
          <div className="join-url">{joinUrl}</div>
        </section>

        {/* Right: Joined Players Live Feed */}
        <section className="lobby-players-card">
          <div className="lobby-players-header">
            <div className="players-count">
              👥 Players ({players.length})
            </div>
            {players.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                Waiting for players to join...
              </span>
            )}
          </div>

          <div className="player-grid">
            {players.map((p) => (
              <div key={p.id} className="player-chip">
                <span className={`status-dot ${p.connected ? '' : 'offline'}`} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>

          <footer className="lobby-footer">
            <button
              className="btn-start"
              disabled={!canStart || isStarting}
              onClick={handleStartGame}
            >
              {isStarting ? 'Starting...' : `Start Game (${players.length})`}
            </button>
          </footer>
        </section>
      </main>
    </div>
  );
}
