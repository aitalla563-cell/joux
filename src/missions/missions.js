// src/missions/missions.js — helpers around the mission data

import { MISSION_DATA } from '../utils/Constants.js';

export { MISSION_DATA };

export function getMissionById(id) {
    return MISSION_DATA.find(m => m.id === id) || null;
}

export function getNextMission(id) {
    return getMissionById(id + 1);
}

export function getMissionCount() {
    return MISSION_DATA.length;
}
