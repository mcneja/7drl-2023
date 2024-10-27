import { numTurnsParForCurrentMap } from './game';
import { maxPlayerHealth, ItemType } from './game-map';
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
        achievementHealthy: new HealthyAchievement(),
        achievementTreasure: new TreasureAchievement(),
        achievementMapping: new MappingAchievement(),
        achievementFaceless: new FacelessAchievement(),
    }
}

export type Achievements = {
    achievementVictory: Achievement;
    achievementGhosty: Achievement;
    achievementZippy: Achievement;
    achievementHungry: Achievement;
    achievementThumpy: Achievement;
    achievementSofty: Achievement;
    achievementNoisy: Achievement;
    achievementLeapy: Achievement;
    achievementSteppy: Achievement;
    achievementHurty: Achievement;
    achievementHealthy: Achievement;
    achievementTreasure: Achievement;
    achievementMapping: Achievement;
    achievementFaceless: Achievement;
}

export class Achievement {
    failed: boolean = false;
    description: string;
    unicodeBadge: string = '';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        if (type === 'gameStart') {
            this.failed = false;
        }
    }
}

class VictoryAchievement extends Achievement {
    unicodeBadge: string = '\u{1F451}';
    description: string = 'Just finish';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
    }
}

class GhostyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F47B}';
    description: string = 'Ghost every level';
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
    description: string = 'Under par time on every level';
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
    description: string = 'Leap more than 80% of your turns';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            this.failed = state.numLeapMoves < 0.8 * state.totalTurns;
        }
    }
}

class SteppyAchievement extends Achievement {
    unicodeBadge: string = '\u{1F6B6}';
    description: string = 'No leaps where stepping will work';
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
    description: string = 'Alert guards with noise on all levels';
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
    description: string = 'Knock out all guards';
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
    description: string = 'No knockouts';
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
    description: string = 'Collect all food';
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
    description: string = 'Take a wound on every level';
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
    description: string = 'Never get wounded';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.player.health < maxPlayerHealth) {
                this.failed = true;
            }
        }
    }
}

class TreasureAchievement extends Achievement {
    unicodeBadge: string = '\u{1F451}';
    description: string = 'Collect all optional loot';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'levelEnd') {
            if (state.gameMap.items.some(item => item.type === ItemType.Treasure)) {
                this.failed = true;
            }
        }
    }
}

class MappingAchievement extends Achievement {
    unicodeBadge: string = '\u{1F5FA}';
    description: string = 'Map 100% before looting';
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
    description: string = 'Ghost with no knockouts';
    update(state: State, type: 'gameStart' | 'turnEnd' | 'levelEnd' | 'gameEnd') {
        super.update(state, type);
        if (type === 'turnEnd') {
            if (state.levelStats.numSpottings > 0) {
                this.failed = true;
            }
        }
    }
}
