// server/index.js — Socket.IO multiplayer server
// Run:  cd server && npm install && npm start   (or: npm run server from the project root)

import http from 'node:http';
import { Server } from 'socket.io';
import { GameRoom } from './GameRoom.js';

const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3001);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS_PER_ROOM || 8);
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '*';

const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Livreur Rush 3D server is running');
});

const io = new Server(httpServer, {
    cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] }
});

/** @type {Map<string, GameRoom>} */
const rooms = new Map();
/** socket.id -> room code */
const socketRoom = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode() {
    let code;
    do {
        code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
}

function sendError(socket, message) {
    socket.emit('error', { message });
}

function leaveCurrentRoom(socket) {
    const code = socketRoom.get(socket.id);
    if (!code) return;
    socketRoom.delete(socket.id);

    const room = rooms.get(code);
    if (!room) return;

    socket.leave(code);
    const player = room.removePlayer(socket.id);

    if (room.isEmpty) {
        rooms.delete(code);
        return;
    }

    io.to(code).emit('player_left', {
        playerId: socket.id,
        playerName: player ? player.name : '',
        players: room.publicPlayers()
    });
}

function joinRoom(socket, room, name, bikeColor) {
    leaveCurrentRoom(socket);
    const player = room.addPlayer(socket, name, bikeColor);
    socketRoom.set(socket.id, room.code);

    socket.emit('room_joined', {
        roomCode: room.code,
        players: room.publicPlayers(),
        isHost: room.hostId === socket.id
    });
    socket.to(room.code).emit('player_joined', {
        playerName: player.name,
        players: room.publicPlayers()
    });
}

io.on('connection', (socket) => {
    console.log(`[+] ${socket.id} connected`);

    socket.on('create_room', ({ name, bikeColor } = {}) => {
        leaveCurrentRoom(socket);
        const code = generateCode();
        const room = new GameRoom(io, code, MAX_PLAYERS, false);
        rooms.set(code, room);
        room.addPlayer(socket, name, bikeColor);
        socketRoom.set(socket.id, code);
        socket.emit('room_created', { roomCode: code, players: room.publicPlayers() });
    });

    socket.on('join_room', ({ roomCode, name, bikeColor } = {}) => {
        const room = rooms.get((roomCode || '').toString().toUpperCase());
        if (!room) return sendError(socket, 'الغرفة غير موجودة — Room not found');
        if (room.state !== 'lobby') return sendError(socket, 'السباق بدأ — Race already started');
        if (room.isFull) return sendError(socket, 'الغرفة ممتلئة — Room is full');
        joinRoom(socket, room, name, bikeColor);
    });

    socket.on('find_room', ({ name, bikeColor } = {}) => {
        let room = [...rooms.values()].find(r => r.isPublic && r.canJoin);
        if (!room) {
            const code = generateCode();
            room = new GameRoom(io, code, MAX_PLAYERS, true);
            rooms.set(code, room);
            leaveCurrentRoom(socket);
            room.addPlayer(socket, name, bikeColor);
            socketRoom.set(socket.id, code);
            socket.emit('room_created', { roomCode: code, players: room.publicPlayers() });
            return;
        }
        joinRoom(socket, room, name, bikeColor);
    });

    socket.on('start_game', () => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (!room) return;
        if (room.hostId !== socket.id) return sendError(socket, 'فقط المضيف يمكنه البدء — Only the host can start');
        if (room.players.size < 2) return sendError(socket, 'تحتاج لاعبين اثنين على الأقل — Need at least 2 players');
        room.startRace();
    });

    socket.on('player_state', (data = {}) => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (room) room.updatePlayer(socket.id, data);
    });

    socket.on('delivery_complete', ({ score, deliveries } = {}) => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (room) room.registerDelivery(socket.id, score, deliveries);
    });

    socket.on('leave_room', () => leaveCurrentRoom(socket));

    socket.on('disconnect', () => {
        console.log(`[-] ${socket.id} disconnected`);
        leaveCurrentRoom(socket);
    });
});

httpServer.listen(PORT, () => {
    console.log(`🏍️  Livreur Rush server listening on port ${PORT} (max ${MAX_PLAYERS} players/room)`);
});
