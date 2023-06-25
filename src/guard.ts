export { Guard, GuardMode, guardActAll, lineOfSight, isRelaxedGuardMode };

import { Float64Grid, GameMap, Item, ItemType, Player, TerrainType, GuardStates } from './game-map';
import { vec2 } from './my-matrix';
import { randomInRange } from './random';
import { Popups, PopupType } from './popups';
import { LightSourceAnimation, SpriteAnimation, tween } from './animation';
import { GameMode } from './types';

enum MoveResult {
    StoodStill,
    Moved,
    BumpedPlayer,
}

enum GuardMode {
    Patrol,
    Look,
    Listen,
    ChaseVisibleTarget,
    MoveToLastSighting,
    MoveToLastSound,
    MoveToGuardShout,
    MoveToDownedGuard,
    WakeGuard,
    RelightTorch,
    PostRelightTorch,
    Unconscious,
}

class Guard {
    pos: vec2;
    dir: vec2;
    mode: GuardMode;
    angry: boolean;
    hasTorch: boolean;
    torchAnimation: LightSourceAnimation|null = null;
    speaking: boolean;
    hasMoved: boolean;
    heardThief: boolean;
    hearingGuard: boolean;
    heardGuard: boolean;
    heardGuardPos: vec2;

    animation: SpriteAnimation|null = null;

    // Chase
    goal: vec2;
    modeTimeout: number;

    // Patrol
    patrolPath: Array<vec2>;
    patrolPathIndex: number;
    patrolReverse: boolean;
    patrolLoops: boolean;

    constructor(patrolPath: Array<vec2>, pathIndexStart: number, map: GameMap) {
        const posStart = patrolPath[pathIndexStart];
        this.pos = vec2.clone(posStart);
        this.dir = vec2.fromValues(1, 0);
        this.mode = GuardMode.Patrol;
        this.angry = false;
        this.hasTorch = false;
        this.speaking = false;
        this.hasMoved = false;
        this.heardThief = false;
        this.hearingGuard = false;
        this.heardGuard = false;
        this.heardGuardPos = vec2.clone(posStart);
        this.goal = vec2.clone(posStart);
        this.modeTimeout = 0;
        this.patrolPath = patrolPath;
        this.patrolPathIndex = pathIndexStart;
        this.patrolReverse = false;
        this.patrolLoops = patrolPathLoops(patrolPath);

        this.updateDirInitial();
    }

    overheadIcon(): number {
        if (this.mode === GuardMode.Unconscious) {
            return GuardStates.Unconscious;
        }
        if (isRelaxedGuardMode(this.mode)) {
            return this.angry? GuardStates.Angry : GuardStates.Relaxed;
        }
    
        return (this.mode == GuardMode.ChaseVisibleTarget) ? GuardStates.Chasing : GuardStates.Alerted;
    }

    act(map: GameMap, popups: Popups, player: Player, shouts: Array<Shout>) {
        const modePrev = this.mode;
        const posPrev = vec2.clone(this.pos);
    
        // See if senses will kick us into a new mode

        if(this.mode===GuardMode.Unconscious) {
            this.modeTimeout--;
            if(this.modeTimeout === 5) {
                const popup = PopupType.GuardStirring;
                popups.add(popup, this.pos);
            }
            if(this.modeTimeout<=0) {
                this.mode = GuardMode.Patrol;
                this.modeTimeout = 0;
                this.angry = true;
                shouts.push({pos_shouter: this.pos, pos_target: this.pos, target:this});
                const popup = PopupType.GuardAwakesWarning;
                popups.add(popup, this.pos);
            }
            return;
        }

        if (!isRelaxedGuardMode(this.mode)) {
            if (this.seesActor(map, player)) {
                vec2.copy(this.goal, player.pos);
                this.mode = GuardMode.ChaseVisibleTarget;
            } else if (this.mode === GuardMode.ChaseVisibleTarget) {
                vec2.copy(this.goal, player.pos);
                this.mode = GuardMode.MoveToLastSighting;
                this.modeTimeout = 3;
            }
        }

        if (this.mode !== GuardMode.ChaseVisibleTarget) {
            if (this.heardGuard) {
                this.mode = GuardMode.MoveToGuardShout;
                this.modeTimeout = 2 + randomInRange(4);
                vec2.copy(this.goal, this.heardGuardPos);
            }
    
            if (this.heardThief) {
                if (this.adjacentTo(player.pos)) {
                    this.mode = GuardMode.ChaseVisibleTarget;
                    vec2.copy(this.goal, player.pos);
                } else if (isRelaxedGuardMode(this.mode)) {
                    this.mode = GuardMode.Listen;
                    this.modeTimeout = 2 + randomInRange(4);
                    updateDir(this.dir, this.pos, player.pos);
                } else if (this.mode!==GuardMode.MoveToDownedGuard) {
                    this.mode = GuardMode.MoveToLastSound;
                    this.modeTimeout = 2 + randomInRange(4);
                    vec2.copy(this.goal, player.pos);
                }
            }
        }
    
        // Pass time in the current mode
    
        switch (this.mode) {
        case GuardMode.Patrol:
            this.patrolStep(map, player);
            break;

        case GuardMode.Look:
        case GuardMode.Listen:
            this.modeTimeout -= 1;
            if (this.modeTimeout == 0) {
                this.mode = GuardMode.Patrol;
            }
            break;

        case GuardMode.ChaseVisibleTarget:
            if (this.adjacentTo(player.pos)) {
                updateDir(this.dir, this.pos, this.goal);
                if (modePrev == GuardMode.ChaseVisibleTarget) {
                    if (!player.damagedLastTurn) {
                        popups.add(PopupType.Damage, this.pos);
                    }
                    const startend = vec2.create();
                    const middle = vec2.create();
                    vec2.subtract(middle, player.pos, this.pos);
                    vec2.scale(middle, middle, 0.5);
                    this.animation = new SpriteAnimation([{pt0:startend, pt1:middle, duration:0.1, fn:tween.easeInQuad},
                                                        {pt0:middle, pt1:startend, duration:0.1, fn:tween.easeOutQuad},
                                                        ], []);
                    player.applyDamage(1);
                }
            } else {
                this.moveTowardPosition(this.goal, map, player);
            }
            break;

        case GuardMode.MoveToLastSighting:
        case GuardMode.MoveToLastSound:
        case GuardMode.MoveToGuardShout:
            if (this.moveTowardPosition(this.goal, map, player) !== MoveResult.Moved) {
                this.modeTimeout -= 1;
            }

            if (this.modeTimeout == 0) {
                this.mode = GuardMode.Patrol;
            }
            break;

        case GuardMode.MoveToDownedGuard:
            if (this.cardinallyAdjacentTo(this.goal)) {
                if(map.guards.find(
                    (g) => g.pos[0] === this.goal[0] 
                    && g.pos[1] === this.goal[1]
                    && g.mode === GuardMode.Unconscious
                ))  {
                    updateDir(this.dir, this.pos, this.goal);
                    this.mode = GuardMode.WakeGuard;
                    this.modeTimeout = 3;    
                } else {
                    this.modeTimeout = 0;
                    this.mode = GuardMode.Patrol;
                }
            } else if (this.moveTowardAdjacentToPosition(this.goal, map, player) !== MoveResult.Moved) {
                this.modeTimeout -= 1;
                if (this.modeTimeout === 0) {
                    this.mode = GuardMode.Patrol;
                }
            }
            break;

            case GuardMode.WakeGuard:
                --this.modeTimeout;
                updateDir(this.dir, this.pos, this.goal);
                const g = map.guards.find(
                    (g) => g.pos[0] === this.goal[0] 
                    && g.pos[1] === this.goal[1]
                    && g.mode === GuardMode.Unconscious
                )
                if(g !== undefined)  {
                    if (this.modeTimeout <= 0) {
                        g.modeTimeout = 0;
                        this.mode = GuardMode.Patrol;
                    }
                } else {
                    this.modeTimeout = 0;
                    this.mode = GuardMode.Patrol;
                }
                break;
    
            case GuardMode.RelightTorch:
                if (this.cardinallyAdjacentTo(this.goal)) {
                    updateDir(this.dir, this.pos, this.goal);
                    this.mode = GuardMode.PostRelightTorch;
                    this.modeTimeout = 3;
                } else if (this.moveTowardAdjacentToPosition(this.goal, map, player) !== MoveResult.Moved) {
                    this.modeTimeout -= 1;
                    if (this.modeTimeout === 0) {
                        this.mode = GuardMode.Patrol;
                    }
                }
                break;

            case GuardMode.PostRelightTorch:
                --this.modeTimeout;
                updateDir(this.dir, this.pos, this.goal);
                if (this.modeTimeout <= 0) {
                    relightTorchAt(map, this.goal, player);
                    this.mode = GuardMode.Patrol;
                }
                break;
        }

        // If the guard's moved and has a torch, recompute the level's lighting so the guard can spot
        // the player using the new lighting

        if (this.hasTorch && (this.pos[0] != posPrev[0] || this.pos[1] != posPrev[1])) {
            map.computeLighting(map.cells.at(player.pos[0], player.pos[1]));
        }

        // Update state based on target visibility from new position
//        let seen:Guard|Player|null = null;
        if (this.seesActor(map, player)) {
            if (isRelaxedGuardMode(this.mode) && !this.adjacentTo(player.pos)) {
                this.mode = GuardMode.Look;
                this.modeTimeout = 2 + randomInRange(4);
            } else {
                vec2.copy(this.goal, player.pos);
                updateDir(this.dir, this.pos, this.goal);
                this.mode = GuardMode.ChaseVisibleTarget;
            }
        } else if(this.mode == GuardMode.ChaseVisibleTarget) {
                vec2.copy(this.goal, player.pos);
                this.mode = GuardMode.MoveToLastSighting;
                this.modeTimeout = 3;
        }
        let guardSeen:Guard|null = null;  
        if (isRelaxedGuardMode(this.mode) && 
                this.mode!== GuardMode.MoveToDownedGuard && 
                this.mode!== GuardMode.WakeGuard) {
            for(let guard of map.guards) {
                if (this !==guard && 
                    guard.mode===GuardMode.Unconscious && 
                    this.seesActor(map, guard)) {
                    vec2.copy(this.goal, guard.pos);
                    this.mode = GuardMode.MoveToDownedGuard;
                    this.angry = true;
                    this.modeTimeout = 3;
                    guardSeen = guard;
                    shouts.push({pos_shouter: this.pos, pos_target: guard.pos, target:guard});
                    break;
                }
            }    
        }
        if (guardSeen === null && this.mode === GuardMode.Patrol) {
            const torch = torchNeedingRelighting(map, this.pos);
            if (torch !== undefined) {
                vec2.copy(this.goal, torch.pos);
                this.mode = GuardMode.RelightTorch;
                this.modeTimeout = 3;
            } else if (posPrev[0] === this.pos[0] && posPrev[1] === this.pos[1]) {
                const posLookAt = this.tryGetPosLookAt(map);
                if (posLookAt !== undefined) {
                    updateDir(this.dir, this.pos, posLookAt);
                }
            }
        }
    
        // Clear heard-thief flag
    
        this.heardThief = false;
    
        // Say something to indicate state changes

        const popupType = popupTypeForStateChange(modePrev, this.mode);
        if (popupType !== undefined) {
            popups.add(popupType, this.pos);
        }
    
        if (this.mode === GuardMode.ChaseVisibleTarget && modePrev !== GuardMode.ChaseVisibleTarget) {
            shouts.push({pos_shouter: this.pos, pos_target: player.pos, target: player});
        }
    }

    cardinallyAdjacentTo(pos: vec2): boolean {
        const dx = Math.abs(pos[0] - this.pos[0]);
        const dy = Math.abs(pos[1] - this.pos[1]);
        return (dx == 1 && dy == 0) || (dx == 0 && dy == 1);
    }

    adjacentTo(pos: vec2): boolean {
        const dx = pos[0] - this.pos[0];
        const dy = pos[1] - this.pos[1];
        return Math.abs(dx) < 2 && Math.abs(dy) < 2;
    }

    seesActor(map: GameMap, person: Player|Guard): boolean {
        const d = vec2.create();
        vec2.subtract(d, person.pos, this.pos);
        if (vec2.dot(this.dir, d) < 0) {
            return false;
        }
    
        let playerIsLit = map.cells.at(person.pos[0], person.pos[1]).lit>0;
    
        let d2 = vec2.squaredLength(d);
        if (d2 >= this.sightCutoff(playerIsLit)) {
            return false;
        }
    
        if (!person.hidden(map) && lineOfSight(map, this.pos, person.pos)) {
            return true;
        }
    
        if ((!isRelaxedGuardMode(this.mode) || this.angry) && Math.abs(d[0]) < 2 && Math.abs(d[1]) < 2) {
            return true;
        }
    
        return false;
    }

    hidden() {
        return false;
    }

    cutoffLit(): number {
        return (isRelaxedGuardMode(this.mode) && !this.angry) ? 40 : 75;
    }
    
    cutoffUnlit(): number {
        return (isRelaxedGuardMode(this.mode) && !this.angry) ? 3 : 33;
    }
    
    sightCutoff(litTarget: boolean): number {
        return litTarget ? this.cutoffLit() : this.cutoffUnlit();
    }

    patrolStep(map: GameMap, player: Player) {
        let moveResult;

        const onPatrolPath = this.patrolPath[this.patrolPathIndex][0] === this.pos[0] &&
                             this.patrolPath[this.patrolPathIndex][1] === this.pos[1];

        if (onPatrolPath) {
            if (this.patrolReverse) {
                if (this.patrolPathIndex === 0) {
                    if (this.patrolLoops) {
                        this.patrolPathIndex = this.patrolPath.length - 1;
                    } else {
                        this.patrolReverse = false;
                        this.patrolPathIndex = 1;
                    }
                } else {
                    --this.patrolPathIndex;
                }
            } else {
                if (this.patrolPathIndex >= this.patrolPath.length - 1) {
                    if (this.patrolLoops) {
                        this.patrolPathIndex = 0;
                    } else {
                        this.patrolReverse = true;
                        this.patrolPathIndex = this.patrolPath.length - 2;
                    }
                } else {
                    ++this.patrolPathIndex;
                }
            }

            moveResult = this.moveTowardPosition(this.patrolPath[this.patrolPathIndex], map, player);
        } else {
            moveResult = this.moveTowardPatrolPath(map, player);
            this.findPatrolPathIndex();
        }

        if (moveResult === MoveResult.BumpedPlayer) {
            this.mode = GuardMode.ChaseVisibleTarget;
            vec2.copy(this.goal, player.pos);
            updateDir(this.dir, this.pos, this.goal);
        }

        // TODO: Plot the back-and-forth paths explicitly, as well as the delays
        // at the ends. When standing still, look for a window, torch, or table
        // to face.
    }

    updateDirInitial()
    {
        let patrolPathIndexNext;
        if (this.patrolReverse) {
            if (this.patrolPathIndex === 0) {
                if (this.patrolLoops) {
                    patrolPathIndexNext = this.patrolPath.length - 1;
                } else {
                    patrolPathIndexNext = 1;
                }
            } else {
                patrolPathIndexNext = this.patrolPathIndex - 1;
            }
        } else {
            if (this.patrolPathIndex >= this.patrolPath.length - 1) {
                if (this.patrolLoops) {
                    patrolPathIndexNext = 0;
                } else {
                    patrolPathIndexNext = this.patrolPath.length - 2;
                }
            } else {
                patrolPathIndexNext = this.patrolPathIndex + 1;
            }
        }

        updateDir(this.dir, this.pos, this.patrolPath[patrolPathIndexNext]);
    }

    moveTowardPosition(posGoal: vec2, map: GameMap, player: Player): MoveResult {
        const distanceField = map.computeDistancesToPosition(posGoal);
        const posNext = posNextBest(map, distanceField, this.pos);

        if (posNext[0] == this.pos[0] && posNext[1] == this.pos[1]) {
            return MoveResult.StoodStill;
        }

        updateDir(this.dir, this.pos, posNext);

        if (player.pos[0] == posNext[0] && player.pos[1] == posNext[1]) {
            return MoveResult.BumpedPlayer;
        }

        const start = vec2.create();
        vec2.subtract(start, this.pos, posNext) 
        const end = vec2.create();
        this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);
        vec2.copy(this.pos, posNext);
        this.onMove(map, player);
        return MoveResult.Moved;
    }

    moveTowardAdjacentToPosition(posGoal: vec2, map: GameMap, player: Player): MoveResult {
        const distanceField = map.computeDistancesToAdjacentToPosition(posGoal);
        const posNext = posNextBest(map, distanceField, this.pos);

        if (posNext[0] == this.pos[0] && posNext[1] == this.pos[1]) {
            return MoveResult.StoodStill;
        }

        updateDir(this.dir, this.pos, posNext);

        if (player.pos[0] == posNext[0] && player.pos[1] == posNext[1]) {
            return MoveResult.BumpedPlayer;
        }

        const start = vec2.create();
        vec2.subtract(start, this.pos, posNext) 
        const end = vec2.create();
        this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);

        vec2.copy(this.pos, posNext);
        this.onMove(map, player);
        return MoveResult.Moved;
    }

    moveTowardPatrolPath(map: GameMap, player: Player): MoveResult {
        const distanceField = map.computeDistancesToPatrolPath(this.patrolPath);
        const posNext = posNextBest(map, distanceField, this.pos);

        if (posNext[0] == this.pos[0] && posNext[1] == this.pos[1]) {
            return MoveResult.StoodStill;
        }

        updateDir(this.dir, this.pos, posNext);

        if (player.pos[0] == posNext[0] && player.pos[1] == posNext[1]) {
            return MoveResult.BumpedPlayer;
        }

        const start = vec2.create();
        vec2.subtract(start, this.pos, posNext) 
        const end = vec2.create();
        this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);

        vec2.copy(this.pos, posNext);
        this.onMove(map, player);
        return MoveResult.Moved;
    }

    onMove(map: GameMap, player: Player) {
        if (vec2.squaredDistance(player.pos, this.pos) < 64) {
            const terrainType = map.cells.at(this.pos[0], this.pos[1]).type;
            if (terrainType == TerrainType.PortcullisNS || terrainType == TerrainType.PortcullisEW) {
                // console.log('went through portcullis');
            }
        }
    }

    findPatrolPathIndex(): boolean {
        // Search forward from guard's current path index
        for (let iPatrolPos = this.patrolPathIndex; iPatrolPos < this.patrolPath.length; ++iPatrolPos) {
            const posPath = this.patrolPath[iPatrolPos];
            if (posPath[0] === this.pos[0] && posPath[1] === this.pos[1]) {
                this.patrolPathIndex = iPatrolPos;
                return true;
            }
        }
        // Search backward from guard's current path index
        for (let iPatrolPos = this.patrolPathIndex - 1; iPatrolPos >= 0; --iPatrolPos) {
            const posPath = this.patrolPath[iPatrolPos];
            if (posPath[0] === this.pos[0] && posPath[1] === this.pos[1]) {
                this.patrolPathIndex = iPatrolPos;
                return true;
            }
        }
        return false;
    }

    tryGetPosLookAt(map: GameMap): vec2 | undefined {
        const x = this.pos[0];
        const y = this.pos[1];
        if (x > 0 && map.cells.at(x - 1, y).type == TerrainType.OneWayWindowW) {
            return vec2.fromValues(x - 1, y);
        } else if (x < map.cells.sizeX - 1 && map.cells.at(x + 1, y).type == TerrainType.OneWayWindowE) {
            return vec2.fromValues(x + 1, y);
        } else if (y > 0 && map.cells.at(x, y - 1).type == TerrainType.OneWayWindowS) {
            return vec2.fromValues(x, y - 1);
        } else if (y < map.cells.sizeY - 1 && map.cells.at(x, y + 1).type == TerrainType.OneWayWindowN) {
            return vec2.fromValues(x, y + 1);
        }

        return undefined;
    }
}

function isRelaxedGuardMode(guardMode: GuardMode): boolean {
    return guardMode === GuardMode.Patrol ||
        guardMode === GuardMode.RelightTorch ||
        guardMode === GuardMode.PostRelightTorch;
}

type Shout = {
    pos_shouter: vec2; // where is the person shouting?
    pos_target: vec2; // where are they reporting the target is?
    target: Player|Guard;
}

function guardActAll(map: GameMap, popups: Popups, player: Player) {

    // Mark if we heard a guard last turn, and clear the speaking flag.

    for (const guard of map.guards) {
        guard.heardGuard = guard.hearingGuard;
        guard.hearingGuard = false;
        guard.speaking = false;
        guard.hasMoved = false;
    }

    // Update each guard for this turn.

    const shouts: Array<Shout> = [];
    for (const guard of map.guards) {
        guard.act(map, popups, player, shouts);
        guard.hasMoved = true;
    }

    // Process shouts

    for (const shout of shouts) {
        alertNearbyGuards(map, shout);
    }
}

function popupTypeForStateChange(modePrev: GuardMode, modeNext: GuardMode): PopupType | undefined {
    if (modeNext == modePrev) {
        return undefined;
    }

    switch (modeNext) {
        case GuardMode.Patrol:
            switch (modePrev) {
                case GuardMode.Look: return PopupType.GuardFinishLooking;
                case GuardMode.Listen: return PopupType.GuardFinishListening;
                case GuardMode.MoveToLastSound: return PopupType.GuardFinishInvestigating;
                case GuardMode.MoveToGuardShout: return PopupType.GuardFinishInvestigating;
                case GuardMode.MoveToLastSighting: return PopupType.GuardEndChase;
                case GuardMode.Unconscious: return PopupType.GuardAwakesWarning;
                default: return undefined;
            }
        case GuardMode.Look: return PopupType.GuardSeeThief;
        case GuardMode.Listen: return PopupType.GuardHearThief;
        case GuardMode.ChaseVisibleTarget:
            if (modePrev != GuardMode.MoveToLastSighting) {
                return PopupType.GuardChase;
            } else {
                return undefined;
            }
        case GuardMode.MoveToLastSighting: return undefined;
        case GuardMode.MoveToLastSound: return PopupType.GuardInvestigate;
        case GuardMode.MoveToGuardShout: return PopupType.GuardHearGuard;
        case GuardMode.MoveToDownedGuard: return PopupType.GuardDownWarning;
    }

    return undefined;
}

function alertNearbyGuards(map: GameMap, shout: Shout) {
    for (const guard of map.guardsInEarshot(shout.pos_shouter, 25)) {
        if (guard.pos[0] != shout.pos_shouter[0] || guard.pos[1] != shout.pos_shouter[1]) {
            guard.hearingGuard = true;
            if(shout.target instanceof Guard) {
                guard.angry = true;
            }
            vec2.copy(guard.heardGuardPos, shout.pos_shouter);
        }
    }
}

function posNextBest(map: GameMap, distanceField: Float64Grid, posFrom: vec2): vec2 {
    let costBest = Infinity;
    let posBest = posFrom;

    const posMin = vec2.fromValues(Math.max(0, posFrom[0] - 1), Math.max(0, posFrom[1] - 1));
    const posMax = vec2.fromValues(Math.min(map.cells.sizeX, posFrom[0] + 2), Math.min(map.cells.sizeY, posFrom[1] + 2));

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            const cost = distanceField.get(x, y);
            if (cost == Infinity) {
                continue;
            }

            let pos = vec2.fromValues(x, y);
            if (map.guardMoveCost(posFrom, pos) == Infinity) {
                continue;
            }

            if (map.cells.at(pos[0], pos[1]).type == TerrainType.GroundWater) {
                continue;
            }

            if (map.isGuardAt(pos[0], pos[1])) {
                continue;
            }

            if (cost < costBest) {
                costBest = cost;
                posBest = pos;
            }
        }
    }

    return posBest;
}

function updateDir(dir: vec2, pos: vec2, posTarget: vec2) {
    const dirTarget = vec2.create();
    vec2.subtract(dirTarget, posTarget, pos);

    const dirLeft = vec2.fromValues(-dir[1], dir[0]);

    let dotForward = vec2.dot(dir, dirTarget);
    let dotLeft = vec2.dot(dirLeft, dirTarget);

    if (Math.abs(dotForward) >= Math.abs(dotLeft)) {
        if (dotForward >= 0) {
            // leave dir unchanged
        } else {
            vec2.negate(dir, dir);
        }
    } else if (Math.abs(dotLeft) > Math.abs(dotForward)) {
        if (dotLeft >= 0) {
            vec2.copy(dir, dirLeft);
        } else {
            vec2.negate(dir, dirLeft);
        }
    } else if (dotForward > 0) {
        // leave dir unchanged
    } else if (dotLeft >= 0) {
        vec2.copy(dir, dirLeft);
    } else {
        vec2.negate(dir, dirLeft);
    }
}

function torchNeedingRelighting(map: GameMap, posViewer: vec2): Item | undefined {
    let bestItem: Item | undefined = undefined;
    let bestDistSquared = Infinity;
    for (const item of map.items) {
        if (item.type === ItemType.TorchUnlit) {
            const distSquared = vec2.squaredDistance(item.pos, posViewer);
            if (distSquared >= bestDistSquared) {
                continue;
            }
            if (!lineOfSight(map, posViewer, item.pos)) {
                continue;
            }
            bestDistSquared = distSquared;
            bestItem = item;
        }
    }
    return bestItem;
}

function relightTorchAt(map: GameMap, posTorch: vec2, player: Player) {
    for (const item of map.items) {
        if (item.type === ItemType.TorchUnlit && item.pos[0] === posTorch[0] && item.pos[1] === posTorch[1]) {
            item.type = ItemType.TorchLit;
        }
    }
    map.computeLighting(map.cells.at(player.pos[0], player.pos[1]));
}

function lineOfSight(map: GameMap, from: vec2, to: vec2): boolean {
    let x = from[0];
    let y = from[1];

    const dx = to[0] - x;
    const dy = to[1] - y;

    let ax = Math.abs(dx);
    let ay = Math.abs(dy);

    const x_inc = (dx > 0) ? 1 : -1;
    const y_inc = (dy > 0) ? 1 : -1;

    let error = ay - ax;

    let n = ax + ay - 1;

    ax *= 2;
    ay *= 2;

    while (n > 0) {
        if (error > 0) {
            y += y_inc;
            error -= ax;
        } else {
            x += x_inc;
            error += ay;
        }

        if (map.cells.at(x, y).blocksSight) {
            return false;
        }

        --n;
    }

    return true;
}

function patrolPathLoops(patrolPath: Array<vec2>): boolean {
    const dx = patrolPath[0][0] - patrolPath[patrolPath.length - 1][0];
    const dy = patrolPath[0][1] - patrolPath[patrolPath.length - 1][1];
    return (dx != 0 || dy != 0) && Math.abs(dx) < 2 && Math.abs(dy) < 2;
}
