import { numTurnsParForCurrentMap } from './game';
import { ItemType } from './game-map';
import { Guard, GuardMode } from './guard';
import { State, Achievements } from './types';

export function getAchievements(): Achievements {
    return {
        achievementVictory: new VictoryAchievement(),
        achievementGhostly: new GhostlyAchievement(),
        achievementZippy: new ZippyAchievement(),
        achievementLeapy: new LeapyAchievement(),
        achievementCreepy: new CreepyAchievement(),
        achievementNoisy: new NoisyAchievement(),
        achievementThumpy: new ThumpyAchievement(),
        achievementSofty: new SoftyAchievement(),
        achievementHungry: new HungryAchievement(),
        achievementHurty: new HurtyAchievement(),
    }
}

export class Achievement {
    complete: boolean = false;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') { }
}

class VictoryAchievement extends Achievement {
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'gameStart') {
            this.complete = false;
        } else if (type === 'gameEnd') {
            this.complete = true;
        }
    }
}

class GhostlyAchievement extends Achievement {
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'gameStart') {
            this.complete = false;
        } else if (type === 'gameEnd') {
            this.complete = state.gameStats.numGhostedLevels === state.gameMapRoughPlans.length;
        }
    }
}

class ZippyAchievement extends Achievement {
    parRuns: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'levelEnd') {
            if (state.turns <= numTurnsParForCurrentMap(state)) this.parRuns++;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.parRuns = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.parRuns === state.gameMapRoughPlans.length;
        }
    }
}

class LeapyAchievement extends Achievement {
    leapMoves: number = 0;
    leapLevels: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'turnEnd') {
            if (state.player.pos.distance(state.oldPlayerPos) >= 2) this.leapMoves++;
        } else if (type === 'levelEnd') {
            if (this.leapMoves >= 0.8 * state.turns) this.leapLevels++;
            this.leapMoves = 0;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.leapMoves = 0;
            this.leapLevels = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.leapLevels === state.gameMapRoughPlans.length;
        }
    }
}

class CreepyAchievement extends Achievement {
    leapMoves: number = 0;
    leapLevels: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'turnEnd') {
            if (state.player.pos.distance(state.oldPlayerPos) >= 2) this.leapMoves++;
        } else if (type === 'levelEnd') {
            if (this.leapMoves <= 20) this.leapLevels++;
            this.leapMoves = 0;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.leapMoves = 0;
            this.leapLevels = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.leapLevels === state.gameMapRoughPlans.length;
        }
    }
}

class NoisyAchievement extends Achievement {
    noisesHeard: number = 0;
    levelsWithNoisesHeard: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'turnEnd') {
            if (state.gameMap.guards.find(g => g.mode === GuardMode.Listen || g.mode === GuardMode.MoveToLastSound)) this.noisesHeard++;
        } else if (type === 'levelEnd') {
            if (this.noisesHeard > 0) this.levelsWithNoisesHeard++;
            this.noisesHeard = 0;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.noisesHeard = 0;
            this.levelsWithNoisesHeard = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.levelsWithNoisesHeard === state.gameMapRoughPlans.length - 1;
        }
    }
}

class ThumpyAchievement extends Achievement {
    levelsWithAwakeGuards: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'levelEnd') {
            if (state.gameMap.guards.find((g) => (g.mode !== GuardMode.Unconscious))) this.levelsWithAwakeGuards++;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.levelsWithAwakeGuards = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.levelsWithAwakeGuards === 0;
        }
    }
}

class SoftyAchievement extends Achievement {
    levelsWithDownedGuards: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'levelEnd') {
            if (state.levelStats.numKnockouts > 0) this.levelsWithDownedGuards++;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.levelsWithDownedGuards = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.levelsWithDownedGuards === 0;
        }
    }
}

class HungryAchievement extends Achievement {
    levelsWithFoodLeft: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'levelEnd') {
            if (!state.gameMap.items.find((item) => ItemType.Health)) this.levelsWithFoodLeft++;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.levelsWithFoodLeft = 0;
        } else if (type === 'gameEnd') {
            this.complete = this.levelsWithFoodLeft === 0;
        }
    }
}

export class HurtyAchievement extends Achievement {
    damageTaken: number = 0;
    damageLevels: number = 0;
    priorTurnHealth: number = 0;
    update(state: State, type: 'turnEnd' | 'levelEnd' | 'gameEnd' | 'gameStart') {
        if (type === 'turnEnd') {
            if (state.player.health < this.priorTurnHealth) this.damageTaken++;
            this.priorTurnHealth = state.player.health;
        } else if (type === 'levelEnd') {
            if (this.damageTaken > 0) this.damageLevels++;
            this.damageTaken = 0;
        } else if (type === 'gameStart') {
            this.complete = false;
            this.damageTaken = 0;
            this.damageLevels = 0;
            this.priorTurnHealth = state.player.health;
        } else if (type === 'gameEnd') {
            this.complete = this.damageLevels === state.gameMapRoughPlans.length;
        }
    }
}
