// server/GameRoom.js — one multiplayer room (lobby + race)

import { RaceManager } from './RaceManager.js';

const TICK_RATE = 20;      // state broadcasts per second
const RACE_TIME = 180;     // seconds

export class GameRoom {
    constructor(io, code, maxPlayers, isPublic = false) {
        this.io = io;
        this.code = code;
        this.maxPlayers = maxPlayers;
        this.isPublic = isPublic;
        this.players = new Map();   // socket.id -> player
        this.hostId = null;
        this.state = 'lobby';       // 'lobby' | 'racing' | 'finished'
        this.race = new RaceManager(RACE_TIME);
        this.tickInterval = null;
    }

    get isFull() { return this.players.size >= this.maxPlayers; }
    get isEmpty() { return this.players.size === 0; }
    get canJoin() { return this.state === 'lobby' && !this.isFull; }

    addPlayer(socket, name, bikeColor) {
        const player = {
            id: socket.id,
            name: (name || 'Player').toString().slice(0, 24),
            bikeColor: Number.isFinite(bikeColor) ? bikeColor : 0xff6b35,
            x: 0, y: 0, z: 0, rotation: 0, speed: 0,
            score: 0, deliveries: 0,
            ready: true
        };
        this.players.set(socket.id, player);
        if (!this.hostId) this.hostId = socket.id;
        socket.join(this.code);
        return player;
    }

    removePlayer(socketId) {
        const player = this.players.get(socketId);
        this.players.delete(socketId);
        if (this.hostId === socketId) {
            this.hostId = this.players.keys().next().value || null;
        }
        if (this.isEmpty) this.dispose();
        return player;
    }

    publicPlayers() {
        return [...this.players.values()].map(p => ({
            id: p.id, name: p.name, bikeColor: p.bikeColor, ready: p.ready
        }));
    }

    updatePlayer(socketId, data) {
        const p = this.players.get(socketId);
        if (!p || this.state !== 'racing') return;
        const num = (v, d) => (Number.isFinite(v) ? v : d);
        p.x = num(data.x, p.x);
        p.y = num(data.y, p.y);
        p.z = num(data.z, p.z);
        p.rotation = num(data.rotation, p.rotation);
        p.speed = num(data.speed, p.speed);
        // score / deliveries are only trusted from delivery_complete (see below)
    }

    registerDelivery(socketId, score, deliveries) {
        const p = this.players.get(socketId);
        if (!p || this.state !== 'racing') return;
        // Deliveries can only go up by one at a time, otherwise ignore (basic anti-cheat)
        if (Number.isFinite(deliveries) && deliveries === p.deliveries + 1) {
            p.deliveries = deliveries;
            if (Number.isFinite(score) && score >= p.score) p.score = score;
        }
    }

    startRace() {
        if (this.state !== 'lobby') return false;
        this.state = 'racing';
        this.players.forEach(p => { p.score = 0; p.deliveries = 0; });

        this.io.to(this.code).emit('game_start', {
            timeLimit: RACE_TIME,
            players: this.publicPlayers()
        });

        this.race.start(() => this.endRace());

        this.tickInterval = setInterval(() => {
            this.io.to(this.code).volatile.emit('game_state', {
                players: [...this.players.values()].map(p => ({
                    id: p.id, name: p.name, bikeColor: p.bikeColor,
                    x: p.x, y: p.y, z: p.z,
                    rotation: p.rotation, speed: p.speed,
                    score: p.score, deliveries: p.deliveries
                }))
            });
        }, 1000 / TICK_RATE);

        return true;
    }

    endRace() {
        if (this.state !== 'racing') return;
        this.state = 'finished';
        this.clearTick();
        this.race.stop();
        this.io.to(this.code).emit('race_end', {
            rankings: RaceManager.rank([...this.players.values()])
        });
        // Back to the lobby so the host can start another race
        setTimeout(() => {
            if (!this.isEmpty) this.state = 'lobby';
        }, 5000);
    }

    clearTick() {
        if (this.tickInterval) clearInterval(this.tickInterval);
        this.tickInterval = null;
    }

    dispose() {
        this.clearTick();
        this.race.stop();
    }
}
