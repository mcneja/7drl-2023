export { Guard, GuardMode, guardActAll, lineOfSight, isRelaxedGuardMode };

import { Float64Grid, GameMap, Item, ItemType, Player, TerrainType, GuardStates, isWindowTerrainType } from './game-map';
import { vec2 } from './my-matrix';
import { randomInRange } from './random';
import { Popups, PopupType } from './popups';
import { LightSourceAnimation, SpriteAnimation, tween } from './animation';
import { State } from './types';

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
    MoveToTorch,
    LightTorch,
    Unconscious,
}

class Guard {
    pos: vec2;
    dir: vec2 = vec2.fromValues(1, 0);
    mode: GuardMode = GuardMode.Patrol;
    angry: boolean = false;
    hasTorch: boolean = false;
    hasPurse: boolean = false;
    torchAnimation: LightSourceAnimation|null = null;
    speaking: boolean = false;
    hasMoved: boolean = false;
    heardThief: boolean = false;
    hearingGuard: boolean = false;
    heardGuard: boolean = false;
    heardGuardPos: vec2;

    animation: SpriteAnimation|null = null;

    // Chase
    goal: vec2;
    modeTimeout: number = 0;

    // Patrol
    patrolPath: Array<vec2>;
    patrolPathIndex: number;

    constructor(patrolPath: Array<vec2>, pathIndexStart: number) {
        const posStart = patrolPath[pathIndexStart];
        this.pos = vec2.clone(posStart);
        this.heardGuardPos = vec2.clone(posStart);
        this.goal = vec2.clone(posStart);
        this.patrolPath = patrolPath;
        this.patrolPathIndex = pathIndexStart;

        this.updateDirInitial();
    }

    overheadIcon(): number {
        if (this.mode === GuardMode.Unconscious) {
            return GuardStates.Unconscious;
        } else if (this.mode === GuardMode.ChaseVisibleTarget) {
            return GuardStates.Chasing;
        } else if (!isRelaxedGuardMode(this.mode)) {
            return GuardStates.Alerted;
        } else if (this.angry) {
            return GuardStates.Angry;
        } else {
            return GuardStates.Relaxed;
        }
    }

    moving(): boolean {
        switch (this.mode) {
            case GuardMode.Patrol:
                if (this.patrolPath[this.patrolPathIndex].equals(this.pos)) {
                    const patrolPathIndexNext = (this.patrolPathIndex + 1) % this.patrolPath.length;
                    return !this.patrolPath[this.patrolPathIndex].equals(this.patrolPath[patrolPathIndexNext]);
                }
                return true;

            case GuardMode.Look:
            case GuardMode.Listen:
            case GuardMode.ChaseVisibleTarget:
            case GuardMode.WakeGuard:
            case GuardMode.LightTorch:
            case GuardMode.Unconscious:
                return false;

            case GuardMode.MoveToLastSighting:
            case GuardMode.MoveToLastSound:
            case GuardMode.MoveToGuardShout:
                return !this.pos.equals(this.goal);
    
            case GuardMode.MoveToDownedGuard:
            case GuardMode.MoveToTorch:
                return !this.cardinallyAdjacentTo(this.goal);
            }
        }

    act(map: GameMap, popups: Popups, player: Player, shouts: Array<Shout>) {
        const modePrev = this.mode;
        const posPrev = vec2.clone(this.pos);
    
        // See if senses will kick us into a new mode

        if (this.mode !== GuardMode.Unconscious) {
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
                this.enterPatrolMode(map);
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
                    this.animation = new SpriteAnimation(
                        [
                            {pt0:startend, pt1:middle, duration:0.1, fn:tween.easeInQuad},
                            {pt0:middle, pt1:startend, duration:0.1, fn:tween.easeOutQuad},
                        ],
                        []);
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
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.MoveToDownedGuard:
            if (this.cardinallyAdjacentTo(this.goal)) {
                if(map.guards.find(
                    (g) => g.pos.equals(this.goal)
                    && g.mode === GuardMode.Unconscious
                ))  {
                    updateDir(this.dir, this.pos, this.goal);
                    this.mode = GuardMode.WakeGuard;
                    this.modeTimeout = 3;    
                } else {
                    this.modeTimeout = 0;
                    this.enterPatrolMode(map);
                }
            } else if (this.moveTowardAdjacentToPosition(this.goal, map, player) !== MoveResult.Moved) {
                this.modeTimeout -= 1;
                if (this.modeTimeout === 0) {
                    this.enterPatrolMode(map);
                }
            }
            break;

        case GuardMode.WakeGuard:
            --this.modeTimeout;
            updateDir(this.dir, this.pos, this.goal);
            const g = map.guards.find((g) => g.pos.equals(this.goal) && g.mode === GuardMode.Unconscious);
            if (g !== undefined)  {
                if (this.modeTimeout <= 0) {
                    g.modeTimeout = 0;
                    this.enterPatrolMode(map);
                }
            } else {
                this.modeTimeout = 0;
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.MoveToTorch:
            {
                const moveResult = this.moveTowardAdjacentToPosition(this.goal, map, player);
                if (this.cardinallyAdjacentTo(this.goal)) {
                    updateDir(this.dir, this.pos, this.goal);
                    this.mode = GuardMode.LightTorch;
                    this.modeTimeout = 5;
                } else if (moveResult === MoveResult.Moved) {
                    this.modeTimeout = 3;
                } else {
                    this.modeTimeout -= 1;
                    if (this.modeTimeout <= 0) {
                        this.enterPatrolMode(map);
                    }
                }
            }
            break;

        case GuardMode.LightTorch:
            --this.modeTimeout;
            updateDir(this.dir, this.pos, this.goal);
            if (this.modeTimeout <= 0) {
                relightTorchAt(map, this.goal, player);
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.Unconscious:
            this.modeTimeout -= 1;
            if (this.modeTimeout === 5) {
                const popup = PopupType.GuardStirring;
                popups.add(popup, this.pos);
            } else if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
                this.modeTimeout = 0;
                this.angry = true;
                shouts.push({pos_shouter: this.pos, pos_target: this.pos, target:this});
                popups.add(PopupType.GuardAwakesWarning, this.pos);
            }
            break;
        }

        // If the guard's moved and has a torch, recompute the level's lighting so the guard can spot
        // the player using the new lighting

        if (this.hasTorch && !posPrev.equals(this.pos)) {
            map.computeLighting(map.cells.at(player.pos[0], player.pos[1]));
        }

        // Update state based on target visibility from new position

        if (this.mode !== GuardMode.Unconscious) {

            // See the player, or deal with losing sight of the player

            if (this.seesActor(map, player)) {
                if (isRelaxedGuardMode(this.mode) && !this.adjacentTo(player.pos)) {
                    this.mode = GuardMode.Look;
                    this.modeTimeout = 2 + randomInRange(4);
                } else {
                    vec2.copy(this.goal, player.pos);
                    updateDir(this.dir, this.pos, this.goal);
                    this.mode = GuardMode.ChaseVisibleTarget;
                }
            } else if (this.mode == GuardMode.ChaseVisibleTarget) {
                vec2.copy(this.goal, player.pos);
                this.mode = GuardMode.MoveToLastSighting;
                this.modeTimeout = 3;
            }

            // If we see a downed guard, move to revive him.

            if (isRelaxedGuardMode(this.mode)) {
                for (let guard of map.guards) {
                    if (guard === this) {
                        continue;
                    }

                    if (guard.mode !== GuardMode.Unconscious) {
                        continue;
                    }

                    if (!this.seesActor(map, guard)) {
                        continue;
                    }

                    vec2.copy(this.goal, guard.pos);
                    this.mode = GuardMode.MoveToDownedGuard;
                    this.angry = true;
                    this.modeTimeout = 3;
                    shouts.push({pos_shouter: this.pos, pos_target: guard.pos, target:guard});
                    break;
                }    
            }

            // If we see an extinguished torch, move to light it.

            if (this.mode === GuardMode.Patrol) {
                const torch = torchNeedingRelighting(map, this.pos);
                if (torch !== undefined) {
                    vec2.copy(this.goal, torch.pos);
                    this.mode = GuardMode.MoveToTorch;
                    this.modeTimeout = 3;
                } else if (posPrev.equals(this.pos)) {
                    const posLookAt = this.tryGetPosLookAt(map);
                    if (posLookAt !== undefined) {
                        updateDir(this.dir, this.pos, posLookAt);
                    }
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

        let playerIsLit = map.cells.atVec(person.pos).lit>0;

        let d2 = vec2.squaredLen(d);
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

    enterPatrolMode(map: GameMap) {
        this.patrolPathIndex = map.patrolPathIndexForResume(this.patrolPath, this.patrolPathIndex, this.pos);
        this.mode = GuardMode.Patrol;
    }

    patrolStep(map: GameMap, player: Player) {
        if (this.patrolPath[this.patrolPathIndex].equals(this.pos)) {
            this.patrolPathIndex = (this.patrolPathIndex + 1) % this.patrolPath.length;
        }

        const moveResult = this.moveTowardPosition(this.patrolPath[this.patrolPathIndex], map, player);

        if (moveResult === MoveResult.BumpedPlayer) {
            this.mode = GuardMode.ChaseVisibleTarget;
            vec2.copy(this.goal, player.pos);
            updateDir(this.dir, this.pos, this.goal);
        }
    }

    updateDirInitial()
    {
        const patrolPathIndexNext = (this.patrolPathIndex + 1) % this.patrolPath.length;

        updateDir(this.dir, this.pos, this.patrolPath[patrolPathIndexNext]);
    }

    moveTowardPosition(posGoal: vec2, map: GameMap, player: Player): MoveResult {
        const distanceField = map.computeDistancesToPosition(posGoal);
        const posNext = map.posNextBest(distanceField, this.pos);

        if (posNext.equals(this.pos)) {
            return MoveResult.StoodStill;
        }

        updateDir(this.dir, this.pos, posNext);

        if (player.pos.equals(posNext)) {
            return MoveResult.BumpedPlayer;
        }

        const start = vec2.create();
        vec2.subtract(start, this.pos, posNext) 
        const end = vec2.create();
        this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);
        vec2.copy(this.pos, posNext);
        return MoveResult.Moved;
    }

    moveTowardAdjacentToPosition(posGoal: vec2, map: GameMap, player: Player): MoveResult {
        const distanceField = map.computeDistancesToAdjacentToPosition(posGoal);
        const posNext = map.posNextBest(distanceField, this.pos);

        if (posNext.equals(this.pos)) {
            return MoveResult.StoodStill;
        }

        updateDir(this.dir, this.pos, posNext);

        if (player.pos.equals(posNext)) {
            return MoveResult.BumpedPlayer;
        }

        const start = vec2.create();
        vec2.subtract(start, this.pos, posNext) 
        const end = vec2.create();
        this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);

        vec2.copy(this.pos, posNext);
        return MoveResult.Moved;
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
           guardMode === GuardMode.MoveToTorch ||
           guardMode === GuardMode.LightTorch;
}

type Shout = {
    pos_shouter: vec2; // where is the person shouting?
    pos_target: vec2; // where are they reporting the target is?
    target: Player|Guard;
}

function guardOnGate(guard: Guard, map: GameMap):boolean {
    const gate = map.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
    return gate!==undefined && guard.pos.equals(gate.pos);
}

function guardActAll(state: State, map: GameMap, popups: Popups, player: Player) {

    // Mark if we heard a guard last turn, and clear the speaking flag.

    for (const guard of map.guards) {
        guard.heardGuard = guard.hearingGuard;
        guard.hearingGuard = false;
        guard.speaking = false;
        guard.hasMoved = false;
    }

    let ontoGate = false;

    // Update each guard for this turn.

    const shouts: Array<Shout> = [];

    for (const guard of map.guards) {
        const oldPos = vec2.clone(guard.pos);
        guard.act(map, popups, player, shouts);
        guard.hasMoved = true;
        ontoGate = ontoGate || (guardOnGate(guard, map) && !oldPos.equals(guard.pos));
    }

    // Process shouts

    for (const shout of shouts) {
        alertNearbyGuards(map, shout);
    }

    // Clear pickTarget if the guard is no longer relaxed and adjacent to the player

    if (player.pickTarget !== null &&
        (!isRelaxedGuardMode(player.pickTarget.mode) || !player.pickTarget.cardinallyAdjacentTo(player.pos))) {
        player.pickTarget = null;
    }

    if (ontoGate) {
        state.sounds['gate'].play(0.2);
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
            if (shout.target instanceof Guard) {
                guard.angry = true;
            }
            vec2.copy(guard.heardGuardPos, shout.pos_shouter);
        }
    }
}

function updateDir(dir: vec2, pos: vec2, posTarget: vec2) {
    const dirTarget = vec2.create();
    vec2.subtract(dirTarget, posTarget, pos);

    const dirLeft = vec2.fromValues(-dir[1], dir[0]);

    let dotForward = vec2.dot(dir, dirTarget);
    let dotLeft = vec2.dot(dirLeft, dirTarget);

    if (dotForward >= Math.abs(dotLeft)) {
        // dirTarget is in front quarter; leave dir unchanged
        // (Including diagonals in front quarter)
    } else if (-dotForward > Math.abs(dotLeft)) {
        // dirTarget is in rear quarter; reverse direction
        // (Excluding diagonals from rear quarter)
        vec2.negate(dir, dirLeft);
    } else if (dotLeft >= 0) {
        // dirTarget is in left quarter; turn left
        vec2.copy(dir, dirLeft);
    } else {
        // dirTarget is in right quarter; turn right
        vec2.negate(dir, dirLeft);
    }
}

function torchNeedingRelighting(map: GameMap, posViewer: vec2): Item | undefined {
    let bestItem: Item | undefined = undefined;
    let bestDistSquared = 65;
    for (const item of map.items) {
        if (item.type === ItemType.TorchUnlit) {
            const distSquared = vec2.squaredDistance(item.pos, posViewer);
            if (distSquared >= bestDistSquared) {
                continue;
            }
            if (!lineOfSightToTorch(map, posViewer, item.pos)) {
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
        if (item.type === ItemType.TorchUnlit && item.pos.equals(posTorch)) {
            item.type = ItemType.TorchLit;
        }
    }
    map.computeLighting(map.cells.atVec(player.pos));
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

function lineOfSightToTorch(map: GameMap, from: vec2, to: vec2): boolean {
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

        const cell = map.cells.at(x, y);

        if (cell.blocksSight) {
            return false;
        }

        if (isWindowTerrainType(cell.type)) {
            return false;
        }

        --n;
    }

    return true;
}
