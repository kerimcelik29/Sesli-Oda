import "dotenv/config";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const {
  API_PORT = "3001",
  APP_PUBLIC_URL = "http://localhost:5173",
  APP_ORIGIN = "http://localhost:5173",
  LIVEKIT_API_URL = "http://localhost:7880",
  LIVEKIT_WS_URL = "ws://localhost:7880",
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
} = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured.");
}

const maxParticipants = 20;
const roomService = new RoomServiceClient(
  LIVEKIT_API_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET
);
const app = express();

app.disable("x-powered-by");
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

app.post("/api/rooms", async (_request, response, next) => {
  const roomId = randomUUID();

  try {
    await roomService.createRoom({
      name: roomId,
      maxParticipants,
      emptyTimeout: 10 * 60
    });
    response.status(201).json({
      roomId,
      inviteUrl: `${APP_PUBLIC_URL.replace(/\/$/, "")}/?room=${roomId}`
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/token", async (request, response, next) => {
  const { roomId } = request.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    response.status(400).json({ error: "Geçersiz oda bağlantısı." });
    return;
  }

  try {
    const [room] = await roomService.listRooms([roomId]);
    if (!room) {
      response.status(404).json({ error: "Bu oda bulunamadı veya artık açık değil." });
      return;
    }

    const participantName = `Misafir-${randomUUID().slice(0, 4)}`;
    const accessToken = new AccessToken(
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET,
      {
        identity: randomUUID(),
        name: participantName,
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
  console.log(`Sesli Oda API listening on port ${API_PORT}`);
});
