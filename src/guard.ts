export { Guard, GuardMode, chooseGuardMoves, guardActAll, lineOfSight, isRelaxedGuardMode };

import { Cell, GameMap, Item, ItemType, Player, GuardStates, isWindowTerrainType, Rect, TerrainType } from './game-map';
import { vec2 } from './my-matrix';
import { randomInRange } from './random';
import { PopupType } from './popups';
import { LightSourceAnimation, SpriteAnimation, tween } from './animation';
import { LevelStats, State } from './types';
import { enlargeHealthBar, flashHeart, joltCamera } from './game';

const distSquaredSeeTorchMax: number = 64;

enum GuardMode {
    Patrol,
    Look,
    LookAtTorch,
    Listen,
    ChaseVisibleTarget,
    MoveToLastSighting,
    InvestigateLastSighting,
    MoveToLastSound,
    MoveToGuardShout,
    MoveToDownedGuard,
    MoveToMissingTreasure,
    LookAtMissingTreasure,
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
        case GuardMode.InvestigateLastSighting:
        case GuardMode.MoveToGuardShout:
        case GuardMode.MoveToLastSound:
            this.goals = this.chooseMoveTowardPosition(this.goal, state.gameMap);
            break;

        case GuardMode.MoveToDownedGuard:
        case GuardMode.MoveToMissingTreasure:
        case GuardMode.LookAtMissingTreasure:
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

    act(state: State, speech: Array<Speech>) {
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

        // Potentially change states if we Hear the thief

        if (this.heardThief &&
            this.mode !== GuardMode.Unconscious &&
            this.mode !== GuardMode.ChaseVisibleTarget) {

            if (isRelaxedGuardMode(this.mode) && !this.heardThiefClosest) {
                this.mode = GuardMode.Listen;
                this.modeTimeout = 2 + randomInRange(4);
                this.goals = this.chooseMoveTowardPosition(this.pos, state.gameMap);
            } else if (this.mode !== GuardMode.MoveToDownedGuard) {
                if (isRelaxedGuardMode(this.mode)) {
                    this.goals = this.chooseMoveTowardPosition(this.pos, state.gameMap);
                }
                this.mode = GuardMode.MoveToLastSound;
                this.modeTimeout = 4 + randomInRange(2);
                vec2.copy(this.goal, player.pos);
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
                    flashHeart(state, player.health);
                    enlargeHealthBar(state);
                    joltCamera(state, player.pos[0] - this.pos[0], player.pos[1] - this.pos[1]);
                    ++levelStats.damageTaken;
                }
            } else {
                this.goals = this.chooseMoveTowardPosition(this.goal, map);
                this.makeBestAvailableMove(map, player);
            }
            break;

        case GuardMode.MoveToLastSighting:
            this.makeBestAvailableMove(map, player);

            if (this.pos.equals(this.goal)) {
                this.mode = GuardMode.InvestigateLastSighting;
                this.modeTimeout = 5;
            } else if (this.pos.equals(posPrev)) {
                this.modeTimeout -= 1;
            }

            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.InvestigateLastSighting:
            this.makeBestAvailableMove(map, player);

            if (this.modeTimeout >= 3 && this.pos.equals(this.goal)) {
                this.tryStepGoalForward(state);
            }

            this.modeTimeout -= 1;
            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.MoveToLastSound:
        case GuardMode.MoveToGuardShout:
            this.makeBestAvailableMove(map, player);

            if (this.pos.equals(posPrev)) {
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

        case GuardMode.MoveToMissingTreasure:
            this.makeBestAvailableMove(map, player);
            if (this.cardinallyAdjacentTo(this.goal)) {
                this.mode = GuardMode.LookAtMissingTreasure;
                this.modeTimeout = 4;
            } else if (this.pos.equals(posPrev)) {
                this.modeTimeout -= 1;
                if (this.modeTimeout <= 0) {
                    this.enterPatrolMode(map);
                }
            } else {
                this.modeTimeout = 3;
            }
            break;

        case GuardMode.LookAtMissingTreasure:
            this.makeBestAvailableMove(map, player);
            if (this.pos.equals(posPrev) && this.cardinallyAdjacentTo(this.goal)) {
                updateDir(this.dir, this.pos, this.goal);
            }
            this.modeTimeout -= 1;
            if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
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
                relightTorchAt(map, this.goal);

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
            if (this.modeTimeout <= 0) {
                this.modeTimeout = 0;
                this.angry = true;
                this.enterPatrolMode(map);
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

            // Hear another guard shouting

            if (this.heardGuard &&
                this.mode !== GuardMode.Look &&
                this.mode !== GuardMode.ChaseVisibleTarget &&
                this.mode !== GuardMode.MoveToLastSighting &&
                this.mode !== GuardMode.InvestigateLastSighting &&
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
                    break;
                }
            }

            // If we see a stolen treasure, get angry and shout to alert other guards

            if (!this.angry && isRelaxedGuardMode(this.mode)) {
                const treasure = map.treasures.find(treasureInfo => treasureInfo.stolen && this.seesPosition(map, treasureInfo.posTreasure));
                if (treasure !== undefined) {
                    this.mode = GuardMode.MoveToMissingTreasure;
                    vec2.copy(this.goal, treasure.posTreasure);
                    this.angry = true;
                    this.modeTimeout = 3;
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
                lineOfSightToPosition(map, this.pos, player.itemUsed.pos)) {
                if (player.itemUsed.type === ItemType.TorchLit) {
                    vec2.copy(this.goal, player.itemUsed.pos);
                    this.mode = GuardMode.LookAtTorch;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (player.itemUsed.type === ItemType.TorchUnlit) {
                    speech.push({ speaker: this, speechType: PopupType.GuardSeeTorchDoused });
                }
            }

            // If we're moving to a shout but we see a guard at our goal position, finish in place.

            if (this.mode === GuardMode.MoveToGuardShout &&
                lineOfSight(map, this.pos, this.goal) &&
                map.guards.some(guard => guard.pos.equals(this.goal))) {
                vec2.copy(this.goal, this.pos);
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

        // Shout on entry to some states to attract nearby guards

        if (this.mode !== this.modePrev) {
            switch (this.mode) {
                case GuardMode.ChaseVisibleTarget:
                    shouts.push({posShouter: vec2.clone(this.pos), posGoal: vec2.clone(player.pos), angry: false});
                    ++levelStats.numSpottings;
                    break;
                case GuardMode.WakeGuard:
                case GuardMode.LookAtMissingTreasure:
                    shouts.push({posShouter: vec2.clone(this.pos), posGoal: vec2.clone(this.goal), angry: true});
                    break;
            }
        }
    }

    tryStepGoalForward(state: State) {
        // If we can step forward in our current direction, do that
        const pos = vec2.create();
        vec2.add(pos, this.pos, this.dir);
        if (state.gameMap.guardMoveCost(this.pos, pos) === 0) {
            vec2.copy(this.goal, pos);
            return;
        }

        // If we can turn left or right, do that
        let posSides: Array<vec2> = [
            vec2.fromValues(this.pos[0] - this.dir[1], this.pos[1] + this.dir[0]),
            vec2.fromValues(this.pos[0] + this.dir[1], this.pos[1] - this.dir[0]),
        ];

        posSides = posSides.filter(pos => state.gameMap.guardMoveCost(this.pos, pos) === 0);

        if (posSides.length > 0) {
            const i = state.rng.randomInRange(posSides.length);
            vec2.copy(this.goal, posSides[i]);
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

    seesActor(map: GameMap, actor: Player|Guard, offset: number = 0): boolean {
        return this.seesPositionInternal(map, actor.pos, actor.hidden(map), lineOfSight, offset);
    }

    seesPosition(map: GameMap, pos: vec2): boolean {
        return this.seesPositionInternal(map, pos, false, lineOfSightToPosition, 0);
    }

    seesPositionInternal(
        map: GameMap,
        pos: vec2,
        targetIsHidden: boolean,
        lineOfSightFunc: (map: GameMap, posFrom: vec2, posTo: vec2) => boolean,
        offset: number): boolean {

        const d = vec2.create();
        vec2.subtract(d, pos, this.pos);

        // Check view frustum except when in GuardMode.ChaseVisibleTarget
        if (this.mode !== GuardMode.ChaseVisibleTarget && vec2.dot(this.dir, d) < offset) {
            return false;
        }

        const positionIsLit = map.cells.atVec(pos).lit>0;

        const d2 = vec2.squaredLen(d);
        if (d2 >= this.sightCutoff(positionIsLit) && !(d[0] === this.dir[0] * 2 && d[1] === this.dir[1] * 2)) {
            return false;
        }

        if ((isRelaxedGuardMode(this.mode) && !this.angry) || Math.abs(d[0]) >= 2 || Math.abs(d[1]) >= 2) {
            // Enemy is relaxed and/or position is distant. Normal line-of-sight applies.
            if (targetIsHidden || !lineOfSightFunc(map, this.pos, pos)) {
                return false;
            }
        } else {
            // Enemy is searching and position is adjacent. If diagonally adjacent, line of
            // sight can be blocked by a sight-blocker in either mutually-adjacent square.
            if (this.pos[0] !== pos[0] &&
                this.pos[1] !== pos[1] &&
                (map.cells.at(this.pos[0], pos[1]).blocksSight ||
                 map.cells.at(pos[0], this.pos[1]).blocksSight)) {
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
        const queryRect: Rect = {
            posMin: vec2.fromValues(Math.max(0, this.pos[0] - 1), Math.max(0, this.pos[1] - 1)),
            posMax: vec2.fromValues(Math.min(map.cells.sizeX, this.pos[0] + 2), Math.min(map.cells.sizeY, this.pos[1] + 2))
        };
        const distanceField = map.computeDistancesToPosition(posGoal, queryRect);
        return map.nextPositions(distanceField, this.pos);
    }

    chooseMoveTowardAdjacentToPosition(posGoal: vec2, map: GameMap): Array<vec2> {
        const queryRect: Rect = {
            posMin: vec2.fromValues(Math.max(0, this.pos[0] - 1), Math.max(0, this.pos[1] - 1)),
            posMax: vec2.fromValues(Math.min(map.cells.sizeX, this.pos[0] + 2), Math.min(map.cells.sizeY, this.pos[1] + 2))
        };
        const distanceField = map.computeDistancesToAdjacentToPosition(posGoal, queryRect);
        return map.nextPositions(distanceField, this.pos);
    }
}

function isRelaxedGuardMode(guardMode: GuardMode): boolean {
    return guardMode === GuardMode.Patrol ||
           guardMode === GuardMode.MoveToTorch ||
           guardMode === GuardMode.LightTorch;
}

type Shout = {
    posShouter: vec2; // where is the shout coming from?
    posGoal: vec2; // where should hearers move to?
    angry: boolean; // should hearers become angry?
}

function nearbyGuardInteracting(playerPos: vec2, movingGuardPositionPairs:[vec2, vec2][], map: GameMap):['gate'|'doorOpen'|'doorClose'|'doorOpenLocked'|'doorCloseLocked', vec2]|undefined {
    // If a guard in the same room interacts with something noise making (currenlty just doors or gates) we will return the interaction
    const maxRange = 20;
    const cells = map.cells;
    const doors = map.items.filter((item)=>item.type>=ItemType.DoorNS && item.type<=ItemType.PortcullisEW);
    let interact:ReturnType<typeof nearbyGuardInteracting> = undefined;
    function interactionSeeker(checkedCells:Set<number>, pos:vec2, remainingRange:number, propagateThroughBlockedOpenings:boolean) {
        const newPositionsToRecurse:vec2[] = [];
        for(let delta of [[1,0],[0,1],[-1,0],[0,-1]]) {
            const p = pos.add(vec2.fromValues(delta[0],delta[1]));
            if (checkedCells.has(p[1]*cells.sizeX+p[0])) continue;
            checkedCells.add(p[1]*cells.sizeX+p[0]);
            const c = cells.atVec(p);
            if (c.type===TerrainType.DoorEW || c.type===TerrainType.DoorNS ||
                c.type===TerrainType.PortcullisEW || c.type===TerrainType.PortcullisNS) {
                const door = doors.find((door)=>door.pos.equals(p));
                const guardInDoor = movingGuardPositionPairs.find(pairs=>pairs[0].equals(p));
                // const guardLeftDoor = movingGuardPositionPairs.find(pairs=>pairs[1].equals(p));
                if (door!==undefined && guardInDoor) {
                    const guardPriorPos = guardInDoor[1];
                    const cellLoc = guardPriorPos[1]*cells.sizeX + guardPriorPos[0];
                    if (!checkedCells.has(cellLoc)) { //Only make door noise for guards moving toward player 
                        switch(door.type) {
                            case ItemType.DoorEW:
                            case ItemType.DoorNS:
                                interact = ['doorOpen', p];
                                break;
                            case ItemType.LockedDoorEW:
                            case ItemType.LockedDoorNS:
                                interact = ['doorOpenLocked',p];
                                break;
                            case ItemType.PortcullisEW:
                            case ItemType.PortcullisNS:
                                interact = ['gate', p];
                                break;
                        }
                    }
                }
                if (interact!==undefined) return;
                if (door && !propagateThroughBlockedOpenings) return;
            }
            if (c.type<TerrainType.Wall0000 || c.type>TerrainType.Wall1111) {
                newPositionsToRecurse.push(p);
            }
        }
        if (remainingRange>0 && interact===undefined) {
            for (let p of newPositionsToRecurse) {
                interactionSeeker(checkedCells, p, remainingRange-1, false);
            }    
        }
    }
    interactionSeeker(new Set(), playerPos, maxRange, true);
    return interact;
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
    const movingGuardPositionPairs:Array<[vec2, vec2]> = [];
    for (const guard of map.guards) {
        const oldPos = vec2.clone(guard.pos);
        guard.act(state, speech);
        guard.hasMoved = true;
        if(!oldPos.equals(guard.pos)) movingGuardPositionPairs.push([guard.pos, oldPos]);
    }

    // Update lighting to account for guards moving with torches, or opening/closing doors

    map.computeLighting(player);

    // Update guard states based on their senses

    const shouts: Array<Shout> = [];
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
        let panning = Math.max(Math.min((speechBest.speaker.pos[0] - player.pos[0])/12,1),0);
        let closeness = Math.max(1 - speechBest.speaker.pos.distance(player.pos)/12, 0);
        const subtitledSound = state.subtitledSounds[soundName].play(0.3+0.3*closeness, panning);

        const speaker: Guard = speech[0].speaker;
        const speechAboveSpeaker = speaker.pos[1] >= player.pos[1];
        state.popups.setSpeech(subtitledSound.subtitle, speaker, speechAboveSpeaker);
        speaker.speaking = true;
    }

    // Process shouts

    for (const shout of shouts) {
        alertNearbyGuards(map, shout);
    }

    // Clear pickTarget if the guard sees the player or is no longer adjacent to the player

    if (player.pickTarget !== null &&
        player.pickTarget instanceof Guard &&
        (player.pickTarget.mode === GuardMode.ChaseVisibleTarget || !player.pickTarget.cardinallyAdjacentTo(player.pos))) {
        player.pickTarget = null;
    }

    const interact = nearbyGuardInteracting(state.player.pos, movingGuardPositionPairs, state.gameMap);
    if (interact) {
        const [action, position] = interact;
        let panning = Math.max(Math.min((position[0] - player.pos[0])/12,1),0);
        let closeness = Math.max(1 - position.distance(player.pos)/12, 0);
        state.sounds[action].play(0.2+0.3*closeness, panning);
    }
}

function soundNameForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return 'guardDamage';
        case PopupType.GuardChase: return 'guardChase';
        case PopupType.GuardSeeThief: return 'guardSeeThief';
        case PopupType.GuardHearThief: return 'guardHearThief';
        case PopupType.GuardHearGuard: return 'guardHearGuard';
        case PopupType.GuardSpotDownedGuard: return 'guardSpotDownedGuard';
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
        case PopupType.GuardSpotStolenTreasure: return 'guardSpotStolenTreasure';
        case PopupType.GuardExamineStolenTreasure: return 'guardExamineStolenTreasure';
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
                case GuardMode.InvestigateLastSighting: return PopupType.GuardEndChase;
                case GuardMode.LightTorch: return inEarshot ? PopupType.GuardFinishLightingTorch : undefined;
                case GuardMode.Unconscious: return PopupType.GuardAwakesWarning;
                case GuardMode.MoveToMissingTreasure: return undefined;
                case GuardMode.LookAtMissingTreasure: return undefined;
                default: return undefined;
            }
        case GuardMode.Look: return PopupType.GuardSeeThief;
        case GuardMode.LookAtTorch: return PopupType.GuardSeeTorchLit;
        case GuardMode.Listen: return PopupType.GuardHearThief;
        case GuardMode.ChaseVisibleTarget:
            if (modePrev != GuardMode.MoveToLastSighting && modePrev !== GuardMode.InvestigateLastSighting) {
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
        case GuardMode.InvestigateLastSighting: return undefined;
        case GuardMode.MoveToLastSound: return PopupType.GuardInvestigate;
        case GuardMode.MoveToGuardShout: return PopupType.GuardHearGuard;
        case GuardMode.MoveToTorch:
            if (modePrev !== GuardMode.LightTorch && inEarshot) {
                return PopupType.GuardSeeUnlitTorch;
            } else {
                return undefined;
            }
        case GuardMode.MoveToDownedGuard: return PopupType.GuardSpotDownedGuard;
        case GuardMode.WakeGuard: return PopupType.GuardDownWarning;
        case GuardMode.MoveToMissingTreasure: return PopupType.GuardSpotStolenTreasure;
        case GuardMode.LookAtMissingTreasure: return PopupType.GuardExamineStolenTreasure;
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
        if (shout.angry) {
            guard.angry = true;
        }
        vec2.copy(guard.heardGuardPos, shout.posGoal);
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
            if (!lineOfSightToPosition(map, posViewer, item.pos)) {
                continue;
            }
            bestDistSquared = distSquared;
            bestItem = item;
        }
    }
    return bestItem;
}

function relightTorchAt(map: GameMap, posTorch: vec2) {
    for (const item of map.items) {
        if (item.type === ItemType.TorchUnlit && item.pos.equals(posTorch)) {
            item.type = ItemType.TorchLit;
        }
    }
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

    const nStart = ax + ay - 1;
    let n = nStart;

    ax *= 2;
    ay *= 2;

    while (n > 0) {
        if (error > 0) {
            y += y_inc;
            error -= ax;
        } else {
            if (error === 0) {
                const cell = map.cells.at(x, y + y_inc);
                if (cell.blocksSight) {
                    return false;
                }
                if (cell.isWindow && n > 1 && n < nStart - 1) {
                    return false;
                }
            }
            x += x_inc;
            error += ay;
        }

        const cell = map.cells.at(x, y);
        if (cell.blocksSight) {
            return false;
        }
        if (cell.isWindow && n > 1 && n < nStart - 1) {
            return false;
        }

        --n;
    }

    return true;
}

function blocksLineOfSightToCell(cell: Cell): boolean {
    if (cell.blocksSight) {
        return true;
    }

    if (isWindowTerrainType(cell.type)) {
        return true;
    }

    return false;
}

function lineOfSightToPosition(map: GameMap, from: vec2, to: vec2): boolean {
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
            if (error === 0 && blocksLineOfSightToCell(map.cells.at(x, y + y_inc))) {
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
