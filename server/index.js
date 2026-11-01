import "dotenv/config";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const {
  API_PORT = "3001",
  APP_PUBLIC_URL = "http://localhost:5173",
  APP_ORIGIN = "http://localhost:5173",
  LIVEKIT_API_URL = "http://localhost:7880",
  LIVEKIT_WS_URL = "ws://localhost:7880",
  ROOM_CREATE_PASSWORD = "krm",
  ROOMS_FILE = path.join(process.cwd(), "data", "rooms.json"),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured.");
}

const maxParticipants = 20;
const roomIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const roomRegistry = await loadRoomRegistry();
const roomRestorations = new Map();
let registryUpdateQueue = Promise.resolve();
const capitalNames = [
  "Abu Dabi", "Abuja", "Addis Ababa", "Alger", "Amman", "Amsterdam", "Andorra la Vella",
  "Ankara", "Antananarivo", "Apia", "Astana", "Asuncion", "Atina", "Aşkabat", "Bağdat",
  "Bakü", "Bamako", "Bandar Seri Begavan", "Bangkok", "Banjul", "Basseterre", "Beijing",
  "Beirut", "Belgrad", "Belmopan", "Berlin", "Bern", "Bişkek", "Bogota", "Brasilia",
  "Bratislava", "Brüksel", "Bükreş", "Budapeşte", "Buenos Aires", "Cakarta", "Canberra",
  "Caracas", "Castries", "Cayenne", "Chisinau", "Cibuti", "Colombo", "Conakry",
  "Cotonou", "Dakar", "Damascus", "Dhaka", "Dili", "Doha", "Dublin", "Erivan",
  "Freetown", "Funafuti", "Gaborone", "Georgetown", "Guatemala", "Hanoi", "Harare",
  "Havana", "Helsinki", "Honiara", "Islamabad", "Jakarta", "Jerusalem", "Juba",
  "Kabul", "Kampala", "Kathmandu", "Khartoum", "Kigali", "Kingston", "Kingstown",
  "Kinshasa", "Kopenhag", "Kuala Lumpur", "Kuveyt", "Lima", "Lizbon", "Ljubljana",
  "Londra", "Luanda", "Lusaka", "Lüksemburg", "Madrid", "Majuro", "Malabo", "Male",
  "Managua", "Manama", "Manila", "Maputo", "Maseru", "Maskat", "Mbabane", "Meksiko",
  "Minsk", "Mogadişu", "Monako", "Monrovia", "Montevideo", "Moroni", "Moskova",
  "Nairobi", "Nassau", "New Delhi", "Ngerulmud", "Niamey", "Nicosia", "Nouakchott",
  "Nuku'alofa", "Oslo", "Ottawa", "Ouagadougou", "Palikir", "Panama", "Paramaribo",
  "Paris", "Pekin", "Phnom Penh", "Podgorica", "Port Louis", "Port Moresby", "Port Vila",
  "Port-au-Prince", "Port of Spain", "Porto Novo", "Prag", "Praia", "Pretoria", "Pyongyang",
  "Rabat", "Reykjavik", "Riga", "Riyad", "Roma", "Roseau", "San Jose", "San Marino",
  "San Salvador", "Sana", "Santiago", "Santo Domingo", "Sarajevo", "Seul", "Singapur",
  "Skopje", "Sofya", "Stockholm", "Suva", "Taipei", "Tallinn", "Tarawa", "Taşkent",
  "Tegucigalpa", "Tiran", "Tokyo", "Tripoli", "Tunis", "Ulan Bator", "Vaduz", "Valletta",
  "Varşova", "Vatikan", "Victoria", "Viyana", "Vilnius", "Wellington", "Yaounde", "Yaren",
  "Zagreb"
];
const roomService = new RoomServiceClient(
  LIVEKIT_API_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);
const app = express();

async function loadRoomRegistry() {
  let contents;
  try {
    contents = await readFile(ROOMS_FILE, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }

  const savedRooms = JSON.parse(contents);
  if (!savedRooms || typeof savedRooms !== "object" || Array.isArray(savedRooms)) {
    throw new Error("The persistent room registry has an invalid format.");
  }

  const rooms = new Map();
  for (const [roomId, roomName] of Object.entries(savedRooms)) {
    if (
      !roomIdPattern.test(roomId) ||
      typeof roomName !== "string" ||
      !roomName.trim() ||
      roomName.length > 80
    ) {
      throw new Error("The persistent room registry contains an invalid room.");
    }
    rooms.set(roomId, roomName);
  }
  return rooms;
}

function rememberRoom(roomId, roomName) {
  const update = registryUpdateQueue.then(async () => {
    const previousName = roomRegistry.get(roomId);
    roomRegistry.set(roomId, roomName);
    try {
      await mkdir(path.dirname(ROOMS_FILE), { recursive: true });
      const temporaryFile = `${ROOMS_FILE}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporaryFile, JSON.stringify(Object.fromEntries(roomRegistry)), {
        encoding: "utf8",
        mode: 0o600
      });
      await rename(temporaryFile, ROOMS_FILE);
    } catch (error) {
      if (previousName === undefined) roomRegistry.delete(roomId);
      else roomRegistry.set(roomId, previousName);
      throw error;
    }
  });
  registryUpdateQueue = update.catch(() => {});
  return update;
}

function createRoom(roomId, roomName) {
  return roomService.createRoom({
    name: roomId,
    metadata: roomName,
    maxParticipants,
    emptyTimeout: 10 * 60,
    departureTimeout: 10 * 60
  });
}

async function findOrRestoreRoom(roomId) {
  const [activeRoom] = await roomService.listRooms([roomId]);
  if (activeRoom) return activeRoom;

  const roomName = roomRegistry.get(roomId);
  if (!roomName) return null;

  let restoration = roomRestorations.get(roomId);
  if (!restoration) {
    restoration = createRoom(roomId, roomName).finally(() => {
      roomRestorations.delete(roomId);
    });
    roomRestorations.set(roomId, restoration);
  }
  return restoration;
}

app.disable("x-powered-by");
app.set("trust proxy", 2);
app.use(helmet());
app.use(cors({ origin: APP_ORIGIN }));
app.use(express.json({ limit: "8kb" }));
app.use(
  "/api/",
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false
  })
);

app.post("/api/rooms", async (request, response, next) => {
  const password = typeof request.body?.password === "string"
    ? request.body.password
    : "";
  if (password !== ROOM_CREATE_PASSWORD) {
    response.status(403).json({ error: "Oda oluşturma şifresi hatalı." });
    return;
  }

  const roomId = randomUUID();
  const roomName = capitalNames[randomInt(capitalNames.length)];

  try {
    await createRoom(roomId, roomName);
    try {
      await rememberRoom(roomId, roomName);
    } catch (registryError) {
      try {
        await roomService.deleteRoom(roomId);
      } catch (cleanupError) {
        console.error("Could not remove a room after saving its registry entry failed:", cleanupError);
      }
      throw registryError;
    }
    response.status(201).json({
      roomId,
      roomName,
      inviteUrl: `${APP_PUBLIC_URL.replace(/\/$/, "")}/?room=${roomId}`
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/token", async (request, response, next) => {
  const { roomId } = request.params;
  const firstName = typeof request.body?.firstName === "string"
    ? request.body.firstName.trim()
    : "";
  const lastName = typeof request.body?.lastName === "string"
    ? request.body.lastName.trim()
    : "";
  const avatarId = request.body?.avatarId;

  if (!roomIdPattern.test(roomId)) {
    response.status(400).json({ error: "Geçersiz oda bağlantısı." });
    return;
  }

  if (
    !firstName ||
    !lastName ||
    firstName.length > 40 ||
    lastName.length > 40 ||
    !Number.isInteger(avatarId) ||
    avatarId < 0 ||
    avatarId > 11
  ) {
    response.status(400).json({ error: "Adınızı, soyadınızı ve bir avatar seçin." });
    return;
  }

  try {
    const room = await findOrRestoreRoom(roomId);
    if (!room) {
      response.status(404).json({ error: "Bu oda bulunamadı veya artık açık değil." });
      return;
    }
    if (!roomRegistry.has(roomId)) {
      await rememberRoom(roomId, room.metadata || "Sesver");
    }

    const participantName = `${firstName} ${lastName}`;
    const accessToken = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: randomUUID(),
        name: participantName,
        metadata: JSON.stringify({ avatarId }),
        ttl: "1h"
      }
    );
    accessToken.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    response.json({
      token: await accessToken.toJwt(),
      serverUrl: LIVEKIT_WS_URL,
      participantName,
      roomName: room.metadata || "Sesver",
      inviteUrl: `${APP_PUBLIC_URL.replace(/\/$/, "")}/?room=${roomId}`
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("API request failed:", error);
  response.status(500).json({ error: "İstek tamamlanamadı. Lütfen tekrar deneyin." });
});

app.listen(Number(API_PORT), "0.0.0.0", () => {
  console.log(`Sesver API listening on port ${API_PORT}`);
});
