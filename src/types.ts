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
    joltOffset: vec2;
    joltVelocity: vec2;
    zoom: number;
    zoomVelocity: number;
    scale: number;
    anchor: vec2;
    snapped: boolean;
    zoomed: boolean;
    panning: boolean;
}

enum GameMode {
    HomeScreen,
    StatsScreen,
    AchievementsScreen,
    OptionsScreen,
    HelpControls,
    HelpKey,
    Mansion,
    MansionComplete,
    Dead,
    Win,
    DailyHub,
    CreditsScreen,
}

type ScoreEntry = {
    score: number;
    turns: number;
    level: number;
    date: string;
}

type LevelStats = {
    numKnockouts: number;
    numSpottings: number;
    damageTaken: number;
}

type GameStats = {
    totalScore: number;
    turns: number;
    numLevels: number;
    numCompletedLevels: number;
    numGhostedLevels: number;
    daily: string|null;
    timeStarted: number;
    timeEnded: number;
}

type PersistedStats = {
    scores: Array<ScoreEntry>;
    bestScore: number;
    totalPlays: number;
    totalWins: number;
    totalGhosts: number;

    currentDailyGameId: string;
    currentDailyPlays: number;
    currentDailyWins: number;
    currentDailyBestScore: number;
    currentDailyWinFirstTry: number;
    lastPlayedDailyGame: GameStats|null;
    allDailyPlays: number;
    allDailyWins: number;
    allDailyWinsFirstTry: number;

    achievementGhostly: number;
    achievementZippy: number;
    achievementHungry: number;
    achievementThumpy: number;
    achievementHippy: number;
    achievementNoisy: number;
    achievementLeapy: number;
    achievementCreepy: number;
    achievementHurty: number;
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
    textWindows: {[key in GameMode]?: TextWindow };
    particles: Array<Particle>;
    player: Player;
    topStatusMessage: string;
    topStatusMessageSticky: boolean;
    topStatusMessageSlide: number;
    numStepMoves: number;
    numLeapMoves: number;
    numWaitMoves: number;
    hasOpenedMenu: boolean;
    hasStartedGame: boolean;
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
    soundVolume: number;
    guardMute: boolean;
    volumeMute: boolean;
    screenShakeEnabled: boolean;
    touchController: TouchController;
    keyboardController: KeyboardController;
    gamepadManager: GamepadManager;
    popups: Popups;
}
