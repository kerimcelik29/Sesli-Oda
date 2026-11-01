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
  "M17 37Q13 10 40 10Q67 10 63 38L67 69Q57 66 55 55L56 31Q40 17 24 31L25 55Q23 66 13 69Z",
  "M17 36Q16 11 40 11Q64 11 63 37L67 66Q57 64 54 53L56 30Q42 18 24 30L26 53Q22 64 13 66Z",
  "M16 37Q13 9 40 10Q67 9 64 38L67 70Q56 66 55 53L57 31Q48 27 42 18Q33 29 23 30L25 54Q22 67 13 70Z",
  "M17 36Q15 10 40 10Q66 10 63 38L69 63Q59 63 55 52L57 30Q43 18 24 30L25 52Q21 63 11 63Z",
  "M15 39Q10 8 40 9Q70 8 65 39L70 70Q59 65 55 54L57 30Q40 15 23 30L25 54Q21 65 10 70Z",
  "M17 37Q15 10 40 10Q65 10 63 38L67 68Q57 65 54 54L56 32Q40 18 24 31L25 54Q22 65 13 68Z",
  "M17 36Q16 12 40 12Q64 12 63 36L58 31Q56 17 45 18Q34 17 22 32Z",
  "M18 36Q18 12 40 12Q62 12 62 36L57 30L55 22Q49 31 42 23Q32 31 23 29Z",
  "M17 38Q12 11 40 10Q68 11 63 38L57 30Q54 20 47 17Q35 28 22 31Z",
  "M18 36Q18 14 40 12Q62 14 62 36L57 28Q51 24 48 18Q45 29 38 24Q30 31 22 29Z",
  "M16 38Q16 9 40 11Q65 10 64 38L59 31Q55 18 44 18Q33 18 21 32Z",
  "M18 36Q18 13 40 12Q62 13 62 36L57 31Q54 21 49 19Q43 30 36 24Q29 31 22 29Z"
];
const skinTones = ["#f5d0b5", "#e7b58f", "#c98f6b", "#9d654d", "#754a3b", "#f0c4a0"];
const shirtColors = ["#315e58", "#5a4a75", "#2f6680", "#8a594b", "#64743f", "#784c68"];
const feminineNames = new Set([
  "ada", "adalet", "aleyna", "asli", "asuman", "ayca", "aydan", "ayla", "aylin", "aysel",
  "ayse", "azra", "bahar", "banu", "basak", "beren", "berfin", "beste", "betul", "beyza",
  "bilge", "birgul", "busra", "cansu", "cemre", "cigdem", "damla", "defne", "dilan",
  "dilara", "dilek", "duygu", "eda", "elif", "emine", "esin", "esma", "esra", "ebru",
  "ezgi", "fatma", "feyza", "gamze", "gizem", "gokce", "gul", "gulcan", "gulizar",
  "gulsah", "gulsum", "gulsen", "hande", "hatice", "hayat", "hilal", "hulya", "ipek",
  "irem", "kader", "kamile", "kubra", "lejla", "makbule", "melike", "melis", "merve",
  "mine", "muberra", "naz", "nazli", "necla", "nevin", "nihan", "nur", "nuray", "ozge",
  "ozlem", "pinar", "rana", "seda", "selin", "sena", "sevil", "sibel", "sinem", "su",
  "safiye", "sahra", "saliha", "sara", "sare", "seher", "selma", "semra", "serap",
  "seren", "sevda", "sevgi", "sila", "simay", "sule", "sultan", "tugba", "tulin",
  "yasemin", "yagmur", "yesim", "zeynep", "zuhal"
]);
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const recentRoomsKey = "sesver.recentRooms";
const legacyRecentRoomsKey = "sesegel.recentRooms";
const savedProfileKey = "sesver.profile";
const chatTopic = "sesver-chat";
const maxChatMessages = 100;
const maxChatMessageLength = 500;

function feminineAvatarForName(firstName: string): number | null {
  const firstWord = firstName
    .trim()
    .split(/\s+/)[0]
    ?.toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!firstWord || !feminineNames.has(firstWord)) return null;

  const nameHash = Array.from(firstWord).reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return nameHash % 6;
}

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
        avatarId: feminineAvatarForName(saved.firstName) ?? saved.avatarId
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

function youtubeVideoIdFromInput(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId: string | null = null;

    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else {
        const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
        videoId = match?.[1] ?? null;
      }
    }

    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
  } catch {
    return null;
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
  const avatarIndex = ((variant % avatarColors.length) + avatarColors.length) % avatarColors.length;
  const colors = avatarColors[avatarIndex];
  const hairstyle = hairstyles[avatarIndex];
  const skinTone = skinTones[avatarIndex % skinTones.length];
  const shirtColor = shirtColors[avatarIndex % shirtColors.length];
  const hasGlasses = avatarIndex === 6 || avatarIndex === 10;
  const hasMustache = avatarIndex === 8 || avatarIndex === 9;
  const hasEarrings = avatarIndex === 0 || avatarIndex === 2 || avatarIndex === 4;

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
      <path d="M13 80Q16 57 40 57Q64 57 67 80Z" fill={shirtColor} />
      <path d="M30 59Q40 69 50 59L55 80H25Z" fill="#ffffff20" />
      <circle cx="19" cy="45" r="4" fill={skinTone} />
      <circle cx="61" cy="45" r="4" fill={skinTone} />
      <ellipse cx="40" cy="42" rx={avatarIndex % 3 === 0 ? 21 : 22} ry="24" fill={skinTone} />
      <path d={hairstyle} fill={colors[2]} />
      {avatarIndex === 5 && (
        <path d="M19 27Q40 16 61 27L58 33Q40 24 22 33Z" fill={colors[1]} />
      )}
      <path d="M31 42h1m16 0h1" stroke="#493c43" strokeLinecap="round" strokeWidth="3" />
      <path d="M35 51q5 4 10 0" fill="none" stroke="#9e5755" strokeLinecap="round" strokeWidth="2" />
      {hasMustache && (
        <path d="M34 47q3-3 6 0 3-3 6 0-1 5-6 3-5 2-6-3Z" fill={colors[2]} />
      )}
      {hasGlasses && (
        <g fill="none" stroke="#35434b" strokeWidth="2">
          <rect x="26" y="37" width="12" height="9" rx="4" />
          <rect x="42" y="37" width="12" height="9" rx="4" />
          <path d="M38 40h4M26 40l-3-1m31 1 3-1" />
        </g>
      )}
      {hasEarrings && (
        <g fill="#f7d36b">
          <circle cx="18" cy="51" r="2" />
          <circle cx="62" cy="51" r="2" />
        </g>
      )}
    </svg>
  );
}

function MediaTrack({
  track,
  video,
  className
}: {
  track: Track;
  video: boolean;
  className?: string;
}) {
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
    <video className={className ?? "shared-screen"} ref={videoRef} autoPlay playsInline />
  ) : (
    <audio ref={audioRef} autoPlay />
  );
}

function CameraTile({ track, name }: { track: Track; name: string }) {
  return (
    <div className="camera-tile">
      <MediaTrack track={track} video className="camera-video" />
      <span>{name}</span>
    </div>
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
  const [createPasswordOpen, setCreatePasswordOpen] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [pendingCreatePassword, setPendingCreatePassword] = useState("");
  const [firstName, setFirstName] = useState(() => loadSavedProfile()?.firstName ?? "");
  const [lastName, setLastName] = useState(() => loadSavedProfile()?.lastName ?? "");
  const [avatarId, setAvatarId] = useState(
    () => loadSavedProfile()?.avatarId ?? Math.floor(Math.random() * avatarColors.length)
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [musicOpen, setMusicOpen] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [youtubeError, setYoutubeError] = useState("");
  const [connected, setConnected] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [revision, setRevision] = useState(0);
  const [speakingIdentities, setSpeakingIdentities] = useState<Set<string>>(() => new Set());
  const notificationAudioRef = useRef<AudioContext | null>(null);

  useEffect(() => () => {
    void notificationAudioRef.current?.close();
    notificationAudioRef.current = null;
  }, []);

  function unlockChatNotifications() {
    try {
      const context = notificationAudioRef.current;
      if (!context || context.state === "closed") {
        notificationAudioRef.current = new AudioContext();
      }
      const activeContext = notificationAudioRef.current;
      if (activeContext?.state === "suspended") {
        void activeContext.resume().catch((audioError: unknown) => {
          setError(audioError instanceof Error ? audioError.message : "Sesli bildirim açılamadı.");
        });
      }
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : "Sesli bildirim açılamadı.");
    }
  }

  function playChatNotification() {
    const context = notificationAudioRef.current;
    if (!context || context.state === "closed") return;

    const playTone = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(740, startAt);
      oscillator.frequency.setValueAtTime(880, startAt + 0.09);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.21);
    };

    if (context.state === "suspended") {
      void context.resume().then(playTone).catch((audioError: unknown) => {
        setError(audioError instanceof Error ? audioError.message : "Sohbet bildirimi çalınamadı.");
      });
      return;
    }
    try {
      playTone();
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : "Sohbet bildirimi çalınamadı.");
    }
  }

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
            if (participant.identity !== room.localParticipant.identity) {
              playChatNotification();
            }
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

  const cameraTracks = useMemo(
    () => {
      const localTracks = Array.from(room.localParticipant.trackPublications.values())
        .filter(
          (publication) =>
            publication.source === Track.Source.Camera && publication.track
        )
        .map((publication) => ({
          identity: room.localParticipant.identity,
          name: room.localParticipant.name || "Katılımcı",
          track: publication.track!
        }));
      const remoteTracks = Array.from(room.remoteParticipants.values()).flatMap((participant) =>
        Array.from(participant.trackPublications.values())
          .filter(
            (publication) =>
              publication.source === Track.Source.Camera && publication.track
          )
          .map((publication) => ({
            identity: participant.identity,
            name: participant.name || "Katılımcı",
            track: publication.track!
          }))
      );
      return [...localTracks, ...remoteTracks];
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
    unlockChatNotifications();
    if (action.type === "create") {
      setCreatePassword("");
      setCreatePasswordOpen(true);
      return;
    }
    if (savedProfile) {
      void enterRoom(action, savedProfile);
      return;
    }
    setEntryAction(action);
  }

  function submitCreatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = createPassword;
    setCreatePassword("");
    setCreatePasswordOpen(false);
    if (savedProfile) {
      void enterRoom({ type: "create" }, savedProfile, password);
      return;
    }
    setPendingCreatePassword(password);
    setEntryAction({ type: "create" });
  }

  function cancelCreatePassword() {
    setCreatePasswordOpen(false);
    setCreatePassword("");
  }

  function cancelEntry() {
    setEntryAction(null);
    setPendingCreatePassword("");
    setError("");
  }

  function randomizeAvatar() {
    setAvatarId((current) => (current + 1 + Math.floor(Math.random() * (avatarColors.length - 1))) % avatarColors.length);
  }

  async function enterRoom(
    action: EntryAction,
    profile: SavedProfile,
    roomPassword?: string
  ) {
    setBusy(true);
    setError("");
    try {
      let normalizedRoomId: string;
      if (action.type === "create") {
        const invite = await apiRequest<InviteResponse>("/api/rooms", {
          method: "POST",
          body: JSON.stringify({ password: roomPassword })
        });
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
      setPendingCreatePassword("");
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
    void enterRoom(
      entryAction,
      { firstName, lastName, avatarId },
      entryAction.type === "create" ? pendingCreatePassword : undefined
    );
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

  async function toggleCamera() {
    try {
      const enabled = !cameraEnabled;
      if (enabled) {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setError("Tarayıcı kameraya erişemiyor. Güvenli bağlantı veya kamera iznini kontrol edin.");
          return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!devices.some((device) => device.kind === "videoinput")) {
          setError("Bu cihazda kullanılabilir bir kamera bulunamadı.");
          return;
        }
      }
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraEnabled(enabled);
    } catch (mediaError) {
      setError(
        mediaError instanceof Error
          ? `Kamera açılamadı: ${mediaError.message}`
          : "Kamera açılamadı. Cihazınızı ve kamera iznini kontrol edin."
      );
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
    setCameraEnabled(false);
    setScreenSharing(false);
    setInviteUrl("");
    setChatMessages([]);
    setChatDraft("");
    setMusicOpen(false);
    setYoutubeVideoId("");
    setYoutubeInput("");
    window.history.replaceState(null, "", window.location.pathname);
  }

  function playYoutubeMusic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const videoId = youtubeVideoIdFromInput(youtubeInput);
    if (!videoId) {
      setYoutubeError("Geçerli bir YouTube video bağlantısı gir.");
      return;
    }
    setYoutubeError("");
    setYoutubeVideoId(videoId);
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
              <span>● Ses, kamera ve ekran paylaşımı</span>
            </div>
            <div className="download-links" aria-label="Masaüstü uygulamasını indir">
              <a
                className="download-link"
                href="https://github.com/kerimcelik29/Sesli-Oda/releases/latest/download/Sesver-Setup.exe"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 4.2 10.4 3v8H3V4.2Zm8.6-1.4L21 1.5V11h-9.4V2.8ZM3 12.6h7.4v8L3 19.4v-6.8Zm8.6 0H21v9.5l-9.4-1.3v-8.2Z" fill="currentColor" />
                </svg>
                <span><strong>Windows için indir</strong><small>Windows 10 ve üzeri</small></span>
                <span className="download-arrow" aria-hidden="true">↓</span>
              </a>
              <a
                className="download-link"
                href="https://github.com/kerimcelik29/Sesli-Oda/releases/latest/download/Sesver.dmg"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M16.4 12.8c0-2 1.6-3 1.7-3.1a4 4 0 0 0-3.1-1.7c-1.3-.1-2.5.8-3.1.8s-1.6-.8-2.7-.8a4.1 4.1 0 0 0-3.4 2.1c-1.5 2.6-.4 6.5 1 8.6.7 1 1.4 2.1 2.5 2 1-.1 1.4-.7 2.7-.7s1.7.7 2.7.7 1.7-1 2.4-2a9 9 0 0 0 1.1-2.3 3.7 3.7 0 0 1-1.8-3.6ZM14.3 6.7a3.8 3.8 0 0 0 .9-2.8 3.9 3.9 0 0 0-2.6 1.3 3.6 3.6 0 0 0-.9 2.7 3.2 3.2 0 0 0 2.6-1.2Z" fill="currentColor" />
                </svg>
                <span><strong>macOS için indir</strong><small>macOS 12 ve üzeri</small></span>
                <span className="download-arrow" aria-hidden="true">↓</span>
              </a>
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
              ) : cameraTracks.length ? (
                <div className="camera-grid">
                  {cameraTracks.map(({ identity, name, track }) => (
                    <CameraTile key={`${identity}-${track.sid}`} track={track} name={name} />
                  ))}
                </div>
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
              className={`control-button ${cameraEnabled ? "control-active" : ""}`}
              onClick={() => void toggleCamera()}
              aria-pressed={cameraEnabled}
            >
              <span className="control-icon" aria-hidden="true">{cameraEnabled ? "◉" : "▣"}</span>
              <span className="control-label">{cameraEnabled ? "Kamerayı kapat" : "Kamerayı aç"}</span>
            </button>
            <button
              className={`control-button ${screenSharing ? "control-active" : ""}`}
              onClick={() => void toggleScreenShare()}
            >
              <span className="control-icon">▣</span>
              <span className="control-label">{screenSharing ? "Paylaşımı durdur" : "Ekran paylaş"}</span>
            </button>
            <button
              className={`control-button ${musicOpen || youtubeVideoId ? "control-active" : ""}`}
              onClick={() => setMusicOpen((open) => !open)}
              aria-expanded={musicOpen}
              aria-controls="room-music-panel"
            >
              <span className="control-icon" aria-hidden="true">♫</span>
              <span className="control-label">Müzik çal</span>
            </button>
            <button className="button button-leave" onClick={() => void leaveRoom()}>
              <span aria-hidden="true">↗</span><span className="control-label">Odadan ayrıl</span>
            </button>
            {musicOpen && (
              <section className="room-music-panel" id="room-music-panel" aria-label="Kişisel YouTube müzik oynatıcı">
                <div className="room-music-heading">
                  <div>
                    <span className="panel-eyebrow">GÜNCEL LİSTE</span>
                    <h2>Popüler müzik</h2>
                  </div>
                  <button
                    className="room-music-close"
                    type="button"
                    onClick={() => setMusicOpen(false)}
                    aria-label="Müzik panelini kapat"
                  >
                    ×
                  </button>
                </div>
                <p className="room-music-note">
                  Güncel Türkiye şarkı listesi YouTube’da açılır. Oynatmak istediğin şarkıya dokun.
                </p>
                <a
                  className="music-chart-link"
                  href="https://charts.youtube.com/charts/TopSongs/tr/weekly"
                  target="_blank"
                  rel="noreferrer"
                >
                  ♫ Türkiye’de popüler şarkıları aç <span aria-hidden="true">↗</span>
                </a>
                <details className="music-manual">
                  <summary>YouTube bağlantısıyla çal</summary>
                  <form className="room-music-form" onSubmit={playYoutubeMusic}>
                    <input
                      aria-label="YouTube video bağlantısı"
                      autoComplete="url"
                      value={youtubeInput}
                      onChange={(event) => {
                        setYoutubeInput(event.target.value);
                        setYoutubeError("");
                      }}
                      placeholder="YouTube video bağlantısı"
                    />
                    <button className="button button-primary" type="submit">
                      Çal
                    </button>
                  </form>
                </details>
                {youtubeError && <p className="room-music-error" role="alert">{youtubeError}</p>}
                {youtubeVideoId && (
                  <iframe
                    className="room-music-player"
                    src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&rel=0`}
                    title="YouTube müzik oynatıcı"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                )}
              </section>
            )}
          </footer>
        </section>
      )}
      {createPasswordOpen && !connected && (
        <div className="entry-backdrop" onMouseDown={cancelCreatePassword}>
          <form
            className="entry-dialog"
            aria-labelledby="create-password-title"
            onSubmit={submitCreatePassword}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="entry-close"
              type="button"
              aria-label="Pencereyi kapat"
              onClick={cancelCreatePassword}
            >
              ×
            </button>
            <span className="entry-kicker">ODA OLUŞTURMA</span>
            <h2 id="create-password-title">Şifreyi gir</h2>
            <p className="entry-description">Yeni oda açmak için oda oluşturma şifresini gir.</p>
            <label className="password-field">
              Oda oluşturma şifresi
              <input
                autoFocus
                autoComplete="current-password"
                required
                type="password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="Şifre"
              />
            </label>
            <button className="button button-primary entry-submit" type="submit">
              Devam et
            </button>
          </form>
        </div>
      )}
      {entryAction && !connected && (
        <div className="entry-backdrop" onMouseDown={() => !busy && cancelEntry()}>
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
              onClick={cancelEntry}
              disabled={busy}
            >
              ×
            </button>
            <span className="entry-kicker">SESEGEL’E HOŞ GELDİN</span>
            <h2 id="entry-title">Seni nasıl tanıyalım?</h2>
            <p className="entry-description">Katılımcıların seni tanıması için adını ve soyadını yaz.</p>
            {error && <p className="entry-error" role="alert">{error}</p>}
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
                  onChange={(event) => {
                    const name = event.target.value;
                    setFirstName(name);
                    const suggestedAvatar = feminineAvatarForName(name);
                    if (suggestedAvatar !== null) setAvatarId(suggestedAvatar);
                  }}
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
