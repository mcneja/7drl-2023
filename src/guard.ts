export { Guard, GuardMode };

import { GameMap, invalidRegion } from './game-map';
import { vec2 } from './my-matrix';

enum GuardMode {
    Patrol,
    Look,
    Listen,
    ChaseVisibleTarget,
    MoveToLastSighting,
    MoveToLastSound,
    MoveToGuardShout,
}

class Guard {
    pos: vec2;
    dir: vec2;
    mode: GuardMode;
    speaking: boolean;
    hasMoved: boolean;
    heardThief: boolean;
    hearingGuard: boolean;
    heardGuard: boolean;
    heardGuardPos: vec2;

    // Chase
    goal: vec2;
    modeTimeout: number;

    // Patrol
    regionGoal: number;
    regionPrev: number;

    constructor(pos: vec2, map: GameMap) {
        this.pos = vec2.clone(pos);
        this.dir = vec2.fromValues(1, 0);
        this.mode = GuardMode.Patrol;
        this.speaking = false;
        this.hasMoved = false;
        this.heardThief = false;
        this.hearingGuard = false;
        this.heardGuard = false;
        this.heardGuardPos = pos;
        this.goal = pos;
        this.modeTimeout = 0;
        this.regionGoal = invalidRegion;
        this.regionPrev = invalidRegion;

        this.setupGoalRegion(map);
    }

    setupGoalRegion(map: GameMap) {
        let regionCur = map.cells.at(this.pos[0], this.pos[1]).region;
    
        if (this.regionGoal != invalidRegion && regionCur == this.regionPrev) {
            return;
        }

        /*
        if (regionCur == invalidRegion) {
            this.regionGoal = map.closestRegion(this.pos);
        } else {
            this.regionGoal = map.randomNeighborRegion(regionCur, this.regionPrev);
            this.regionPrev = regionCur;
        }
        */
    }
}
