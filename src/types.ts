import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';
import { Animator } from './animation';
import { Achievements } from './achievements';

export {Camera, GameMode, GameStats, LevelStats, PersistedStats, State, ScoreEntry, AmbienceType}

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
    DevScreen,
}

enum AmbienceType {
    Indoor,
    Outdoor,
    OutdoorWater,
    Water,
    Kitchen,
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
    steppableLeaps: number;
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

    achievementVictory: number;
    achievementGhosty: number;
    achievementZippy: number;
    achievementHungry: number;
    achievementThumpy: number;
    achievementSofty: number;
    achievementNoisy: number;
    achievementLeapy: number;
    achievementSteppy: number;
    achievementHurty: number;
    achievementHealthy: number;
    achievementTreasure: number;
    achievementMapping: number;
    achievementFaceless: number;
}

interface Particle {
    pos:vec2;
    animation?: Animator;
}

type HealthBarState = {
    damageDisplayTimer: number;
    healing: boolean;
    size: number;
    enlargeTimeRemaining: number;
    heartFlashRemaining: Array<number>;
}

type FPSInfo = {
    enabled: boolean;
    frames: number;
    cumulativeTime: number;
    worstFrame: number;
    drops: number;
    msgFPS: string;
}

type State = {
    gameStats: GameStats;
    persistedStats: PersistedStats;
    levelStats: LevelStats;
    achievements: Achievements;
    rng: RNG;
    fpsInfo: FPSInfo;
    devMode: boolean;
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
    ambience: AmbienceType;
    ambientSoundPool: ActiveHowlPool;
    hintMessage: string;
    healthBarState: HealthBarState;
    numStepMoves: number;
    numLeapMoves: number;
    numWaitMoves: number;
    numZoomMoves: number;
    hasEnteredMansion: boolean;
    experiencedPlayer: boolean;
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
