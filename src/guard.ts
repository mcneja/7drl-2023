export { Guard, GuardMode, chooseGuardMoves, guardActAll, lineOfSight, isRelaxedGuardMode };

import { Cell, GameMap, Item, ItemType, Player, GuardStates, isWindowTerrainType } from './game-map';
import { vec2 } from './my-matrix';
import { randomInRange } from './random';
import { PopupType } from './popups';
import { LightSourceAnimation, SpriteAnimation, tween } from './animation';
import { LevelStats, State } from './types';
import { joltCamera } from './game';

const distSquaredSeeTorchMax: number = 64;

enum GuardMode {
    Patrol,
    Look,
    LookAtTorch,
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

type Speech = {
    speaker: Guard;
    speechType: PopupType;
}

class Guard {
    pos: vec2;
    dir: vec2 = vec2.fromValues(1, 0);
    mode: GuardMode = GuardMode.Patrol;
    modePrev: GuardMode = GuardMode.Patrol;
    angry: boolean = false;
    hasTorch: boolean = false;
    hasPurse: boolean = false;
    hasVaultKey: boolean = false;
    torchAnimation: LightSourceAnimation|null = null;
    speaking: boolean = false;
    hasMoved: boolean = false;
    heardThief: boolean = false;
    heardThiefClosest: boolean = false;
    hearingGuard: boolean = false;
    heardGuard: boolean = false;
    heardGuardPos: vec2;

    animation: SpriteAnimation|null = null;

    // Desired moves, in order
    goals: Array<vec2> = [];

    // Chase
    goal: vec2;
    modeTimeout: number = 0;

    // Patrol
    patrolPath: Array<vec2>;
    patrolPathIndex: number;

    constructor(patrolPath: Array<vec2>, pathIndexStart: number) {
        const posStart = patrolPath[pathIndexStart];
        this.pos = vec2.clone(posStart);
        this.heardGuardPos = vec2.create();
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

    posAnimated(): vec2 {
        let offset = this.animation?.offset?? vec2.create();
        const pos = vec2.create();
        vec2.add(pos, this.pos, offset);
        return pos;
    }

    allowsMoveOntoFrom(posFrom: vec2): boolean {
        if (this.goals.length <= 0) {
            return true;
        }
        const posNextPlanned = this.goals[0];

        // If the guard is planning on standing still, disallow movement onto them.

        if (posNextPlanned.equals(this.pos)) {
            return false;
        }

        // If the guard is planning on moving to posFrom, disallow it.

        if (posNextPlanned.equals(posFrom)) {
            return false;
        }

        // If the guard is planning on moving to the point between posFrom
        // and where they are, disallow it.
    
        const midX = Math.floor((this.pos[0] + posFrom[0]) / 2);
        const midY = Math.floor((this.pos[1] + posFrom[1]) / 2);
        if (posNextPlanned[0] === midX && posNextPlanned[1] === midY) {
            return false;
        }

        return true;
    }

    moving(): boolean {
        if (this.goals.length <= 0) {
            return false;
        }
        const posNextPlanned = this.goals[0];

        return !this.pos.equals(posNextPlanned);
    }

    chooseMoves(state: State) {
        switch (this.mode) {
        case GuardMode.Patrol:
            this.goals = this.choosePatrolStep(state);
            break;

        case GuardMode.Look:
        case GuardMode.LookAtTorch:
        case GuardMode.Listen:
        case GuardMode.Unconscious:
            this.goals = this.chooseMoveTowardPosition(this.pos, state.gameMap);
            break;

        case GuardMode.ChaseVisibleTarget:
        case GuardMode.MoveToLastSighting:
        case GuardMode.MoveToGuardShout:
        case GuardMode.MoveToLastSound:
            this.goals = this.chooseMoveTowardPosition(this.goal, state.gameMap);
            break;

        case GuardMode.MoveToDownedGuard:
        case GuardMode.WakeGuard:
        case GuardMode.MoveToTorch:
        case GuardMode.LightTorch:
            this.goals = this.chooseMoveTowardAdjacentToPosition(this.goal, state.gameMap);
            break;
        }
    }

    bestAvailableMove(moves: Array<vec2>, gameMap: GameMap, player: Player): [vec2, boolean] {
        let bumpedPlayer = false;
        for (const pos of moves) {
            if (gameMap.guardMoveCost(this.pos, pos) == Infinity) {
                continue;
            }

            if (player.pos.equals(pos)) {
                bumpedPlayer = true;
                continue;
            }

            if (gameMap.isGuardAtVec(pos)) {
                continue;
            }

            return [pos, bumpedPlayer];
        }

        // Should never hit this point; our current position should always be in available moves

        return [this.pos, bumpedPlayer];
    }

    act(state: State, speech: Array<Speech>, shouts: Array<Shout>) {
        const posPrev = vec2.clone(this.pos);
        const map = state.gameMap;
        const player = state.player;
        const levelStats = state.levelStats;

        // Immediately upgrade to chasing if we see the player while investigating;
        // this lets us start moving toward the player on this turn rather than
        // wait for next turn.

        if (this.mode !== GuardMode.Unconscious && !isRelaxedGuardMode(this.mode)) {
            // If guard expects to move, ignore squares in line with their current position
            const offset = this.moving() ? 1 : 0;
            if (this.seesActor(map, player, offset)) {
                this.mode = GuardMode.ChaseVisibleTarget;
            }
        }

        // Pass time in the current mode
    
        switch (this.mode) {
        case GuardMode.Patrol:
            this.makeBestAvailableMove(map, player);
            if (!this.pos.equals(this.patrolPath[this.patrolPathIndex])) {
                this.enterPatrolMode(map);
            } else if (this.pos.equals(posPrev)) {
                // Stand still for a turn before rotating to face look-at direction
                const posPrev2 = this.patrolPath[(Math.max(0, this.patrolPathIndex + this.patrolPath.length - 2)) % this.patrolPath.length];
                if (posPrev.equals(posPrev2)) {
                    const includeDoors = this.patrolPath.length === 1;
                    const posLookAt = map.tryGetPosLookAt(this.pos, includeDoors);
                    if (posLookAt !== undefined) {
                        updateDir(this.dir, this.pos, posLookAt);
                    }
                }
            }
            break;

        case GuardMode.Look:
        case GuardMode.Listen:
            this.makeBestAvailableMove(map, player);

            this.modeTimeout -= 1;
            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.LookAtTorch:
            this.makeBestAvailableMove(map, player);
            updateDir(this.dir, this.pos, this.goal);

            this.modeTimeout -= 1;
            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.ChaseVisibleTarget:
            vec2.copy(this.goal, player.pos);
            if (this.adjacentTo(player.pos) && !this.pos.equals(player.pos)) {
                updateDir(this.dir, this.pos, this.goal);
                if (this.modePrev === GuardMode.ChaseVisibleTarget) {
                    if (!player.damagedLastTurn) {
                        speech.push({ speaker: this, speechType: PopupType.Damage });
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
                    joltCamera(state, player.pos[0] - this.pos[0], player.pos[1] - this.pos[1]);
                    ++levelStats.damageTaken;
                }
            } else {
                this.goals = this.chooseMoveTowardPosition(this.goal, map);
                this.makeBestAvailableMove(map, player);
            }
            break;

        case GuardMode.MoveToLastSighting:
        case GuardMode.MoveToLastSound:
        case GuardMode.MoveToGuardShout:
            this.makeBestAvailableMove(map, player);

            if (this.pos.equals(posPrev)) {
                updateDir(this.dir, this.pos, this.goal);
                this.modeTimeout -= 1;
            }

            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.MoveToDownedGuard:
            this.makeBestAvailableMove(map, player);

            if (this.cardinallyAdjacentTo(this.goal)) {
                if (map.guards.find((g) => g.pos.equals(this.goal) && g.mode === GuardMode.Unconscious)) {
                    this.mode = GuardMode.WakeGuard;
                    this.modeTimeout = 3;    
                } else {
                    this.modeTimeout = 0;
                    this.enterPatrolMode(map);
                }
            } else if (this.pos.equals(posPrev)) {
                this.modeTimeout -= 1;
                if (this.modeTimeout <= 0) {
                    this.enterPatrolMode(map);
                }
            }
            break;

        case GuardMode.WakeGuard:
            this.makeBestAvailableMove(map, player);

            if (this.pos.equals(posPrev)) {
                updateDir(this.dir, this.pos, this.goal);
            }

            --this.modeTimeout;
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
            this.makeBestAvailableMove(map, player);

            if (map.items.some((item)=>item.pos.equals(this.goal) && item.type === ItemType.TorchLit)) {
                this.enterPatrolMode(map);
            } else {
                if (this.cardinallyAdjacentTo(this.goal)) {
                    this.mode = GuardMode.LightTorch;
                    this.modeTimeout = 5;
                } else if (!this.pos.equals(posPrev)) {
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
            this.makeBestAvailableMove(map, player);

            --this.modeTimeout;
            updateDir(this.dir, this.pos, this.goal);
            if (this.modeTimeout <= 0) {
                relightTorchAt(map, this.goal, player);

                const torch = torchNeedingRelighting(map, this.pos);
                if (torch === undefined) {
                    this.enterPatrolMode(map);
                } else {
                    vec2.copy(this.goal, torch.pos);
                    if (this.cardinallyAdjacentTo(this.goal)) {
                        this.mode = GuardMode.LightTorch;
                        this.modeTimeout = 5;
                    } else {
                        this.mode = GuardMode.MoveToTorch;
                        this.modeTimeout = 3;
                    }
                }
            }
            break;

        case GuardMode.Unconscious:
            // this.modeTimeout -= 1;
            if (this.modeTimeout === 5) {
                speech.push({ speaker: this, speechType: PopupType.GuardStirring });
            } else if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
                this.modeTimeout = 0;
                this.angry = true;
                shouts.push({posShouter: vec2.clone(this.pos), target: this});
                speech.push({ speaker: this, speechType: PopupType.GuardAwakesWarning });
            }
            break;
        }
    }

    postActSense(map: GameMap, player: Player, levelStats: LevelStats, speech: Array<Speech>, shouts: Array<Shout>) {
        if (this.mode !== GuardMode.Unconscious) {

            // See the thief, or lose sight of the thief

            if (this.seesActor(map, player)) {
                if (isRelaxedGuardMode(this.mode) && !this.adjacentTo(player.pos)) {
                    this.mode = GuardMode.Look;
                    this.modeTimeout = 2 + randomInRange(4);
                } else {
                    this.mode = GuardMode.ChaseVisibleTarget;
                }
            } else if (this.mode === GuardMode.ChaseVisibleTarget && this.modePrev === GuardMode.ChaseVisibleTarget) {
                this.mode = GuardMode.MoveToLastSighting;
                this.modeTimeout = 3;
            }

            // Hear the thief

            if (this.heardThief && this.mode !== GuardMode.ChaseVisibleTarget) {
                if (this.adjacentTo(player.pos)) {
                    this.mode = GuardMode.ChaseVisibleTarget;
                } else if (isRelaxedGuardMode(this.mode) && !this.heardThiefClosest) {
                    this.mode = GuardMode.Listen;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (this.mode !== GuardMode.MoveToDownedGuard) {
                    this.mode = GuardMode.MoveToLastSound;
                    this.modeTimeout = 2 + randomInRange(4);
                    vec2.copy(this.goal, player.pos);
                }
            }

            // Hear another guard shouting

            if (this.heardGuard &&
                this.mode !== GuardMode.Look &&
                this.mode !== GuardMode.ChaseVisibleTarget &&
                this.mode !== GuardMode.MoveToLastSighting &&
                this.mode !== GuardMode.MoveToLastSound &&
                this.mode !== GuardMode.MoveToDownedGuard &&
                this.mode !== GuardMode.WakeGuard) {

                this.mode = GuardMode.MoveToGuardShout;
                this.modeTimeout = 2 + randomInRange(4);
                vec2.copy(this.goal, this.heardGuardPos);
            }

            // If we see a downed guard, move to revive him.

            if (this.mode !== GuardMode.ChaseVisibleTarget &&
                this.mode !== GuardMode.MoveToDownedGuard &&
                this.mode !== GuardMode.WakeGuard) {
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
                    shouts.push({posShouter: vec2.clone(this.pos), target: guard});
                    break;
                }
            }

            // If we see an extinguished torch, move to light it.

            if (this.hasTorch && this.mode === GuardMode.Patrol) {
                const torch = torchNeedingRelighting(map, this.pos);
                if (torch !== undefined) {
                    vec2.copy(this.goal, torch.pos);
                    if (this.cardinallyAdjacentTo(this.goal)) {
                        this.mode = GuardMode.LightTorch;
                        this.modeTimeout = 5;
                    } else {
                        this.mode = GuardMode.MoveToTorch;
                        this.modeTimeout = 3;
                    }
                }
            }

            // If we see a torch lit or doused, turn to look at it (if lit), or remark on it (if unlit)

            if (!this.hasTorch &&
                isRelaxedGuardMode(this.mode) &&
                player.itemUsed !== null &&
                vec2.squaredDistance(this.pos, player.itemUsed.pos) <= distSquaredSeeTorchMax &&
                lineOfSightToTorch(map, this.pos, player.itemUsed.pos)) {
                if (player.itemUsed.type === ItemType.TorchLit) {
                    vec2.copy(this.goal, player.itemUsed.pos);
                    this.mode = GuardMode.LookAtTorch;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (player.itemUsed.type === ItemType.TorchUnlit) {
                    speech.push({ speaker: this, speechType: PopupType.GuardSeeTorchDoused });
                }
            }
        }

        // Clear sense flags
    
        this.heardThief = false;
        this.heardThiefClosest = false;

        // Say something to indicate state changes

        const popupType = popupTypeForStateChange(this.modePrev, this.mode, vec2.squaredDistance(this.pos, player.pos));
        if (popupType !== undefined) {
            speech.push({ speaker: this, speechType: popupType });
        }

        if (this.mode === GuardMode.ChaseVisibleTarget && this.modePrev !== GuardMode.ChaseVisibleTarget) {
            shouts.push({posShouter: vec2.clone(this.pos), target: player});
            ++levelStats.numSpottings;
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

    seesActor(map: GameMap, person: Player|Guard, offset: number = 0): boolean {
        const d = vec2.create();
        vec2.subtract(d, person.pos, this.pos);

        // Check view frustum except when in GuardMode.ChaseVisibleTarget
        if (this.mode !== GuardMode.ChaseVisibleTarget && vec2.dot(this.dir, d) < offset) {
            return false;
        }

        const personIsLit = map.cells.atVec(person.pos).lit>0;

        const d2 = vec2.squaredLen(d);
        if (d2 >= this.sightCutoff(personIsLit) && !(d[0] === this.dir[0] * 2 && d[1] === this.dir[1] * 2)) {
            return false;
        }

        if ((isRelaxedGuardMode(this.mode) && !this.angry) || Math.abs(d[0]) >= 2 || Math.abs(d[1]) >= 2) {
            // Enemy is relaxed and/or player is distant. Normal line-of-sight applies.
            if (person.hidden(map) || !lineOfSight(map, this.pos, person.pos)) {
                return false;
            }
        } else {
            // Enemy is searching and player is adjacent. If diagonally adjacent, line of
            // sight can be blocked by a sight-blocker in either mutually-adjacent square.
            if (this.pos[0] !== person.pos[0] &&
                this.pos[1] !== person.pos[1] &&
                (map.cells.at(this.pos[0], person.pos[1]).blocksSight ||
                 map.cells.at(person.pos[0], this.pos[1]).blocksSight)) {
                return false;
            }
        }

        return true;
    }

    hidden(map: GameMap) {
        if (map.cells.atVec(this.pos).hidesPlayer) {
            return true;
        }

        return false;
    }

    sightCutoff(litTarget: boolean): number {
        if (this.mode === GuardMode.ChaseVisibleTarget) {
            return litTarget ? 75 : 33;
        } else if (!isRelaxedGuardMode(this.mode) || this.angry) {
            return litTarget ? 75 : 15;
        } else {
            return litTarget ? 40 : 3;
        }
    }

    enterPatrolMode(map: GameMap) {
        this.patrolPathIndex = map.patrolPathIndexForResume(this.patrolPath, this.patrolPathIndex, this.pos);
        this.mode = GuardMode.Patrol;
    }

    choosePatrolStep(state: State): Array<vec2> {
        if (this.pos.equals(this.patrolPath[this.patrolPathIndex])) {
            this.patrolPathIndex = (this.patrolPathIndex + 1) % this.patrolPath.length;
        }

        return this.chooseMoveTowardPosition(this.patrolPath[this.patrolPathIndex], state.gameMap);
    }

    makeBestAvailableMove(map: GameMap, player: Player) {
        const [pos, bumpedPlayer] = this.bestAvailableMove(this.goals, map, player);

        if (!pos.equals(this.pos)) {
            updateDir(this.dir, this.pos, pos);

            const start = vec2.create();
            vec2.subtract(start, this.pos, pos);
            const end = vec2.create();
            this.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.linear}], []);
            vec2.copy(this.pos, pos);
        }

        if (bumpedPlayer) {
            this.mode = GuardMode.ChaseVisibleTarget;
            updateDir(this.dir, this.pos, player.pos);
        }
    }

    updateDirInitial() {
        const patrolPathIndexNext = (this.patrolPathIndex + 1) % this.patrolPath.length;
        updateDir(this.dir, this.pos, this.patrolPath[patrolPathIndexNext]);
    }

    chooseMoveTowardPosition(posGoal: vec2, map: GameMap): Array<vec2> {
        const distanceField = map.computeDistancesToPosition(posGoal);
        return map.nextPositions(distanceField, this.pos);
    }

    chooseMoveTowardAdjacentToPosition(posGoal: vec2, map: GameMap): Array<vec2> {
        const distanceField = map.computeDistancesToAdjacentToPosition(posGoal);
        return map.nextPositions(distanceField, this.pos);
    }
}

function isRelaxedGuardMode(guardMode: GuardMode): boolean {
    return guardMode === GuardMode.Patrol ||
           guardMode === GuardMode.MoveToTorch ||
           guardMode === GuardMode.LightTorch;
}

type Shout = {
    posShouter: vec2; // where is the person shouting?
    target: Player|Guard;
}

function guardOnGate(guard: Guard, map: GameMap):boolean {
    const gate = map.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
    return gate!==undefined && guard.pos.equals(gate.pos);
}

function chooseGuardMoves(state: State) {
    for (const guard of state.gameMap.guards) {
        guard.chooseMoves(state);
    }
}

function guardActAll(state: State) {
    const map = state.gameMap;
    const player = state.player;    

    // Mark if we heard a guard last turn, and clear the speaking flag.

    for (const guard of map.guards) {
        guard.modePrev = guard.mode;
        guard.heardGuard = guard.hearingGuard;
        guard.hearingGuard = false;
        guard.speaking = false;
        guard.hasMoved = false;
    }

    // Sort guards so the ones in GuardMode.ChaseVisibleTarget update first.

    const guardOrdering = (guard0: Guard, guard1: Guard) => {
        const guard0Chasing = guard0.mode === GuardMode.ChaseVisibleTarget;
        const guard1Chasing = guard1.mode === GuardMode.ChaseVisibleTarget;
        if (guard0Chasing !== guard1Chasing) {
            return guard0Chasing ? -1 : 1;
        }

        // Sort by descending patrol length, so the stationary guards move last.
        // This allows other guards to get by them.

        return guard1.patrolPath.length - guard0.patrolPath.length;
    };

    map.guards.sort(guardOrdering);

    // Update each guard for this turn.

    const speech: Array<Speech> = [];
    const shouts: Array<Shout> = [];
    let ontoGate = false;

    for (const guard of map.guards) {
        const oldPos = vec2.clone(guard.pos);
        guard.act(state, speech, shouts);
        guard.hasMoved = true;
        ontoGate = ontoGate || (guardOnGate(guard, map) && !oldPos.equals(guard.pos));
    }

    // Update lighting to account for guards moving with torches, or opening/closing doors

    map.computeLighting(map.cells.atVec(player.pos));

    // Update guard states based on their senses

    for (const guard of map.guards) {
        guard.postActSense(map, player, state.levelStats, speech, shouts);
    }

    // Of all the guards trying to talk, pick the one that seems most important and create a speech bubble for them

    if (speech.length > 0) {
        speech.sort((a, b) => {
            if (a.speechType < b.speechType)
                return -1;
            if (a.speechType > b.speechType)
                return 1;
            const posA = a.speaker.pos;
            const posB = b.speaker.pos;
            const aDist = vec2.squaredDistance(posA, player.pos);
            const bDist = vec2.squaredDistance(posB, player.pos);
            if (aDist < bDist)
                return -1;
            if (aDist > bDist)
                return 1;
            return 0;
        });

        const speechBest = speech[0];
        const soundName = soundNameForPopupType(speechBest.speechType);
        const subtitledSound = state.subtitledSounds[soundName].play(0.6);

        const speaker: Guard | Player = speech[0].speaker;
        const below = speaker.pos[1] < player.pos[1];
        state.popups.setCur(subtitledSound.subtitle, () => speaker.posAnimated(), below);
        speaker.speaking = true;
    }

    // Process shouts

    for (const shout of shouts) {
        alertNearbyGuards(map, shout);
    }

    // Clear pickTarget if the guard sees the player or is no longer adjacent to the player

    if (player.pickTarget !== null &&
        (player.pickTarget.mode === GuardMode.ChaseVisibleTarget || !player.pickTarget.cardinallyAdjacentTo(player.pos))) {
        player.pickTarget = null;
    }

    if (ontoGate) {
        state.sounds['gate'].play(0.2);
    }
}

function soundNameForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return 'guardDamage';
        case PopupType.GuardChase: return 'guardChase';
        case PopupType.GuardSeeThief: return 'guardSeeThief';
        case PopupType.GuardHearThief: return 'guardHearThief';
        case PopupType.GuardHearGuard: return 'guardHearGuard';
        case PopupType.GuardSeeTorchLit: return 'guardSeeTorchLit';
        case PopupType.GuardSeeUnlitTorch: return 'guardSeeUnlitTorch';
        case PopupType.GuardDownWarning: return 'guardDownWarning';
        case PopupType.GuardAwakesWarning: return 'guardAwakesWarning';
        case PopupType.GuardWarningResponse: return 'guardWarningResponse';
        case PopupType.GuardInvestigate: return 'guardInvestigate';
        case PopupType.GuardEndChase: return 'guardEndChase';
        case PopupType.GuardFinishInvestigating: return 'guardFinishInvestigating';
        case PopupType.GuardFinishLooking: return 'guardFinishLooking';
        case PopupType.GuardFinishListening: return 'guardFinishListening';
        case PopupType.GuardFinishLightingTorch: return 'guardFinishLightingTorch';
        case PopupType.GuardFinishLookingAtLitTorch: return 'guardFinishLookingAtLitTorch';
        case PopupType.GuardStirring: return 'guardStirring';
        case PopupType.GuardSeeTorchDoused: return 'guardSeeTorchDoused';
    }
}

function popupTypeForStateChange(modePrev: GuardMode, modeNext: GuardMode, squaredPlayerDist: number): PopupType | undefined {
    if (modeNext == modePrev) {
        return undefined;
    }

    const inEarshot = squaredPlayerDist <= distSquaredSeeTorchMax;

    switch (modeNext) {
        case GuardMode.Patrol:
            switch (modePrev) {
                case GuardMode.Look: return PopupType.GuardFinishLooking;
                case GuardMode.LookAtTorch: return PopupType.GuardFinishLookingAtLitTorch;
                case GuardMode.Listen: return PopupType.GuardFinishListening;
                case GuardMode.MoveToLastSound: return PopupType.GuardFinishInvestigating;
                case GuardMode.MoveToGuardShout: return PopupType.GuardEndChase;
                case GuardMode.MoveToLastSighting: return PopupType.GuardEndChase;
                case GuardMode.LightTorch: return inEarshot ? PopupType.GuardFinishLightingTorch : undefined;
                case GuardMode.Unconscious: return PopupType.GuardAwakesWarning;
                default: return undefined;
            }
        case GuardMode.Look: return PopupType.GuardSeeThief;
        case GuardMode.LookAtTorch: return PopupType.GuardSeeTorchLit;
        case GuardMode.Listen: return PopupType.GuardHearThief;
        case GuardMode.ChaseVisibleTarget:
            if (modePrev != GuardMode.MoveToLastSighting) {
                return PopupType.GuardChase;
            } else {
                return undefined;
            }
        case GuardMode.LightTorch:
            if (modePrev === GuardMode.Patrol && inEarshot) {
                return PopupType.GuardSeeUnlitTorch;
            } else {
                return undefined;
            }
        case GuardMode.MoveToLastSighting: return undefined;
        case GuardMode.MoveToLastSound: return PopupType.GuardInvestigate;
        case GuardMode.MoveToGuardShout: return PopupType.GuardHearGuard;
        case GuardMode.MoveToTorch:
            if (modePrev !== GuardMode.LightTorch && inEarshot) {
                return PopupType.GuardSeeUnlitTorch;
            } else {
                return undefined;
            }
        case GuardMode.MoveToDownedGuard: return PopupType.GuardDownWarning;
    }

    return undefined;
}

function alertNearbyGuards(map: GameMap, shout: Shout) {
    for (const guard of map.guardsInEarshot(shout.posShouter, 25)) {
        if (guard.mode === GuardMode.Unconscious) {
            continue;
        }
        if (guard.pos.equals(shout.posShouter)) {
            continue;
        }
        guard.hearingGuard = true;
        if (shout.target instanceof Guard) {
            guard.angry = true;
        }
        vec2.copy(guard.heardGuardPos, shout.posShouter);
    }
}

function updateDir(dir: vec2, pos: vec2, posTarget: vec2) {
    const dirTarget = vec2.create();
    vec2.subtract(dirTarget, posTarget, pos);

    const dirLeft = vec2.fromValues(-dir[1], dir[0]);

    const dotForward = vec2.dot(dir, dirTarget);
    const dotLeft = vec2.dot(dirLeft, dirTarget);

    if (dotForward >= Math.abs(dotLeft)) {
        // dirTarget is in front quarter; leave dir unchanged
        // (Including diagonals in front quarter)
    } else if (-dotForward > Math.abs(dotLeft)) {
        // dirTarget is in rear quarter; reverse direction
        // (Excluding diagonals from rear quarter)
        vec2.negate(dir, dir);
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
    let bestDistSquared = distSquaredSeeTorchMax + 1;
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
            if (error === 0 && map.cells.at(x, y + y_inc).blocksSight) {
                return false;
            }
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

function blocksLineOfSightToTorch(cell: Cell): boolean {
    if (cell.blocksSight) {
        return true;
    }

    if (isWindowTerrainType(cell.type)) {
        return true;
    }

    return false;
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
            if (error === 0 && blocksLineOfSightToTorch(map.cells.at(x, y + y_inc))) {
                return false;
            }
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
