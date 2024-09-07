import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { Achievement } from './achievements';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';
import { Animator } from './animation';

export {Camera, GameMode, GameStats, LevelStats, PersistedStats, State, Achievements, ScoreEntry}

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
    extraFoodCollected: number;
}

type Achievements = {
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

    achievementGhosty: number;
    achievementZippy: number;
    achievementHungry: number;
    achievementThumpy: number;
    achievementSofty: number;
    achievementNoisy: number;
    achievementLeapy: number;
    achievementSteppy: number;
    achievementHurty: number;
    achievementVictory: number;
}

interface Particle {
    pos:vec2;
    animation?: Animator;
}

type HealthBarState = {
    size: number;
    enlargeTimeRemaining: number;
    heartFlashRemaining: Array<number>;
}

type State = {
    gameStats: GameStats;
    persistedStats: PersistedStats;
    levelStats: LevelStats;
    achievements: Achievements;
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
    oldPlayerPos: vec2,
    topStatusMessage: string;
    topStatusMessageSlide: number;
    playerHintMessage: string;
    playerHintMessageIsNew: boolean;
    healthBarState: HealthBarState;
    numStepMoves: number;
    numLeapMoves: number;
    numWaitMoves: number;
    numZoomMoves: number;
    hasOpenedMenu: boolean;
    hasClosedMenu: boolean;
    hasEnteredMansion: boolean;
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
    treasureStolen: number;
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
