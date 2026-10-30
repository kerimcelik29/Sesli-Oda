import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import headphonesLogo from "../headphones.svg";

type RoomTokenResponse = {
  token: string;
  serverUrl: string;
  participantName: string;
  roomName: string;
  inviteUrl: string;
};

type InviteResponse = {
  roomId: string;
  roomName: string;
  inviteUrl: string;
};

type EntryAction = {
  type: "create" | "join";
  roomId?: string;
};

type RecentRoom = {
  roomId: string;
  roomName: string;
};

type SavedProfile = {
  firstName: string;
  lastName: string;
  avatarId: number;
};

type ChatMessage = {
  id: string;
  senderIdentity: string;
  senderName: string;
  text: string;
  timestamp: number;
};

const avatarColors = [
  ["#b7f3e6", "#42b99e", "#285e57"],
  ["#ffe0bd", "#e78b5a", "#633d58"],
  ["#d8d3ff", "#8878df", "#38436f"],
  ["#c7e8ff", "#55a5d9", "#315a79"],
  ["#ffd8e4", "#db7294", "#65425f"],
  ["#ffedb8", "#d5a747", "#57543e"],
  ["#c8f0c2", "#66ad71", "#385b55"],
  ["#d8e0ff", "#7183d3", "#41466b"],
  ["#f6d5c8", "#c97162", "#653d44"],
  ["#c9f1f5", "#4ba9b9", "#365b71"],
  ["#eed9ff", "#ad72c8", "#60456c"],
  ["#e4edc4", "#98a94f", "#515b3e"]
];
const hairstyles = [
  "M18 35Q18 12 40 13Q63 13 62 36L58 29Q50 25 44 19Q35 29 22 30Z",
  "M18 34Q18 14 40 13Q62 15 62 35L57 29Q53 18 42 20Q29 18 22 32Z",
  "M17 34Q18 13 40 13Q64 14 62 35Q56 28 57 21Q49 29 42 20Q32 29 22 27Z",
  "M18 35Q17 15 40 13Q64 14 62 35L56 29Q54 22 50 19Q48 31 40 24Q32 31 25 27Z"
];
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const recentRoomsKey = "sesver.recentRooms";
const legacyRecentRoomsKey = "sesegel.recentRooms";
const savedProfileKey = "sesver.profile";
const chatTopic = "sesver-chat";
const maxChatMessages = 100;
const maxChatMessageLength = 500;

function loadRecentRooms(): RecentRoom[] {
  try {
    const savedValue =
      localStorage.getItem(recentRoomsKey) ?? localStorage.getItem(legacyRecentRoomsKey) ?? "[]";
    const saved: unknown = JSON.parse(savedValue);
    if (!Array.isArray(saved)) return [];
    const rooms = saved
      .filter(
        (item): item is RecentRoom =>
          typeof item?.roomId === "string" &&
          typeof item?.roomName === "string" &&
          /^[0-9a-f-]{36}$/i.test(item.roomId)
      )
      .slice(0, 6);
    if (!localStorage.getItem(recentRoomsKey) && localStorage.getItem(legacyRecentRoomsKey)) {
      localStorage.setItem(recentRoomsKey, JSON.stringify(rooms));
      localStorage.removeItem(legacyRecentRoomsKey);
    }
    return rooms;
  } catch {
    return [];
  }
}

function loadSavedProfile(): SavedProfile | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(savedProfileKey) ?? "null");
    if (
      typeof saved === "object" &&
      saved !== null &&
      "firstName" in saved &&
      "lastName" in saved &&
      "avatarId" in saved &&
      typeof saved.firstName === "string" &&
      typeof saved.lastName === "string" &&
      typeof saved.avatarId === "number" &&
      Number.isInteger(saved.avatarId) &&
      saved.avatarId >= 0 &&
      saved.avatarId < avatarColors.length
    ) {
      return {
        firstName: saved.firstName,
        lastName: saved.lastName,
        avatarId: saved.avatarId
      };
    }
  } catch {
    return null;
  }
  return null;
}

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

function Avatar({ variant, className = "" }: { variant: number; className?: string }) {
  const colors = avatarColors[((variant % avatarColors.length) + avatarColors.length) % avatarColors.length];
  const hairstyle = hairstyles[variant % hairstyles.length];

  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      role="img"
      aria-label="Rastgele avatar"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`avatar-bg-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="40" fill={`url(#avatar-bg-${variant})`} />
      <circle cx="40" cy="42" r="23" fill="#f4c7a5" />
      <path d={hairstyle} fill={colors[2]} />
      <path d="M16 80Q18 58 40 57Q62 58 64 80Z" fill={colors[2]} />
      <path d="M31 43h1m16 0h1" stroke="#493c43" strokeLinecap="round" strokeWidth="3" />
      <path d="M35 51q5 4 10 0" fill="none" stroke="#a85c5d" strokeLinecap="round" strokeWidth="2" />
      <circle cx="22" cy="45" r="3" fill="#f4c7a5" />
      <circle cx="58" cy="45" r="3" fill="#f4c7a5" />
    </svg>
  );
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

function ScreenShareTile({
  track,
  own,
  onError
}: {
  track: Track;
  own: boolean;
  onError: (message: string) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const updateFullscreen = () => {
      setFullscreen(document.fullscreenElement === tileRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  async function toggleFullscreen() {
    const tile = tileRef.current;
    if (!tile) return;
    try {
      if (document.fullscreenElement === tile) {
        await document.exitFullscreen();
      } else {
        await tile.requestFullscreen();
      }
    } catch (fullscreenError) {
      onError(
        fullscreenError instanceof Error
          ? fullscreenError.message
          : "Tam ekran açılamadı."
      );
    }
  }

  return (
    <div className="screen-tile" ref={tileRef}>
      <MediaTrack track={track} video />
      <span>{own ? "Sen" : "Bir katılımcı"} ekran paylaşıyor</span>
      <button
        className="screen-fullscreen-button"
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={fullscreen ? "Tam ekrandan çık" : "Tam ekran yap"}
        title={fullscreen ? "Tam ekrandan çık" : "Tam ekran yap"}
      >
        {fullscreen ? "×" : "⛶"}
      </button>
    </div>
  );
}

export default function App() {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get("room") ?? ""
  );
  const [roomName, setRoomName] = useState("");
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>(loadRecentRooms);
  const [savedProfile, setSavedProfile] = useState<SavedProfile | null>(loadSavedProfile);
  const [inviteUrl, setInviteUrl] = useState("");
  const [entryAction, setEntryAction] = useState<EntryAction | null>(null);
  const [firstName, setFirstName] = useState(() => loadSavedProfile()?.firstName ?? "");
  const [lastName, setLastName] = useState(() => loadSavedProfile()?.lastName ?? "");
  const [avatarId, setAvatarId] = useState(
    () => loadSavedProfile()?.avatarId ?? Math.floor(Math.random() * avatarColors.length)
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [revision, setRevision] = useState(0);
  const [speakingIdentities, setSpeakingIdentities] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const updateActiveSpeakers = (speakers: Participant[]) => {
      setSpeakingIdentities(new Set(speakers.map((speaker) => speaker.identity)));
      refresh();
    };
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.ConnectionStateChanged,
      RoomEvent.DataReceived
    ];
    events.forEach((event) => room.on(event, refresh));
    room.on(RoomEvent.ActiveSpeakersChanged, updateActiveSpeakers);
    const handleDataReceived = (
      payload: Uint8Array,
      participant?: Participant,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic !== chatTopic || !participant) return;
      try {
        const message: unknown = JSON.parse(new TextDecoder().decode(payload));
        if (
          typeof message === "object" &&
          message !== null &&
          "text" in message
        ) {
          const text = message.text;
          if (
            typeof text === "string" &&
            text.trim().length > 0 &&
            text.length <= maxChatMessageLength
          ) {
            setChatMessages((current) => [
              ...current.slice(-(maxChatMessages - 1)),
              {
                id: `${participant.identity}-${Date.now()}-${Math.random()}`,
                senderIdentity: participant.identity,
                senderName: participant.name || "Katılımcı",
                text: text.trim(),
                timestamp: Date.now()
              }
            ]);
          }
        }
      } catch {
        setError("Sohbet mesajı okunamadı.");
      }
    };
    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      events.forEach((event) => room.off(event, refresh));
      room.off(RoomEvent.ActiveSpeakersChanged, updateActiveSpeakers);
      room.off(RoomEvent.DataReceived, handleDataReceived);
      void room.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const latestChatMessageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    latestChatMessageRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chatMessages]);

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

  function startEntry(action: EntryAction) {
    setError("");
    if (savedProfile) {
      void enterRoom(action, savedProfile);
      return;
    }
    setEntryAction(action);
  }

  function randomizeAvatar() {
    setAvatarId((current) => (current + 1 + Math.floor(Math.random() * (avatarColors.length - 1))) % avatarColors.length);
  }

  async function enterRoom(action: EntryAction, profile: SavedProfile) {
    setBusy(true);
    setError("");
    try {
      let normalizedRoomId: string;
      if (action.type === "create") {
        const invite = await apiRequest<InviteResponse>("/api/rooms", { method: "POST" });
        normalizedRoomId = invite.roomId;
      } else {
        normalizedRoomId = roomIdFromInput(action.roomId ?? "");
      }

      const result = await apiRequest<RoomTokenResponse>(
        `/api/rooms/${encodeURIComponent(normalizedRoomId)}/token`,
        {
          method: "POST",
          body: JSON.stringify(profile)
        }
      );
      await room.connect(result.serverUrl, result.token);
      setRoomId(normalizedRoomId);
      setRoomName(result.roomName);
      setInviteUrl(result.inviteUrl);
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setAvatarId(profile.avatarId);
      setSavedProfile(profile);
      try {
        localStorage.setItem(savedProfileKey, JSON.stringify(profile));
      } catch {
        setError("Odaya katıldın ancak adın bu cihazda kaydedilemedi.");
      }
      const updatedRecentRooms = [
        { roomId: normalizedRoomId, roomName: result.roomName },
        ...recentRooms.filter((recentRoom) => recentRoom.roomId !== normalizedRoomId)
      ].slice(0, 6);
      setRecentRooms(updatedRecentRooms);
      try {
        localStorage.setItem(recentRoomsKey, JSON.stringify(updatedRecentRooms));
      } catch {
        setError("Odaya katıldın ancak son odalar listesi kaydedilemedi.");
      }
      window.history.replaceState(null, "", `?room=${encodeURIComponent(normalizedRoomId)}`);
      setConnected(true);
      setEntryAction(null);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicrophoneEnabled(true);
      } catch {
        setError("Odaya katıldın ancak mikrofon açılamadı. Tarayıcı mikrofon iznini ve cihazını kontrol et.");
      }
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Odaya bağlanılamadı.");
    } finally {
      setBusy(false);
    }
  }

  function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryAction) return;
    void enterRoom(entryAction, { firstName, lastName, avatarId });
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatDraft.trim().slice(0, maxChatMessageLength);
    if (!text || !connected) return;

    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ text })),
        { reliable: true, topic: chatTopic }
      );
      setChatMessages((current) => [
        ...current.slice(-(maxChatMessages - 1)),
        {
          id: `${room.localParticipant.identity}-${Date.now()}-${Math.random()}`,
          senderIdentity: room.localParticipant.identity,
          senderName: room.localParticipant.name || `${firstName} ${lastName}`,
          text,
          timestamp: Date.now()
        }
      ]);
      setChatDraft("");
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Mesaj gönderilemedi.");
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
      setToast("Davet bağlantısı kopyalandı");
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
    setChatMessages([]);
    setChatDraft("");
    window.history.replaceState(null, "", window.location.pathname);
  }

  return (
    <main className={`app-shell ${connected ? "room-shell" : ""}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sesver ana sayfa">
          <img className="brand-mark" src={headphonesLogo} alt="" />
          <span>Sesver</span>
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
      {toast && (
        <div className="copy-toast" role="status">
          <span aria-hidden="true">✓</span>
          {toast}
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
              <button
                className="button button-primary"
                onClick={() => startEntry({ type: "create" })}
                disabled={busy}
              >
                Yeni oda oluştur
              </button>
              <div className="join-row">
                <input
                  aria-label="Oda bağlantısı veya kodu"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value)}
                  placeholder="Oda bağlantısını veya kodunu yapıştır"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && roomId.trim()) {
                      startEntry({ type: "join", roomId: roomId.trim() });
                    }
                  }}
                />
                <button
                  className="button button-secondary"
                  onClick={() => startEntry({ type: "join", roomId: roomId.trim() })}
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
            {recentRooms.length > 0 && (
              <div className="recent-rooms">
                <div className="recent-rooms-heading">
                  <span>SON ODALAR</span>
                  <span>{recentRooms.length}</span>
                </div>
                <div className="recent-room-list">
                  {recentRooms.map((recentRoom) => (
                    <button
                      className="recent-room"
                      key={recentRoom.roomId}
                      onClick={() => startEntry({ type: "join", roomId: recentRoom.roomId })}
                      disabled={busy}
                    >
                      <span className="recent-room-icon" aria-hidden="true">⌖</span>
                      <span className="recent-room-details">
                        <strong>{recentRoom.roomName}</strong>
                        <small>Başkent odası</small>
                      </span>
                      <span className="recent-room-arrow" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
          <header className="room-heading">
            <div>
              <span className="room-kicker"><span className="connection-dot" /> SES GEL BULUŞMASI</span>
              <h1>{roomName}</h1>
              <p className="room-subtitle">Sesini aç, sohbete katıl.</p>
            </div>
            <div className="room-heading-actions">
              <span className="live-pill"><span className="connection-dot" /> Canlı</span>
              <button className="button button-secondary invite-button" onClick={copyInvite}>
                <span aria-hidden="true">↗</span> Davet bağlantısı
              </button>
            </div>
          </header>
          <div className="room-content">
            <div className="stage">
              {screenTracks.length ? (
                screenTracks.map(({ identity, track }) => (
                  <ScreenShareTile
                    key={`${identity}-${track.sid}`}
                    track={track}
                    own={room.localParticipant.identity === identity}
                    onError={setError}
                  />
                ))
              ) : (
                <div className="empty-stage">
                  <div className="stage-visual">
                    <span className="stage-orbit stage-orbit-one" />
                    <span className="stage-orbit stage-orbit-two" />
                    <div className="stage-avatar-stack">
                      {participants.slice(0, 3).map((participant) => (
                        <div className="stage-person" key={participant.identity}>
                          <span
                            className={`speaker-avatar stage-speaker-avatar ${speakingIdentities.has(participant.identity) ? "speaker-speaking" : ""}`}
                          >
                            <Avatar
                              variant={getAvatarId(participant.metadata, participant.identity)}
                              className="stage-avatar"
                            />
                          </span>
                          <span className="stage-person-name">{participant.name || "Katılımcı"}</span>
                        </div>
                      ))}
                    </div>
                    <span className="stage-wave"><i /><i /><i /><i /><i /><i /><i /></span>
                  </div>
                  <span className="stage-caption">ODA HAZIR</span>
                  <h2>Güzel sohbetler burada başlar.</h2>
                  <p>Ekranını paylaş ya da mikrofonunu açıp sohbete katıl.</p>
                  <button
                    className="button button-primary stage-share-button"
                    onClick={() => void toggleScreenShare()}
                  >
                    <span aria-hidden="true">▣</span> Ekranımı paylaş
                  </button>
                </div>
              )}
            </div>
            <aside className="people-panel">
              <div className="panel-title">
                <div>
                  <span className="panel-eyebrow">TOPLULUK</span>
                  <h2>Katılımcılar</h2>
                </div>
                <span className="participant-count">{participants.length}<small> / 20</small></span>
              </div>
              <div className="participant-list">
                {participants.map((participant) => {
                  const isLocal = participant === room.localParticipant;
                  const isSpeaking = speakingIdentities.has(participant.identity);
                  return (
                    <div
                      className={`participant ${isLocal ? "participant-local" : ""} ${isSpeaking ? "participant-speaking" : ""}`}
                      key={participant.identity}
                    >
                      <span className={`speaker-avatar participant-speaker-avatar ${isSpeaking ? "speaker-speaking" : ""}`}>
                        <Avatar
                          variant={getAvatarId(participant.metadata, participant.identity)}
                          className="participant-avatar"
                        />
                      </span>
                      <span className="participant-name">
                        {participant.name || "Katılımcı"}
                        <small className={isSpeaking ? "speaker-status" : ""}>
                          {isSpeaking
                            ? "Konuşuyor"
                            : isLocal
                              ? "Sen"
                              : participant.isMicrophoneEnabled
                                ? "Mikrofon açık"
                                : "Sessiz"}
                        </small>
                      </span>
                      <span
                        className={`mic-indicator ${
                          isSpeaking ? "mic-speaking" : participant.isMicrophoneEnabled ? "mic-on" : ""
                        }`}
                        aria-label={
                          isSpeaking ? "Şu anda konuşuyor" : participant.isMicrophoneEnabled ? "Mikrofon açık, konuşmuyor" : "Mikrofon kapalı"
                        }
                      >
                        {isSpeaking ? "♫" : participant.isMicrophoneEnabled ? "●" : "×"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="privacy-note">
                <span aria-hidden="true">✦</span>
                <p>Bu oda davet bağlantısıyla katılıma açıktır.</p>
              </div>
            </aside>
            <section className="chat-panel" aria-label="Oda sohbeti">
              <div className="chat-heading">
                <div>
                  <span className="panel-eyebrow">YAZILI SOHBET</span>
                  <h2>Sohbet</h2>
                </div>
                <span className="chat-message-count">{chatMessages.length}</span>
              </div>
              <div className="chat-messages" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <p className="chat-empty">Henüz mesaj yok. İlk mesajı sen gönder.</p>
                ) : (
                  chatMessages.map((message) => (
                    <article
                      className={`chat-message ${message.senderIdentity === room.localParticipant.identity ? "chat-message-own" : ""}`}
                      key={message.id}
                    >
                      <div className="chat-message-meta">
                        <strong>{message.senderName}</strong>
                        <time>{new Date(message.timestamp).toLocaleTimeString("tr-TR", {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}</time>
                      </div>
                      <p>{message.text}</p>
                    </article>
                  ))
                )}
                <div ref={latestChatMessageRef} />
              </div>
              <form className="chat-form" onSubmit={sendChatMessage}>
                <input
                  aria-label="Sohbet mesajı"
                  maxLength={maxChatMessageLength}
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Mesaj yaz..."
                />
                <button
                  type="submit"
                  aria-label="Mesajı gönder"
                  disabled={!chatDraft.trim()}
                >
                  ↑
                </button>
              </form>
            </section>
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
              <span className="control-icon">{microphoneEnabled ? "♫" : "×"}</span>
              <span className="control-label">{microphoneEnabled ? "Mikrofon" : "Mikrofon kapalı"}</span>
            </button>
            <button
              className={`control-button ${screenSharing ? "control-active" : ""}`}
              onClick={() => void toggleScreenShare()}
            >
              <span className="control-icon">▣</span>
              <span className="control-label">{screenSharing ? "Paylaşımı durdur" : "Ekran paylaş"}</span>
            </button>
            <button className="button button-leave" onClick={() => void leaveRoom()}>
              <span aria-hidden="true">↗</span><span className="control-label">Odadan ayrıl</span>
            </button>
          </footer>
        </section>
      )}
      {entryAction && !connected && (
        <div className="entry-backdrop" onMouseDown={() => !busy && setEntryAction(null)}>
          <form
            className="entry-dialog"
            aria-labelledby="entry-title"
            onSubmit={submitEntry}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="entry-close"
              type="button"
              aria-label="Pencereyi kapat"
              onClick={() => setEntryAction(null)}
              disabled={busy}
            >
              ×
            </button>
            <span className="entry-kicker">SESEGEL’E HOŞ GELDİN</span>
            <h2 id="entry-title">Seni nasıl tanıyalım?</h2>
            <p className="entry-description">Katılımcıların seni tanıması için adını ve soyadını yaz.</p>
            <div className="entry-avatar-row">
              <Avatar variant={avatarId} className="entry-avatar" />
              <div>
                <strong>Senin avatarın</strong>
                <span>Diğer katılımcılar seni bu avatarla görür.</span>
              </div>
              <button className="avatar-shuffle" type="button" onClick={randomizeAvatar} aria-label="Rastgele avatar değiştir">
                Karıştır
              </button>
            </div>
            <div className="name-fields">
              <label>
                Ad
                <input
                  autoFocus
                  autoComplete="given-name"
                  maxLength={40}
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Adın"
                />
              </label>
              <label>
                Soyad
                <input
                  autoComplete="family-name"
                  maxLength={40}
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Soyadın"
                />
              </label>
            </div>
            <button className="button button-primary entry-submit" type="submit" disabled={busy}>
              {busy ? "Bağlanıyor..." : entryAction.type === "create" ? "Odayı oluştur ve katıl" : "Odaya katıl"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function getAvatarId(metadata: string | undefined, identity: string) {
  if (metadata) {
    try {
      const value: unknown = JSON.parse(metadata).avatarId;
      if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < avatarColors.length) {
        return value;
      }
    } catch {
      // Older or custom participants may not provide avatar metadata.
    }
  }

  return Array.from(identity).reduce((total, character) => total + character.charCodeAt(0), 0) % avatarColors.length;
}
