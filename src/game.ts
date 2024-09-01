import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap, Adjacency } from './create-map';
import { BooleanGrid, Cell, ItemType, GameMap, Item, Player, LevelType, TerrainType, maxPlayerHealth, maxPlayerTurnsUnderwater, GuardStates, CellGrid, isDoorItemType } from './game-map';
import { SpriteAnimation, LightSourceAnimation, tween, LightState, FrameAnimator, TweenData, RadialAnimation as IdleRadialAnimation, PulsingColorAnimation, RadialAnimation } from './animation';
import { Guard, GuardMode, chooseGuardMoves, guardActAll, isRelaxedGuardMode, lineOfSight } from './guard';
import { Renderer } from './render';
import { RNG, randomInRange } from './random';
import { TileInfo, getTileSet, getFontTileSet, TileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups } from './popups';
import { Controller, TouchController, GamepadManager, KeyboardController, lastController, Rect } from './controllers';
import { HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, MansionCompleteScreen, HelpControls, HelpKey, DailyHubScreen, CreditsScreen, AchievementsScreen } from './ui'
import {Achievements, Camera, GameMode, LevelStats, PersistedStats, ScoreEntry, State} from './types';

import * as colorPreset from './color-preset';
import { getAchievements } from './achievements';

export const gameConfig = {
    numGameMaps: 10,
    totalGameLoot: 100
}

enum NoiseType {
    Creak,
    Splash,
    Thud,
    BangDoor,
    BangChair,
}

enum StepType {
    Normal,
    AttemptedLeap,
    AttemptedLeapBounceBack,
}

const debugInitialLevel = 0; // set to non-zero to test level generation
const debugSeeAll = false; // initial value for see-all cheat code
const tileSet = getTileSet();
const fontTileSet = getFontTileSet();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
let canvasSizeX: number = canvas.clientWidth;
let canvasSizeY: number = canvas.clientHeight;

window.onload = loadResourcesThenRun;

const statusBarCharPixelSizeX: number = 8;
const statusBarCharPixelSizeY: number = 16;
//TODO: The constants live in the tileset and code should reference the tileset
const pixelsPerTileX: number = 16; // width of unzoomed tile
const pixelsPerTileY: number = 16; // height of unzoomed tile
const zoomPower: number = 1.1892;
const initZoomLevel: number = 4;
const minZoomLevel: number = -4;
const maxZoomLevel: number = 16;

function loadResourcesThenRun() {
    Promise.all([
        loadImage(fontTileSet.imageSrc, fontTileSet.image),
        loadImage(tileSet.imageSrc, tileSet.image),
    ]).then(main);
}

function main(images: Array<HTMLImageElement>) {

    document.body.addEventListener('keydown', e=>ensureInitSound());
    canvas.addEventListener('mousedown', e=>ensureInitSound());
    canvas.addEventListener('touchstart', e=>ensureInitSound());
    window.addEventListener("gamepadconnected", e=>ensureInitSound());

    const renderer = new Renderer(canvas, tileSet, fontTileSet);
    const sounds:Howls = {};
    const subtitledSounds:SubtitledHowls = {};
    const activeSoundPool:ActiveHowlPool = new ActiveHowlPool();
    const touchController = new TouchController(canvas);
    const state = initState(sounds, subtitledSounds, activeSoundPool, touchController);

    function ensureInitSound() {
        if (Object.keys(state.sounds).length==0) {
            setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);

            // Set Howler volume and mutes from game state

            Howler.volume(state.soundVolume);
            Howler.mute(state.volumeMute);
            for(const s in state.subtitledSounds) {
                state.subtitledSounds[s].mute = state.guardMute;
            }
        }
    }
    
    function requestUpdateAndRender() {
        requestAnimationFrame(now => updateAndRender(now, renderer, state));
    }

    const observer = new ResizeObserver((entries) => {
        canvasSizeX = canvas.clientWidth;
        canvasSizeY = canvas.clientHeight;
        state.camera.snapped = false;
    });
    observer.observe(canvas);

    requestUpdateAndRender();
}

function updateControllerState(state:State) {
    state.gamepadManager.updateGamepadStates();
    if(lastController !== null) {
        if(state.gameMode === GameMode.Mansion) {
            onControlsInMansion(lastController);
        } else {
            state.textWindows[state.gameMode]?.onControls(state, menuActivated);
        }    
        state.touchController.endFrame();
        state.keyboardController.endFrame();
        for(const g in state.gamepadManager.gamepads) state.gamepadManager.gamepads[g].endFrame();
    }
    function activated(action:string):boolean {
        const dt = Date.now();
        let result = false;
        if(lastController===null) return false;
        const controlStates = lastController.controlStates;
        if(!(action in controlStates)) return false;
        const threshold = state.keyRepeatActive===action? state.keyRepeatRate:state.keyRepeatDelay;
        result = lastController.currentFramePresses.has(action) || 
                 controlStates[action] && 
                 dt-lastController.controlTimes[action]>threshold;
        if(result) {
            if(controlStates[action] && dt-lastController.controlTimes[action]>threshold) {
                state.keyRepeatActive = action;
            }
            lastController.controlTimes[action] = dt;
        }
        if(!controlStates[action] && state.keyRepeatActive===action) state.keyRepeatActive = undefined;
        return result;
    }
    function menuActivated(action:string):boolean {
        //same as activated but no repeating, which is better for menus
        let result = false;
        if(lastController===null) return false;
        const controlStates = lastController.controlStates;
        if(!(action in controlStates)) return false;
        result = lastController.currentFramePresses.has(action);
        if(result) lastController.controlTimes[action] == Date.now();
        return result;
    }
    
    function onControlsInMansion(controller: Controller) {
        if (controller.controlStates['panLeft']) {
            state.camera.panning = true;
            state.camera.position[0] -= 1 / state.camera.zoom;
        }
        if (controller.controlStates['panRight']) {
            state.camera.panning = true;
            state.camera.position[0] += 1 / state.camera.zoom;
        }
        if (controller.controlStates['panUp']) {
            state.camera.panning = true;
            state.camera.position[1] += 1 / state.camera.zoom;
        }
        if (controller.controlStates['panDown']) {
            state.camera.panning = true;
            state.camera.position[1] -= 1 / state.camera.zoom;
        }
        if (controller.controlStates['snapToPlayer']) {
            state.camera.panning = false;
        }
        if (activated('left')) {
            if (state.leapToggleActive !== controller.controlStates['jump']) {
                tryPlayerLeap(state, -1, 0);
            } else {
                tryPlayerStep(state, -1, 0, StepType.Normal);
            }
        } else if (activated('right')) {
            if (state.leapToggleActive !== controller.controlStates['jump']) {
                tryPlayerLeap(state, 1, 0);
            } else {
                tryPlayerStep(state, 1, 0, StepType.Normal);
            }
        } else if (activated('down')) {
            if (state.leapToggleActive !== controller.controlStates['jump']) {
                tryPlayerLeap(state, 0, -1);
            } else {
                tryPlayerStep(state, 0, -1, StepType.Normal);
            }
        } else if (activated('up')) {
            if (state.leapToggleActive !== controller.controlStates['jump']) {
                tryPlayerLeap(state, 0, 1);
            } else {
                tryPlayerStep(state, 0, 1, StepType.Normal);
            }
        } else if (activated('wait')) {
            tryPlayerWait(state);
        } else if (activated('menu')) {
            if(state.player.health>0) {
                state.gameMode = GameMode.HomeScreen;
                state.hasOpenedMenu = true;
            } else {
                state.gameMode = GameMode.Dead;
            }
        } else if (activated('jumpToggle')) {
            state.leapToggleActive = !state.leapToggleActive;
        } else if (activated('seeAll')) {
            state.seeAll = !state.seeAll;
        } else if (activated('collectLoot')) {
            const loot = state.gameMap.collectAllLoot();
            state.player.loot += loot;
            state.lootStolen += loot;
            postTurn(state);
        } else if (activated('forceRestart')) {
            state.rng = new RNG();
            state.dailyRun = null;
            restartGame(state);
        } else if (activated('nextLevel')) {
            if (state.level < state.gameMapRoughPlans.length - 1) {
                scoreCompletedLevel(state);
                setupLevel(state, state.level+1);
            }
        } else if (activated('resetState')) {
            resetState(state);
        } else if (activated('prevLevel')) {
            if (state.level > 0) {
                scoreCompletedLevel(state);
                setupLevel(state, state.level-1);
            }
        } else if (activated('guardSight')) {
            state.seeGuardSight = !state.seeGuardSight;
        } else if (activated('guardPatrols')) {
            state.seeGuardPatrols = !state.seeGuardPatrols;
        } else if (activated('markSeen')) {
            state.gameMap.markAllSeen();
            postTurn(state);
        } else if (activated('zoomIn')) {
            zoomIn(state);
        } else if (activated('zoomOut')) {
            zoomOut(state);
        } else if (activated('seeAll')) {
            state.seeAll = !state.seeAll;
        } else if (activated('guardMute')) {
            setGuardMute(state, !state.guardMute);
            setStatusMessage(state, 'Guard speech ' + (state.guardMute ? 'disabled' : 'enabled'));
        } else if (activated('idleCursorToggle')) {
            switch (state.player.idleCursorType) {
                case 'orbs':
                    state.player.idleCursorType = 'bracket';
                    break;
                case 'bracket':
                    state.player.idleCursorType = 'off';
                    break;
                case 'off':
                    state.player.idleCursorType = 'orbs';
                    break;
            }
            state.player.idle = false;
            state.idleTimer = 2;
            setStatusMessage(state, "Setting player idle cursor to "+state.player.idleCursorType);
        } else if (activated('volumeMute')) {
            setVolumeMute(state, !state.volumeMute);
            setStatusMessage(state, 'Sound ' + (state.volumeMute ? 'disabled' : 'enabled'));
        } else if (activated('volumeDown')) {
            const soundVolume = Math.max(0.1, state.soundVolume - 0.1);
            setSoundVolume(state, soundVolume);
            setStatusMessage(state, 'Sound volume ' + Math.floor(state.soundVolume * 100 + 0.5) + '%');
        } else if (activated('volumeUp')) {
            const soundVolume = Math.min(1.0, state.soundVolume + 0.1);
            setSoundVolume(state, soundVolume);
            setStatusMessage(state, 'Sound volume ' + Math.floor(state.soundVolume * 100 + 0.5) + '%');
        } else if (activated('showSpeech')) {
            state.popups.currentPopupTimeRemaining = (state.popups.currentPopupTimeRemaining > 0) ? 0 : 2;
        }
    }
}

function scoreCompletedLevel(state: State) {
    if(state.gameMapRoughPlans[state.level].played) {
        return;
    }
    state.gameMapRoughPlans[state.level].played = true;

    const ghosted = state.levelStats.numSpottings === 0;
    const numTurnsPar = numTurnsParForCurrentMap(state);
    const timeBonus = Math.max(0, numTurnsPar - state.turns);
    const lootScore = state.lootStolen * 10;
    const treasureScore = state.treasureStolen * 40;
    const foodScore = state.levelStats.extraFoodCollected * 5;
    const ghostBonus = ghosted ? lootScore : 0;
    const score = lootScore + treasureScore + foodScore + timeBonus + ghostBonus;

    state.gameStats.totalScore += score;
    state.gameStats.turns += state.totalTurns;
    state.gameStats.numLevels = state.gameMapRoughPlans.length;
    state.gameStats.numCompletedLevels = state.level + 1;
    state.gameStats.numGhostedLevels += ghosted ? 1 : 0;
    state.gameStats.daily = state.dailyRun;
    state.gameStats.timeEnded = Date.now();
}

function scoreIncompleteLevel(state: State) {
    if(state.gameMapRoughPlans[state.level].played) {
        return;
    }
    state.gameMapRoughPlans[state.level].played = true;

    const score = state.lootStolen * 10 + state.levelStats.extraFoodCollected * 5;

    state.gameStats.totalScore += score;
    state.gameStats.turns += state.totalTurns;
    state.gameStats.numLevels = state.gameMapRoughPlans.length;
    state.gameStats.numCompletedLevels = state.level;
    state.gameStats.daily = state.dailyRun;
    state.gameStats.timeEnded = Date.now();
}

function clearLevelStats(levelStats: LevelStats) {
    levelStats.numKnockouts = 0;
    levelStats.numSpottings = 0;
    levelStats.damageTaken = 0;
    levelStats.extraFoodCollected = 0;
}

function updateAchievements(state: State, type:'turnEnd'|'levelEnd'|'gameEnd'|'gameStart') {
    let key:keyof Achievements;
    for(key in state.achievements) {
        state.achievements[key].update(state, type);
    }
}

function persistAchievements(state: State) {
    let key:keyof Achievements;
    let pKey:keyof PersistedStats;
    for(key in state.achievements) {
        if(key in state.persistedStats) {
            pKey = key;
            if(state.achievements[key].complete) {
                state.persistedStats[pKey]++;
                setStat(pKey, state.persistedStats[pKey]);
            }
        }
    }
}

export function setupLevel(state: State, level: number) {
    state.level = level;
    if (state.level >= gameConfig.numGameMaps) {
        restartGame(state);
        return;
    }

    state.activeSoundPool.empty();
    state.gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.lightStates = new Array(state.gameMap.lightCount).fill(0);
    setLights(state.gameMap, state);
    setCellAnimations(state.gameMap, state);
    state.topStatusMessage = '';
    state.topStatusMessageSlide = 1;
    state.finishedLevel = false;

    state.turns = 0;
    state.lootStolen = 0;
    state.treasureStolen = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;

    clearLevelStats(state.levelStats);

    state.player.pos = state.gameMap.playerStartPos;
    state.player.dir = vec2.fromValues(0, -1);
    state.player.noisy = false;
    state.player.preNoisy = false;
    state.player.hasVaultKey = false;
    state.player.damagedLastTurn = false;
    state.player.turnsRemainingUnderwater = maxPlayerTurnsUnderwater;
    state.player.animation = null;
    state.popups.reset();

    state.camera = createCamera(state.gameMap.playerStartPos, state.zoomLevel);
    state.camera.zoomed = (level !== 0);
    state.gameMode = GameMode.Mansion;

    chooseGuardMoves(state);
    postTurn(state);

//    analyzeLevel(state);
}

function analyzeLevel(state: State) {
    const numDiscoverableCells = state.gameMap.numCells() - state.gameMap.numPreRevealedCells;
    const numCellsTraversal = numDiscoverableCells * state.gameMap.backtrackingCoefficient;
    const numGuards = state.gameMap.guards.length;
    const guardsPerCell = numGuards / numCellsTraversal;
    const turnsForTraversal = numCellsTraversal / 3.5;
    const turnsForGuardAvoidance = 8 * numGuards + 1000 * guardsPerCell;
    const par = 10 * Math.ceil((turnsForTraversal + turnsForGuardAvoidance) / 10);
    console.log('Level:', state.level);
    console.log('Discoverable cells:', numDiscoverableCells);
    console.log('Backtracking coefficient:', state.gameMap.backtrackingCoefficient);
    console.log('Number of guards:', numGuards);
    console.log('Guards per cell:', guardsPerCell);
    console.log('Turns for discovery:', turnsForTraversal);
    console.log('Turns for guards:', turnsForGuardAvoidance);
    console.log('Par:', par);
}

export function numTurnsParForCurrentMap(state: State): number {
    const numDiscoverableCells = state.gameMap.numCells() - state.gameMap.numPreRevealedCells;
    const numCellsTraversal = numDiscoverableCells * state.gameMap.backtrackingCoefficient;
    const numGuards = state.gameMap.guards.length;
    const guardsPerCell = numGuards / numCellsTraversal;
    const turnsForTraversal = numCellsTraversal / 3.5;
    const turnsForGuardAvoidance = 8 * numGuards + 1000 * guardsPerCell;
    const par = 10 * Math.ceil((turnsForTraversal + turnsForGuardAvoidance) / 10);
    return par;
}

const mansionCompleteTopStatusHint: Array<string> = [
    'Use darkness or hiding places to avoid guards',
    'Escape out windows with Shift+Dir',
    'Knock out adjacent, unaware guards with Shift+Dir',
    'Pickpocket by following exactly for two turns',
    'Zoom view with [ and ]',
    'Bang walls to make noise with Shift+Dir',
    '\'Ghost\' by never being fully seen',
    'Knock out spotting guard by leaping onto them',
];

function advanceToMansionComplete(state: State) {
    scoreCompletedLevel(state);
    updateAchievements(state, "levelEnd");
    state.activeSoundPool.empty();
    state.sounds['levelCompleteJingle'].play(0.35);
    if(state.levelStats.numSpottings === 0) {
        state.persistedStats.totalGhosts++;
        setStat('totalGhosts',state.persistedStats.totalGhosts);
    }

    if (state.level < mansionCompleteTopStatusHint.length) {
        state.topStatusMessage = '\xFF: ' + mansionCompleteTopStatusHint[state.level];
    } else {
        state.topStatusMessage = '';
    }

    state.gameMode = GameMode.MansionComplete;
}

export function advanceToWin(state: State) {
    const victorySong = (Math.random() < 0.1) ? 'easterEgg' : 'victorySong';
    state.sounds[victorySong].play(0.5);
    state.persistedStats.totalWins++;
    const score = state.gameStats.totalScore;
    state.persistedStats.bestScore = Math.max(state.persistedStats.bestScore, score);
    const scoreEntry: ScoreEntry = {
        score: score,
        date: getCurrentDateFormatted(),
        turns: state.totalTurns,
        level: state.level+1
    };
    updateAchievements(state, "gameEnd");
    state.persistedStats.scores.push(scoreEntry);
    if(state.dailyRun) {
        state.persistedStats.currentDailyBestScore = Math.max(state.persistedStats.currentDailyBestScore, score);
        state.persistedStats.currentDailyWins++;
        state.persistedStats.currentDailyWinFirstTry = state.persistedStats.currentDailyPlays===1?1:state.persistedStats.currentDailyWinFirstTry;
        state.persistedStats.lastPlayedDailyGame = structuredClone(state.gameStats);
        state.persistedStats.allDailyWins++;
        state.persistedStats.allDailyWinsFirstTry += state.persistedStats.currentDailyPlays===1?1:0;
        //TODO: notify user if the game was finished after the deadline
        // if(state.dailyRun===getCurrentDateFormatted()) state.scoreServer.addScore(score, state.totalTurns, state.level+1);
    }
    saveStats(state.persistedStats);
    persistAchievements(state);

    state.gameMode = GameMode.Win;
}

function collectLoot(state: State, pos: vec2, posFlyToward: vec2): boolean {
    const itemsCollected = state.gameMap.collectLootAt(pos);
    if (itemsCollected.length === 0) {
        return false;
    }
    let coinCollected = false;
    let healthCollected = false;
    for (const item of itemsCollected) {
        let offset = 0;
        if (item.type === ItemType.Coin) {
            ++state.player.loot;
            ++state.lootStolen;
            coinCollected = true;
        } else if (item.type === ItemType.Treasure) {
            coinCollected = true;
            ++state.treasureStolen;
            offset = 0.625;
        } else if (item.type === ItemType.Health) {
            if (state.player.health >= maxPlayerHealth) {
                ++state.levelStats.extraFoodCollected;
            }
            state.player.health = Math.min(maxPlayerHealth, state.player.health + 1);
            healthCollected = true;
        }
        const pt0 = vec2.create();
        const pt2 = vec2.fromValues((posFlyToward[0]-item.pos[0]), (posFlyToward[1]-item.pos[1]+offset));
        const pt1 = pt2.scale(0.3333).add(vec2.fromValues(0,0.5+offset/2));
        const animation = new SpriteAnimation([
                {pt0:pt0, pt1:pt1, duration:0.1, fn:tween.easeOutQuad},
                {pt0:pt1, pt1:pt2, duration:0.1, fn:tween.easeInQuad}
            ], 
            [
                tileSet.itemTiles[item.type], 
                tileSet.itemTiles[item.type]
            ]
        );
        animation.removeOnFinish = true;
        item.animation = animation;
        state.particles.push(item);
    }

    if (coinCollected) {
        state.sounds.coin.play(1.0);
    }
    if (healthCollected) {
        // TODO: Play health pickup sound
    }

    return true;
}

function canStepToPos(state: State, pos: vec2): boolean {

    // Cannot step off map if level is unfinished

    if (pos[0] < 0 || pos[0] >= state.gameMap.cells.sizeX ||
        pos[1] < 0 || pos[1] >= state.gameMap.cells.sizeY) {
        if (!state.finishedLevel) {
            return false;
        }
    }

    // Cannot step onto walls or windows

    const cellNew = state.gameMap.cells.atVec(pos);
    if (cellNew.blocksPlayerMove) {
        return false;
    }

    if (isOneWayWindowTerrainType(cellNew.type)) {
        return false;
    }

    // Cannot step onto torches, portcullises, treasure boxes or treasure

    for (const item of state.gameMap.items.filter((item) => item.pos.equals(pos))) {
        switch (item.type) {
        case ItemType.DrawersShort:
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
        case ItemType.PortcullisEW:
        case ItemType.PortcullisNS:
        case ItemType.TreasureLockBox:
        case ItemType.Treasure:
            return false;
        }
    }

    // Cannot step onto guards

    if (state.gameMap.guards.find((guard)=>guard.pos.equals(pos))) {
        return false;
    }

    return true;
}

function canLeapToPosDisregardingGuard(state: State, pos: vec2): boolean {
    // Cannot leap off map if level is unfinished

    if (pos[0] < 0 || pos[0] >= state.gameMap.cells.sizeX ||
        pos[1] < 0 || pos[1] >= state.gameMap.cells.sizeY) {
        if (!state.finishedLevel) {
            return false;
        }
    }

    // Cannot leap onto a wall, window, portcullis, or door

    const cellNew = state.gameMap.cells.atVec(pos);
    if (cellNew.blocksPlayerMove) {
        return false;
    }

    if (isOneWayWindowTerrainType(cellNew.type)) {
        return false;
    }

    if (cellNew.type === TerrainType.PortcullisNS || cellNew.type === TerrainType.PortcullisEW) {
        return false;
    }

    if ((cellNew.type === TerrainType.DoorNS || cellNew.type === TerrainType.DoorEW) &&
        state.gameMap.items.find((item)=>item.pos.equals(pos) && isDoorItemType(item.type))) {
        return false;
    }

    // Cannot leap onto a blocking item

    if (state.gameMap.items.find((item)=>item.pos.equals(pos) && !canLeapOntoItemType(item.type))) {
        return false;
    }

    return true;
}

function canLeapToPos(state: State, pos: vec2): boolean {

    if (!canLeapToPosDisregardingGuard(state, pos)) {
        return false;
    }

    // Cannot leap onto a stationary guard

    if (state.gameMap.guards.find((guard)=>guard.pos.equals(pos) && !guard.allowsMoveOntoFrom(state.player.pos))) {
        return false;
    }

    return true;
}

function playMoveSound(state: State, cellOld: Cell, cellNew: Cell) {
    // Hide sound effect

    if (cellNew.hidesPlayer) {
        state.sounds['hide'].play(0.2);
        return;
    }

    // Water exit sound

    const volScale = 0.5 + Math.random()/2;
    const changedTile = cellOld.type !== cellNew.type;

    if (changedTile) {
        if (cellOld.type === TerrainType.GroundWater) {
            state.sounds['waterExit'].play(0.5*volScale);
            return;
        } else if (cellNew.type === TerrainType.GroundWater) {
            state.sounds['waterEnter'].play(0.5*volScale);
            return;
        }
    }

    // Terrain sound effects

    switch (cellNew.type) {
    case TerrainType.GroundWoodCreaky:
        state.sounds["footstepCreaky"].play(0.15*volScale);
        break;
    case TerrainType.GroundWood:
        if (changedTile || Math.random() > 0.9) state.sounds["footstepWood"].play(0.15*volScale);
        break;
    case TerrainType.GroundNormal:
        if (changedTile || Math.random() > 0.5) state.sounds["footstepGravel"].play(0.03*volScale);
        break;
    case TerrainType.GroundGrass:
        if (changedTile || Math.random() > 0.75) state.sounds["footstepGrass"].play(0.05*volScale);
        break;
    case TerrainType.GroundWater:
        if (changedTile || Math.random() > 0.6) state.sounds["footstepWater"].play(0.02*volScale);
        break;
    case TerrainType.GroundMarble:
        if (changedTile || Math.random() > 0.8) state.sounds["footstepTile"].play(0.05*volScale);
        break;
    case TerrainType.GroundVault:
        if (changedTile || Math.random() > 0.8) state.sounds["footstepTile"].play(0.05*volScale);
        break;
    default:
        if (changedTile || Math.random() > 0.8) state.sounds["footstepTile"].play(0.02*volScale);
        break;
    }    
}

function bumpAnim(state: State, dx: number, dy: number) {
    const pos0 = vec2.create();
    const pos1 = vec2.fromValues(dx/4, dy/4);

    state.player.animation = new SpriteAnimation(
        [
            {pt0:pos0, pt1:pos1, duration:0.05, fn:tween.linear},
            {pt0:pos1, pt1:pos0, duration:0.05, fn:tween.linear}
        ],
        [tileSet.playerTiles.normal]);
}

function bumpFail(state: State, dx: number, dy: number) {
    state.sounds['footstepTile'].play(0.1);
    bumpAnim(state, dx, dy);
}

function collectGuardLoot(state:State, player:Player, guard:Guard, posNew:vec2, animDelay:number=0) {
    let pickedItem:Item|null = null;
    player.pickTarget = null;
    if (guard.hasPurse) {
        guard.hasPurse = false;
        player.loot += 1;
        state.lootStolen += 1;
        pickedItem = {pos:vec2.clone(guard.pos), type:ItemType.Coin};
    }
    if (guard.hasVaultKey) {
        guard.hasVaultKey = false;
        player.hasVaultKey = true;
        pickedItem = {pos:vec2.clone(guard.pos), type:ItemType.Key};
    }
    if(pickedItem) {
        const pt0 = vec2.create();
        const pt2 = posNew.subtract(pickedItem.pos);
        const pt1 = pt2.scale(0.3333).add(vec2.fromValues(0,0.5));
        const animation = animDelay>0?
            new SpriteAnimation([
                    {pt0:pt0, pt1:pt0, duration:0.1, fn:tween.easeOutQuad},
                    {pt0:pt0, pt1:pt1, duration:0.1, fn:tween.easeOutQuad},
                    {pt0:pt1, pt1:pt2, duration:0.1, fn:tween.easeInQuad}
                ],
                [
                    tileSet.itemTiles[pickedItem.type], 
                    tileSet.itemTiles[pickedItem.type], 
                    tileSet.itemTiles[pickedItem.type]
                ]
            ):
            new SpriteAnimation([
                    {pt0:pt0, pt1:pt1, duration:0.1, fn:tween.easeOutQuad},
                    {pt0:pt1, pt1:pt2, duration:0.1, fn:tween.easeInQuad}
                ],
                [
                    tileSet.itemTiles[pickedItem.type], 
                    tileSet.itemTiles[pickedItem.type]
                ]
            );
        animation.removeOnFinish = true;
        pickedItem.animation = animation;
        state.particles.push(pickedItem);            

        state.sounds.coin.play(1.0);                        
    }
}

function pushOrSwapGuard(state: State, guard: Guard) {
    const posGuardOld = vec2.clone(guard.pos);
    const posPlayer = vec2.clone(state.player.pos);

    // Try to push the guard away from the player. If that doesn't work,
    //  exchange places with the player.

    const posGuardNew = vec2.create();
    vec2.subtract(posGuardNew, posGuardOld, posPlayer);
    vec2.add(posGuardNew, posGuardNew, posGuardOld);

    let pulledGuard = false;

    if (blocksPushedGuard(state, posGuardNew)) {
        vec2.copy(posGuardNew, posPlayer);
        pulledGuard = true;
    }

    // Update guard position
    vec2.copy(guard.pos, posGuardNew);

    // If guard ends up in water he wakes up immediately
    if (state.gameMap.cells.atVec(guard.pos).type === TerrainType.GroundWater) {
        guard.modeTimeout = 0;
    }

    // Animate guard sliding
    const gpos0 = vec2.clone(posGuardOld).subtract(guard.pos);
    const gpos1 = vec2.create();

    let tweenSeq;

    if (pulledGuard) {
        tweenSeq = [{pt0:gpos0, pt1:gpos1, duration:0.2, fn:tween.easeOutQuad}];
    } else {
        const gp = vec2.fromValues(0.5*(posGuardOld[0]-guard.pos[0]),0.5*(posGuardOld[1]-guard.pos[1]));
        tweenSeq = [
            {pt0:gpos0, pt1:gp, duration:0.2, fn:tween.easeInQuad},
            {pt0:gp, pt1:gpos1, duration:0.1, fn:tween.easeOutQuad},
        ];
    }

    guard.animation = new SpriteAnimation(tweenSeq, []);
}

function moveGuardToPlayerPos(state: State, guard: Guard) {
    // Update guard position
    const posGuardOld = vec2.clone(guard.pos);
    vec2.copy(guard.pos, state.player.pos);

    // Animate guard sliding
    const gpos0 = vec2.clone(posGuardOld).subtract(state.player.pos);
    const gpos1 = vec2.create();

    const tweenSeq = [{pt0:gpos0, pt1:gpos1, duration:0.2, fn:tween.easeOutQuad}];

    guard.animation = new SpriteAnimation(tweenSeq, []);
}

function blocksPushedGuard(state: State, posGuardNew: vec2): boolean {
    if (posGuardNew[0] < 0 ||
        posGuardNew[1] < 0 ||
        posGuardNew[0] >= state.gameMap.cells.sizeX ||
        posGuardNew[1] >= state.gameMap.cells.sizeY) {
        return true;
    }
    if (state.gameMap.cells.atVec(posGuardNew).moveCost === Infinity) {
        return true;
    }
    if (state.gameMap.guards.find((guard)=>guard.pos.equals(posGuardNew))) {
        return true;
    }

    for (const item of state.gameMap.items.filter((item) => item.pos.equals(posGuardNew))) {
        switch (item.type) {
        case ItemType.PortcullisEW:
        case ItemType.PortcullisNS:
            return true;

        case ItemType.LockedDoorEW:
        case ItemType.LockedDoorNS:
            if (!state.player.hasVaultKey) {
                return true;
            }
            break;
        }
    }

    return false;
}

export function joltCamera(state: State, dx: number, dy: number) {
    if (!state.screenShakeEnabled) {
        return;
    }

    vec2.scaleAndAdd(state.camera.joltVelocity, state.camera.joltVelocity, vec2.fromValues(dx, dy), -8);
}

function tryMakeBangNoise(state: State, dx: number, dy: number, stepType: StepType) {
    if (stepType === StepType.AttemptedLeap) {
        if (state.player.preNoisy && dx === state.player.noiseOffset[0] && dy === state.player.noiseOffset[1]) {
            preTurn(state);
            state.player.pickTarget = null;
            bumpAnim(state, dx*1.25, dy*1.25);
            joltCamera(state, dx, dy);
            makeNoise(state.gameMap, state.player, NoiseType.BangDoor, dx, dy, state.sounds);
            advanceTime(state);
            if (state.level === 0) {
                setStatusMessage(state, 'Noise attracts people');
            }
        } else {
            state.player.preNoisy = true;
            state.player.noiseOffset[0] = dx;
            state.player.noiseOffset[1] = dy;
            state.player.pickTarget = null;
            if (state.level === 0) {
                setStatusMessage(state, 'Make Noise (repeat): Shift+' + directionArrowCharacter(dx, dy));
            }
        }
    } else {
        // See if we are bumping a bookshelf; display the book title, if so.
        const x = state.player.pos[0] + dx;
        const y = state.player.pos[1] + dy;
        const item = state.gameMap.items.find(item =>
            item.pos[0] === x &&
            item.pos[1] === y &&
            item.type === ItemType.Bookshelf);
        if (item !== undefined) {
            preTurn(state);
            state.player.pickTarget = null;
            if (!state.gameMap.cells.at(x, y).lit) {
                state.player.lightActive = true;
            }
            bumpAnim(state, dx, dy);
            advanceTime(state);
            let title = state.gameMap.bookTitle.get(item);
            if (title === undefined) {
                title = 'Untitled';
            }
            title = '"' + title + '"';
            if (state.gameMap.treasureUnlock.numSwitchesUsed < state.gameMap.treasureUnlock.switches.length) {
                for (let i = 0; i < state.gameMap.treasureUnlock.switches.length; ++i) {
                    if (state.gameMap.treasureUnlock.switches[i][0] !== x ||
                        state.gameMap.treasureUnlock.switches[i][1] !== y) {
                        continue;
                    }
                    if (i === state.gameMap.treasureUnlock.numSwitchesUsed) {
                        ++state.gameMap.treasureUnlock.numSwitchesUsed;
                        if (state.gameMap.treasureUnlock.numSwitchesUsed >= state.gameMap.treasureUnlock.switches.length) {
                            state.sounds.switchSuccess.play(0.5);
                            title = '(rumble) ' + title;
                            joltCamera(state, dx, dy);
                            state.gameMap.items.push({
                                pos: vec2.clone(state.gameMap.treasureUnlock.posTreasure),
                                type: ItemType.Treasure,
                            });
                        } else {
                            state.sounds.switchProgress.play(0.5);
                            title = '(click) ' + title;
                        }
                    } else if (i === 0) {
                        state.sounds.switchProgress.play(0.5);
                        title = '(click) ' + title;
                        state.gameMap.treasureUnlock.numSwitchesUsed = 1;
                    } else {
                        state.sounds.switchReset.play(0.5);
                        title = '(clunk) ' + title;
                        state.gameMap.treasureUnlock.numSwitchesUsed = 0;
                    }
                    break;
                }
            }
            setStatusMessage(state, title);
        } else {
            bumpFail(state, dx, dy);
            if (state.level === 0) {
                setStatusMessage(state, 'Make Noise: Shift+' + directionArrowCharacter(dx, dy));
            }
        }
    }
}

function tryPlayerWait(state: State) {
    const player = state.player;

    // Can't move if you're dead.
    if (player.health <= 0) {
        return;
    }

    player.idle = false;
    state.idleTimer = 5;

    // Move camera with player by releasing any panning motion
    state.camera.panning = false;
    state.touchController.clearMotion();

    preTurn(state);

    state.gameMap.identifyAdjacentCells(player.pos);

    player.pickTarget = null;
    player.preNoisy = false;

    ++state.numWaitMoves;

    advanceTime(state);
}

function tryPlayerStep(state: State, dx: number, dy: number, stepType: StepType) {

    // Can't move if you're dead

    const player = state.player;
    if (player.health <= 0) {
        return;
    }

    if (stepType !== StepType.AttemptedLeap) {
        player.preNoisy = false;
    }

    player.idle = false;
    state.idleTimer = 5;

    // Move camera with player by releasing any panning motion

    state.camera.panning = false;
    state.touchController.clearMotion();

    // Get the player's current position and new position

    const posOld = vec2.clone(player.pos);
    const posNew = vec2.fromValues(player.pos[0] + dx, player.pos[1] + dy);

    // Trying to move off the map?

    if (posNew[0] < 0 || posNew[0] >= state.gameMap.cells.sizeX ||
        posNew[1] < 0 || posNew[1] >= state.gameMap.cells.sizeY) {

        if (!state.finishedLevel) {
            setStatusMessage(state, 'Collect all loot before leaving');
            bumpFail(state, dx, dy);
        } else {
            preTurn(state);
            advanceToMansionComplete(state);

            // Animate the player moving off the map edge
            // This is largely a simplified copy of the normal player-movement animation;
            // should probably be commonized

            const start = vec2.create();
            const end = vec2.clone(posNew).subtract(posOld);
            let mid = start.add(end).scale(0.5).add(vec2.fromValues(0,0.0625));

            const tweenSeq = [
                {pt0:start, pt1:mid, duration:0.1, fn:tween.easeInQuad},
                {pt0:mid, pt1:end, duration:0.1, fn:tween.easeOutQuad},
                {pt0:end, pt1:end, duration:(dy>0)?0.5:0.1, fn:tween.easeOutQuad}
            ];
        
            const tile = dx<0? tileSet.playerTiles.left:
                         dx>0? tileSet.playerTiles.right:
                         dy>0? tileSet.playerTiles.up:
                         tileSet.playerTiles.down;
            player.animation = new SpriteAnimation(tweenSeq, [tile, tile, tile, tile]);
        }
        return;
    }

    // Trying to move into solid terrain?

    const cellNew = state.gameMap.cells.atVec(posNew);
    if (cellNew.blocksPlayerMove) {
        if (collectLoot(state, posNew, player.pos)) {
            preTurn(state);
            player.pickTarget = null;
            bumpAnim(state, dx, dy);
            advanceTime(state);
        } else {
            tryMakeBangNoise(state, dx, dy, stepType);
        }
        return;
    }

    // Trying to go through the wrong way through a one-way window?

    if ((cellNew.type == TerrainType.OneWayWindowE && posNew[0] <= posOld[0]) ||
        (cellNew.type == TerrainType.OneWayWindowW && posNew[0] >= posOld[0]) ||
        (cellNew.type == TerrainType.OneWayWindowN && posNew[1] <= posOld[1]) ||
        (cellNew.type == TerrainType.OneWayWindowS && posNew[1] >= posOld[1])) {

        setStatusMessage(state, 'Window cannot be accessed from outside');

        if (state.level === 0) {
            setTimeout(()=>state.sounds['tooHigh'].play(0.3),250);
        }

        tryMakeBangNoise(state, dx, dy, stepType);
        return;
    }

    // Trying to move into a one-way window instead of leaping through?

    if (isOneWayWindowTerrainType(cellNew.type)) {
        setLeapStatusMessage(state, dx, dy);

        if (state.level === 0) {
            setTimeout(()=>state.sounds['jump'].play(0.3), 250);
        }

        bumpFail(state, dx, dy);
        return;
    }

    // Trying to move into an item that blocks movement?

    for (const item of state.gameMap.items.filter((item) => item.pos.equals(posNew))) {
        switch (item.type) {
        case ItemType.DrawersShort:
            if (canLeapToPos(state, vec2.fromValues(posOld[0] + 2*dx, posOld[1] + 2*dy))) {
                setLeapStatusMessage(state, dx, dy);
            }
            if (collectLoot(state, posNew, player.pos)) {
                preTurn(state);
                player.pickTarget = null;
                bumpAnim(state, dx, dy);
                advanceTime(state);
            } else {
                tryMakeBangNoise(state, dx, dy, stepType);
            }
            return;

        case ItemType.TreasureLockBox:
            preTurn(state);
            if(collectLoot(state, posNew, player.pos)) {
                player.pickTarget = null;
                player.itemUsed = item;
                bumpAnim(state, dx, dy);
                advanceTime(state);    
            } else {
                bumpAnim(state, dx, dy);
                setLeapStatusMessage(state, dx, dy);
            }
            return;

        case ItemType.TorchUnlit:
            preTurn(state);
            state.sounds["ignite"].play(0.08);
            item.type = ItemType.TorchLit;
            player.pickTarget = null;
            player.itemUsed = item;
            bumpAnim(state, dx, dy);
            advanceTime(state);
            return;

        case ItemType.TorchLit:
            preTurn(state);
            state.sounds["douse"].play(0.05);
            item.type = ItemType.TorchUnlit;
            player.pickTarget = null;
            player.itemUsed = item;
            bumpAnim(state, dx, dy);
            advanceTime(state);
            return;

        case ItemType.PortcullisEW:
        case ItemType.PortcullisNS:
            setLeapStatusMessage(state, dx, dy);
            state.sounds['gate'].play(0.3);
            if (state.level === 0) {
                setTimeout(()=>state.sounds['jump'].play(0.3), 1000);
            }
            bumpAnim(state, dx, dy);
            return;

        case ItemType.LockedDoorEW:
        case ItemType.LockedDoorNS:
            if (!player.hasVaultKey) {
                setStatusMessage(state, 'Locked!');

                tryMakeBangNoise(state, dx, dy, stepType);
                return;
            }
            break;
        }
    }

    // Trying to move onto a guard?

    const guard = state.gameMap.guards.find((guard) => guard.pos.equals(posNew));
    if (guard === undefined) {
        player.pickTarget = null;
    } else if (guard.mode === GuardMode.Unconscious) {
        player.pickTarget = null;
        pushOrSwapGuard(state, guard);
    } else if (guard.mode === GuardMode.ChaseVisibleTarget) {
        bumpFail(state, dx, dy);
        return;
    } else {
        let needGuardLootCollect = false;
        if (guard.hasPurse || guard.hasVaultKey) {
            // If we have already targeted this guard, pick their pocket; otherwise target them
            if (player.pickTarget === guard) {
                needGuardLootCollect = true;
            } else {
                player.pickTarget = guard;
            }
        }

        // If the guard is stationary, pass time in place
        if (!guard.allowsMoveOntoFrom(player.pos)) {
            if(needGuardLootCollect) collectGuardLoot(state, player, guard, posOld);
            preTurn(state);
            advanceTime(state);
            return;
        }
        if(needGuardLootCollect) collectGuardLoot(state, player, guard, posNew);
    }

    // Execute the move
    const fromHid = player.hidden(state.gameMap);

    preTurn(state);

    vec2.copy(player.pos, posNew);
    ++state.numStepMoves;

    // Identify creaky floors nearby

    state.gameMap.identifyAdjacentCells(player.pos);

    // Animate player moving

    const start = vec2.clone(posOld).subtract(posNew);
    const end = vec2.create();
    const mid = start.add(end).scale(0.5).add(vec2.fromValues(0,0.0625));
    const hid = player.hidden(state.gameMap);

    let tweenSeq: Array<TweenData>;

    if (guard !== undefined && guard.mode === GuardMode.Unconscious) {
        const gp = vec2.fromValues(0.5*(posOld[0]-posNew[0]),0.5*(posOld[1]-posNew[1]));
        tweenSeq = [
            {pt0:start, pt1:gp, duration:0.2, fn:tween.easeInQuad},
            {pt0:gp, pt1:end, duration:0.1, fn:tween.easeOutQuad},
        ];
    } else {
        const dtStep = (stepType === StepType.AttemptedLeapBounceBack) ? 0.05 : 0.1;
        tweenSeq = [
            {pt0:start, pt1:mid, duration:dtStep, fn:tween.easeInQuad},
            {pt0:mid, pt1:end, duration:dtStep, fn:tween.easeOutQuad},
            {pt0:end, pt1:end, duration:(dy>0 && !hid)?0.5:0.1, fn:tween.easeOutQuad}
        ]
        if(dy>0 && !hid) tweenSeq.push({pt0:end, pt1:end, duration:0.1, fn:tween.easeOutQuad})
    }

    const baseTile =    dx<0? tileSet.playerTiles.left:
                        dx>0? tileSet.playerTiles.right:
                        dy>0? tileSet.playerTiles.up:
                        tileSet.playerTiles.down;
    const tile1 = fromHid? tileSet.playerTiles.hidden:baseTile;
    const tile2 = hid? tileSet.playerTiles.hidden:baseTile;
    const tile3 = hid? tileSet.playerTiles.hidden:tileSet.playerTiles.left;
    player.animation = new SpriteAnimation(tweenSeq, [tile1, tile2, tile2, tile3]);

    // Collect loot

    collectLoot(state, player.pos, posNew);

    // Generate movement AI noises

    if (cellNew.type === TerrainType.GroundWoodCreaky) {
        makeNoise(state.gameMap, player, NoiseType.Creak, 0, -1, state.sounds);
    }

    // Let guards take a turn

    advanceTime(state);

    // Play sound for terrain type changes

    playMoveSound(state, state.gameMap.cells.atVec(posOld), cellNew);
}

function tryPlayerLeap(state: State, dx: number, dy: number) {

    // Can't move if you're dead

    const player = state.player;
    if (player.health <= 0) {
        return;
    }

    player.idle = false;
    state.idleTimer = 5;

    // Move camera with player by releasing any panning motion

    state.camera.panning = false;
    state.touchController.clearMotion();

    // Get the player's current position and new position, and the middle position between them

    const posOld = vec2.clone(player.pos);
    const posMid = vec2.fromValues(player.pos[0] + dx, player.pos[1] + dy);
    const posNew = vec2.fromValues(player.pos[0] + 2*dx, player.pos[1] + 2*dy);

    const cellOld = state.gameMap.cells.atVec(posOld)
    const cellMid = state.gameMap.cells.atVec(posMid);
    const cellNew = state.gameMap.cells.atVec(posNew);


    // If an unaware guard is adjacent in the leap direction, knock them unconscious

    const guardMid = state.gameMap.guards.find((guard) =>
        guard.pos.equals(posMid) &&
        guard.mode !== GuardMode.Unconscious);

    if (guardMid) {
        if (cellMid.type===TerrainType.PortcullisEW ||
            cellMid.type===TerrainType.PortcullisNS) {
            //Can't attack or leap over a guard on a portcullis
            tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);             
            return;
        } else if (guardMid.mode === GuardMode.ChaseVisibleTarget) {
            // Swap places with the guard
            moveGuardToPlayerPos(state, guardMid);
            tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        } else {
            preTurn(state);

            guardMid.mode = GuardMode.Unconscious;
            guardMid.modeTimeout = Math.max(1, 40 - 2*state.level) + randomInRange(20);
            if (guardMid.hasPurse || guardMid.hasVaultKey) {
                collectGuardLoot(state, player, guardMid, posOld);
            }
            player.pickTarget = null;
            ++state.levelStats.numKnockouts;
            state.sounds.hitGuard.play(0.25);
        
            advanceTime(state);
    
            bumpAnim(state, dx, dy);

            joltCamera(state, dx, dy);
        }
        return;
    }

    // If player is in water, downgrade to a step

    if (cellOld.type === TerrainType.GroundWater) {
        tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        return;
    }

    // If the endpoint is off the map, downgrade to a step

    if (posNew[0] < 0 ||
        posNew[1] < 0 ||
        posNew[0] >= state.gameMap.cells.sizeX ||
        posNew[1] >= state.gameMap.cells.sizeY) {
        tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        return;
    }

    // If the midpoint is a wall, downgrade to a step

    if (cellMid.blocksPlayerMove) {
        tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        return;
    }

    // If the midpoint is a door, downgrade to a step

    if ((cellMid.type === TerrainType.DoorNS || cellMid.type === TerrainType.DoorEW) &&
        state.gameMap.items.find((item)=>item.pos.equals(posMid) && isDoorItemType(item.type))) {
        tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        return;
    }

    // If the midpoint is a one-way window but is the wrong way, downgrade to a step

    if ((cellMid.type == TerrainType.OneWayWindowE && posNew[0] <= posOld[0]) ||
        (cellMid.type == TerrainType.OneWayWindowW && posNew[0] >= posOld[0]) ||
        (cellMid.type == TerrainType.OneWayWindowN && posNew[1] <= posOld[1]) ||
        (cellMid.type == TerrainType.OneWayWindowS && posNew[1] >= posOld[1])) {
        tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        return;
    }

    // If the leap destination is blocked, try a step if it can succeeed; else fail

    const guard = state.gameMap.guards.find((guard) => guard.pos.equals(posNew));
    if (!canLeapToPos(state, posNew)) {
        if (canStepToPos(state, posMid)) {
            if (guard !== undefined && 
                guard.overheadIcon() === GuardStates.Alerted &&
                cellNew.type !== TerrainType.PortcullisEW &&
                cellNew.type !== TerrainType.PortcullisNS) {
                // Leaping attack: An alert guard at posNew will be KO'd and looted with player landing at posMid
                executeLeapAttack(state, player, guard, dx, dy, posOld, posMid, posNew);
            } else {
                tryPlayerStep(state, dx, dy, StepType.AttemptedLeapBounceBack);
            }
        } else {
            tryPlayerStep(state, dx, dy, StepType.AttemptedLeap);
        }
        return;
    }

    // Handle a guard at the endpoint
    if (guard === undefined || !(guard.hasPurse || guard.hasVaultKey)) {
        player.pickTarget = null;
    } else {
        player.pickTarget = guard;
    }

    // Execute the leap

    preTurn(state);

    // Collect any loot from posMid

    collectLoot(state, posMid, posNew);

    // Extinguish torch at posMid

    const torchMid = state.gameMap.items.find((item)=>item.pos.equals(posMid) && item.type === ItemType.TorchLit);
    if (torchMid !== undefined) {
        state.sounds["douse"].play(0.05);
        torchMid.type = ItemType.TorchUnlit;
        player.itemUsed = torchMid;
    }

    // End level if moving off the map

    if (posNew[0] < 0 ||
        posNew[1] < 0 ||
        posNew[0] >= state.gameMap.cells.sizeX ||
        posNew[1] >= state.gameMap.cells.sizeY) {
        advanceToMansionComplete(state);

        // Animate player moving off the map

        const start = vec2.create();
        const end = vec2.clone(posNew).subtract(posOld);
        let mid = start.add(end).scale(0.5).add(vec2.fromValues(0,0.25));
        const tile = dx<0? tileSet.playerTiles.left:
                     dx>0? tileSet.playerTiles.right:
                     dy>0? tileSet.playerTiles.up:
                     tileSet.playerTiles.down;
    
        const tweenSeq = [
            {pt0:start, pt1:mid, duration:0.1, fn:tween.easeInQuad},
            {pt0:mid, pt1:end, duration:0.1, fn:tween.easeOutQuad},
            {pt0:end, pt1:end, duration:(dy>0)?0.5:0.1, fn:tween.easeOutQuad}
        ]
    
        player.animation = new SpriteAnimation(tweenSeq, [tile, tile, tile]);
    
        return;
    }

    // Update player position

    vec2.copy(player.pos, posNew);
    ++state.numLeapMoves;

    // Identify creaky floor under player
    cellNew.identified = true;

    // Animate player moving

    const start = vec2.clone(posOld).subtract(posNew);
    const end = vec2.create();
    let mid = start.add(end).scale(0.5).add(vec2.fromValues(0,0.25));
    const tile = dx<0? tileSet.playerTiles.left:
                 dx>0? tileSet.playerTiles.right:
                 dy>0? tileSet.playerTiles.up:
                 tileSet.playerTiles.down;

    const hid = player.hidden(state.gameMap);
    const tweenSeq = [
        {pt0:start, pt1:mid, duration:0.1, fn:tween.easeInQuad},
        {pt0:mid, pt1:end, duration:0.1, fn:tween.easeOutQuad},
        {pt0:end, pt1:end, duration:(dy>0 && !hid)?0.5:0.1, fn:tween.easeOutQuad}
    ]
    if(dy>0 && !hid) tweenSeq.push({pt0:end, pt1:end, duration:0.1, fn:tween.easeOutQuad})

    const tile2 = hid? tileSet.playerTiles.hidden : tile;
    player.animation = new SpriteAnimation(tweenSeq, [tile, tile2, tile2, tileSet.playerTiles.left]);

    // Collect any loot from posNew

    collectLoot(state, posNew, posNew);

    // Generate movement AI noises

    /*
    if (state.gameMap.items.find((item)=>item.pos.equals(posNew) && item.type === ItemType.Chair)) {
        makeNoise(state.gameMap, player, NoiseType.BangChair, 0, 0, state.sounds);
    } else
    */
    if (cellNew.type === TerrainType.GroundWoodCreaky) {
        makeNoise(state.gameMap, player, NoiseType.Creak, 0, -1, state.sounds);
    } else if (cellNew.type === TerrainType.GroundWater) {
        makeNoise(state.gameMap, player, NoiseType.Splash, 0, 0, state.sounds);
    }

    // Let guards take a turn

    advanceTime(state);

    // Play sound for terrain type changes

    playMoveSound(state, state.gameMap.cells.atVec(posOld), cellNew);

    if (cellMid.type === TerrainType.PortcullisNS || cellMid.type === TerrainType.PortcullisEW) {
        state.sounds['gate'].play(0.3);
    }
}

function executeLeapAttack(state: State, player:Player, target:Guard, dx:number, dy:number, posOld:vec2, posMid:vec2, posNew:vec2) {
    // Execute the leaping attack that will finish at posMid

    preTurn(state);

    // Collect any loot from posMid

    collectLoot(state, posMid, posNew);

    // Update player position

    vec2.copy(player.pos, posMid);
    ++state.numLeapMoves;

    target.mode = GuardMode.Unconscious;
    target.modeTimeout = Math.max(1, 40 - 2*state.level) + randomInRange(20);
    if (target.hasPurse || target.hasVaultKey) {
        collectGuardLoot(state, player, target, posMid, 0.15);
    }
    player.pickTarget = null;
    ++state.levelStats.numKnockouts;
    state.sounds.hitGuard.play(0.25);


    // Identify creaky floor under player

    const cellMid = state.gameMap.cells.atVec(posMid);
    cellMid.identified = true;

    // Animate player moving

    const start = vec2.clone(posOld).subtract(posMid);
    const mid = vec2.clone(posNew).subtract(posMid).scale(0.5).add(vec2.fromValues(0,0.25));
    const end = vec2.create();
    // let smid = start.add(mid).scale(0.5).add(vec2.fromValues(0,0.25));
    // let emid = mid.add(end).scale(0.5).add(vec2.fromValues(0,0.25));
    const tile = dx<0? tileSet.playerTiles.left:
                dx>0? tileSet.playerTiles.right:
                dy>0? tileSet.playerTiles.up:
                tileSet.playerTiles.down;

    const hid = player.hidden(state.gameMap);
    const tweenSeq = [
        {pt0:start, pt1:mid, duration:0.15, fn:tween.easeInQuad},
        {pt0:mid, pt1:end, duration:0.1, fn:tween.easeOutQuad},
        {pt0:end, pt1:end, duration:(dy>0 && !hid)?0.5:0.1, fn:tween.easeOutQuad}
    ]
    if(dy>0 && !hid) tweenSeq.push({pt0:end, pt1:end, duration:0.1, fn:tween.easeOutQuad})

    const tile2 = hid? tileSet.playerTiles.hidden : tile;
    player.animation = new SpriteAnimation(tweenSeq, [tile, tile2, tile2, tileSet.playerTiles.left]);

    // Generate movement AI noises

    if (cellMid.type === TerrainType.GroundWoodCreaky) {
        makeNoise(state.gameMap, player, NoiseType.Creak, 0, -1, state.sounds);
    } else if (cellMid.type === TerrainType.GroundWater) {
        makeNoise(state.gameMap, player, NoiseType.Splash, 0, 0, state.sounds);
    }

    joltCamera(state, dx, dy);
    makeNoise(state.gameMap, player, NoiseType.Thud, dx, dy, state.sounds);

    // Let guards take a turn

    advanceTime(state);

    // Play sound for terrain type changes

    playMoveSound(state, state.gameMap.cells.atVec(posOld), cellMid);

}

function canLeapOntoItemType(itemType: ItemType): boolean {
    switch (itemType) {
        case ItemType.DrawersShort:
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
        case ItemType.TreasureLockBox:
        case ItemType.Treasure:
            return false;
        default:
            return true;
    }
}

function isOneWayWindowTerrainType(terrainType: TerrainType): boolean {
    switch (terrainType) {
        case TerrainType.OneWayWindowE:
        case TerrainType.OneWayWindowW:
        case TerrainType.OneWayWindowN:
        case TerrainType.OneWayWindowS:
            return true;
        default:
            return false;
    }
}

function makeNoise(map: GameMap, player: Player, noiseType: NoiseType, dx: number, dy: number, sounds: Howls) {
    player.noisy = true;
    player.noiseOffset[0] = dx;
    player.noiseOffset[1] = dy;

    const radius = 23;

    switch (noiseType) {
        case NoiseType.Creak:
            sounds.footstepCreaky.play(0.6);
            break;
        case NoiseType.Splash:
            sounds.splash.play(0.5);
            break;
        case NoiseType.Thud:
            // Sound effect currently played in executeLeapAttack
            break;
        case NoiseType.BangDoor:
            sounds.thump.play(0.5);
            break;
        case NoiseType.BangChair:
            // TODO: sound effect
            break;
    }

    let foundClosestGuard = false;

    for (const guard of map.guardsInEarshot(player.pos, radius)) {
        guard.heardThief = true;
        if (!foundClosestGuard) {
            foundClosestGuard = true;
            guard.heardThiefClosest = true;
        }
    }
}

function preTurn(state: State) {
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
    state.player.itemUsed = null;
    state.player.lightActive = false;
}

function advanceTime(state: State) {
    const oldHealth = state.player.health;
    state.player.preNoisy = false;
    ++state.turns;
    ++state.totalTurns;
    if (state.gameMap.cells.atVec(state.player.pos).type == TerrainType.GroundWater) {
        if (state.player.turnsRemainingUnderwater > 0) {
            --state.player.turnsRemainingUnderwater;

            if (state.player.turnsRemainingUnderwater <= 0) {
                state.sounds['waterExit'].play(0.25);
            }
        }
    } else {
        state.player.turnsRemainingUnderwater = maxPlayerTurnsUnderwater;
    }

    state.gameMap.computeLighting(state.player);

    guardActAll(state);

    state.gameMap.recomputeVisibility(state.player.pos);

    chooseGuardMoves(state);
    postTurn(state);

    if (oldHealth > state.player.health) {
        state.sounds['hitPlayer'].play(0.5);

        if (state.player.health <= 0) {
            setTimeout(()=>state.sounds['gameOverJingle'].play(0.5), 1000);
            scoreIncompleteLevel(state);
            state.persistedStats.bestScore = Math.max(state.persistedStats.bestScore, state.gameStats.totalScore);
            const scoreEntry: ScoreEntry = {
                score: state.gameStats.totalScore,
                date: getCurrentDateFormatted(),
                turns: state.totalTurns,
                level: state.level+1
            };
            state.persistedStats.scores.push(scoreEntry);        
            if(state.dailyRun) {
                state.persistedStats.currentDailyBestScore=Math.max(state.persistedStats.currentDailyBestScore, state.gameStats.totalScore);
                state.persistedStats.lastPlayedDailyGame = structuredClone(state.gameStats);
//                setStat('lastDaily', state.gameStats);
            }
            saveStats(state.persistedStats);
        }
    }

    updateAchievements(state, "turnEnd");
}

function postTurn(state: State) {
    const allSeen = state.gameMap.allSeen();
    const allLooted = state.lootStolen >= state.lootAvailable;

    if (allSeen && allLooted) {
        if(!state.finishedLevel) {
            state.sounds['levelRequirementJingle'].play(0.5);
        }
        state.finishedLevel = true;
    }

    const hintMessage = statusBarMessage(state);
    state.playerHintMessageIsNew = state.playerHintMessage!==hintMessage && hintMessage!=='';
    state.playerHintMessage = hintMessage;
    setStatusMessage(state, hintMessage!=''?'\xFF '+hintMessage:'');
}

function statusBarMessage(state: State): string {
    if (state.player.health <= 0) {
        return 'You were killed. Press Escape/Menu to see score.';
    }

    const allSeen = state.gameMap.allSeen();
    const allLooted = state.lootStolen >= state.lootAvailable;

    if (allSeen) {
        if (allLooted) {
            return 'Loot collected! Exit any map edge';
        } else if (state.level < 3) {
            return 'Collect all loot';
        }
    }

    if (state.level === 0) {
        const item = state.gameMap.items.find(item=>item.pos.equals(state.player.pos));
        const cell = state.gameMap.cells.atVec(state.player.pos);
        if (cell.type == TerrainType.GroundWater) {
            if (state.player.turnsRemainingUnderwater > 0) {
                return 'Hold breath and hide underwater';
            } else {
                return 'Exit water regain your breath';
            }
        } else if (item !== undefined && item.type === ItemType.Bush) {
            return 'Hide in bushes';
        } else if (item !== undefined && item.type === ItemType.Table) {
            return 'Hide under tables';
        } else if (item !== undefined && (item.type === ItemType.BedL || item.type === ItemType.BedR)) {
            return 'Hide under beds';
        } else if (state.numStepMoves < 4) {
            return ((state.numStepMoves > 0) ? '\xfb' : '\x07') + ' Move: \x18\x19\x1b\x1a';
        } else if (state.numLeapMoves < 4) {
            return ((state.numLeapMoves > 0) ? '\xfb' : '\x07') + ' Leap/Run: Shift+Direction';
        } else {
            return 'Explore entire mansion';
        }
    } else if (state.level === 1) {
        if (state.turns < 10) {
            if (state.numWaitMoves < 4) {
                return ((state.numWaitMoves > 0) ? '\xfb' : '\x07') + ' Wait: Z, Period, or Space';
            } else if (!state.hasOpenedMenu) {
                return 'Esc or Slash: More help';
            }
        }
    } else if (state.level === 3) {
        if (allSeen && !allLooted && remainingLootIsOnGuard(state)) {
            if (state.player.pickTarget !== null || adjacentToUnawareGuardWithLoot(state)) {
                return 'Step to pickpocket or leap to knock out';
            } else {
                return 'Move or leap from behind into loot-carrying guard';
            }
        } else if (state.numZoomMoves < 4 && state.turns < 10) {
            return ((state.numZoomMoves > 0) ? '\xfb' : '\x07') + ' Zoom View: [ or ]';
        }
    }

    return '';
}

function setLeapStatusMessage(state: State, dx: number, dy: number) {
    setStatusMessage(state, 'Leap: Shift+' + directionArrowCharacter(dx, dy));
}

function directionArrowCharacter(dx: number, dy: number): string {
    if (dx > 0) {
        return '\x1a';
    } else if (dx < 0) {
        return '\x1b';
    } else if (dy > 0) {
        return '\x18';
    } else if (dy < 0) {
        return '\x19';
    }
    return '\x07';
}

function remainingLootIsOnGuard(state: State): boolean {
    const lootOnGround = state.gameMap.items.reduce((count, item)=>count + (item.type === ItemType.Coin ? 1 : 0), 0);
    const lootOnGuards = state.gameMap.guards.reduce((count, guard)=>count + (guard.hasPurse ? 1 : 0), 0);
    return lootOnGround === 0 && lootOnGuards > 0;
}

function adjacentToUnawareGuardWithLoot(state: State): boolean {
    return state.gameMap.guards.some((guard)=>{
        const dx = Math.abs(guard.pos[0]-state.player.pos[0]);
        const dy = Math.abs(guard.pos[1]-state.player.pos[1]);
        return ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) && isRelaxedGuardMode(guard.mode) && guard.hasPurse;
    });
}

export function setStatusMessage(state: State, msg: string) {
    state.topStatusMessage = msg;
}

function loadImage(src: string, img: HTMLImageElement): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function lightAnimator(baseVal:number, lightStates:Array<number>, srcIds:Set<number>, seen:boolean) {
    //Returns the exponent to apply to the light value for tiles hit with animated light
    if(srcIds.size==0) return baseVal;
    if(!seen) return 0;
    let expo=0;
    for(let l of [...srcIds]) {
        expo+=lightStates[l];
    } 
    return baseVal**(1+expo/srcIds.size);
}

function updateAnimatedLight(cells:CellGrid, lightStates:Array<number>, seeAll: boolean) {
    for(let x=0; x<cells.sizeX; x++) {
        for(let y=0;y<cells.sizeY; y++) {
            const c = cells.at(x,y);
            if(c.type<TerrainType.Wall0000 || c.type>TerrainType.DoorEW) {
                cells.at(x,y).litAnim = lightAnimator(c.lit, lightStates, c.litSrc, seeAll || c.seen);
            } else {
                //Walls and portals get rendered unlit regardless of light sources
                cells.at(x,y).litAnim = 0;                
            }
        }
    }
}

function litVertices(x:number, y:number, cells:CellGrid):[number,number,number,number] {
    // The scale of 0.1 for unlit tiles creates a hard-ish edge at the boundary of lit and unlit tiles
    // 0 would give a completely hard edge, while 1 will be smooth but hard for the player to tell
    // which tiles at the boundary are lit
    const scale = (cells.at(x, y).lit ? 1 : 0.1) / 4;

    const lld = cells.at(x-1,y-1).litAnim;
    const ld  = cells.at(x,  y-1).litAnim;
    const lrd = cells.at(x+1,y-1).litAnim;
    const ll  = cells.at(x-1,y  ).litAnim;
    const l   = cells.at(x,  y  ).litAnim;
    const lr  = cells.at(x+1,y  ).litAnim;
    const llu = cells.at(x-1,y+1).litAnim;
    const lu  = cells.at(x,  y+1).litAnim;
    const lru = cells.at(x+1,y+1).litAnim;

    return [
        scale * (lld+ld+ll+l), //bottom left vertex
        scale * (lrd+ld+lr+l), //bottom right
        scale * (llu+lu+ll+l), //top left
        scale * (lru+lu+lr+l), //top right
    ];
}

function renderTouchButtons(renderer:Renderer, touchController:TouchController) {
    for(const bkey in touchController.coreTouchTargets) {
        if (!(bkey in touchController.controlStates)) continue;
        const b = touchController.coreTouchTargets[bkey];
        if (b.tileInfo === null || b.rect[2] === 0 || b.rect[3] === 0) continue;
        const lit = touchController.controlStates[bkey] ? 1 : 0;
        renderer.addGlyphLit(
            b.rect[0],
            b.rect[1],
            b.rect[0] + b.rect[2],
            b.rect[1] + b.rect[3],
            b.tileInfo,
            lit);
    }
    renderer.flush();
}

function waterTileSetForLevelType(levelType: LevelType, tileset:TileSet) {
    switch (levelType) {
        case LevelType.Manor: return tileset.waterAnimation;
        case LevelType.Mansion: return tileset.manseWaterAnimation;
        case LevelType.Fortress: return tileset.fortressWaterAnimation;
    }
}

function terrainTileSetForLevelType(levelType: LevelType, tileset:TileSet) {
    switch (levelType) {
        case LevelType.Manor: return tileset.terrainTiles;
        case LevelType.Mansion: return tileset.manseTerrainTiles;
        case LevelType.Fortress: return tileset.fortressTerrainTiles;
    }
}

function itemTileSetForLevelType(levelType: LevelType, tileset:TileSet) {
    switch (levelType) {
        case LevelType.Manor: return tileset.itemTiles;
        case LevelType.Mansion: return tileset.manseItemTiles;
        case LevelType.Fortress: return tileset.fortressItemTiles;
    }
}

function renderWorld(state: State, renderer: Renderer) {
    updateAnimatedLight(state.gameMap.cells, state.lightStates, state.seeAll);

    // Draw terrain
    const terrTiles = terrainTileSetForLevelType(state.gameMapRoughPlans[state.level].levelType, renderer.tileSet);

    for (let x = 0; x < state.gameMap.cells.sizeX; ++x) {
        for (let y = state.gameMap.cells.sizeY-1; y >= 0 ; --y) { //Render top to bottom for overlapped 3/4 view tiles
            const cell = state.gameMap.cells.at(x, y);
            if (!cell.seen && !state.seeAll) {
                continue;
            }
            let terrainType = cell.type;
            if (terrainType == TerrainType.GroundWoodCreaky) {
                if (!(cell.lit || cell.identified)) {
                    terrainType = TerrainType.GroundWood;
                }
            }
            const lv = litVertices(x, y, state.gameMap.cells);

            // Draw tile
            if (terrainType === TerrainType.PortcullisEW || 
                terrainType === TerrainType.PortcullisNS ||
                terrainType === TerrainType.DoorEW ||
                terrainType === TerrainType.DoorNS) {
                //The door/portcullis terrain renders the door/gate open
                if (!state.gameMap.items.find((item)=> {
                    return item.pos[0] === x && 
                        item.pos[1] === y &&
                        item.type >= ItemType.DoorNS 
                        && item.type <=ItemType.PortcullisEW;})) {
                    renderer.addGlyphLit4(x, y, x+1, y+1, terrTiles[terrainType], lv);
                } else if (state.gameMap.guards.find((guard)=>guard.pos[0]===x && guard.pos[1]===y) ||
                        (state.player.pos[0]===x && state.player.pos[1]===y)) {
                        renderer.addGlyphLit4(x, y, x+1, y+1, terrTiles[terrainType], lv);
                }
            } else {
                const tile = cell.animation? cell.animation.currentTile():terrTiles[terrainType];
                renderer.addGlyphLit4(x, y, x+1, y+1, tile, lv);
            }

            // Draw border for water
            if (terrainType===TerrainType.GroundWater) {
                const ledge = renderer.tileSet.ledgeTiles;
                let ctr = 0;
                for(let adj of [[0,1],[0,-1],[-1,0],[1,0]]) {
                    const cell = state.gameMap.cells.at(x+adj[0],y+adj[1]);
                    if(cell.type!==TerrainType.GroundWater) {
                        renderer.addGlyphLit4(x, y, x+1, y+1, ledge[ctr], lv);
                    }
                    ctr++;
                }
            }
        }
    }

    // Draw items
    const itemTiles = itemTileSetForLevelType(state.gameMapRoughPlans[state.level].levelType, renderer.tileSet);

    for(const item of state.gameMap.items) {
        let x = item.pos[0];
        let y = item.pos[1];
        const cell = state.gameMap.cells.at(x, y);
        if (!cell.seen && !state.seeAll) {
            continue;
        }
        const terrainType = cell.type;
        const lv = litVertices(x, y, state.gameMap.cells);
        if (terrainType === TerrainType.PortcullisEW || 
            terrainType === TerrainType.PortcullisNS ||
            terrainType === TerrainType.DoorEW ||
            terrainType === TerrainType.DoorNS) {
                //The door/portcullis item renders the door/gate closed if there is no guard or player present
            if (!state.gameMap.guards.find((guard)=>guard.pos[0]===x && guard.pos[1]===y) &&
                !(state.player.pos[0]===x && state.player.pos[1]===y)) {
                renderer.addGlyphLit4(x, y, x + 1, y + 1, itemTiles[item.type], lv);
            }
        } else if (item.type===ItemType.Treasure) {
            const ti = item.animation ?
                item.animation.currentTile() :
                itemTiles[item.type];
            renderer.addGlyphLit4(x, y+0.625, x + 1, y + 1.625, ti, lv);
        } else {
            const ti = item.animation ?
                item.animation.currentTile() :
                itemTiles[item.type];
            if (item.animation instanceof SpriteAnimation) {
                const o = item.animation.offset;
                x += o[0];
                y += o[1];
            }
            renderer.addGlyphLit4(x, y, x + 1, y + 1, ti, lv);
        }
    }

    // Draw adjacencies

//    renderRoomAdjacencies(state.gameMap.adjacencies, renderer);
}

function renderRoomAdjacencies(adjacencies: Array<Adjacency>, renderer: Renderer) {
    const tile = {
        textureIndex: 2,
        color: 0xffffffff,
        unlitColor: 0xffffffff
    };

    for (const adj of adjacencies) {
        const x0 = adj.origin[0];
        const y0 = adj.origin[1];
        const x1 = adj.origin[0] + adj.dir[0] * adj.length;
        const y1 = adj.origin[1] + adj.dir[1] * adj.length;
        renderer.addGlyph(x0 + 0.25, y0 + 0.25, x0 + 0.75, y0 + 0.75, tile);
        renderer.addGlyph(x1 + 0.25, y1 + 0.25, x1 + 0.75, y1 + 0.75, tile);
    }

    for (const adj of adjacencies) {
        const p0x = adj.origin[0] + 0.5;
        const p0y = adj.origin[1] + 0.5;
        const p1x = adj.origin[0] + adj.dir[0] * adj.length + 0.5;
        const p1y = adj.origin[1] + adj.dir[1] * adj.length + 0.5;

        const r = 0.1;
        const x0 = Math.min(p0x, p1x) - r + Math.abs(adj.dir[0]) *  0.5;
        const y0 = Math.min(p0y, p1y) - r + Math.abs(adj.dir[1]) *  0.5;
        const x1 = Math.max(p0x, p1x) + r + Math.abs(adj.dir[0]) * -0.5;
        const y1 = Math.max(p0y, p1y) + r + Math.abs(adj.dir[1]) * -0.5;

        renderer.addGlyph(x0, y0, x1, y1, tile);
    }
}

function renderWorldBorder(state: State, renderer: Renderer) {
    const sizeX = state.gameMap.cells.sizeX;
    const sizeY = state.gameMap.cells.sizeY;
    const tileInfo = {textureIndex: 0, color: colorPreset.white, unlitColor: colorPreset.white};
    renderer.addGlyph(-1, 0, 0, sizeY, tileInfo);
    renderer.addGlyph(sizeX, 0, sizeX + 1, sizeY, tileInfo);
    renderer.addGlyph(-1, -1, sizeX + 1, 0, tileInfo);
    renderer.addGlyph(-1, sizeY, sizeX + 1, sizeY + 1, tileInfo);
}

function renderPlayer(state: State, renderer: Renderer) {
    const player = state.player;
    const a = player.animation;
    const offset = a &&  a instanceof SpriteAnimation ? a.offset : vec2.create();
    const x = player.pos[0] + offset[0];
    const y = player.pos[1] + offset[1];
    const x0 = player.pos[0];
    const y0 = player.pos[1];
    const cell = state.gameMap.cells.at(x0, y0);
    const lit = lightAnimator(cell.lit, state.lightStates, cell.litSrc, state.seeAll || cell.seen);
    const hidden = player.hidden(state.gameMap);
    const dead = player.health <= 0;

    let tileInfo:TileInfo;
    if (a) {
        tileInfo = a.currentTile();
    } else {
        const p = renderer.tileSet.playerTiles;
        tileInfo =
            dead ? p.dead :
            hidden ? p.hidden :
            p.normal;
    }

    const frontRenders:[number, number, number, number, TileInfo, number][] = [];
    const tileInfoTinted = structuredClone(tileInfo);
    if (!dead) {
        if (player.idle) {
            // const idleTileInfo = renderer.tileSet.namedTiles['idleIndicatorAlt'];
            if(player.idleCursorAnimation !== null && player.idleCursorAnimation.length === 1 && 
                player.idleCursorAnimation[0] instanceof PulsingColorAnimation) {
                const tile = player.idleCursorAnimation[0].currentTile();
                renderer.addGlyphLit(x0, y0, x0+1, y0+1, tile, 1);
            }
            if(player.idleCursorAnimation !== null && player.idleCursorAnimation.length > 1) {
                for (let anim of player.idleCursorAnimation) {
                    if (anim instanceof RadialAnimation) {
                        const tile = anim.currentTile();
                        const off = anim.offset;
                        if(off[1]>0) {
                            renderer.addGlyphLit(x0+off[0], y0+off[1]/4-0.125, x0+off[0]+1, y0+off[1]/4+1-0.125, tile, 1);        
                        } else {
                            frontRenders.push([x0+off[0], y0+off[1]/4-0.125, x0+off[0]+1, y0+off[1]/4+1-0.125, tile, 1])
                        }
                    }
                }
            }
        }
        if (player.damagedLastTurn) {
            tileInfoTinted.color = colorPreset.lightRed;
            tileInfoTinted.unlitColor = colorPreset.darkRed;
        } else if (hidden) {
            tileInfoTinted.color = colorPreset.darkGray;
            tileInfoTinted.unlitColor = colorPreset.darkerGray;
        }
    }

    renderer.addGlyphLit(x, y, x+1, y+1, tileInfoTinted, lit);
    if(hidden && player.idle) {
        renderer.addGlyphLit(x, y, x+1, y+1, renderer.tileSet.playerTiles.litFace, 0.15);
    }
    if(player.lightActive) {
        const torchTile = player.torchAnimation?
        player.torchAnimation.currentTile():
        renderer.tileSet.itemTiles[ItemType.TorchCarry];
        renderer.addGlyphLit(x, y, x+1, y+1, torchTile, lit);    
    }
    for(let dr of frontRenders) {
        renderer.addGlyphLit(...dr);
    }
}

function renderGuards(state: State, renderer: Renderer) {
    for (const guard of state.gameMap.guards) {
        let tileIndex = 0 + tileIndexOffsetForDir(guard.dir);

        const cell = state.gameMap.cells.atVec(guard.pos);
        let lit = lightAnimator(cell.lit, state.lightStates, cell.litSrc, state.seeAll || cell.seen);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        if(!visible && guard.mode !== GuardMode.Unconscious) tileIndex+=4;
        else if(guard.mode === GuardMode.Patrol && !guard.speaking && cell.lit==0) lit=0;
        else if(guard.mode === GuardMode.Unconscious) tileIndex+=12;
        else tileIndex+=8;
        const tileInfo = structuredClone(renderer.tileSet.npcTiles[tileIndex]);
        if (guard.mode === GuardMode.Unconscious && guard.hidden(state.gameMap)) {
            tileInfo.color! = colorPreset.darkGray;
            tileInfo.unlitColor! = colorPreset.darkerGray;
        }

        const gate = state.gameMap.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
        const offX = (gate!==undefined && gate.pos.equals(guard.pos))? 0.25 : 0;

        let offset = guard.animation?.offset?? vec2.create();
        const x = guard.pos[0] + offset[0] + offX;
        const y = guard.pos[1] + offset[1];
    
        if(guard.hasTorch || guard.hasPurse || guard.hasVaultKey) {
            let t0 = x+guard.dir[0]*0.375+guard.dir[1]*0.375;
            let t1 = y-0.125;
            const tti = guard.mode!==GuardMode.Unconscious&&guard.torchAnimation?
                    guard.torchAnimation.currentTile():
                    renderer.tileSet.itemTiles[ItemType.TorchCarry];
            let p0 = x-guard.dir[0]*0.250+(guard.dir[1]<0?0.375:0);
            let p1 = y-0.125;
            const pti = guard.hasVaultKey?tileSet.itemTiles[ItemType.KeyCarry]:renderer.tileSet.itemTiles[ItemType.PurseCarry];
            if(guard.dir[1]>0) {
                if(guard.hasTorch) renderer.addGlyphLit(t0, t1, t0 + 1, t1 + 1, tti, lit);
                renderer.addGlyphLit(x, y, x + 1, y + 1, tileInfo, lit);
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyphLit(p0, p1, p0 + 1, p1 + 1, pti, lit);
            } else if(guard.dir[1]<0) {
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyphLit(p0, p1, p0 + 1, p1 + 1, pti, lit);
                renderer.addGlyphLit(x, y, x + 1, y + 1, tileInfo, lit);
                if(guard.hasTorch) renderer.addGlyphLit(t0, t1, t0 + 1, t1 + 1, tti, lit);
            } else {
                renderer.addGlyphLit(x, y, x + 1, y + 1, tileInfo, lit);    
                if(guard.hasTorch) renderer.addGlyphLit(t0, t1, t0 + 1, t1 + 1, tti, lit);
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyphLit(p0, p1, p0 + 1, p1 + 1, pti, lit);
            }
        }
        else renderer.addGlyphLit(x, y, x + 1, y + 1, tileInfo, lit);
        // renderer.addGlyphLit(guard.pos[0], guard.pos[1], guard.pos[0] + 1, guard.pos[1] + 1, tileInfo, lit);
    }
}

function renderParticles(state: State, renderer: Renderer) {
    for(let p of state.particles) {
        if(p.animation) {
            const a = p.animation;
            const offset = (a instanceof SpriteAnimation)||(a instanceof IdleRadialAnimation) ? a.offset : vec2.create();
            const x = p.pos[0] + offset[0];
            const y = p.pos[1] + offset[1];
            const tileInfo = a.currentTile();
            renderer.addGlyph(x, y, x+1, y+1, tileInfo);
        }
    }
}

function renderIconOverlays(state: State, renderer: Renderer) {
    const player = state.player;
    const bubble_right = renderer.tileSet.namedTiles['speechBubbleR'];
    const bubble_left = renderer.tileSet.namedTiles['speechBubbleL'];
    if(state.playerHintMessageIsNew) {
        const a = state.player.animation;
        const offset = a && a instanceof SpriteAnimation ? a.offset : vec2.create();
        const [x,y] = player.pos.add(offset);
        const ptile = renderer.tileSet.namedTiles['playerHint'];
        renderer.addGlyph(x, y+0.625, x+1, y+1.625, ptile);
    }
    for (const guard of state.gameMap.guards) {
        const cell = state.gameMap.cells.atVec(guard.pos);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        let offset = guard.animation?.offset?? vec2.create();
        const x = guard.pos[0] + offset[0];
        const y = guard.pos[1] + offset[1];

        if (guard.speaking && state.popups.currentPopupTimeRemaining <= 0) {
            const dir = guard.dir[0];
            if(dir>=0) {
                renderer.addGlyph(x+1, y, x+2, y+1, bubble_right);
            } else {
                renderer.addGlyph(x-1, y, x, y+1, bubble_left);
            }
        }

        const guardState = guard.overheadIcon();
        if (guardState!==GuardStates.Relaxed) {
            const gtile = renderer.tileSet.guardStateTiles[guardState]
            renderer.addGlyph(x, y+0.625, x+1, y+1.625, gtile);
        }
        if (guard === player.pickTarget) {
            // Render the shadowing indicator if player is shadowing a guard
            const gtile = tileSet.namedTiles['pickTarget'];
            renderer.addGlyph(x, y+0.625, x+1, y+1.625, gtile);
        } 
    }

    // Render an icon over the player if the player is being noisy
    if (player.preNoisy || player.noisy) {
        const a = player.animation;
        const offset = a && a instanceof SpriteAnimation ? a.offset : vec2.create();
        if (Math.abs(offset[0]) < 0.5 && Math.abs(offset[1]) < 0.5) {
            const x = player.pos[0] + player.noiseOffset[0] / 2;
            const y = player.pos[1] + player.noiseOffset[1] / 2;
            if (player.preNoisy) {
                renderer.addGlyph(x, y, x+1, y+1, tileSet.namedTiles['pickTarget']);
            } else {
                const s = 0.0625 *  Math.sin(player.noisyAnim * Math.PI * 2);
                renderer.addGlyph(x - s, y - s, x+1+s, y+1+s, tileSet.namedTiles['noise']);
            }
        }
    }
}

function renderGuardSight(state: State, renderer: Renderer) {
    if (!state.seeGuardSight) {
        return;
    }

    const mapSizeX = state.gameMap.cells.sizeX;
    const mapSizeY = state.gameMap.cells.sizeY;

    const seenByGuard = new BooleanGrid(mapSizeX, mapSizeY, false);

    const pos = vec2.create();
    const dpos = vec2.create();

    for (const guard of state.gameMap.guards) {
        const maxSightCutoff = 10;
        const xMin = Math.max(0, Math.floor(guard.pos[0] - maxSightCutoff));
        const xMax = Math.min(mapSizeX, Math.floor(guard.pos[0] + maxSightCutoff) + 1);
        const yMin = Math.max(0, Math.floor(guard.pos[1] - maxSightCutoff));
        const yMax = Math.min(mapSizeY, Math.floor(guard.pos[1] + maxSightCutoff) + 1);
        for (let y = yMin; y < yMax; ++y) {
            for (let x = xMin; x < xMax; ++x) {
                if (seenByGuard.get(x, y)) {
                    continue;
                }
                vec2.set(pos, x, y);
                vec2.subtract(dpos, pos, guard.pos);
                const cell = state.gameMap.cells.atVec(pos);
                if (!state.seeAll && !cell.seen) {
                    continue;
                }
                if (cell.blocksPlayerMove) {
                    continue;
                }
                if (guard.mode !== GuardMode.ChaseVisibleTarget && vec2.dot(guard.dir, dpos) < 0) {
                    continue;
                }
                if (vec2.squaredLen(dpos) >= guard.sightCutoff(cell.lit>0) && !(dpos[0] === guard.dir[0] * 2 && dpos[1] === guard.dir[1] * 2)) {
                    continue;
                }
                if (cell.hidesPlayer && (Math.abs(dpos[0]) > 1 || Math.abs(dpos[1]) > 1 || isRelaxedGuardMode(guard.mode))) {
                    continue;
                }
                if (!lineOfSight(state.gameMap, guard.pos, pos)) {
                    continue;
                }
        
                seenByGuard.set(x, y, true);
            }
        }
    }

    for (let y = 0; y < state.gameMap.cells.sizeY; ++y) {
        for (let x = 0; x < state.gameMap.cells.sizeX; ++x) {
            if (seenByGuard.get(x, y)) {
                renderer.addGlyph(x, y, x+1, y+1, tileSet.namedTiles['crossHatch']);
            }
        }
    }
}

function renderGuardPatrolPaths(state: State, renderer: Renderer) {
    if (!state.seeGuardPatrols) {
        return;
    }

    for (const guard of state.gameMap.guards) {
        for (const pos of guard.patrolPath) {
            renderer.addGlyph(pos[0], pos[1], pos[0]+1, pos[1]+1, tileSet.namedTiles['patrolRoute']);
        }
    }
}

function tileIndexOffsetForDir(dir: vec2): number {
    if (dir[1] > 0) {
        return 1;
    } else if (dir[1] < 0) {
        return 3;
    } else if (dir[0] > 0) {
        return 0;
    } else if (dir[0] < 0) {
        return 2;
    } else {
        return 3;
    }
}

function createCamera(posPlayer: vec2, zoomLevel: number): Camera {
    const camera = {
        position: vec2.create(),
        velocity: vec2.create(),
        joltOffset: vec2.create(),
        joltVelocity: vec2.create(),
        zoom: zoomLevel,
        zoomVelocity: 0,
        scale: Math.pow(zoomPower, zoomLevel),
        anchor: vec2.create(),
        snapped: false,
        zoomed: false,
        panning: false,
    };

    vec2.copy(camera.position, posPlayer);
    vec2.zero(camera.velocity);

    return camera;
}

export function setSoundVolume(state: State, soundVolume: number) {
    state.soundVolume = soundVolume;
    Howler.volume(soundVolume);
    window.localStorage.setItem('LLL/soundVolume', soundVolume.toString());
}

export function setVolumeMute(state: State, volumeMute: boolean) {
    state.volumeMute = volumeMute;
    Howler.mute(volumeMute);
    window.localStorage.setItem('LLL/volumeMute', volumeMute ? 'true' : 'false');
}

export function setGuardMute(state: State, guardMute: boolean) {
    state.guardMute = guardMute;
    window.localStorage.setItem('LLL/guardMute', guardMute ? 'true' : 'false');
    for(const s in state.subtitledSounds) {
        state.subtitledSounds[s].mute = guardMute;
    }
}

export function setScreenShakeEnabled(state: State, screenShakeEnabled: boolean) {
    state.screenShakeEnabled = screenShakeEnabled;
    window.localStorage.setItem('LLL/screenShakeEnabled', screenShakeEnabled ? 'true' : 'false');
}

//TODO: should do some runtime type checking here to validate what's being written
export function getStat<T>(name:string):T | undefined {
    const statJson = window.localStorage.getItem('LLL/stat/'+name);
    if (statJson === null || statJson === undefined)
        return undefined;
    if (statJson === 'undefined')
        return undefined;
    return JSON.parse(String(statJson));
}

export function setStat<T>(name:string, value:T) {
    const statJson = JSON.stringify(value);
    window.localStorage.setItem('LLL/stat/'+name, statJson);
}

export function loadStats(): PersistedStats {
    return {
        scores: getStat('highScores') ?? [],
        lastPlayedDailyGame: getStat('lastPlayedDailyGame') ?? null,
        currentDailyGameId: getStat('currentDailyGameId') ?? '',
        currentDailyPlays: getStat('currentDailyPlays') ?? 0,
        currentDailyWins: getStat('currentDailyWins') ?? 0,
        currentDailyBestScore: getStat('currentDailyBestScore')?? 0,
        currentDailyWinFirstTry: getStat('currentDailyWinFirstTry')?? 0,
        bestScore: getStat('bestScore') ?? 0,
        totalPlays: getStat('totalPlays') ?? 0,
        totalWins: getStat('totalWins') ?? 0,
        totalGhosts: getStat('totalGhosts') ?? 0,
        allDailyPlays: getStat('allDailyPlays') ?? 0,
        allDailyWins: getStat('allDailyWins') ?? 0,
        allDailyWinsFirstTry: getStat('allDailyWinsFirstTry') ?? 0,
        achievementGhosty: getStat('achievementGhosty') ?? 0,
        achievementZippy: getStat('achievementZippy') ?? 0,
        achievementHungry: getStat('achievementHungry') ?? 0,
        achievementThumpy: getStat('achievementThumpy') ?? 0,
        achievementSofty: getStat('achievementSofty') ?? 0,
        achievementNoisy: getStat('achievementNoisy') ?? 0,
        achievementLeapy: getStat('achievementLeapy') ?? 0,
        achievementSteppy: getStat('achievementSteppy') ?? 0,
        achievementHurty: getStat('achievementHurty') ?? 0,
        achievementVictory: getStat('achievementVictory') ?? 0,
    };
}

export function saveStats(persistedStats: PersistedStats) {
    setStat('currentDailyGameId', persistedStats.currentDailyGameId);
    setStat('currentDailyPlays', persistedStats.currentDailyPlays);
    setStat('currentDailyWins', persistedStats.currentDailyWins);
    setStat('currentDailyBestScore', persistedStats.currentDailyBestScore);
    setStat('currentDailyWinFirstTry', persistedStats.currentDailyWinFirstTry);
    setStat('lastPlayedDailyGame', persistedStats.lastPlayedDailyGame);
    setStat('allDailyPlays', persistedStats.allDailyPlays);
    setStat('allDailyWins', persistedStats.allDailyWins);
    setStat('allDailyWinsFirstTry', persistedStats.allDailyWinsFirstTry);
    setStat('scores', persistedStats.scores);
    setStat('bestScore', persistedStats.bestScore);
    setStat('totalPlays', persistedStats.totalPlays);
    setStat('totalWins', persistedStats.totalWins);
    setStat('totalGhosts', persistedStats.totalGhosts);
    
    setStat('achievementGhosty', persistedStats.achievementGhosty);
    setStat('achievementZippy', persistedStats.achievementZippy);
    setStat('achievementHungry', persistedStats.achievementHungry);
    setStat('achievementThumpy', persistedStats.achievementThumpy);
    setStat('achievementSofty', persistedStats.achievementSofty);
    setStat('achievementNoisy', persistedStats.achievementNoisy);
    setStat('achievementLeapy', persistedStats.achievementLeapy);
    setStat('achievementSteppy', persistedStats.achievementSteppy);
    setStat('achievementHurty', persistedStats.achievementHurty);
}

function initState(sounds:Howls, subtitledSounds: SubtitledHowls, activeSoundPool:ActiveHowlPool, touchController:TouchController): State {
    const rng = new RNG();  
    const initialLevel = debugInitialLevel;
    const gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, rng);
    const gameMap = createGameMap(initialLevel, gameMapRoughPlans[initialLevel]);
    const stats = loadStats();
    let keyRepeatRate = parseInt(window.localStorage.getItem('LLL/keyRepeatRate')??'175');
    if(isNaN(keyRepeatRate)) keyRepeatRate = 175;
    let keyRepeatDelay = parseInt(window.localStorage.getItem('LLL/keyRepeatDelay')??'250');
    if(isNaN(keyRepeatDelay)) keyRepeatDelay = 250;
    let soundVolume = parseFloat(window.localStorage.getItem('LLL/soundVolume')??'1.0');
    if(isNaN(soundVolume)) soundVolume = 1.0;
    let volumeMuteSaved: string | null = window.localStorage.getItem('LLL/volumeMute');
    const volumeMute = (volumeMuteSaved === null) ? false : volumeMuteSaved === 'true';
    let guardMuteSaved: string | null = window.localStorage.getItem('LLL/guardMute');
    const guardMute = (guardMuteSaved === null) ? false : guardMuteSaved === 'true';
    let screenShakeEnabledSaved: string | null = window.localStorage.getItem('LLL/screenShakeEnabled');
    const screenShakeEnabled = (screenShakeEnabledSaved === null) ? true : screenShakeEnabledSaved === 'true';

    const state: State = {
        gameStats: {    
            totalScore: 0,
            turns: 0,
            numLevels: 0,
            numCompletedLevels: 0,
            numGhostedLevels: 0,
            daily: null,
            timeStarted: 0,
            timeEnded: 0,
        },
        persistedStats: stats,
        levelStats: {
            numKnockouts: 0,
            numSpottings: 0,
            damageTaken: 0,
            extraFoodCollected: 0,
        },
        achievements: getAchievements(),
        lightStates: Array(gameMap.lightCount).fill(0),
        particles:[],
        tLast: undefined,
        dt: 0,
        idleTimer: 5,
        rng: rng,
        dailyRun: null,
        leapToggleActive: false,
        playerHintMessage: '',
        playerHintMessageIsNew: false,
        gameMode: GameMode.HomeScreen,
        textWindows: {
            [GameMode.HomeScreen]: new HomeScreen(),
            [GameMode.OptionsScreen]: new OptionsScreen(),
            [GameMode.StatsScreen]: new StatsScreen(),
            [GameMode.AchievementsScreen]: new AchievementsScreen(),
            [GameMode.DailyHub]: new DailyHubScreen(),
            [GameMode.HelpControls]: new HelpControls(),
            [GameMode.HelpKey]: new HelpKey(),
            [GameMode.MansionComplete]: new MansionCompleteScreen(),
            [GameMode.Dead]: new DeadScreen(),
            [GameMode.Win]: new WinScreen(),
            [GameMode.CreditsScreen]: new CreditsScreen(),
        },
        player: new Player(gameMap.playerStartPos),
        oldPlayerPos: gameMap.playerStartPos,
        topStatusMessage: '',
        topStatusMessageSlide: 1,
        numStepMoves: 0,
        numLeapMoves: 0,
        numWaitMoves: 0,
        numZoomMoves: 0,
        hasOpenedMenu: false,
        hasClosedMenu: false,
        finishedLevel: false,
        hasStartedGame: false,
        zoomLevel: initZoomLevel,
        seeAll: debugSeeAll,
        seeGuardSight: false,
        seeGuardPatrols: false,
        camera: createCamera(gameMap.playerStartPos, initZoomLevel),
        level: initialLevel,
        turns: 0,
        totalTurns: 0,
        lootStolen: 0,
        lootAvailable: gameMapRoughPlans[initialLevel].totalLoot,
        treasureStolen: 0,
        gameMapRoughPlans: gameMapRoughPlans,
        gameMap: gameMap,
        sounds: sounds,
        subtitledSounds: subtitledSounds,
        activeSoundPool: activeSoundPool,
        soundVolume: soundVolume,
        guardMute: guardMute,
        volumeMute: volumeMute,
        screenShakeEnabled: screenShakeEnabled,
        keyRepeatActive: undefined,
        keyRepeatRate: keyRepeatRate,
        keyRepeatDelay: keyRepeatDelay,
        touchController: touchController,
        gamepadManager: new GamepadManager(),
        keyboardController: new KeyboardController(),
        popups: new Popups,
    };

    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    chooseGuardMoves(state);
    postTurn(state);

    return state;
}

export function zoomIn(state: State) {
    state.zoomLevel = Math.min(maxZoomLevel, state.zoomLevel + 1);
    state.camera.panning = false;
    ++state.numZoomMoves;
    postTurn(state);
}

export function zoomOut(state: State) {
    state.zoomLevel = Math.max(minZoomLevel, state.zoomLevel - 1);
    state.camera.panning = false;
    ++state.numZoomMoves;
    postTurn(state);
}

function setCellAnimations(gameMap: GameMap, state: State) {
    const levelType = state.gameMapRoughPlans[state.level].levelType;
    const tileSet = getTileSet();
    let counter = 1;
    for(let c of gameMap.cells.values) {
        if(c.type===TerrainType.GroundWater) {
            c.animation = new FrameAnimator(waterTileSetForLevelType(levelType, tileSet), 1, (counter*1369)%4);
            counter++;
        }
    }
}

function setLights(gameMap: GameMap, state: State) {
    let id = 0;
    if(tileSet.candleAnimation.length>=3) {
        const stoveSeq:[TileInfo, number][] = tileSet.stoveAnimation.slice(0,2).map((t)=>[t,0.5]);
        const stoveDim = stoveSeq[0][0];
        const stoveOff = stoveSeq[0][0];
        const candleSeq:[TileInfo, number][] = tileSet.candleAnimation.slice(0,3).map((t)=>[t,0.5]);
        const candleDim = tileSet.candleAnimation.at(-2)!;
        const candleOff = tileSet.candleAnimation.at(-1)!;
        for(let i of gameMap.items) {
            if (i.type === ItemType.Stove) {
                i.animation = new LightSourceAnimation(LightState.idle, id, state.lightStates, i, stoveSeq, stoveDim, stoveOff);
                id++;
            } else if (i.type === ItemType.TorchLit) {
                i.animation = new LightSourceAnimation(LightState.idle, id, state.lightStates, i, candleSeq, candleDim, candleOff);
                id++;
            } else if (i.type === ItemType.TorchUnlit) {
                i.animation = new LightSourceAnimation(LightState.off, id, state.lightStates, i, candleSeq, candleDim, candleOff);
                id++;
            }
        }    
    }
    if(tileSet.torchAnimation.length>=3) {
        const torchSeq:[TileInfo, number][] = tileSet.torchAnimation.slice(0,3).map((t)=>[t,0.5]);
        const torchDim = tileSet.torchAnimation.at(-2)!;
        const torchOff = tileSet.torchAnimation.at(-1)!;
        for(let g of gameMap.guards) {
            if(g.hasTorch) {
                g.torchAnimation = new LightSourceAnimation(LightState.idle, id, state.lightStates, null, torchSeq, torchDim, torchOff);
                id++;
            }
        }    
    }
    if(tileSet.playerTorchAnimation.length>=2) {
        const torchSeq:[TileInfo, number][] = tileSet.playerTorchAnimation.slice(0,2).map((t)=>[t,0.5]);
        const torchDim = tileSet.playerTorchAnimation.at(-2)!;
        const torchOff = tileSet.playerTorchAnimation.at(-1)!;
        const p = state.player;
        p.torchAnimation = new LightSourceAnimation(LightState.idle, id, state.lightStates, null, torchSeq, torchDim, torchOff);
        id++;
    }
}

export function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, state.rng);
    state.level = debugInitialLevel;



    state.persistedStats.totalPlays++;
    setStat('totalPlays',state.persistedStats.totalPlays);
    if(state.dailyRun) {
        state.persistedStats.currentDailyPlays++;
        setStat('currentDailyPlays',state.persistedStats.currentDailyPlays);
        state.persistedStats.allDailyPlays++;
        setStat('allDailyPlays',state.persistedStats.allDailyPlays);
    }

    state.gameStats = { 
        totalScore: 0,
        turns: 0,
        numLevels: 0,
        numCompletedLevels: 0,
        numGhostedLevels: 0,
        daily: state.dailyRun,
        timeStarted: Date.now(),
        timeEnded: 0,
    };
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.lightStates = Array(gameMap.lightCount).fill(0);
    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    state.gameMode = GameMode.Mansion;
    state.topStatusMessage = '';
    state.numStepMoves = 0;
    state.numLeapMoves = 0;
    state.numWaitMoves = 0;
    state.numZoomMoves = 0;
    state.hasOpenedMenu = false;
    state.hasClosedMenu = false;
    state.finishedLevel = false;
    state.turns = 0;
    state.totalTurns = 0;
    state.lootStolen = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.treasureStolen = 0;
    clearLevelStats(state.levelStats);
    updateAchievements(state, "gameStart");
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos, state.zoomLevel);
    state.gameMap = gameMap;
    state.activeSoundPool.empty();
    state.popups.reset();

    chooseGuardMoves(state);
    postTurn(state);

//    analyzeLevel(state);

    Howler.stop();
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.lightStates = Array(gameMap.lightCount).fill(0);
    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    state.turns = 0;
    state.totalTurns = 0;
    state.lootStolen = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.treasureStolen = 0;
    clearLevelStats(state.levelStats);
    updateAchievements(state, "gameStart");

    state.topStatusMessage = '';
    state.finishedLevel = false;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos, state.zoomLevel);
    state.gameMap = gameMap;
    state.popups.reset();
    state.activeSoundPool.empty();

    chooseGuardMoves(state);
    postTurn(state);

    Howler.stop();
}


function updateIdle(state:State, dt:number) {
    const player = state.player;

    if (state.player.health <= 0) {
        return;
    }

    if (state.gameMode !== GameMode.Mansion) {
        return;
    }

    if (state.player.animation !== null) {
        return;
    }

    state.idleTimer -= dt;
    if (state.idleTimer > 0) {
        return;
    }

    const start = vec2.create();
    const left = vec2.fromValues(-0.125, 0);
    const right = vec2.fromValues(0.125, 0);
    const up = vec2.fromValues(0,0.125);
    const hid = player.hidden(state.gameMap);
    const p = tileSet.playerTiles;
    let tweenSeq: Array<TweenData>, tiles: Array<TileInfo>;
    if (hid || Math.random() > 0.5) {
        tweenSeq = [
            {pt0:start, pt1:up, duration:0.1, fn:tween.easeInQuad},
            {pt0:up, pt1:start, duration:0.05, fn:tween.easeOutQuad},
            {pt0:start, pt1:start, duration:0.1, fn:tween.easeOutQuad},
            {pt0:start, pt1:up, duration:0.1, fn:tween.easeInQuad},
            {pt0:up, pt1:start, duration:0.05, fn:tween.easeOutQuad},
        ];
        tiles = hid? [p.hidden] : [p.normal];
    } else {
        tweenSeq = [
            {pt0:start, pt1:left, duration:0.1, fn:tween.easeOutQuad},
            {pt0:left, pt1:left, duration:0.5, fn:tween.easeOutQuad},
            {pt0:left, pt1:start, duration:0.1, fn:tween.easeInQuad},
            {pt0:start, pt1:right, duration:0.1, fn:tween.easeOutQuad},
            {pt0:right, pt1:right, duration:0.5, fn:tween.easeOutQuad},
            {pt0:right, pt1:start, duration:0.1, fn:tween.easeInQuad},
        ];
        tiles = [p.left, p.left, p.normal, p.right, p.right, p.normal];        
    }
    player.animation = new SpriteAnimation(tweenSeq, tiles);
    if(!player.idle) {
        if(player.idleCursorType==='bracket') {
            const tile = tileSet.namedTiles['idleIndicatorAlt'];
            if(tile.color) {
                tile.color = 0xa0FFFFFF & tile.color;
                tile.unlitColor = 0x00FFFFFF & tile.color;
            }
                player.idleCursorAnimation = [
                new PulsingColorAnimation(tile, 0, 1/Math.PI),
            ];    
        } else if(player.idleCursorType==='orbs') {
            player.idleCursorAnimation = [
                new IdleRadialAnimation(tileSet.namedTiles['idleIndicator'], 0.6, Math.PI, 0, 0),
                new IdleRadialAnimation(tileSet.namedTiles['idleIndicator'], 0.6, Math.PI, 2*Math.PI/3, 0),
                new IdleRadialAnimation(tileSet.namedTiles['idleIndicator'], 0.6, Math.PI, 4*Math.PI/3, 0),
            ];    
        } else {
            player.idleCursorAnimation = [];
        }    
    }
    player.idle = true;
    state.idleTimer = 5; //Time to next movement
}

function updateAndRender(now: number, renderer: Renderer, state: State) {
    const t = now / 1000;
    const dt = (state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.dt = dt;
    state.tLast = t;

    canvas.width = canvasSizeX;
    canvas.height = canvasSizeY;
    const screenSize = vec2.fromValues(canvasSizeX, canvasSizeY);
    state.oldPlayerPos = vec2.clone(state.player.pos);

    updateControllerState(state);

    const topStatusMessageTargetUpper = state.player.pos[1] >= state.gameMap.cells.sizeY / 2;
    const slideRate = 4.0 * dt;
    if (topStatusMessageTargetUpper) {
        state.topStatusMessageSlide = Math.min(1, state.topStatusMessageSlide + slideRate);
    } else {
        state.topStatusMessageSlide = Math.max(0, state.topStatusMessageSlide - slideRate);
    }

    if (!state.camera.zoomed) {
        state.camera.zoomed = true;
        zoomToFitCamera(state, screenSize);
    }

    if (!state.camera.snapped) {
        state.camera.panning = false;
        state.camera.snapped = true;
        snapCamera(state, screenSize);
    }

    if (dt > 0) {
        updateState(state, screenSize, dt);
    }

    const tw = state.textWindows[state.gameMode];
    if(tw !== undefined) {
        tw.update(state);
        tw.parseUI(screenSize);
    }

    updateTouchButtons(state.touchController, renderer, screenSize, state);

    renderScene(renderer, screenSize, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}


function updateState(state: State, screenSize: vec2, dt: number) {
    updateCamera(state, screenSize, dt);

    updateIdle(state, dt);

    state.popups.currentPopupTimeRemaining = Math.max(0, state.popups.currentPopupTimeRemaining - dt);

    state.player.noisyAnim += 2.0 * dt;
    state.player.noisyAnim -= Math.floor(state.player.noisyAnim);

    if(state.player.animation) {
        if(state.player.animation.update(dt)) {
            state.player.animation = null;
        }
    }
    if(state.player.lightActive && state.player.torchAnimation?.update(dt)) {
        state.player.torchAnimation = null;
    }
    if(state.player.idle && state.player.idleCursorAnimation) {
        state.player.idleCursorAnimation = state.player.idleCursorAnimation.filter((anim)=>!anim.update(dt));
    }
    for(let c of state.gameMap.cells.values) {
        c.animation?.update(dt);
    }
    for(let g of state.gameMap.guards) {
        if(g.animation?.update(dt)) {
            g.animation = null;
        }
        if(g.torchAnimation?.update(dt)) {
            g.torchAnimation = null;
        }    
    }
    if (state.gameMapRoughPlans[state.level].levelType === LevelType.Fortress && !state.oldPlayerPos.equals(state.player.pos)) {
        const item = state.gameMap.items.find((item) => item.pos.equals(state.oldPlayerPos))
        if(item && item.type === ItemType.Bush) {
            const ti0 = itemTileSetForLevelType(LevelType.Fortress, getTileSet())[item.type];
            const ti1 = {...ti0};
            const ti2 = {...ti0};
            const ti3 = {...ti0};
            ti1.textureIndex = ti0.textureIndex? ti0.textureIndex+1:0;
            ti2.textureIndex = ti0.textureIndex? ti0.textureIndex+2:0;
            ti3.textureIndex = ti0.textureIndex? ti0.textureIndex+3:0;
            item.animation = new FrameAnimator([ti0, ti1, ti2, ti3, ti3, ti3, ti2, ti1, ti0], 1, 0, 1);
        }
    }
    state.gameMap.items = state.gameMap.items.filter( (i) => {
        const done = i.animation?.update(dt);
        if(done === true) {
            i.animation = undefined;
        }
        if((i instanceof SpriteAnimation || i instanceof FrameAnimator) && i.removeOnFinish) {
            return done !== true;
        }
        return true;
    });
    state.particles = state.particles.filter( (p) => {
        const done = p.animation?.update(dt);
        if(p.animation instanceof SpriteAnimation) {
            return !(p.animation.removeOnFinish && done);
        }
        return true;
    });
}

function renderScene(renderer: Renderer, screenSize: vec2, state: State) {
    renderer.beginFrame(screenSize);
    const matScreenFromWorld = mat4.create();
    setupViewMatrix(state, screenSize, matScreenFromWorld);

    renderer.start(matScreenFromWorld, 1);
    renderWorld(state, renderer);
    if(state.gameMode===GameMode.Mansion) {
        renderGuardSight(state, renderer);
        renderGuardPatrolPaths(state, renderer);
    }
    renderGuards(state, renderer);
    if ((state.gameMode !== GameMode.MansionComplete && state.gameMode !== GameMode.Win) || state.player.animation) {
        renderPlayer(state, renderer);
    }
    renderParticles(state, renderer);
    if(state.gameMode===GameMode.Mansion) {
        renderIconOverlays(state, renderer);
    }
    renderWorldBorder(state, renderer);
    renderer.flush();

    if (state.gameMode===GameMode.Mansion || state.gameMode===GameMode.MansionComplete) {
        renderTextBox(renderer, screenSize, state);
    }

    if (state.gameMode===GameMode.Mansion || state.gameMode===GameMode.MansionComplete) {
        renderStatusOverlay(renderer, screenSize, state);
    }

    const menuWindow = state.textWindows[state.gameMode];
    if(menuWindow !== undefined) {
        menuWindow.render(renderer);    
    }

    renderBottomStatusBar(renderer, screenSize, state);

    if (lastController===state.touchController) {
        const matScreenFromPixel = mat4.create();
        mat4.ortho(
            matScreenFromPixel,
            0,
            screenSize[0],
            0,
            screenSize[1],
            1,
            -1
        );
    
        renderer.start(matScreenFromPixel, 1);
        renderTouchButtons(renderer, state.touchController);
        renderer.flush();
    }
}

function updateTouchButtons(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    //TODO: Perhaps should move more of the game-specific logic from touchcontroller class into here
    if (lastController !== touchController)
        return;

    const menu = state.textWindows[state.gameMode];

    if(touchController.lastMotion.id!==-1 && menu===undefined && touchController.targetOnTouchDown===null && touchController.lastMotion.active) {
        const dXScreen = touchController.lastMotion.x - touchController.lastMotion.x0;
        const dYScreen = touchController.lastMotion.y - touchController.lastMotion.y0;
        const dXWorld = dXScreen / (pixelsPerTileX * state.camera.scale);
        const dYWorld = dYScreen / (pixelsPerTileY * state.camera.scale);
        state.camera.panning = true;
        state.camera.position[0] -= dXWorld - state.camera.anchor[0];
        state.camera.position[1] -= dYWorld - state.camera.anchor[1];
        state.camera.anchor[0] = dXWorld;
        state.camera.anchor[1] = dYWorld;
    } else {
        state.camera.anchor[0] = 0;
        state.camera.anchor[1] = 0;
    }

    updateTouchButtonsGamepad(touchController, renderer, screenSize, state);

    touchController.activateTouchTargets(menu ? menu.touchTargets : undefined);
}

function updateTouchButtonsGamepad(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    const tt = (renderer.tileSet.touchButtons !== undefined) ? renderer.tileSet.touchButtons : {};

    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize);
    const x = 0;
    const y = statusBarPixelSizeY;
    const w = screenSize[0];
    const h = screenSize[1] - 2*statusBarPixelSizeY;

    const buttonSizePixels = Math.min(80, Math.floor(Math.min(w,h)/5));
    const bw = buttonSizePixels;
    const bh = buttonSizePixels;
    const r = 8;

    const inGame = state.gameMode===GameMode.Mansion;

    const buttonData: Array<{action:string,rect:Rect,tileInfo:TileInfo,visible:boolean}> = [
        {action:'menu',       rect:new Rect(x+r,           y+h-bh-r,    bw,     bh),     tileInfo:tt['menu'],       visible:true},
        {action:'zoomIn',     rect:new Rect(x+w-bw-r,      y+h-bh-r,    bw,     bh),     tileInfo:tt['zoomIn'],     visible:inGame},
        {action:'zoomOut',    rect:new Rect(x+w-bw-r,      y+h-2*bh-r,  bw,     bh),     tileInfo:tt['zoomOut'],    visible:inGame},
        {action:'left',       rect:new Rect(x+r,           y+bh+r,      bw,     bh),     tileInfo:tt['left'],       visible:true},
        {action:'right',      rect:new Rect(x+2*bw+r,      y+bh+r,      bw,     bh),     tileInfo:tt['right'],      visible:true},
        {action:'up',         rect:new Rect(x+bw+r,        y+2*bh+r,    bw,     bh),     tileInfo:tt['up'],         visible:true},
        {action:'down',       rect:new Rect(x+bw+r,        y+r,         bw,     bh),     tileInfo:tt['down'],       visible:true},
        {action:'wait',       rect:new Rect(x+bw+r,        y+bh+r,      bw,     bh),     tileInfo:tt['wait'],       visible:inGame},
        {action:'jump',       rect:new Rect(x+w-1.75*bw-r, y+0.75*bw+r, 1.5*bw, 1.5*bh), tileInfo:tt['jump'],       visible:inGame},
        {action:'menuAccept', rect:new Rect(x+w-1.75*bw-r, y+0.75*bw+r, 1.5*bw, 1.5*bh), tileInfo:tt['menuAccept'], visible:!inGame},
    ];

    const emptyRect = new Rect();

    for(const b of buttonData) {
        touchController.updateCoreTouchTarget(b.action, b.visible ? b.rect : emptyRect, b.tileInfo);
    }
}

function updateCamera(state: State, screenSize: vec2, dt: number) {

    const kSpring = 8; // spring constant, radians/sec

    const zoomError = state.zoomLevel - state.camera.zoom;
    const zoomVelocityError = -state.camera.zoomVelocity;

    const zoomAcceleration = (2 * zoomVelocityError + zoomError * kSpring) * kSpring;

    const zoomVelocityNew = state.camera.zoomVelocity + zoomAcceleration * dt;
    state.camera.zoom += (state.camera.zoomVelocity + zoomVelocityNew) * (0.5 * dt);
    state.camera.zoomVelocity = zoomVelocityNew;
    state.camera.scale = Math.pow(zoomPower, state.camera.zoom);

    const velNew = vec2.create();

    if (!state.camera.panning) {
        // Figure out where the camera should be pointed

        const posCameraTarget = vec2.create();
        const scaleTarget = Math.pow(zoomPower, state.zoomLevel);
        cameraTargetCenterPosition(
            posCameraTarget,
            vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY),
            scaleTarget,
            screenSize,
            state.player.pos
        );

        // Update player follow

        const posError = vec2.create();
        vec2.subtract(posError, posCameraTarget, state.camera.position);

        const velError = vec2.create();
        vec2.negate(velError, state.camera.velocity);

        const acc = vec2.create();
        vec2.scale(acc, posError, kSpring**2);
        vec2.scaleAndAdd(acc, acc, velError, 2*kSpring);

        vec2.scaleAndAdd(velNew, state.camera.velocity, acc, dt);
    }

    vec2.scaleAndAdd(state.camera.position, state.camera.position, state.camera.velocity, 0.5 * dt);
    vec2.scaleAndAdd(state.camera.position, state.camera.position, velNew, 0.5 * dt);
    vec2.copy(state.camera.velocity, velNew);

    // Animate jolt

    const kSpringJolt = 24;
    const joltAcc = vec2.create();
    vec2.scale(joltAcc, state.camera.joltOffset, -(kSpringJolt**2));
    vec2.scaleAndAdd(joltAcc, joltAcc, state.camera.joltVelocity, -2*kSpringJolt);
    const joltVelNew = vec2.create();
    vec2.scaleAndAdd(joltVelNew, state.camera.joltVelocity, joltAcc, dt);
    vec2.scaleAndAdd(state.camera.joltOffset, state.camera.joltOffset, state.camera.joltVelocity, 0.5 * dt);
    vec2.scaleAndAdd(state.camera.joltOffset, state.camera.joltOffset, joltVelNew, 0.5 * dt);
    vec2.copy(state.camera.joltVelocity, joltVelNew);
}

function zoomToFitCamera(state: State, screenSize: vec2) {
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize);
    const viewportTileSizeX = screenSize[0] / pixelsPerTileX;
    const viewportTileSizeY = (screenSize[1] - 2 * statusBarPixelSizeY) / pixelsPerTileY;
    const worldTileSizeX = state.gameMap.cells.sizeX;
    const worldTileSizeY = state.gameMap.cells.sizeY;
    if (viewportTileSizeX * worldTileSizeY < viewportTileSizeY * worldTileSizeX) {
        // horizontal dimension is limiting dimension. zoom to fit horizontally
        state.zoomLevel = Math.log(viewportTileSizeX / worldTileSizeX) / Math.log(zoomPower);
    } else {
        // vertical dimension is limiting. zoom to fit vertically
        state.zoomLevel = Math.log(viewportTileSizeY / worldTileSizeY) / Math.log(zoomPower);
    }
    state.zoomLevel = Math.max(0, Math.floor(state.zoomLevel));
}

function snapCamera(state: State, screenSize: vec2) {
    state.camera.zoom = state.zoomLevel;
    state.camera.zoomVelocity = 0;
    state.camera.scale = Math.pow(zoomPower, state.camera.zoom);
    cameraTargetCenterPosition(
        state.camera.position,
        vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY),
        state.camera.scale,
        screenSize,
        state.player.pos
    );
    vec2.zero(state.camera.velocity);
    vec2.zero(state.camera.joltOffset);
    vec2.zero(state.camera.joltVelocity);

    state.topStatusMessageSlide = (state.player.pos[1] >= state.gameMap.cells.sizeY / 2) ? 1 : 0
}

function cameraTargetCenterPosition(posCameraCenter: vec2, worldSize: vec2, zoomScale: number, screenSize: vec2, posPlayer: vec2) {
    const posCenterMin = vec2.create();
    const posCenterMax = vec2.create();
    cameraCenterPositionLegalRange(worldSize, screenSize, zoomScale, posCenterMin, posCenterMax);

    posCameraCenter[0] = Math.max(posCenterMin[0], Math.min(posCenterMax[0], posPlayer[0] + 0.5));
    posCameraCenter[1] = Math.max(posCenterMin[1], Math.min(posCenterMax[1], posPlayer[1] + 0.5));
}

function cameraCenterPositionLegalRange(worldSize: vec2, screenSize: vec2, zoomScale: number, posLegalMin: vec2, posLegalMax: vec2) {
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize);
    const viewPixelSizeX = screenSize[0];
    const viewPixelSizeY = screenSize[1] - statusBarPixelSizeY;
    const viewWorldSizeX = viewPixelSizeX / (pixelsPerTileX * zoomScale);
    const viewWorldSizeY = viewPixelSizeY / (pixelsPerTileY * zoomScale);

    let viewCenterMinX = viewWorldSizeX / 2;
    let viewCenterMaxX = worldSize[0] - viewWorldSizeX / 2;

    if (viewCenterMinX > viewCenterMaxX) {
        viewCenterMinX = viewCenterMaxX = worldSize[0] / 2;
    }

    let viewCenterMinY = viewWorldSizeY / 2;
    let viewCenterMaxY = worldSize[1] - viewWorldSizeY / 2;

    if (viewCenterMinY > viewCenterMaxY) {
        viewCenterMinY = viewCenterMaxY = worldSize[1] / 2;
    }

    posLegalMin[0] = viewCenterMinX;
    posLegalMin[1] = viewCenterMinY;

    posLegalMax[0] = viewCenterMaxX;
    posLegalMax[1] = viewCenterMaxY;
}

function setupViewMatrix(state: State, screenSize: vec2, matScreenFromWorld: mat4) {
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - statusBarPixelSizeY);
    const [viewWorldSizeX, viewWorldSizeY] = viewWorldSize(viewportPixelSize, state.camera.scale);

    const viewWorldCenterX = state.camera.position[0] + state.camera.joltOffset[0];
    const viewWorldCenterY = state.camera.position[1] + state.camera.joltOffset[1];

    const statusBarWorldSizeY = statusBarPixelSizeY / (pixelsPerTileY * state.camera.scale);

    const viewWorldMinX = viewWorldCenterX - viewWorldSizeX / 2;
    const viewWorldMinY = viewWorldCenterY - viewWorldSizeY / 2;

    mat4.ortho(
        matScreenFromWorld,
        viewWorldMinX,
        viewWorldMinX + viewWorldSizeX,
        viewWorldMinY - statusBarWorldSizeY,
        viewWorldMinY + viewWorldSizeY,
        1,
        -1
    );
}

function viewWorldSize(viewportPixelSize: vec2, zoomScale: number): [number, number] {
    const zoomedPixelsPerTileX = pixelsPerTileX * zoomScale;
    const zoomedPixelsPerTileY = pixelsPerTileY * zoomScale;

    const viewWorldSizeX = viewportPixelSize[0] / zoomedPixelsPerTileX;
    const viewWorldSizeY = viewportPixelSize[1] / zoomedPixelsPerTileY;

    return [viewWorldSizeX, viewWorldSizeY];
}

export function statusBarZoom(screenSize: vec2): number {
    const minCharsX = 56;
    const minCharsY = 25;
    const scaleLargestX = Math.max(1, screenSize[0] / (statusBarCharPixelSizeX * minCharsX));
    const scaleLargestY = Math.max(1, screenSize[1] / (statusBarCharPixelSizeY * minCharsY));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const scaleFactorSnapped = Math.floor(scaleFactor * 2) / 2;
    return scaleFactorSnapped;
}

function renderTextBox(renderer: Renderer, screenSize: vec2, state: State) {
    if (state.popups.currentPopupTimeRemaining <= 0)
        return;

    const message = state.popups.currentPopup;
    if (message.length === 0)
        return;

    const tileZoom = statusBarZoom(screenSize);

    const pixelsPerCharX = tileZoom * statusBarCharPixelSizeX;
    const pixelsPerCharY = tileZoom * statusBarCharPixelSizeY;

    const worldToPixelScaleX = pixelsPerTileX * state.camera.scale;
    const worldToPixelScaleY = pixelsPerTileY * state.camera.scale;

    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - pixelsPerCharY);
    const [viewWorldSizeX, viewWorldSizeY] = viewWorldSize(viewportPixelSize, state.camera.scale);

    const viewWorldCenterX = state.camera.position[0] + state.camera.joltOffset[0];
    const viewWorldCenterY = state.camera.position[1] + state.camera.joltOffset[1];

    const posPopupWorld = state.popups.currentPopupWorldPos();
    const popupPixelX = Math.floor(((posPopupWorld[0] + 0.5 - viewWorldCenterX) + viewWorldSizeX / 2) * worldToPixelScaleX);
    const popupPixelY = Math.floor(((posPopupWorld[1] + 0.5 - viewWorldCenterY) + viewWorldSizeY / 2) * worldToPixelScaleY) + pixelsPerCharY;

    const lines = message.split('\n');

    const numCharsX = lines.reduce((maxLen, line) => Math.max(maxLen, line.length), 0);
    const numCharsY = lines.length;

    const matScreenFromWorld = mat4.create();
    mat4.ortho(
        matScreenFromWorld,
        0, screenSize[0],
        0, screenSize[1],
        1, -1
    );

    const marginX = tileZoom * 4;
    const marginY = tileZoom * 2;
    const border = tileZoom * 2;

    const rectSizeX = numCharsX * pixelsPerCharX + 2 * (marginX + border);
    const rectSizeY = numCharsY * pixelsPerCharY + 2 * (marginY + border);

    let yMin: number;

    const xMin = Math.floor(Math.max(0, Math.min(screenSize[0] - rectSizeX, popupPixelX - rectSizeX / 2)));

    if (state.popups.currentPopupBelow) {
        yMin = Math.floor(popupPixelY + -0.5 * worldToPixelScaleY - rectSizeY);
    } else {
        yMin = Math.floor(popupPixelY + 1.0 * worldToPixelScaleY);
    }

    yMin = Math.max(pixelsPerCharY, Math.min(screenSize[1] - rectSizeY, yMin));

    renderer.start(matScreenFromWorld, 0);

    renderer.addGlyph(xMin, yMin, xMin + numCharsX * pixelsPerCharX + 2*(marginX + border), yMin + numCharsY * pixelsPerCharY + 2*(marginY + border), {textureIndex:219, color:0xff080808});
    renderer.addGlyph(xMin + border, yMin + border, xMin + numCharsX * pixelsPerCharX + 2*marginX + border, yMin + numCharsY * pixelsPerCharY + 2*marginY + border, {textureIndex:219, color:0xffd0d0d0});

    let y = yMin + (numCharsY - 1) * pixelsPerCharY + marginY + border;
    for (const line of lines) {
        let x = Math.floor(xMin + marginX + border + (numCharsX - line.length) * pixelsPerCharX / 2);

        for (let i = 0; i < line.length; ++i) {
            const glyphIndex = line.charCodeAt(i);
            renderer.addGlyph(x, y, x + pixelsPerCharX, y + pixelsPerCharY, {textureIndex:glyphIndex, color:0xff080808});
            x += pixelsPerCharX;
        }
    
        y -= pixelsPerCharY;
    }

    renderer.flush();
}

function renderStatusOverlay(renderer: Renderer, screenSize: vec2, state: State) {
    const message = state.topStatusMessage;
    if (message.length === 0) {
        return;
    }

    const borderX = 1;
    const borderY = 0.25;

    const tileZoom = statusBarZoom(screenSize);
    const colorBackground = 0xb0000000;

    const screenSizeInTilesX = screenSize[0] / (tileZoom * statusBarCharPixelSizeX);
    const screenSizeInTilesY = screenSize[1] / (tileZoom * statusBarCharPixelSizeY);

    const matScreenFromText = mat4.create();

    const offsetTilesX = (screenSizeInTilesX - message.length) / -2;

    {
        const offsetTilesY = borderY + -(3 + borderY);

        mat4.ortho(
            matScreenFromText,
            offsetTilesX, screenSizeInTilesX + offsetTilesX,
            offsetTilesY, screenSizeInTilesY + offsetTilesY,
            1, -1
        );

        const u = state.topStatusMessageSlide;
        const colorBackgroundFade = colorLerp(0x00080808, 0xb0080808, u);
        const colorForegroundFade = colorLerp(0x00ffffff, 0xffffffff, u);
        renderer.start(matScreenFromText, 0);
        renderer.addGlyph(-borderX, -borderY, message.length + borderX, 1 + borderY, {textureIndex: fontTileSet.background.textureIndex, color: colorBackgroundFade, unlitColor: colorBackgroundFade});
        putString(renderer, 0, message, colorForegroundFade);
        renderer.flush();
    }

    {
        const offsetTilesY = (3 + borderY) - (screenSizeInTilesY + borderY);

        mat4.ortho(
            matScreenFromText,
            offsetTilesX, screenSizeInTilesX + offsetTilesX,
            offsetTilesY, screenSizeInTilesY + offsetTilesY,
            1, -1
        );

        const u = 1 - state.topStatusMessageSlide;
        const colorBackgroundFade = colorLerp(0x00080808, 0xb0080808, u);
        const colorForegroundFade = colorLerp(0x00ffffff, 0xffffffff, u);

        renderer.start(matScreenFromText, 0);
        renderer.addGlyph(-borderX, -borderY, message.length + borderX, 1 + borderY, {textureIndex: fontTileSet.background.textureIndex, color: colorBackgroundFade, unlitColor: colorBackgroundFade});
        putString(renderer, 0, message, colorForegroundFade);
        renderer.flush();
    }
}

function colorLerp(color0: number, color1: number, u: number): number {
    const r0 = (color0 & 255);
    const g0 = ((color0 >> 8) & 255);
    const b0 = ((color0 >> 16) & 255);
    const a0 = ((color0 >> 24) & 255);

    const r1 = (color1 & 255);
    const g1 = ((color1 >> 8) & 255);
    const b1 = ((color1 >> 16) & 255);
    const a1 = ((color1 >> 24) & 255);

    const r = Math.max(0, Math.min(255, Math.trunc(r0 + (r1 - r0) * u)));
    const g = Math.max(0, Math.min(255, Math.trunc(g0 + (g1 - g0) * u)));
    const b = Math.max(0, Math.min(255, Math.trunc(b0 + (b1 - b0) * u)));
    const a = Math.max(0, Math.min(255, Math.trunc(a0 + (a1 - a0) * u)));

    return r + (g << 8) + (b << 16) + (a << 24);
}

function putString(renderer: Renderer, x: number, s: string, color: number) {
    for (let i = 0; i < s.length; ++i) {
        let glyphIndex = s.charCodeAt(i);
        if (glyphIndex === 10) {
            glyphIndex = 32;
        }
        renderer.addGlyph(x, 0, x + 1, 1, {textureIndex:glyphIndex, color:color});
        ++x;
    }
}

function renderBottomStatusBar(renderer: Renderer, screenSize: vec2, state: State) {
    const tileZoom = statusBarZoom(screenSize);

    const screenSizeInTilesX = screenSize[0] / (tileZoom * statusBarCharPixelSizeX);
    const screenSizeInTilesY = screenSize[1] / (tileZoom * statusBarCharPixelSizeY);

    const matScreenFromWorld = mat4.create();

    mat4.ortho(
        matScreenFromWorld,
        0, screenSizeInTilesX,
        0, screenSizeInTilesY,
        1, -1
    );

    renderer.start(matScreenFromWorld, 0);

    renderer.addGlyph(0, 0, screenSizeInTilesX, 1, fontTileSet.background);

    let leftSideX = 1;

    const playerUnderwater = state.gameMap.cells.atVec(state.player.pos).type == TerrainType.GroundWater && state.player.turnsRemainingUnderwater > 0;
    if (playerUnderwater) {
        // Underwater indicator

        const glyphBubble = fontTileSet.air.textureIndex;
        for (let i = 0; i < maxPlayerTurnsUnderwater - 2; ++i) {
            const color = (i < state.player.turnsRemainingUnderwater - 1) ? colorPreset.lightCyan : colorPreset.darkGray;
            renderer.addGlyph(leftSideX, 0, leftSideX + 1, 1, {textureIndex:glyphBubble, color:color});
            ++leftSideX;
        }
    } else {
        // Health indicator

        const glyphHeart = fontTileSet.heart.textureIndex;
        for (let i = 0; i < maxPlayerHealth; ++i) {
            const color = (i < state.player.health) ? colorPreset.darkRed : colorPreset.darkGray;
            renderer.addGlyph(leftSideX, 0, leftSideX + 1, 1, {textureIndex:glyphHeart, color:color});
            ++leftSideX;
        }
    }

    // Leap toggle indicator

    ++leftSideX;
    const msgLeapToggle = 'Leap';
    if (state.leapToggleActive) {
        putString(renderer, leftSideX, msgLeapToggle, colorPreset.lightGreen);
    }
    leftSideX += msgLeapToggle.length;

    let rightSideX = screenSizeInTilesX;

    const percentRevealed = Math.floor(state.gameMap.fractionRevealed() * 100);
    if (percentRevealed >= 100) {
        // Total loot

        let msgLoot = 'Loot ' + state.lootStolen + '/' + (percentRevealed >= 100 ? state.lootAvailable : '?');
        rightSideX -= msgLoot.length + 1;
        putString(renderer, rightSideX, msgLoot, colorPreset.lightYellow);
    } else {
        // Mapping percentage

        let msgSeen = 'Map ' + percentRevealed + '%';
        rightSideX -= msgSeen.length + 1;
        putString(renderer, rightSideX, msgSeen, colorPreset.white);
    }

    // Key possession

    const msgKey = 'Key';
    if (state.player.hasVaultKey) {
        rightSideX -= msgKey.length + 1;
        putString(renderer, rightSideX, msgKey, colorPreset.lightCyan);
    }

    // Level number, turn count, and speed bonus

    const msgLevel = (state.dailyRun ? 'Daily Lvl ' : 'Lvl ') + (state.level + 1);

    let msgTimer = state.turns + '/' + numTurnsParForCurrentMap(state);

    const ghosted = state.levelStats.numSpottings === 0;
    if (!ghosted) {
        msgTimer += '!';
    }

    const centeredX = (leftSideX + rightSideX - (msgLevel.length + msgTimer.length + 1)) / 2;
    putString(renderer, centeredX, msgLevel, colorPreset.lightGray);
    putString(renderer, centeredX + msgLevel.length + 1, msgTimer, colorPreset.darkGray);

    renderer.flush();
}

export function getCurrentDateFormatted(date:Date|null=null, utcConvert:boolean=true):string {
    const currentDate = date ?? new Date();
  
    // Extract the year, month, and day from the Date object
    const year = utcConvert?currentDate.getUTCFullYear():currentDate.getFullYear();
    const month = 1 + (utcConvert?currentDate.getUTCMonth():currentDate.getMonth()); // Months are 0-indexed, so we add 1
    const day = utcConvert?currentDate.getUTCDate():currentDate.getDate();
  
    // Format the date components as strings with proper padding
    const yearString = String(year);
    const monthString = String(month).padStart(2, '0');
    const dayString = String(day).padStart(2, '0');
  
    // Concatenate the date components using the desired format
    const formattedDate = `${yearString}/${monthString}/${dayString}`;
  
    return formattedDate;
}
  
  