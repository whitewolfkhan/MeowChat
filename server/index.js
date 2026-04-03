const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 50e6,
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[AGENT CONNECTED] ${socket.id}`);

  socket.on('join-room', ({ roomId, codename }) => {
    socket.join(roomId);
    socket.codename = codename;
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    rooms.get(roomId).set(socket.id, { id: socket.id, codename });

    socket.to(roomId).emit('agent-joined', { codename, id: socket.id });

    const agents = Array.from(rooms.get(roomId).values()).map(({ id, codename }) => ({ id, codename }));
    io.to(roomId).emit('room-update', { agents });

    console.log(`[JOIN] ${codename} -> channel #${roomId} (${agents.length} agents)`);
  });

  // --- Feature 1: AES symmetric messages ---
  socket.on('encrypted-message', ({ roomId, ciphertext, timestamp, msgId }) => {
    socket.to(roomId).emit('encrypted-message', {
      ciphertext, timestamp, msgId,
      sender: socket.codename, senderId: socket.id,
    });
  });

  // --- Feature 2: ECC public key exchange ---
  socket.on('share-public-key', ({ roomId, publicKey }) => {
    const room = rooms.get(roomId);
    if (room && room.has(socket.id)) {
      room.get(socket.id).publicKey = publicKey;
    }

    socket.to(roomId).emit('public-key-shared', {
      id: socket.id,
      codename: socket.codename,
      publicKey,
    });

    if (room) {
      room.forEach((agent, agentId) => {
        if (agentId !== socket.id && agent.publicKey) {
          socket.emit('public-key-shared', {
            id: agentId,
            codename: agent.codename,
            publicKey: agent.publicKey,
          });
        }
      });
    }

    console.log(`[KEY EXCHANGE] ${socket.codename} shared public key in #${roomId}`);
  });

  // --- Feature 2: ECC encrypted messages ---
  socket.on('encrypted-message-ecc', ({ roomId, payloads, senderPublicKey, timestamp, msgId }) => {
    socket.to(roomId).emit('encrypted-message-ecc', {
      payloads, senderPublicKey, timestamp, msgId,
      sender: socket.codename, senderId: socket.id,
    });
  });

  // --- Feature 3: Signal Protocol (Double Ratchet) ---
  socket.on('signal-ratchet-key', ({ roomId, targetId, ratchetPublicKey }) => {
    io.to(targetId).emit('signal-ratchet-key', {
      senderId: socket.id,
      codename: socket.codename,
      ratchetPublicKey,
    });
    console.log(`[SIGNAL] ${socket.codename} sent ratchet key to ${targetId}`);
  });

  socket.on('encrypted-message-signal', ({ roomId, payloads, timestamp, msgId }) => {
    socket.to(roomId).emit('encrypted-message-signal', {
      payloads, timestamp, msgId,
      sender: socket.codename, senderId: socket.id,
    });
  });

  // --- Feature 4: Steganography image messages ---
  socket.on('stego-message', ({ roomId, imageData, timestamp, msgId }) => {
    socket.to(roomId).emit('stego-message', {
      imageData, timestamp, msgId,
      sender: socket.codename, senderId: socket.id,
    });
  });

  // --- Media messages (images/videos) ---
  socket.on('media-message', ({ roomId, mediaData, mediaType, fileName, timestamp, msgId }) => {
    socket.to(roomId).emit('media-message', {
      mediaData, mediaType, fileName, timestamp, msgId,
      sender: socket.codename, senderId: socket.id,
    });
  });

  // --- Message status receipts ---
  socket.on('message-delivered', ({ msgId, senderId }) => {
    io.to(senderId).emit('message-delivered', { msgId });
  });

  socket.on('message-read', ({ msgIds, senderId }) => {
    io.to(senderId).emit('message-read', { msgIds });
  });

  // --- Screenshot detection ---
  socket.on('screenshot-alert', ({ roomId }) => {
    socket.to(roomId).emit('screenshot-alert', { codename: socket.codename });
  });

  socket.on('typing', ({ roomId }) => {
    socket.to(roomId).emit('typing', {
      codename: socket.codename,
      senderId: socket.id,
    });
  });

  socket.on('stop-typing', ({ roomId }) => {
    socket.to(roomId).emit('stop-typing', {
      senderId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.delete(socket.id);

      if (room.size === 0) {
        rooms.delete(socket.roomId);
      } else {
        socket.to(socket.roomId).emit('agent-left', { codename: socket.codename, id: socket.id });
        const agents = Array.from(room.values()).map(({ id, codename }) => ({ id, codename }));
        io.to(socket.roomId).emit('room-update', { agents });
      }
    }
    console.log(`[AGENT DISCONNECTED] ${socket.id} (${socket.codename || 'unknown'})`);
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OPERATIONAL',
    uptime: process.uptime(),
    rooms: rooms.size,
    connections: io.engine.clientsCount,
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   MEOWCHAT RELAY SERVER               ║');
  console.log('  ║   Status: OPERATIONAL                 ║');
  console.log(`  ║   Port:   ${PORT}                        ║`);
  console.log('  ║   Mode:   ENCRYPTED RELAY             ║');
  console.log('  ║   Proto:  AES-256 + ECC-25519         ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
});
