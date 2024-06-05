import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';
import { Animator } from './animation';

export {Camera, GameMode, GameStats, LevelStats, PersistedStats, State, ScoreEntry}

type Camera = {
    position: vec2;
    velocity: vec2;
    zoom: number;
    zoomVelocity: number;
    scale: number;
    anchor: vec2;
    snapped: boolean;
    panning: boolean;
}

enum GameMode {
    HomeScreen,
    StatsScreen,
    OptionsScreen,
    Mansion,
    BetweenMansions,
    Dead,
    Win,
    DailyHub,
}

type ScoreEntry = {
    score: number;
    turns: number;
    level: number;
    date: string;
}

type PersistedStats = {
    highScores: Array<ScoreEntry>;
    dailyScores: Array<ScoreEntry>;
    lastDaily: ScoreEntry | undefined;
    dailyWinStreak: number;
    dailyPlays: number;
    dailyWins: number;
    bestScore: number;
    bestDailyScore: number;
    totalGold: number;
    totalPlays: number;
    totalWins: number;
    totalPerfect: number;
    totalGhosts: number;
    totalLootSweeps: number;
    achievements: Set<string>;
}

type GameStats = {
    loot: number;
    lootStolen: number;
    totalScore: number;
    turns: number;
    numLevels: number;
    numCompletedLevels: number;
    numGhostedLevels: number;
    win: boolean;
    daily: string|null;
}

type LevelStats = {
    numKnockouts: number;
    numSpottings: number;
    damageTaken: number;
}

interface Particle {
    pos:vec2;
    animation?: Animator;
}

type State = {
    gameStats: GameStats;
    persistedStats: PersistedStats;
    levelStats: LevelStats;
    rng: RNG;
    dailyRun: string|null;
    tLast: number | undefined;
    lightStates: Array<number>;
    dt: number;
    idleTimer: number;
    keyRepeatActive: string|undefined;
    keyRepeatRate: number;
    keyRepeatDelay: number;
    leapToggleActive: boolean;
    gameMode: GameMode;
    helpScreen: TextWindow;
    textWindows: {[key in GameMode]?: TextWindow };
    helpActive: boolean;
    particles: Array<Particle>;
    player: Player;
    topStatusMessage: string;
    topStatusMessageSticky: boolean;
    topStatusMessageAnim: number;
    numStepMoves: number;
    numLeapMoves: number;
    numWaitMoves: number;
    hasOpenedMenu: boolean;
    finishedLevel: boolean;
    zoomLevel: number;
    seeAll: boolean;
    seeGuardSight: boolean;
    seeGuardPatrols: boolean;
    camera: Camera;
    level: number;
    turns: number;
    totalTurns: number;
    lootStolen: number;
    lootAvailable: number;
    gameMapRoughPlans: Array<GameMapRoughPlan>;
    gameMap: GameMap;
    sounds: Howls;
    subtitledSounds: SubtitledHowls;
    activeSoundPool: ActiveHowlPool;
    guardMute: boolean;
    volumeMute: boolean;
    touchController: TouchController;
    keyboardController: KeyboardController;
    gamepadManager: GamepadManager;
    popups: Popups;
}
