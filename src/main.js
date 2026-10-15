// src/main.js — application entry point

import { Game } from './game/Game.js';

async function bootstrap() {
    const game = new Game();
    // Handy for debugging in the browser console
    window.__game = game;

    try {
        await game.init();
    } catch (err) {
        console.error('Game failed to start:', err);
        const text = document.getElementById('loading-text');
        if (text) text.textContent = '❌ خطأ في التحميل — ' + (err && err.message ? err.message : err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
