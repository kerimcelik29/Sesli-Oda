import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";

type RoomTokenResponse = {
  token: string;
  serverUrl: string;
  participantName: string;
  inviteUrl: string;
};

type InviteResponse = {
  roomId: string;
  inviteUrl: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

function roomIdFromInput(value: string) {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).searchParams.get("room") ?? trimmed;
  } catch {
    return trimmed;
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || "İstek tamamlanamadı.");
  }
  return body;
}

function MediaTrack({ track, video }: { track: Track; video: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = video ? videoRef.current : audioRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track, video]);

  return video ? (
    <video className="shared-screen" ref={videoRef} autoPlay playsInline />
  ) : (
    <audio ref={audioRef} autoPlay />
  );
}

export default function App() {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get("room") ?? ""
  );
  const [inviteUrl, setInviteUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ConnectionStateChanged
    ];
    events.forEach((event) => room.on(event, refresh));
    return () => {
      events.forEach((event) => room.off(event, refresh));
      void room.disconnect();
    };
  }, [room]);

  const participants = useMemo(
    () => [room.localParticipant, ...room.remoteParticipants.values()],
    [room, revision]
  );

  const screenTracks = useMemo(
    () => {
      const localTracks = Array.from(room.localParticipant.trackPublications.values()).map(
        (publication) => ({ identity: room.localParticipant.identity, publication })
      );
      const remoteTracks = Array.from(room.remoteParticipants.values()).flatMap((participant) =>
        Array.from(participant.trackPublications.values()).map((publication) => ({
          identity: participant.identity,
          publication
        }))
      );

      return [...localTracks, ...remoteTracks]
        .filter(
          ({ publication }) =>
            publication.source === Track.Source.ScreenShare && publication.track
        )
        .map(({ identity, publication }) => ({
          identity,
          track: publication.track!
        }));
    },
    [room, revision]
  );

  const audioTracks = useMemo(
    () =>
      Array.from(room.remoteParticipants.values()).flatMap((participant) =>
        Array.from(participant.trackPublications.values())
          .filter(
            (publication) =>
              publication.kind === Track.Kind.Audio && publication.track
          )
          .map((publication) => publication.track!)
      ),
    [room, revision]
  );

  async function joinRoom(id: string) {
    setBusy(true);
    setError("");
    try {
      const normalizedRoomId = roomIdFromInput(id);
      const result = await apiRequest<RoomTokenResponse>(
        `/api/rooms/${encodeURIComponent(normalizedRoomId)}/token`,
        { method: "POST" }
      );
      await room.connect(result.serverUrl, result.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setRoomId(normalizedRoomId);
      setInviteUrl(result.inviteUrl);
      window.history.replaceState(null, "", `?room=${encodeURIComponent(normalizedRoomId)}`);
      setMicrophoneEnabled(true);
      setConnected(true);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Odaya katılınamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const invite = await apiRequest<InviteResponse>("/api/rooms", { method: "POST" });
      setInviteUrl(invite.inviteUrl);
      await joinRoom(invite.roomId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Oda oluşturulamadı.");
      setBusy(false);
    }
  }

  async function toggleMicrophone() {
    try {
      const enabled = !microphoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : "Mikrofon açılamadı.");
    }
  }

  async function toggleScreenShare() {
    try {
      const enabled = !screenSharing;
      await room.localParticipant.setScreenShareEnabled(enabled);
      setScreenSharing(enabled);
    } catch (mediaError) {
      setError(mediaError instanceof Error ? mediaError.message : "Ekran paylaşılamadı.");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      setError("Bağlantı kopyalanamadı. Tarayıcı izinlerini kontrol edin.");
    }
  }

  async function leaveRoom() {
    await room.disconnect();
    setConnected(false);
    setMicrophoneEnabled(false);
    setScreenSharing(false);
    setInviteUrl("");
    window.history.replaceState(null, "", window.location.pathname);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sesli Oda ana sayfa">
          <span className="brand-mark">S</span>
          <span>sesli oda</span>
        </a>
        <span className="topbar-note">Hesap yok, davet bağlantısı yeterli.</span>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button type="button" onClick={() => setError("")} aria-label="Uyarıyı kapat">
            ×
          </button>
        </div>
      )}

      {!connected ? (
        <section className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">BİRLİKTE OLMAK DAHA KOLAY</span>
            <h1>Sesini duyur.<br />Ekranını paylaş.</h1>
            <p>
              Bir oda aç, bağlantıyı arkadaşlarınla paylaş ve sohbete başlayın.
              Kayıt olmak gerekmez.
            </p>
            <div className="welcome-actions">
              <button className="button button-primary" onClick={createRoom} disabled={busy}>
                {busy ? "Oda hazırlanıyor..." : "Yeni oda oluştur"}
              </button>
              <div className="join-row">
                <input
                  aria-label="Oda bağlantısı veya kodu"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  placeholder="Oda bağlantısını veya kodunu yapıştır"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && roomId.trim()) void joinRoom(roomId.trim());
                  }}
                />
                <button
                  className="button button-secondary"
                  onClick={() => void joinRoom(roomId.trim())}
                  disabled={busy || !roomId.trim()}
                >
                  Katıl
                </button>
              </div>
            </div>
            <div className="feature-list">
              <span>● Ücretsiz katılım</span>
              <span>● 20 kişiye kadar</span>
              <span>● Ses ve ekran paylaşımı</span>
            </div>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-card">
              <span className="avatar avatar-violet">A</span>
              <span className="avatar avatar-blue">M</span>
              <span className="avatar avatar-orange">E</span>
              <span className="sound-wave"><i /><i /><i /><i /><i /><i /><i /></span>
              <span className="art-caption">Sohbet başladı</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="room-layout">
          <div className="room-heading">
            <div>
              <span className="eyebrow">CANLI ODA</span>
              <h1>Birlikte konuşalım</h1>
            </div>
            <div className="invite-control">
              <span className="connection-dot" />
              <span>Bağlantı açık</span>
              <button className="button button-secondary" onClick={copyInvite}>
                Bağlantıyı kopyala
              </button>
            </div>
          </div>
          <div className="room-content">
            <div className="stage">
              {screenTracks.length ? (
                screenTracks.map(({ identity, track }) => (
                  <div className="screen-tile" key={`${identity}-${track.sid}`}>
                    <MediaTrack track={track} video />
                    <span>{identity} ekran paylaşıyor</span>
                  </div>
                ))
              ) : (
                <div className="empty-stage">
                  <div className="screen-icon">▣</div>
                  <h2>Bir ekran paylaşımı başlat</h2>
                  <p>Ekranını aç, birlikte bakın ve konuşun.</p>
                  <button
                    className="button button-secondary"
                    onClick={() => void toggleScreenShare()}
                  >
                    Ekranımı paylaş
                  </button>
                </div>
              )}
            </div>
            <aside className="people-panel">
              <div className="panel-title">
                <h2>Odadakiler</h2>
                <span>{participants.length} / 20</span>
              </div>
              <div className="participant-list">
                {participants.map((participant, index) => (
                  <div className="participant" key={participant.identity}>
                    <span className={`avatar avatar-${index % 3}`}>
                      {(participant.name || "M").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="participant-name">
                      {participant.name || "Misafir"}
                      {participant === room.localParticipant && <small> (sen)</small>}
                    </span>
                    <span
                      className={`mic-indicator ${
                        participant.isMicrophoneEnabled ? "mic-on" : ""
                      }`}
                      aria-label={
                        participant.isMicrophoneEnabled ? "Mikrofon açık" : "Mikrofon kapalı"
                      }
                    >
                      {participant.isMicrophoneEnabled ? "♫" : "×"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="privacy-note">
                <span>🔒</span>
                <p>Odaya yalnızca davet bağlantısını paylaşan kişiler katılabilir.</p>
              </div>
            </aside>
          </div>
          <footer className="controls">
            <div className="audio-tracks" aria-hidden="true">
              {audioTracks.map((track) => (
                <MediaTrack key={track.sid} track={track} video={false} />
              ))}
            </div>
            <button
              className={`control-button ${microphoneEnabled ? "control-active" : "control-muted"}`}
              onClick={() => void toggleMicrophone()}
            >
              <span>{microphoneEnabled ? "♫" : "×"}</span>
              {microphoneEnabled ? "Mikrofon açık" : "Mikrofon kapalı"}
            </button>
            <button
              className={`control-button ${screenSharing ? "control-active" : ""}`}
              onClick={() => void toggleScreenShare()}
            >
              <span>▣</span>
              {screenSharing ? "Paylaşımı durdur" : "Ekran paylaş"}
            </button>
            <button className="button button-leave" onClick={() => void leaveRoom()}>
              Odadan ayrıl
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}
