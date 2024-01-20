import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';
import { Animator } from './animation';

export {Camera, GameMode, GameStats, State, Statistics, ScoreEntry}

type Camera = {
    position: vec2;
    velocity: vec2;
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
    ServerConfig,
}

type ScoreEntry = {
    score: number;
    turns: number;
    level: number;
    date: string;
}

type Statistics = {
    highScores: Array<ScoreEntry>;
    dailyScores: Array<ScoreEntry>;
    lastDaily: ScoreEntry;
    dailyWinStreak: number;
    dailyPlays: number;
    dailyWins: number;
    dailyPerfect: number;
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
    lootSpent: number;
    ghostBonuses: number;
    timeBonuses: number;
    maxGhostBonuses: number;
    maxTimeBonuses: number;
    maxLootStolen: number;
    turns: number;
    level: number;
    win: boolean;
    daily: string|null;
}

interface Particle {
    pos:vec2;
    animation?: Animator;
}

type State = {
    gameStats: GameStats;
    stats: Statistics;
    rng: RNG;
    dailyRun: string|null;
    tLast: number | undefined;
    initialSeen: number;
    lightStates: Array<number>;
    dt: number;
    idleTimer: number;
    leapToggleActive: boolean;
    gameMode: GameMode;
    helpScreen: TextWindow;
    textWindows: {[key in GameMode]?: TextWindow };
    helpActive: boolean;
    particles: Array<Particle>;
    player: Player;
    topStatusMessage: string;
    topStatusMessageSticky: boolean;
    finishedLevel: boolean;
    healCost: number;
    zoomLevel: number;
    seeAll: boolean;
    seeGuardSight: boolean;
    seeGuardPatrols: boolean;
    camera: Camera;
    level: number;
    turns: number;
    totalTurns: number;
    lootStolen: number;
    lootSpent: number;
    lootAvailable: number;
    ghostBonus: number;
    maxTimeBonus: number;
    gameMapRoughPlans: Array<GameMapRoughPlan>;
    gameMap: GameMap;
    customUpdater: undefined|((state:State)=>void);
    sounds: Howls;
    subtitledSounds: SubtitledHowls;
    activeSoundPool: ActiveHowlPool;
    guardMute: boolean;
    volumeMute: boolean;
    touchAsGamepad: boolean;
    touchController: TouchController;
    keyboardController: KeyboardController;
    gamepadManager: GamepadManager;
    popups: Popups;
}
