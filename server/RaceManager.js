// server/RaceManager.js — race timer and rankings for one room

export class RaceManager {
    constructor(timeLimit = 180) {
        this.timeLimit = timeLimit;
        this.startedAt = 0;
        this.running = false;
        this.timeout = null;
    }

    start(onEnd) {
        this.running = true;
        this.startedAt = Date.now();
        this.timeout = setTimeout(() => {
            this.running = false;
            onEnd();
        }, this.timeLimit * 1000);
    }

    stop() {
        this.running = false;
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = null;
    }

    get elapsed() {
        return this.running ? (Date.now() - this.startedAt) / 1000 : 0;
    }

    static rank(players) {
        return [...players]
            .sort((a, b) => (b.score - a.score) || (b.deliveries - a.deliveries))
            .map((p, i) => ({
                rank: i + 1,
                id: p.id,
                name: p.name,
                score: p.score,
                deliveries: p.deliveries
            }));
    }
}
