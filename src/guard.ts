export { Guard, GuardMode, GuardType, guardActAll, lineOfSight, isRelaxedGuardMode };

import { Cell, GameMap, Item, ItemType, Player, TerrainType, GuardStates, isWindowTerrainType } from './game-map';
import { vec2 } from './my-matrix';
import { randomInRange } from './random';
import { Popups, PopupType } from './popups';
import { LightSourceAnimation, SpriteAnimation, tween } from './animation';
import { State, Particle } from './types';
import { getTileSet } from './tilesets';

enum MoveResult {
    StoodStill,
    Moved,
    BumpedPlayer,
}

enum GuardMode {
    //Guard and Defender modes
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
    //All types can be unconscious
    Unconscious, 
    //Sleeper modes
    SleeperSleeping,
    SleeperStirring,
    SleeperAwake,
    //Owner and worker modes
    DoingTasks,
    YellingForGuards,
    //Tracker and assassin tracker modes
    Tracking,
    TrackingTargetAcquired,
}

enum GuardType {
    Footman,
    Defender,
    Tracker,
    AssassinTracker,
    Worker,
    Owner,
    Sleeper,
}

class Guard {
    pos: vec2;
    dir: vec2 = vec2.fromValues(1, 0);
    type: GuardType = GuardType.Footman;
    mode: GuardMode = GuardMode.Patrol;
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

    // Chase
    goal: vec2;
    modeTimeout: number = 0;

    // Patrol
    patrolPath: Array<vec2>;
    patrolPathIndex: number;
    outsidePatrol: boolean;

    constructor(type: GuardType, patrolPath: Array<vec2>, pathIndexStart: number, outsidePatrol:boolean=false) {
        const posStart = patrolPath[pathIndexStart];
        this.pos = vec2.clone(posStart);
        this.heardGuardPos = vec2.clone(posStart);
        this.goal = vec2.clone(posStart);
        this.patrolPath = patrolPath;
        this.patrolPathIndex = pathIndexStart;
        this.outsidePatrol = outsidePatrol;
        this.type = type;
        this.mode = this.type===GuardType.Sleeper? GuardMode.SleeperSleeping:
                    this.type===GuardType.Footman? GuardMode.Patrol:
                    this.type===GuardType.Defender? GuardMode.Patrol:
                    this.type===GuardType.Tracker? GuardMode.Tracking:
                    this.type===GuardType.AssassinTracker? GuardMode.Tracking:
                    GuardMode.DoingTasks;

        this.updateDirInitial();
    }

    overheadIcon(): number {
        if (this.mode === GuardMode.Unconscious || this.mode === GuardMode.SleeperSleeping) {
            return GuardStates.Unconscious;
        } else if (this.mode === GuardMode.ChaseVisibleTarget) {
            return GuardStates.Chasing;
        } else if (!isRelaxedGuardMode(this.mode) && this.mode!==GuardMode.Tracking &&this.mode!==GuardMode.DoingTasks) {
            return GuardStates.Alerted;
        } else if (this.angry) {
            return GuardStates.Angry;
        } else {
            return GuardStates.Relaxed;
        }
    }

    allowsMoveOntoFrom(posFrom: vec2): boolean {
        switch (this.mode) {
        case GuardMode.Patrol:
        case GuardMode.DoingTasks:
        case GuardMode.Tracking:
            const posPatrolCur = this.patrolPath[this.patrolPathIndex];
            if (posPatrolCur.equals(this.pos)) {
                const patrolPathIndexNext = (this.patrolPathIndex + 1) % this.patrolPath.length;
                const posPatrolNext = this.patrolPath[patrolPathIndexNext];
                return !(posPatrolNext.equals(posPatrolCur) || posPatrolNext.equals(posFrom));
            }
            return true;

        case GuardMode.Look:
        case GuardMode.Listen:
        case GuardMode.ChaseVisibleTarget:
        case GuardMode.WakeGuard:
        case GuardMode.LightTorch:
        case GuardMode.Unconscious:
        case GuardMode.SleeperAwake:
        case GuardMode.SleeperStirring:
        case GuardMode.SleeperSleeping:
        case GuardMode.YellingForGuards:
        case GuardMode.TrackingTargetAcquired:
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

    moving(): boolean {
        switch (this.mode) {
            case GuardMode.Patrol:
            case GuardMode.Tracking:
            case GuardMode.DoingTasks:
                    const posPatrolCur = this.patrolPath[this.patrolPathIndex];
                if (posPatrolCur.equals(this.pos)) {
                    const patrolPathIndexNext = (this.patrolPathIndex + 1) % this.patrolPath.length;
                    const posPatrolNext = this.patrolPath[patrolPathIndexNext];
                    return !posPatrolNext.equals(posPatrolCur);
                }
                return true;
    
            case GuardMode.Look:
            case GuardMode.Listen:
            case GuardMode.ChaseVisibleTarget:
            case GuardMode.WakeGuard:
            case GuardMode.LightTorch:
            case GuardMode.Unconscious:
            case GuardMode.SleeperAwake:
            case GuardMode.SleeperStirring:
            case GuardMode.SleeperSleeping:
            case GuardMode.YellingForGuards:
            case GuardMode.TrackingTargetAcquired:
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

    act(map: GameMap, popups: Popups, player: Player, shouts: Array<Shout>, particles:Particle[]) {
        const modePrev = this.mode;
        const posPrev = vec2.clone(this.pos);

        // Immediately upgrade to chasing if we see the player while investigating;
        // this lets us start moving toward the player on this turn rather than
        // wait for next turn.

        if ((this.type===GuardType.Footman || this.type===GuardType.Defender) && 
            this.mode !== GuardMode.Unconscious &&
            !isRelaxedGuardMode(this.mode) &&
            this.seesActor(map, player, 1)) {
            this.mode = GuardMode.ChaseVisibleTarget;
        }

        if(this.type===GuardType.Tracker) {
            if(this.mode===GuardMode.TrackingTargetAcquired || this.seesActor(map, player)) {
                this.patrolPath = [vec2.fromValues(player.pos[0], player.pos[1])];
            } else {
                //Extend the path if the player moved
                const last = this.patrolPath.length>0?this.patrolPath[this.patrolPath.length-1]:undefined;
                if(!last || !last.equals(player.pos)) this.patrolPath.push(vec2.fromValues(player.pos[0], player.pos[1]));
                //Shorten the path if the tracker finds a newer scent further along the path (i.e., if the player backtracks)
                for(let i=this.patrolPath.length-1;i>=0;i--) {
                    if(this.patrolPath[i]===this.pos) {
                        this.patrolPath = this.patrolPath.slice(i);
                        this.patrolPathIndex = 0;
                        break;
                    }
                }
                //Shorten the path if it is getting very long
                if(this.patrolPath.length>=60) {
                    this.patrolPath = this.patrolPath.slice(1);
                    this.patrolPathIndex = Math.max(0, this.patrolPathIndex-1);
                }    
            }
            if(this.patrolPathIndex>=this.patrolPath.length) this.patrolPathIndex = this.patrolPath.length-1;
        } 

        if(this.type===GuardType.AssassinTracker) {
            this.patrolPath = [player.pos];
        } 

        // Pass time in the current mode    
        switch (this.mode) {
        case GuardMode.Patrol:
        case GuardMode.DoingTasks:
        case GuardMode.Tracking:
            this.patrolStep(map, player);
            break;

        case GuardMode.Look:
        case GuardMode.Listen:
        case GuardMode.YellingForGuards:
        case GuardMode.SleeperAwake:
        case GuardMode.TrackingTargetAcquired:
            this.modeTimeout -= 1;
            if (this.modeTimeout == 0) {
                this.enterPatrolMode(map);
            }
            break;

        case GuardMode.ChaseVisibleTarget:
            vec2.copy(this.goal, player.pos);
            if (this.adjacentTo(player.pos)) {
                updateDir(this.dir, this.pos, this.goal);
                if (modePrev == GuardMode.ChaseVisibleTarget) {
                    if (!player.damagedLastTurn) {
                        popups.add(PopupType.Damage, this.pos);
                        this.speaking = true;
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
                this.speaking = true;
            } else if (this.modeTimeout <= 0) {
                this.enterPatrolMode(map);
                this.modeTimeout = 0;
                this.angry = true;
                shouts.push({pos_shouter: this.pos, pos_target: this.pos, target:this});
                popups.add(PopupType.GuardAwakesWarning, this.pos);
                this.speaking = true;
            }
            break;
        case GuardMode.SleeperSleeping:
            {
                const dist2 = this.pos.squaredDistance(player.pos);
                if(dist2<=25) {
                        this.mode = GuardMode.SleeperStirring;
                        this.modeTimeout = 6+randomInRange(6);
                }    
            }
            break;
        case GuardMode.SleeperStirring:
            {
                const dist2 = this.pos.squaredDistance(player.pos);
                if(dist2<=25) {
                        this.modeTimeout--;
                        if(this.modeTimeout===0) {
                            this.mode=GuardMode.SleeperAwake;
                            this.modeTimeout = 6;
                            shouts.push({pos_shouter: this.pos, pos_target: player.pos, target:player});
                            popups.add(PopupType.SleeperAwakesWarning, this.pos);
                        }
                } else {
                    this.mode = GuardMode.SleeperSleeping;
                    this.modeTimeout = 0;
                }
            }
            break;    
        case GuardMode.SleeperAwake:
            {
                const dist2 = this.pos.squaredDistance(player.pos);
                if(dist2>25) {
                    this.modeTimeout--;
                }
                if(this.modeTimeout===0) {
                    this.mode = GuardMode.SleeperSleeping;
                }
            }
            break;    
        }

        // If the guard's moved and has a torch, recompute the level's lighting so the guard can spot
        // the player using the new lighting

        if (this.hasTorch && !posPrev.equals(this.pos)) {
            map.computeLighting(map.cells.at(player.pos[0], player.pos[1]));
        }

        // Change states based on sensory input

        if (this.mode !== GuardMode.Unconscious &&  this.mode !== GuardMode.SleeperSleeping) {

            // See the thief, or lose sight of the thief
            const seesPlayer = this.seesActor(map, player);

            if (seesPlayer) {
                if (this.mode===GuardMode.DoingTasks) {
                    this.mode = GuardMode.YellingForGuards;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (this.mode===GuardMode.Tracking) {
                    this.mode = GuardMode.TrackingTargetAcquired;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (isRelaxedGuardMode(this.mode) && !this.adjacentTo(player.pos)) {
                    this.mode = GuardMode.Look;
                    this.modeTimeout = 2 + randomInRange(4);
                } else if (this.type===GuardType.Footman || this.type===GuardType.Defender) {
                    this.mode = GuardMode.ChaseVisibleTarget;
                }
            } else if (this.mode === GuardMode.ChaseVisibleTarget) {
                this.mode = GuardMode.MoveToLastSighting;
                this.modeTimeout = 3;
            }

            // Footman-specific actions
            if (this.type===GuardType.Footman || this.type===GuardType.Defender) {
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
                    this.mode !== GuardMode.MoveToLastSound) {
    
                    this.mode = GuardMode.MoveToGuardShout;
                    this.modeTimeout = 2 + randomInRange(4);
                    vec2.copy(this.goal, this.heardGuardPos);
                }
    
                // If we see a downed guard, move to revive him.
                if (isRelaxedGuardMode(this.mode)) {
                    for (let guard of map.guards) {
                        if (guard === this) continue;
                        if (guard.mode !== GuardMode.Unconscious) continue;
                        if (!this.seesActor(map, guard)) continue;    
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
                        if (this.cardinallyAdjacentTo(this.goal)) {
                            this.mode = GuardMode.LightTorch;
                            this.modeTimeout = 5;
                        } else {
                            this.mode = GuardMode.MoveToTorch;
                            this.modeTimeout = 3;
                        }
                    }
                }
                
            }
        }

        // If a worker/owner sees a downed guard, alert other guards.
        if (this.mode===GuardMode.DoingTasks || this.mode===GuardMode.Tracking) {
            for (let guard of map.guards) {
                if (guard === this) continue;
                if (guard.mode !== GuardMode.Unconscious) continue;
                if (guard.type !== GuardType.Footman && guard.type !== GuardType.Defender) continue;
                if (!this.seesActor(map, guard)) continue;

                vec2.copy(this.goal, guard.pos);
                this.mode = GuardMode.YellingForGuards;
                this.angry = true;
                this.modeTimeout = 3;
                shouts.push({pos_shouter: this.pos, pos_target: guard.pos, target:guard});
                break;
            }    
        }

        // If a worker/owner/tracker sees an extinguished torch, ask a nearby guard to light it.
        if (this.mode === GuardMode.DoingTasks ||
            this.mode === GuardMode.Tracking && this.type === GuardType.Tracker) {
            const torch = torchNeedingRelighting(map, this.pos);
            if (torch !== undefined) {
                let closestGuard:Guard = this;
                let closestDist = 100;
                for(let g of map.guards) {
                    if(g===this) continue;
                    if(g.type!==GuardType.Footman && g.type!==GuardType.Defender) continue;
                    if(g.goal.equals(torch.pos)) {
                        closestDist = 100;
                        break
                    }
                    if(!isRelaxedGuardMode(g.mode)) continue;
                    const dist = g.pos.distance(this.pos);
                    if(dist<closestDist) {
                        closestDist = dist;
                        closestGuard = g;
                    }
                }
                if(closestDist<10) {
                    const g = closestGuard;
                    vec2.copy(g.goal, torch.pos);
                    if (g.cardinallyAdjacentTo(g.goal)) {
                        g.mode = GuardMode.LightTorch;
                        g.modeTimeout = 5;
                    } else {
                        g.mode = GuardMode.MoveToTorch;
                        g.modeTimeout = 3;
                    }    
                };
            }
        }


        // Clear heard-thief flags
    
        this.heardThief = false;
        this.heardThiefClosest = false;
    
        // Say something to indicate state changes

        const popupType = popupTypeForStateChange(modePrev, this.mode);
        if (popupType !== undefined) {
            popups.add(popupType, this.pos);
            this.speaking = true;
        }
    
        if (this.mode === GuardMode.ChaseVisibleTarget && modePrev !== GuardMode.ChaseVisibleTarget ||
            this.mode === GuardMode.YellingForGuards && modePrev !== GuardMode.YellingForGuards ||
            this.type === GuardType.Tracker && this.mode === GuardMode.TrackingTargetAcquired && modePrev !== GuardMode.TrackingTargetAcquired) {
            shouts.push({pos_shouter: this.pos, pos_target: player.pos, target: player});
            this.speaking = true;
        }

        if (this.type === GuardType.AssassinTracker && this.mode === GuardMode.TrackingTargetAcquired) {
            const dist = player.pos.distance(this.pos);
            if(dist<=10 && this.seesActor(map, player)) {
                player.applyDamage(1);
                const ppos = player.pos.subtract(this.pos);
                const origin = vec2.create();
                const item:Item = {
                    type:ItemType.Shuriken,
                    pos:this.pos,
                }
                const animation = new SpriteAnimation(
                    [
                        {pt0:origin, pt1:ppos, duration:dist*0.05, fn:tween.easeInQuad},
                        {pt0:ppos, pt1:origin, duration:dist*0.05, fn:tween.easeOutQuad},
                    ],
                    [getTileSet().namedTiles['shuriken1'],
                     getTileSet().namedTiles['shuriken2']]                
                )
                animation.frameStep = Math.ceil(dist);
                animation.removeOnFinish = true;
                item.animation = animation;
                particles.push(item);    
            }
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

        let playerIsLit = map.cells.atVec(person.pos).lit>0;

        let d2 = vec2.squaredLen(d);
        if (d2 >= this.sightCutoff(playerIsLit)) {
            return false;
        }

        // Once an enemy is searching, they can see into all of the adjacent squares regardless
        // of whether anything would normally block line of sight. The one place where this
        // feels weird is that they can see around corners.

        if ((person.hidden(map) || !lineOfSight(map, this.pos, person.pos)) &&
            ((isRelaxedGuardMode(this.mode) && !this.angry) || Math.abs(d[0]) >= 2 || Math.abs(d[1]) >= 2)) {
            return false;
        }

        return true;
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
        this.mode = this.type===GuardType.Footman ? GuardMode.Patrol:
                    this.type===GuardType.Sleeper ? GuardMode.SleeperSleeping:
                    this.type===GuardType.AssassinTracker? GuardMode.Tracking:
                    this.type===GuardType.Tracker? GuardMode.Tracking:
                    GuardMode.DoingTasks ;
    }

    patrolStep(map: GameMap, player: Player) {
        if (this.patrolPath[this.patrolPathIndex].equals(this.pos)) {
            this.patrolPathIndex = (this.patrolPathIndex + 1) % this.patrolPath.length;
        }

        const moveResult = this.moveTowardPosition(this.patrolPath[this.patrolPathIndex], map, player);

        if (moveResult === MoveResult.BumpedPlayer) {
            if(this.type===GuardType.Footman || this.type===GuardType.Defender) {
                this.mode = GuardMode.ChaseVisibleTarget;
            }
            updateDir(this.dir, this.pos, player.pos);
        } else if (moveResult === MoveResult.StoodStill) {
            const posLookAt = this.tryGetPosLookAt(map);
            if (posLookAt !== undefined) {
                updateDir(this.dir, this.pos, posLookAt);
            }
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

        updateDir(this.dir, this.pos, posNext);

        if (player.pos.equals(posNext)) {
            return MoveResult.BumpedPlayer;
        }

        if (posNext.equals(this.pos)) {
            return MoveResult.StoodStill;
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

        updateDir(this.dir, this.pos, posNext);

        if (player.pos.equals(posNext)) {
            return MoveResult.BumpedPlayer;
        }

        if (posNext.equals(this.pos)) {
            return MoveResult.StoodStill;
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
           guardMode === GuardMode.LightTorch ||
           guardMode === GuardMode.SleeperSleeping ||
           guardMode === GuardMode.SleeperStirring ||
           guardMode === GuardMode.DoingTasks;
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

    // Sort guards so the non-moving ones update first, and guards closer to the player after that.

    const guardOrdering = (guard0: Guard, guard1: Guard) => {
        const guard0Moving = guard0.moving();
        const guard1Moving = guard1.moving();
        if (guard0Moving && !guard1Moving) {
            return 1;
        }
        if (guard1Moving && !guard0Moving) {
            return -1;
        }

        const distGuard0 = Math.abs(guard0.pos[0] - player.pos[0]) + Math.abs(guard0.pos[1] - player.pos[1]);
        const distGuard1 = Math.abs(guard1.pos[0] - player.pos[0]) + Math.abs(guard1.pos[1] - player.pos[1]);
        return distGuard0 - distGuard1;
    };

    map.guards.sort(guardOrdering);

    // Update each guard for this turn.

    const shouts: Array<Shout> = [];
    let ontoGate = false;

    for (const guard of map.guards) {
        const oldPos = vec2.clone(guard.pos);
        guard.act(map, popups, player, shouts, state.particles);
        guard.hasMoved = true;
        ontoGate = ontoGate || (guardOnGate(guard, map) && !oldPos.equals(guard.pos));
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

function popupTypeForStateChange(modePrev: GuardMode, modeNext: GuardMode): PopupType | undefined {
    if (modeNext == modePrev) {
        return undefined;
    }

    switch (modeNext) {
        case GuardMode.Patrol:
        case GuardMode.SleeperSleeping:
        case GuardMode.DoingTasks:
            switch (modePrev) {
                case GuardMode.Look: return PopupType.GuardFinishLooking;
                case GuardMode.Listen: return PopupType.GuardFinishListening;
                case GuardMode.MoveToLastSound: return PopupType.GuardFinishInvestigating;
                case GuardMode.MoveToGuardShout: return PopupType.GuardFinishInvestigating;
                case GuardMode.MoveToLastSighting: return PopupType.GuardEndChase;
                case GuardMode.Unconscious: return PopupType.GuardAwakesWarning;
                case GuardMode.SleeperAwake: return PopupType.SleeperBackToSleep;
                case GuardMode.SleeperStirring: return PopupType.SleeperBackToSleep;
                case GuardMode.YellingForGuards: return PopupType.YellingForGuards;
                default: return undefined;
            }
        case GuardMode.SleeperStirring: return PopupType.GuardStirring;
        case GuardMode.SleeperAwake: return PopupType.SleeperAwakesWarning;
        case GuardMode.YellingForGuards: return PopupType.YellingForGuards;
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
        case GuardMode.TrackingTargetAcquired: return PopupType.TrackerYellingForGuards;
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
