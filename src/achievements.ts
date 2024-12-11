import { numTurnsParForCurrentMap } from './game';
import { ItemType } from './game-map';
import { GuardMode } from './guard';
import { State } from './types';

export function getAchievements(): Achievements {
    return {
        achievementVictory: new VictoryAchievement(),
        achievementHungry: new HungryAchievement(),
        achievementTreasure: new TreasureAchievement(),
        achievementHealthy: new HealthyAchievement(),
        achievementSteppy: new SteppyAchievement(),
        achievementThumpy: new ThumpyAchievement(),
        achievementSofty: new SoftyAchievement(),
        achievementMapping: new MappingAchievement(),
        achievementFaceless: new FacelessAchievement(),
        achievementZippy: new ZippyAchievement(),
        achievementGhosty: new GhostyAchievement(),
    }
}

export type Achievements = {
    achievementVictory: Achievement;
    achievementHungry: Achievement;
    achievementTreasure: Achievement;
    achievementHealthy: Achievement;
    achievementSteppy: Achievement;
    achievementThumpy: Achievement;
    achievementSofty: Achievement;
    achievementMapping: Achievement;
    achievementFaceless: Achievement;
    achievementZippy: Achievement;
    achievementGhosty: Achievement;
}

export class Achievement {
    failed: boolean = false;
    unicodeBadge: string = '';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        if (type === 'gameStart') {
            this.failed = false;
        }
    }
}

class VictoryAchievement extends Achievement {
    unicodeBadge: string = '\u{1F3C6}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
    }
}

class GhostyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F47B}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.levelStats.numSpottings > 0 || state.levelStats.numKnockouts > 0) {
                this.failed = true;
            }
        }
    }
}

class ZippyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F3C3}';
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
    unicodeBadge: string = '\u{1F998}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            this.failed = state.numLeapMoves < 0.8 * state.totalTurns;
        }
    }
}

class SteppyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F6B6}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.levelStats.steppableLeaps > 0) {
                this.failed = true;
            }
        }
    }
}

class NoisyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F941}';
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
    unicodeBadge: string = '\u{1F44A}';
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
    unicodeBadge: string = '\u{262E}';
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
    unicodeBadge: string = '\u{1F96A}';
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
    unicodeBadge: string = '\u{1F915}';
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

class HealthyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F915}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.player.health < state.player.healthMax) {
                this.failed = true;
            }
        }
    }
}

class TreasureAchievement extends Achievement {
    unicodeBadge: string = '\u{1F48E}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.gameMap.items.some(item => item.type === ItemType.EmptyVaultTreasureBox)) {
                this.failed = true;
            }
        } else if (type === 'levelEnd') {
            if (state.gameMap.items.some(item =>
                    item.type >= ItemType.TreasureA ||
                    item.type === ItemType.VaultTreasureBox ||
                    item.type === ItemType.EmptyVaultTreasureBox)) {
                this.failed = true;
            }
        }
    }
}

class MappingAchievement extends Achievement {
    unicodeBadge: string = '\u{1F5FA}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (!this.failed &&
                (state.lootStolen > 0 || state.treasureStolen > 0 || state.levelStats.extraFoodCollected > 0) &&
                !state.gameMap.allSeen()) {
                this.failed = true;
            }
        }
    }
}

class FacelessAchievement extends Achievement {
    unicodeBadge: string = '\u{1F977}';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.levelStats.numSpottings > 0) {
                this.failed = true;
            }
        }
    }
}
