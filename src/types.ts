import { vec2 } from './my-matrix';
import { GameMap, GameMapRoughPlan, Player } from './game-map';
import { RNG } from './random';
import { Howls, SubtitledHowls, ActiveHowlPool } from './audio';
import { Popups } from './popups';
import { TouchController, GamepadManager, KeyboardController } from './controllers';
import { TextWindow } from './ui';

export {Camera, GameMode, EndStats, State}

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
}

type EndStats = {
    lootStolen: number;
    lootSpent: number;
    ghostBonuses: number;
    timeBonuses: number;
    maxGhostBonuses: number;
    maxTimeBonuses: number;
    maxLootStolen: number;
}

type State = {
    endStats: EndStats;
    rng: RNG;
    tLast: number | undefined;
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
