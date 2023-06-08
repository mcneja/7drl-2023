import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';
import { ScoreServer } from './firebase';

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
    lootStolen: number;
    lootSpent: number;
    ghostBonuses: number;
    timeBonuses: number;
    maxGhostBonuses: number;
    maxTimeBonuses: number;
    maxLootStolen: number;
}

type State = {
    scoreServer: ScoreServer;
    gameStats: GameStats;
    stats: Statistics;
    rng: RNG;
    dailyRun: string|null;
    tLast: number | undefined;
    initialSeen: number;
    lightStates: Array<number>;
    dt: number;
    leapToggleActive: boolean;
    gameMode: GameMode;
    helpScreen: TextWindow;
    textWindows: {[key in GameMode]?: TextWindow };
    helpActive: boolean;
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
