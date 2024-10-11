import { numTurnsParForCurrentMap } from './game';
import { ItemType } from './game-map';
import { GuardMode } from './guard';
import { State } from './types';

export function getAchievements(): Achievements {
    return {
        achievementVictory: new VictoryAchievement(),
        achievementGhosty: new GhostyAchievement(),
        achievementZippy: new ZippyAchievement(),
        achievementLeapy: new LeapyAchievement(),
        achievementSteppy: new SteppyAchievement(),
        achievementNoisy: new NoisyAchievement(),
        achievementThumpy: new ThumpyAchievement(),
        achievementSofty: new SoftyAchievement(),
        achievementHungry: new HungryAchievement(),
        achievementHurty: new HurtyAchievement(),
    }
}

export type Achievements = {
    achievementGhosty: Achievement;
    achievementZippy: Achievement;
    achievementHungry: Achievement;
    achievementThumpy: Achievement;
    achievementSofty: Achievement;
    achievementNoisy: Achievement;
    achievementLeapy: Achievement;
    achievementSteppy: Achievement;
    achievementHurty: Achievement;
    achievementVictory: Achievement;
}

export class Achievement {
    failed: boolean = false;
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        if (type === 'gameStart') {
            this.failed = false;
        }
    }
}

class VictoryAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
    }
}

class GhostyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.levelStats.numSpottings > 0) {
                this.failed = true;
            }
        }
    }
}

class ZippyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.turns > numTurnsParForCurrentMap(state)) {
                this.failed = true;
            }
        }
    }
}

class LeapyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            this.failed = state.numLeapMoves < 0.8 * state.totalTurns;
        }
    }
}

class SteppyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.numLeapMoves > 20) {
                this.failed = true;
            }
        }
    }
}

class NoisyAchievement extends Achievement {
    noiseHeardOnCurrentLevel: boolean = false;
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'gameStart') {
            this.noiseHeardOnCurrentLevel = false;
        } else if (type === 'turnEnd') {
            if (state.gameMap.guards.some(g => g.mode === GuardMode.Listen || g.mode === GuardMode.MoveToLastSound)) {
                this.noiseHeardOnCurrentLevel = true;
            }
        } else if (type === 'levelEnd') {
            if (!this.noiseHeardOnCurrentLevel && state.gameMap.guards.length > 0) {
                this.failed = true;
            }
            this.noiseHeardOnCurrentLevel = false;
        }
    }
}

class ThumpyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'levelEnd') {
            if (state.gameMap.guards.some((g) => (g.mode !== GuardMode.Unconscious))) {
                this.failed = true;
            }
        }
    }
}

class SoftyAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'levelEnd') {
            if (state.levelStats.numKnockouts > 0) {
                this.failed = true;
            }
        }
    }
}

class HungryAchievement extends Achievement {
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'levelEnd') {
            if (state.gameMap.items.some((item) => item.type === ItemType.Health)) {
                this.failed = true;
            }
        }
    }
}

class HurtyAchievement extends Achievement {
    damageTakenThisLevel: boolean = false;
    priorTurnHealth: number = 0;
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'gameStart') {
            this.damageTakenThisLevel = false;
            this.priorTurnHealth = state.player.health;
        } else if (type === 'turnEnd') {
            if (state.player.health < this.priorTurnHealth) {
                this.damageTakenThisLevel = true;
            }
            this.priorTurnHealth = state.player.health;
        } else if (type === 'levelEnd') {
            if (!this.damageTakenThisLevel && state.gameMap.guards.length > 0) {
                this.failed = true;
            }
            this.damageTakenThisLevel = false;
        }
    }
}
