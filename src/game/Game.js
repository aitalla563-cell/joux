// src/game/Game.js

import * as THREE from 'three';
import { GAME_CONFIG, MISSION_DATA, FOOD_EMOJIS } from '../utils/Constants.js';
import { Player } from './Player.js';
import { Physics } from './Physics.js';
import { GameCamera } from './Camera.js';
import { InputManager } from './InputManager.js';
import { SoundManager } from './SoundManager.js';
import { World } from '../world/World.js';
import { MissionManager } from '../missions/MissionManager.js';
import { UIManager } from '../ui/UIManager.js';
import { NetworkManager } from '../multiplayer/NetworkManager.js';
import { RoomManager } from '../multiplayer/RoomManager.js';
import { Lobby } from '../multiplayer/Lobby.js';
import { getPlayerProfile, savePlayerProfile, getSettings, saveSettings } from '../utils/Storage.js';

export class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.gameCamera = null;
        this.clock = new THREE.Clock();

        this.input = new InputManager();
        this.sound = new SoundManager();
        this.ui = new UIManager();
        this.physics = new Physics();
        this.world = null;
        this.player = null;
        this.missions = null;

        this.network = new NetworkManager();
        this.roomManager = null;
        this.lobby = null;

        this.state = 'loading'; // 'loading', 'menu', 'playing', 'paused', 'results'
        this.gameMode = null; // 'singleplayer', 'multiplayer'
        this.isPaused = false;

        this.profile = getPlayerProfile();
        this.settings = getSettings();

        this.networkTickTimer = 0;
        this.minimapTimer = 0;
    }

    async init() {
        this.ui.setLoadingProgress(10, 'تهيئة المحرك...');

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: this.settings.quality !== 'low',
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        this.ui.setLoadingProgress(20, 'إنشاء المشهد...');

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 500);
        this.gameCamera = new GameCamera(this.camera);

        this.ui.setLoadingProgress(30, 'بناء المدينة...');

        // World
        this.world = new World(this.scene, this.physics);
        await new Promise(resolve => {
            setTimeout(() => {
                this.world.generate((status) => {
                    this.ui.setLoadingProgress(30 + Math.random() * 40, status);
                });
                resolve();
            }, 50);
        });

        this.ui.setLoadingProgress(75, 'إنشاء اللاعب...');

        // Player
        this.player = new Player(this.scene, this.profile.bikeColor);
        this.player.motorcycle.setPosition(0, 0, 0);

        // Mission manager
        this.missions = new MissionManager(this.world, this.player);

        // Room manager
        this.roomManager = new RoomManager(this.scene, this.network);
        this.lobby = new Lobby(this.network, this.ui);

        this.ui.setLoadingProgress(85, 'إعداد التحكم...');

        this.setupEventListeners();
        this.setupMissionCallbacks();
        this.setupMultiplayerCallbacks();
        this.applySettings();

        this.ui.setLoadingProgress(95, 'جاهز!');

        // Handle resize
        window.addEventListener('resize', () => this.onResize());

        this.ui.setLoadingProgress(100, 'مول التوصيل جاهز!');

        setTimeout(() => {
            this.ui.hideLoading();
            this.state = 'menu';
            this.ui.showMainMenu();
        }, 500);

        // Start game loop
        this.animate();
    }

    setupEventListeners() {
        // Main menu
        document.getElementById('btn-singleplayer')?.addEventListener('click', () => {
            this.ui.hideAllScreens();
            this.ui.showScreen('sp-menu');
        });

        document.getElementById('btn-multiplayer')?.addEventListener('click', () => {
            this.ui.hideAllScreens();
            this.ui.showScreen('mp-menu');
            this.tryConnectMultiplayer();
        });

        document.getElementById('btn-garage')?.addEventListener('click', () => {
            this.showGarage();
        });

        document.getElementById('btn-settings')?.addEventListener('click', () => {
            this.showSettings();
        });

        // SP menu
        document.getElementById('sp-back')?.addEventListener('click', () => {
            this.ui.showMainMenu();
        });

        document.getElementById('btn-sp-missions')?.addEventListener('click', () => {
            this.showMissionSelect();
        });

        document.getElementById('btn-sp-endless')?.addEventListener('click', () => {
            this.startEndlessMode();
        });

        document.getElementById('btn-sp-tutorial')?.addEventListener('click', () => {
            this.startMission(1);
        });

        // Mission select
        document.getElementById('mission-back')?.addEventListener('click', () => {
            this.ui.hideAllScreens();
            this.ui.showScreen('sp-menu');
        });

        // MP menu
        document.getElementById('mp-back')?.addEventListener('click', () => {
            this.ui.showMainMenu();
        });

        document.getElementById('btn-mp-create')?.addEventListener('click', () => {
            this.createMultiplayerRoom();
        });

        document.getElementById('btn-mp-join')?.addEventListener('click', () => {
            this.ui.hideAllScreens();
            this.ui.showScreen('join-room-screen');
        });

        document.getElementById('btn-mp-public')?.addEventListener('click', () => {
            this.findPublicRoom();
        });

        // Join room
        document.getElementById('join-back')?.addEventListener('click', () => {
            this.ui.hideAllScreens();
            this.ui.showScreen('mp-menu');
        });

        document.getElementById('btn-join-confirm')?.addEventListener('click', () => {
            const code = document.getElementById('room-code-input')?.value || '';
            if (code.length >= 4) {
                this.joinMultiplayerRoom(code);
            }
        });

        // Lobby
        document.getElementById('lobby-back')?.addEventListener('click', () => {
            this.roomManager.leave();
            this.ui.hideAllScreens();
            this.ui.showScreen('mp-menu');
        });

        document.getElementById('btn-start-race')?.addEventListener('click', () => {
            this.network.startGame();
        });

        // HUD
        document.getElementById('btn-accept-order')?.addEventListener('click', () => {
            this.ui.hideOrderPopup();
            this.missions.acceptMission();
        });

        // Pause
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            this.resumeGame();
        });

        document.getElementById('btn-restart')?.addEventListener('click', () => {
            this.restartMission();
        });

        document.getElementById('btn-quit')?.addEventListener('click', () => {
            this.quitToMenu();
        });

        // Results
        document.getElementById('btn-next-mission')?.addEventListener('click', () => {
            this.nextMission();
        });

        document.getElementById('btn-results-menu')?.addEventListener('click', () => {
            this.quitToMenu();
        });

        // Garage
        document.getElementById('garage-back')?.addEventListener('click', () => {
            this.ui.showMainMenu();
        });

        // Settings
        document.getElementById('settings-back')?.addEventListener('click', () => {
            this.saveCurrentSettings();
            this.ui.showMainMenu();
        });

        // Canvas click to init sound
        this.canvas.addEventListener('click', () => {
            this.sound.init();
            this.sound.resume();
        }, { once: true });

        this.canvas.addEventListener('touchstart', () => {
            this.sound.init();
            this.sound.resume();
        }, { once: true });
    }

    setupMissionCallbacks() {
        this.missions.onOrderEvent = (type, message) => {
            const icons = {
                'picked_up': '📦',
                'angry_call': '📱',
                'warning': '⚠️',
                'police': '👮',
                'info': 'ℹ️',
                'angry': '😡',
                'weather': '🌧️',
                'success': '✅'
            };
            this.ui.showEventPopup(icons[type] || '⚠️', message);

            if (type === 'picked_up') {
                this.sound.playPickup();
            }
        };

        this.missions.onMissionComplete = (data) => {
            this.state = 'results';
            this.sound.playDelivery();
            this.ui.showHUD(false);
            this.ui.setResults({
                success: true,
                score: data.score,
                satisfaction: data.satisfaction,
                stars: data.stars,
                timeBonus: data.timeBonus,
                foodCondition: data.foodCondition
            });
            this.ui.showResults(true);
            this.input.showMobileControls(false);
        };

        this.missions.onMissionFail = (data) => {
            if (this.gameMode === 'multiplayer') {
                this.ui.showNotification('⏰ انتهى الوقت! طلب جديد — Time out, new order');
                this.missions.startNextEndlessOrder();
                return;
            }
            this.state = 'results';
            this.ui.showHUD(false);
            this.ui.setResults({
                success: false,
                score: data.score,
                satisfaction: 0,
                stars: 0,
                deliveries: data.deliveries
            });
            this.ui.showResults(true);
            this.input.showMobileControls(false);
        };
    }

    setupMultiplayerCallbacks() {
        this.roomManager.setupCallbacks(this.ui);

        // Keep RoomManager's handler (it creates the remote players) and extend it
        const roomManagerOnStart = this.network.onGameStart;
        this.network.onGameStart = (data) => {
            if (roomManagerOnStart) roomManagerOnStart(data);
            this.roomManager.raceTimeLimit = data.timeLimit || 180;

            // Start the multiplayer game
            this.gameMode = 'multiplayer';
            this.state = 'playing';
            this.isPaused = false;
            this.player.motorcycle.setPosition(0, 0, 0);
            this.lastSentDeliveries = 0;
            this.ui.hideAllScreens();
            this.ui.showHUD(true);
            this.input.showMobileControls(true);

            // Start a delivery
            this.missions.startEndlessMode();
            this.ui.showNotification('🏁 السباق بدأ! — Race started!');
        };

        this.network.onConnect = () => {
            this.ui.setConnectionStatus(true);
        };

        this.network.onDisconnect = () => {
            this.ui.setConnectionStatus(false);
            if (this.state === 'playing' && this.gameMode === 'multiplayer') {
                this.ui.showNotification('⚠️ فقدان الاتصال — Connection lost');
            }
        };

        this.network.onError = (msg) => {
            this.ui.showNotification('❌ ' + msg);
        };

        this.network.onRoomCreated = (data) => {
            this.roomManager.roomState = 'lobby';
            this.ui.hideAllScreens();
            this.ui.showScreen('multiplayer-lobby');
            this.ui.updateLobby(data.players, data.roomCode, true);
        };

        this.network.onRoomJoined = (data) => {
            this.roomManager.roomState = 'lobby';
            this.ui.hideAllScreens();
            this.ui.showScreen('multiplayer-lobby');
            this.ui.updateLobby(data.players, data.roomCode, this.network.isHost);
        };

        this.network.onPlayerJoined = (data) => {
            this.ui.updateLobby(data.players, this.network.roomCode, this.network.isHost);
            this.ui.showNotification(`🏍️ ${data.playerName} انضم!`);
        };

        this.network.onPlayerLeft = (data) => {
            if (this.roomManager.remotePlayers.has(data.playerId)) {
                this.roomManager.remotePlayers.get(data.playerId).dispose();
                this.roomManager.remotePlayers.delete(data.playerId);
            }
            if (data.players) {
                this.ui.updateLobby(data.players, this.network.roomCode, this.network.isHost);
            }
            if (data.playerName) {
                this.ui.showNotification(`${data.playerName} غادر — left`);
            }
        };

        const roomManagerOnRaceEnd = this.network.onRaceEnd;
        this.network.onRaceEnd = (data) => {
            if (roomManagerOnRaceEnd) roomManagerOnRaceEnd(data);
            this.finishMultiplayerRace(data);
        };
    }

    // ------------------------------------------------------------------
    // Settings / garage
    // ------------------------------------------------------------------

    applySettings() {
        const s = this.settings;
        this.sound.setVolumes(s.musicVolume, s.sfxVolume);
        this.gameCamera.smoothness = GAME_CONFIG.CAMERA_SMOOTH * (0.5 + (s.sensitivity || 50) / 50 * 0.5);

        if (this.renderer) {
            this.renderer.shadowMap.enabled = !!s.shadows;
            const maxRatio = s.quality === 'low' ? 1 : s.quality === 'high' ? 2 : 1.5;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    showSettings() {
        const s = this.settings;
        const el = (id) => document.getElementById(id);
        if (el('setting-music')) el('setting-music').value = s.musicVolume;
        if (el('setting-sfx')) el('setting-sfx').value = s.sfxVolume;
        if (el('setting-quality')) el('setting-quality').value = s.quality;
        if (el('setting-shadows')) el('setting-shadows').checked = !!s.shadows;
        if (el('setting-sensitivity')) el('setting-sensitivity').value = s.sensitivity;
        if (el('setting-server-url')) el('setting-server-url').value = s.serverUrl || '';
        this.ui.hideAllScreens();
        this.ui.showScreen('settings-screen');
    }

    saveCurrentSettings() {
        const el = (id) => document.getElementById(id);
        this.settings = {
            ...this.settings,
            musicVolume: Number(el('setting-music')?.value ?? this.settings.musicVolume),
            sfxVolume: Number(el('setting-sfx')?.value ?? this.settings.sfxVolume),
            quality: el('setting-quality')?.value || this.settings.quality,
            shadows: el('setting-shadows') ? el('setting-shadows').checked : this.settings.shadows,
            sensitivity: Number(el('setting-sensitivity')?.value ?? this.settings.sensitivity),
            serverUrl: (el('setting-server-url')?.value || '').trim()
        };
        saveSettings(this.settings);
        this.applySettings();
    }

    showGarage() {
        const colors = [0xff6b35, 0xff3333, 0x33aaff, 0x33cc66, 0xffd700, 0xaa44ff, 0xffffff, 0x222222];
        this.ui.populateColorPicker(colors, this.profile.bikeColor, (color) => {
            this.profile.bikeColor = color;
            this.player.motorcycle.setColor(color);
            savePlayerProfile(this.profile);
        });
        const coins = document.getElementById('garage-coins');
        if (coins) coins.textContent = this.profile.coins || 0;
        this.ui.hideAllScreens();
        this.ui.showScreen('garage-screen');
    }

    // ------------------------------------------------------------------
    // Single player
    // ------------------------------------------------------------------

    showMissionSelect() {
        this.profile = getPlayerProfile();
        this.ui.populateMissionList(this.missions.getMissionList(), (id) => this.startMission(id));
        this.ui.hideAllScreens();
        this.ui.showScreen('mission-select');
    }

    resetPlayerState() {
        this.player.score = 0;
        this.player.deliveries = 0;
        this.player.combo = 1;
        this.player.foodCondition = 100;
        this.player.collisionCooldown = 0;
        this.player.motorcycle.speed = 0;
        this.player.motorcycle.setPosition(0, 0, 0);
        this.player.motorcycle.rotation = 0;
    }

    enterGameplay() {
        this.state = 'playing';
        this.isPaused = false;
        this.ui.hideAllScreens();
        this.ui.showPause(false);
        this.ui.showResults(false);
        this.ui.showHUD(true);
        this.ui.updateMultiplayerRankings(this.gameMode === 'multiplayer' ? [] : null);
        this.input.showMobileControls(true);
        this.sound.init();
        this.sound.resume();
    }

    startMission(missionId) {
        this.gameMode = 'singleplayer';
        this.currentMissionId = missionId;
        this.missions.reset();
        this.resetPlayerState();

        if (!this.missions.startMission(missionId)) return;

        this.enterGameplay();

        const m = this.missions.currentMission;
        this.ui.showOrderPopup({
            emoji: FOOD_EMOJIS[m.food] || '📦',
            food: m.food,
            timeLimit: m.time,
            state: 'pickup'
        });
    }

    startEndlessMode() {
        this.gameMode = 'singleplayer';
        this.currentMissionId = null;
        this.missions.reset();
        this.resetPlayerState();
        this.enterGameplay();
        this.missions.startEndlessMode();
    }

    nextMission() {
        const next = this.currentMissionId ? this.currentMissionId + 1 : null;
        if (next && MISSION_DATA.some(m => m.id === next)) {
            this.ui.showResults(false);
            this.startMission(next);
        } else {
            this.quitToMenu();
        }
    }

    restartMission() {
        this.ui.showPause(false);
        this.ui.showResults(false);
        if (this.gameMode === 'multiplayer') return;
        if (this.currentMissionId) this.startMission(this.currentMissionId);
        else this.startEndlessMode();
    }

    pauseGame() {
        if (this.state !== 'playing' || this.gameMode === 'multiplayer') {
            // Multiplayer can't be paused, the race keeps running on the server
            if (this.gameMode === 'multiplayer') this.ui.showNotification('⏸ لا يمكن الإيقاف في اللعب الجماعي');
            return;
        }
        this.state = 'paused';
        this.isPaused = true;
        this.sound.stopEngine();
        this.ui.showPause(true);
    }

    resumeGame() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        this.isPaused = false;
        this.ui.showPause(false);
    }

    quitToMenu() {
        if (this.gameMode === 'multiplayer') {
            this.roomManager.leave();
        }
        this.missions.reset();
        this.world.clearDeliveryMarkers();
        this.resetPlayerState();
        this.sound.stopEngine();
        this.state = 'menu';
        this.gameMode = null;
        this.isPaused = false;
        this.profile = getPlayerProfile();
        this.ui.showPause(false);
        this.ui.showResults(false);
        this.ui.hideOrderPopup();
        this.ui.showHUD(false);
        this.ui.updateMultiplayerRankings(null);
        this.input.showMobileControls(false);
        this.ui.showMainMenu();
    }

    // ------------------------------------------------------------------
    // Multiplayer
    // ------------------------------------------------------------------

    getServerUrl() {
        return this.settings.serverUrl || GAME_CONFIG.SERVER_URL;
    }

    async tryConnectMultiplayer() {
        if (this.network.connected) {
            this.ui.setConnectionStatus(true);
            return true;
        }
        return this.lobby.connectToServer(this.getServerUrl());
    }

    async createMultiplayerRoom() {
        if (!(await this.tryConnectMultiplayer())) return;
        this.lobby.createRoom(this.profile.name, this.profile.bikeColor);
    }

    async joinMultiplayerRoom(code) {
        if (!(await this.tryConnectMultiplayer())) return;
        this.lobby.joinRoom(code, this.profile.name, this.profile.bikeColor);
    }

    async findPublicRoom() {
        if (!(await this.tryConnectMultiplayer())) return;
        this.lobby.findPublicRoom(this.profile.name, this.profile.bikeColor);
    }

    finishMultiplayerRace(data) {
        if (this.gameMode !== 'multiplayer') return;
        const rankings = (data && data.rankings) || [];
        const myIndex = rankings.findIndex(r => r.id === this.network.playerId);
        const me = rankings[myIndex] || { score: this.player.score, deliveries: this.player.deliveries };

        this.state = 'results';
        this.ui.hideOrderPopup();
        this.ui.showHUD(false);
        this.input.showMobileControls(false);
        this.sound.stopEngine();
        this.ui.setResults({
            success: myIndex === 0,
            score: me.score,
            satisfaction: this.missions.satisfaction.getSatisfactionPercent(),
            stars: myIndex === 0 ? 3 : myIndex === 1 ? 2 : 1,
            deliveries: me.deliveries
        });
        this.ui.showResults(true);

        // Rankings in the results screen
        const details = document.getElementById('results-details');
        if (details && rankings.length) {
            details.innerHTML += rankings.map((r, i) => `
                <div class="results-row"><span class="label">#${i + 1} ${r.name}</span><span class="value">${r.score}</span></div>
            `).join('');
        }
    }

    // ------------------------------------------------------------------
    // Main loop
    // ------------------------------------------------------------------

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const dt = Math.min(this.clock.getDelta(), 0.05);

        if (this.state === 'playing') {
            this.updatePlaying(dt);
        } else if (this.state === 'menu' || this.state === 'results') {
            this.updateIdleCamera(dt);
        }

        this.renderer.render(this.scene, this.camera);
    }

    updatePlaying(dt) {
        this.input.update();

        if (this.input.consumePause()) {
            this.pauseGame();
            if (this.state !== 'playing') return;
        }
        if (this.input.consumeCamera()) {
            this.gameCamera.toggleMode();
        }
        if (this.input.state.horn) {
            this.hornCooldown = (this.hornCooldown || 0) - dt;
            if (this.hornCooldown <= 0) {
                this.sound.playHorn();
                this.hornCooldown = 0.5;
            }
        }

        // Player
        const collided = this.player.update(this.input.state, dt, this.physics);
        if (collided) {
            this.gameCamera.shake(0.4);
            this.sound.playCollision();
            this.missions.orderSystem.damageFoodCondition(10);
        }

        // World + missions
        const pos = this.player.getPosition();
        this.world.update(dt, pos);
        this.missions.update(dt);
        this.roomManager.update(dt);

        // Camera + sound
        this.gameCamera.update(pos, this.player.getRotation(), Math.abs(this.player.getSpeed()), dt);
        this.sound.playEngineSound(Math.abs(this.player.getSpeed()), GAME_CONFIG.MOTO_MAX_SPEED);

        // HUD
        this.ui.updateHUD(this.missions.getHUDData());

        this.minimapTimer += dt;
        if (this.minimapTimer > 0.1) {
            this.minimapTimer = 0;
            this.ui.updateMinimap(pos, this.player.getRotation(), this.getMinimapTargets(), GAME_CONFIG.WORLD_SIZE);
        }

        // Multiplayer
        if (this.gameMode === 'multiplayer') {
            this.networkTickTimer += dt;
            if (this.networkTickTimer >= 1 / GAME_CONFIG.MULTIPLAYER.TICK_RATE) {
                this.networkTickTimer = 0;
                this.roomManager.sendPlayerState(this.player);
                this.ui.updateMultiplayerRankings(this.roomManager.getRankings(this.player));
            }
            if (this.player.deliveries > (this.lastSentDeliveries || 0)) {
                this.lastSentDeliveries = this.player.deliveries;
                this.network.sendDeliveryComplete(this.player.score, this.player.deliveries);
            }
        }
    }

    getMinimapTargets() {
        const order = this.missions.orderSystem.currentOrder;
        if (!order) return [];
        return order.state === 'pickup'
            ? [{ x: order.pickup.x, z: order.pickup.z, type: 'pickup' }]
            : [{ x: order.delivery.x, z: order.delivery.z, type: 'delivery' }];
    }

    updateIdleCamera(dt) {
        // Slow orbit around the city while in menus / results
        this.orbitAngle = (this.orbitAngle || 0) + dt * 0.1;
        const r = 80;
        this.camera.position.set(Math.cos(this.orbitAngle) * r, 35, Math.sin(this.orbitAngle) * r);
        this.camera.lookAt(0, 5, 0);
        this.world.update(dt, new THREE.Vector3(0, 0, 0));
    }
}
