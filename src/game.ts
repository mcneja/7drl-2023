import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap, Adjacency } from './create-map';
import { BooleanGrid, Cell, ItemType, GameMap, Item, Player, TerrainType, maxPlayerHealth, maxPlayerTurnsUnderwater, GuardStates, CellGrid, isDoorItemType } from './game-map';
import { SpriteAnimation, LightSourceAnimation, tween, LightState, FrameAnimator } from './animation';
import { Guard, GuardMode, guardActAll, lineOfSight, isRelaxedGuardMode } from './guard';
import { Renderer } from './render';
import { RNG, randomInRange } from './random';
import { TileInfo, getTileSet, getFontTileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups } from './popups';
import { Controller, TouchController, GamepadManager, KeyboardController, lastController, Rect } from './controllers';
import { HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, BetweenMansionsScreen, HelpScreen, DailyHubScreen } from './ui'
import {Camera, GameMode, LevelStats, PersistedStats, ScoreEntry, State} from './types';

import * as colorPreset from './color-preset';

export const gameConfig = {
    numGameMaps: 10,
    totalGameLoot: 100
}

enum NoiseType {
    Creak,
    Splash,
}

const tileSet = getTileSet();
const fontTileSet = getFontTileSet(); 

window.onload = loadResourcesThenRun;

const targetStatusBarWidthInChars: number = 80;
const statusBarCharPixelSizeX: number = 8;
const statusBarCharPixelSizeY: number = 16;
//TODO: The constants live in the tileset and code should reference the tileset
const pixelsPerTileX: number = 16; // width of unzoomed tile
const pixelsPerTileY: number = 16; // height of unzoomed tile
const zoomPower: number = 1.1892;
const initZoomLevel: number = 4;
const minZoomLevel: number = -4;
const maxZoomLevel: number = 16;

const leapPrompt = 'Shift+Move: Leap/Run';

function loadResourcesThenRun() {
    Promise.all([
        loadImage(fontTileSet.imageSrc, fontTileSet.image),
        loadImage(tileSet.imageSrc, tileSet.image),
    ]).then(main);
}

function main(images: Array<HTMLImageElement>) {

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
    document.body.addEventListener('keydown', e=>ensureInitSound());
    canvas.addEventListener('mousedown', e=>ensureInitSound());
    canvas.addEventListener('touchstart', e=>ensureInitSound());
    window.addEventListener("gamepadconnected", e=>ensureInitSound());

    const renderer = new Renderer(canvas, tileSet, fontTileSet);
    const sounds:Howls = {};
    const subtitledSounds:SubtitledHowls = {};
    const activeSoundPool:ActiveHowlPool = new ActiveHowlPool();
    const touchController = new TouchController(canvas, true);
    const state = initState(sounds, subtitledSounds, activeSoundPool, touchController);

    function ensureInitSound() {
        if (Object.keys(state.sounds).length==0) {
            setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);
        }
    }
    
    function requestUpdateAndRender() {
        requestAnimationFrame(now => updateAndRender(now, renderer, state));
    }

    function onWindowResized() {
        requestUpdateAndRender();
    }

    window.addEventListener('resize', onWindowResized);

    requestUpdateAndRender();
}


function updateControllerState(state:State) {
    state.gamepadManager.updateGamepadStates();
    if(lastController !== null) {
        if(state.helpActive) {
            state.helpScreen.onControls(state, activated);
        } else {
            if(state.gameMode == GameMode.Mansion) {
                onControlsInMansion(lastController);
            } else {
                state.textWindows[state.gameMode]?.onControls(state, menuActivated);
            }    
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
        if(lastController===state.touchController) {
            const t = state.touchController;
            if(action in t.touchTargets && t.touchTargets[action].trigger=='release') {
                result = lastController.currentFrameReleases.has(action);
                if(result) lastController.controlTimes[action] = dt;
                return result;
            }
        }
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
        if(lastController===state.touchController) {
            const t = state.touchController;
            if(action in t.touchTargets && t.touchTargets[action].trigger=='release') {
                result = lastController.currentFrameReleases.has(action);
                if(result) lastController.controlTimes[action] == Date.now();
                return result;
            }
        }
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
            if (state.leapToggleActive || controller.controlStates['jump']) {
                tryPlayerLeap(state, -1, 0);
            } else {
                tryPlayerStep(state, -1, 0);
            }
        } else if (activated('right')) {
            if (state.leapToggleActive || controller.controlStates['jump']) {
                tryPlayerLeap(state, 1, 0);
            } else {
                tryPlayerStep(state, 1, 0);
            }
        } else if (activated('down')) {
            if (state.leapToggleActive || controller.controlStates['jump']) {
                tryPlayerLeap(state, 0, -1);
            } else {
                tryPlayerStep(state, 0, -1);
            }
        } else if (activated('up')) {
            if (state.leapToggleActive || controller.controlStates['jump']) {
                tryPlayerLeap(state, 0, 1);
            } else {
                tryPlayerStep(state, 0, 1);
            }
        } else if (activated('jumpLeft')) {
            tryPlayerLeap(state, -1, 0);
        } else if (activated('jumpRight')) {
            tryPlayerLeap(state, 1, 0);
        } else if (activated('jumpDown')) {
            tryPlayerLeap(state, 0, -1);
        } else if (activated('jumpUp')) {
            tryPlayerLeap(state, 0, 1);
        } else if (activated('wait')) {
            tryPlayerWait(state);
        } else if (activated('exitLevel')) {
            if (state.level >= gameConfig.numGameMaps - 1) {
                advanceToWin(state);
            } else {
                advanceToBetweenMansions(state);
            }
        } else if (activated('menu')) {
            if(state.player.health>0) {
                state.helpActive = true;
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
            state.guardMute = !state.guardMute;
            for(const s in state.subtitledSounds) {
                state.subtitledSounds[s].mute = state.guardMute;
            }
        } else if (activated('volumeMute')) {
            state.volumeMute = !state.volumeMute;
            Howler.mute(state.volumeMute);
        } else if (activated('volumeDown')) {
            const vol = Howler.volume();
            Howler.volume(Math.max(vol-0.1,0.1));
        } else if (activated('volumeUp')) {
            const vol = Howler.volume();
            Howler.volume(Math.max(vol+0.1,1.0));
        }
    }
}

function scoreCompletedLevel(state: State) {
    if(state.gameMapRoughPlans[state.level].played) {
        return;
    }
    state.gameMapRoughPlans[state.level].played = true;

    const ghosted = state.levelStats.numSpottings === 0 && state.levelStats.numKnockouts === 0;
    const score = Math.ceil(calculateTimeBonus(state) * ghostMultiplier(state.levelStats));

    state.gameStats.loot = state.player.loot;
    state.gameStats.lootStolen += state.lootStolen;
    state.gameStats.totalScore += score;
    state.gameStats.turns = state.totalTurns;
    state.gameStats.numLevels = state.gameMapRoughPlans.length;
    state.gameStats.numCompletedLevels = state.level + 1;
    state.gameStats.numGhostedLevels += ghosted ? 1 : 0;
    state.gameStats.win = state.level === (gameConfig.numGameMaps - 1) && state.player.health > 0;
    state.gameStats.daily = state.dailyRun;
}

function clearLevelStats(levelStats: LevelStats) {
    levelStats.numKnockouts = 0;
    levelStats.numSpottings = 0;
    levelStats.damageTaken = 0;
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
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = 0;
    state.finishedLevel = false;

    state.turns = 0;
    state.lootStolen = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;

    clearLevelStats(state.levelStats);

    state.player.pos = state.gameMap.playerStartPos;
    state.player.dir = vec2.fromValues(0, -1);
    state.player.noisy = false;
    state.player.hasVaultKey = false;
    state.player.damagedLastTurn = false;
    state.player.turnsRemainingUnderwater = maxPlayerTurnsUnderwater;
    state.popups.clear();

    state.camera = createCamera(state.gameMap.playerStartPos, state.zoomLevel);
    state.gameMode = GameMode.Mansion;

    postTurn(state);
}

export function calculateTimeBonus(state:State):number {
    const numDiscoverableCells = state.gameMap.numCells() - state.gameMap.numPreRevealedCells;
    const numTurnsPar = Math.ceil(numDiscoverableCells / 2);
    return Math.max(0, numTurnsPar - state.turns);
}

export function ghostMultiplier(levelStats: LevelStats): number {
    let multiplier = 1;
    if (levelStats.numKnockouts === 0) {
        multiplier += 1/3;
    }
    if (levelStats.numSpottings === 0) {
        multiplier += 1/3;
    }
    if (levelStats.damageTaken === 0) {
        multiplier += 1/3;
    }
    return multiplier;
}

function advanceToBetweenMansions(state: State) {
    scoreCompletedLevel(state);
    state.activeSoundPool.empty();
    state.sounds['levelCompleteJingle'].play(0.35);
    state.gameMode = GameMode.BetweenMansions;
    if(state.lootStolen === state.lootAvailable) {
        state.persistedStats.totalLootSweeps++;
        setStat('totalLootSweeps',state.persistedStats.totalLootSweeps);
    }
    if(state.levelStats.numKnockouts === 0 && state.levelStats.numSpottings === 0) {
        state.persistedStats.totalGhosts++;
        setStat('totalGhosts',state.persistedStats.totalGhosts);
    }
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = 0;
}

function advanceToWin(state: State) {
    scoreCompletedLevel(state);
    state.activeSoundPool.empty();
    if (state.player.loot>95 && Math.random()>0.9) state.sounds['easterEgg'].play(0.5);
    else state.sounds['victorySong'].play(0.5);
    state.persistedStats.totalWins++;
    const score = state.gameStats.totalScore;
    state.persistedStats.bestScore = Math.max(state.persistedStats.bestScore, score);
    state.persistedStats.totalGold+= state.gameStats.lootStolen;
    const scoreEntry: ScoreEntry = {
        score: score,
        date: getCurrentDateFormatted(),
        turns: state.totalTurns,
        level: state.level+1
    };
    state.persistedStats.highScores.push(scoreEntry);
    if(state.dailyRun) {
        state.persistedStats.bestDailyScore = Math.max(state.persistedStats.bestDailyScore, state.player.loot);
        state.persistedStats.dailyWins++;
        state.persistedStats.dailyWinStreak++;
        state.persistedStats.lastDaily = scoreEntry;
        state.persistedStats.dailyScores.push(scoreEntry);
        //TODO: notify user if the game was finished after the deadline
        // if(state.dailyRun===getCurrentDateFormatted()) state.scoreServer.addScore(score, state.totalTurns, state.level+1);
    }
    state.gameMode = GameMode.Win;
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = 0;

    saveStats(state.persistedStats);
}

function collectLoot(state: State, pos: vec2, posFlyToward: vec2): boolean {
    const itemsCollected = state.gameMap.collectLootAt(pos);
    if (itemsCollected.length === 0) {
        return false;
    }
    let coinCollected = false;
    let healthCollected = false;
    for (const item of itemsCollected) {
        if (item.type === ItemType.Coin) {
            ++state.player.loot;
            ++state.lootStolen;
            coinCollected = true;
        } else if (item.type === ItemType.Health) {
            state.player.health = Math.min(maxPlayerHealth, state.player.health + 1);
            healthCollected = true;
        }
        const pt0 = vec2.create();
        const pt2 = vec2.fromValues((posFlyToward[0]-item.pos[0]), (posFlyToward[1]-item.pos[1]));
        const pt1 = pt2.scale(0.3333).add(vec2.fromValues(0,0.5));
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

    // Cannot step onto torches or portcullises

    for (const item of state.gameMap.items.filter((item) => item.pos.equals(pos))) {
        switch (item.type) {
        case ItemType.DrawersShort:
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
        case ItemType.PortcullisEW:
        case ItemType.PortcullisNS:
            return false;
        }
    }

    // Cannot step onto guards

    if (state.gameMap.guards.find((guard)=>guard.pos.equals(pos))) {
        return false;
    }

    return true;
}

function canLeapToPos(state: State, pos: vec2): boolean {

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

    // Terrain sound effects

    const volScale = 0.5 + Math.random()/2;
    const changedTile = cellOld.type !== cellNew.type;

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

function collectGuardLoot(state:State, player:Player, guard:Guard, posNew:vec2) {
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
        const animation = new SpriteAnimation([
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

function tryPlayerWait(state: State) {
    const player = state.player;

    // Can't move if you're dead.
    if (player.health <= 0) {
        return;
    }

    state.idleTimer = 5;

    // Move camera with player by releasing any panning motion
    state.camera.panning = false;
    state.touchController.clearMotion();

    preTurn(state);

    state.gameMap.identifyAdjacentCells(player.pos);

    player.pickTarget = null;

    ++state.numWaitMoves;

    advanceTime(state);
}

function tryPlayerStep(state: State, dx: number, dy: number) {

    // Can't move if you're dead

    const player = state.player;
    if (player.health <= 0) {
        return;
    }

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
            if (state.level < gameConfig.numGameMaps - 1) {
                advanceToBetweenMansions(state);
            } else {
                advanceToWin(state);
            }

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
            bumpFail(state, dx, dy);
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

        bumpFail(state, dx, dy);
        return;
    }

    // Trying to move into a one-way window instead of leaping through?

    if (isOneWayWindowTerrainType(cellNew.type)) {
        setStatusMessage(state, leapPrompt);

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
                setStatusMessage(state, leapPrompt);
            }
            if (collectLoot(state, posNew, player.pos)) {
                preTurn(state);
                player.pickTarget = null;
                bumpAnim(state, dx, dy);
                advanceTime(state);
            } else {
                bumpFail(state, dx, dy);
            }
            return;

        case ItemType.TorchUnlit:
            preTurn(state);
            state.sounds["ignite"].play(0.08);
            item.type = ItemType.TorchLit;
            player.pickTarget = null;
            bumpAnim(state, dx, dy);
            advanceTime(state);
            return;

        case ItemType.TorchLit:
            preTurn(state);
            state.sounds["douse"].play(0.05);
            item.type = ItemType.TorchUnlit;
            player.pickTarget = null;
            bumpAnim(state, dx, dy);
            advanceTime(state);
            return;

        case ItemType.PortcullisEW:
        case ItemType.PortcullisNS:
            setStatusMessage(state, leapPrompt);
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

                bumpFail(state, dx, dy);
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
    let mid = start.add(end).scale(0.5).add(vec2.fromValues(0,0.0625));
    const hid = player.hidden(state.gameMap);

    let tweenSeq;

    if (guard !== undefined && guard.mode === GuardMode.Unconscious) {
        const gp = vec2.fromValues(0.5*(posOld[0]-posNew[0]),0.5*(posOld[1]-posNew[1]));
        tweenSeq = [
            {pt0:start, pt1:gp, duration:0.2, fn:tween.easeInQuad},
            {pt0:gp, pt1:end, duration:0.1, fn:tween.easeOutQuad},
        ];
    } else {
        tweenSeq = [
            {pt0:start, pt1:mid, duration:0.1, fn:tween.easeInQuad},
            {pt0:mid, pt1:end, duration:0.1, fn:tween.easeOutQuad},
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
        makeNoise(state.gameMap, player, NoiseType.Creak, 17, state.sounds);
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

    state.idleTimer = 5;

    // Move camera with player by releasing any panning motion

    state.camera.panning = false;
    state.touchController.clearMotion();

    // Get the player's current position and new position, and the middle position between them

    const posOld = vec2.clone(player.pos);
    const posMid = vec2.fromValues(player.pos[0] + dx, player.pos[1] + dy);
    const posNew = vec2.fromValues(player.pos[0] + 2*dx, player.pos[1] + 2*dy);

    // If the midpoint is an unaware guard, knock them unconscious

    const guardMid = state.gameMap.guards.find((guard) =>
        guard.pos.equals(posMid) &&
        guard.mode !== GuardMode.Unconscious &&
        guard.mode !== GuardMode.ChaseVisibleTarget);

    if (guardMid) {
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
        return;
    }

    // If player is in water, downgrade to a step

    if (state.gameMap.cells.atVec(posOld).type === TerrainType.GroundWater) {
        tryPlayerStep(state, dx, dy);
        return;
    }

    // If the midpoint is off the map, downgrade to a step

    if (posMid[0] < 0 ||
        posMid[1] < 0 ||
        posMid[0] >= state.gameMap.cells.sizeX ||
        posMid[1] >= state.gameMap.cells.sizeY) {
        tryPlayerStep(state, dx, dy);
        return;
    }

    // If the midpoint is a wall, downgrade to a step

    const cellMid = state.gameMap.cells.atVec(posMid);
    if (cellMid.blocksPlayerMove) {
        tryPlayerStep(state, dx, dy);
        return;
    }

    // If the midpoint is a door, downgrade to a step

    if ((cellMid.type === TerrainType.DoorNS || cellMid.type === TerrainType.DoorEW) &&
        state.gameMap.items.find((item)=>item.pos.equals(posMid) && isDoorItemType(item.type))) {
        tryPlayerStep(state, dx, dy);
        return;
    }

    // If the midpoint is a one-way window but is the wrong way, downgrade to a step

    if ((cellMid.type == TerrainType.OneWayWindowE && posNew[0] <= posOld[0]) ||
        (cellMid.type == TerrainType.OneWayWindowW && posNew[0] >= posOld[0]) ||
        (cellMid.type == TerrainType.OneWayWindowN && posNew[1] <= posOld[1]) ||
        (cellMid.type == TerrainType.OneWayWindowS && posNew[1] >= posOld[1])) {
        tryPlayerStep(state, dx, dy);
        return;
    }

    // If the leap destination is blocked, try a step if it can succeeed; else fail

    if (!canLeapToPos(state, posNew)) {
        if (canStepToPos(state, posMid)) {
            tryPlayerStep(state, dx, dy);
        } else if (collectLoot(state, posMid, player.pos)) {
            preTurn(state);
            player.pickTarget = null;
            bumpAnim(state, dx, dy);
            advanceTime(state);
        } else {
            bumpFail(state, dx, dy);
        }
        return;
    }

    // Handle a guard at the endpoint

    const guard = state.gameMap.guards.find((guard) => guard.pos.equals(posNew));
    if (guard === undefined || !(guard.hasPurse || guard.hasVaultKey)) {
        player.pickTarget = null;
    } else {
        player.pickTarget = guard;
    }

    // Execute the leap

    preTurn(state);

    // Collect any loot from posMid

    collectLoot(state, posMid, posNew);

    // End level if moving off the map

    if (posNew[0] < 0 ||
        posNew[1] < 0 ||
        posNew[0] >= state.gameMap.cells.sizeX ||
        posNew[1] >= state.gameMap.cells.sizeY) {
        if (state.level < gameConfig.numGameMaps - 1) {
            advanceToBetweenMansions(state);
        } else {
            advanceToWin(state);
        }

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

    const cellNew = state.gameMap.cells.atVec(posNew);
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

    if (cellNew.type === TerrainType.GroundWoodCreaky) {
        makeNoise(state.gameMap, player, NoiseType.Creak, 17, state.sounds);
    } else if (cellNew.type === TerrainType.GroundWater) {
        makeNoise(state.gameMap, player, NoiseType.Splash, 17, state.sounds);
    }

    // Let guards take a turn

    advanceTime(state);

    // Play sound for terrain type changes

    playMoveSound(state, state.gameMap.cells.atVec(posOld), cellNew);

    if (cellMid.type === TerrainType.PortcullisNS || cellMid.type === TerrainType.PortcullisEW) {
        state.sounds['gate'].play(0.3);
    }
}

function canLeapOntoItemType(itemType: ItemType): boolean {
    switch (itemType) {
        case ItemType.DrawersShort:
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
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

function makeNoise(map: GameMap, player: Player, noiseType: NoiseType, radius: number, sounds: Howls) {
    player.noisy = true;

    switch (noiseType) {
        case NoiseType.Creak:
            sounds.footstepCreaky.play(0.6);
            break;
        case NoiseType.Splash:
            // TODO: splash sound effect
            // sounds.leapSplash.play(0.6);
            break;
    }

    let closestGuardDist = Infinity;
    let closestGuard = null;

    for (const guard of map.guardsInEarshot(player.pos, radius)) {
        guard.heardThief = true;

        const dist = player.pos.squaredDistance(guard.pos);
        if (dist < closestGuardDist && isRelaxedGuardMode(guard.mode)) {
            closestGuardDist = dist;
            closestGuard = guard;
        }
    }

    if (closestGuard !== null) {
        closestGuard.heardThiefClosest = true;
    }
}

function preTurn(state: State) {
    state.popups.clear();
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
}

function advanceTime(state: State) {
    let oldHealth = state.player.health;
    state.turns++;
    state.totalTurns++;
    if (state.gameMap.cells.atVec(state.player.pos).type == TerrainType.GroundWater) {
        if (state.player.turnsRemainingUnderwater > 0) {
            --state.player.turnsRemainingUnderwater;
        }
    } else {
        state.player.turnsRemainingUnderwater = maxPlayerTurnsUnderwater;
    }

    state.gameMap.computeLighting(state.gameMap.cells.atVec(state.player.pos));

    guardActAll(state, state.gameMap, state.popups, state.player);

    state.gameMap.recomputeVisibility(state.player.pos);

    postTurn(state);

    if (oldHealth > state.player.health) {
        state.sounds['hitPlayer'].play(0.5);

        if (state.player.health <= 0) {
            setTimeout(()=>state.sounds['gameOverJingle'].play(0.5), 1000);
            if(state.dailyRun) {
                state.persistedStats.dailyWinStreak=0;
                setStat('dailyWinStreak',state.persistedStats.dailyWinStreak)    
//                setStat('lastDaily', state.gameStats);
            }
            setStatusMessageSticky(state, 'You were killed. Press Escape/Menu to see score.');
        }
    }
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

    // Update top status-bar message

    const subtitle = state.popups.endOfUpdate(state.subtitledSounds);

    if (subtitle !== '') {
        setStatusMessageSticky(state, subtitle);
    } else if (allSeen) {
        if (allLooted) {
            setStatusMessage(state, 'Loot collected! Exit any map edge');
        } else {
            setStatusMessage(state, 'Collect all loot');
        }
    } else if (state.numStepMoves < 4) {
        setStatusMessage(state, 'Left, Right, Up, Down: Move');
    } else if (state.numLeapMoves < 4) {
        setStatusMessage(state, leapPrompt);
    } else if (state.level === 0) {
        setStatusMessage(state, 'Map entire mansion');
    } else if (state.level === 1) {
        if (state.numWaitMoves < 4) {
            setStatusMessage(state, 'Z, Period, or Space: Wait');
        } else if (!state.hasOpenedMenu) {
            setStatusMessage(state, 'Esc or Slash: More help');
        } else if (!state.topStatusMessageSticky) {
            setStatusMessage(state, '');
        }
    } else if (state.level === 3 && state.turns === 0) {
        setStatusMessage(state, 'Zoom view with brackets [ and ]');
    } else if (!state.topStatusMessageSticky) {
        setStatusMessage(state, '');
    }
}

function setStatusMessage(state: State, msg: string) {
    if (state.topStatusMessage === msg) {
        return;
    }

    state.topStatusMessage = msg;
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = (msg.length === 0) ? 0 : 1;
}

function setStatusMessageSticky(state: State, msg: string) {
    if (state.topStatusMessage === msg) {
        return;
    }

    state.topStatusMessage = msg;
    state.topStatusMessageSticky = true;
    state.topStatusMessageAnim = (msg.length === 0) ? 0 : 1;
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
                cells.at(x,y).litAnim = lightAnimator(c.lit,   lightStates, c.litSrc, seeAll || c.seen);
            } else {
                //Walls and portals get rendered unlit regardless of light sources
                cells.at(x,y).litAnim = 0;                
            }
        }
    }
}

function litVertices(x:number, y:number, cells:CellGrid, lightStates:Array<number>, seeAll: boolean):[number,number,number,number] {
    const l =  cells.at(x,y).litAnim;
    const scale = l>0? 1:0.03;

    const llu = cells.at(x-1,y-1).litAnim;
    const lu =  cells.at(x,y-1).litAnim;
    const lru = cells.at(x+1,y-1).litAnim;
    const ll =  cells.at(x-1,y).litAnim;
    const lr =  cells.at(x+1,y).litAnim;
    const lld = cells.at(x-1,y+1).litAnim;
    const ld =  cells.at(x,y+1).litAnim;
    const lrd = cells.at(x+1,y+1).litAnim;
    
    return [
        scale*(llu+lu+ll+l)/4, //top left vertex
        scale*(lru+lu+lr+l)/4, //top right
        scale*(lld+ld+ll+l)/4, //bottom left
        scale*(lrd+ld+lr+l)/4, //bottom right
    ];
}

function renderTouchButtons(renderer:Renderer, touchController:TouchController) {
    for(const bkey in touchController.coreTouchTargets) {
        if (!(bkey in touchController.controlStates)) continue;
        const b = touchController.coreTouchTargets[bkey];
        if (b.tileInfo === null || b.view[2] === 0 || b.view[3] === 0) continue;
        const lit = touchController.controlStates[bkey] ? 1 : 0;
        if (b.show==='always' || (b.show==='press' && b.id !== -1)) {
            renderer.addGlyph(
                b.view[0],
                b.view[1],
                b.view[0] + b.view[2],
                b.view[1] + b.view[3],
                b.tileInfo,
                lit);
        }
    }
    renderer.flush();
}

function renderWorld(state: State, renderer: Renderer) {
    const mappedItems:{[id:number]:Array<Item>} = {}; //Sweep over the items and allocate them to a map
    for(let item of state.gameMap.items) {
        const ind = state.gameMap.cells.indexVec(item.pos);
        if(ind in mappedItems) mappedItems[ind].push(item);
        else mappedItems[ind] = [item];
    }
    updateAnimatedLight(state.gameMap.cells, state.lightStates, state.seeAll);

    for (let x = 0; x < state.gameMap.cells.sizeX; ++x) {
        for (let y = state.gameMap.cells.sizeY-1; y >= 0 ; --y) { //Render top to bottom for overlapped 3/4 view tiles
            const cell = state.gameMap.cells.at(x, y);
            if (!cell.seen && !state.seeAll) {
                continue;
            }
            let terrainType = cell.type;
            if (terrainType == TerrainType.GroundWoodCreaky && !cell.lit && !cell.identified) {
                terrainType = TerrainType.GroundWood;
            }
            const lv = litVertices(x, y, state.gameMap.cells, state.lightStates, state.seeAll);

            //Draw tile
            if([TerrainType.PortcullisEW].includes(terrainType)
                && state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                renderer.addGlyph(x, y, x+1, y+1, renderer.tileSet.terrainTiles[TerrainType.PortcullisNS], lv);
            } else {
                const tile = cell.animation? cell.animation.currentTile():renderer.tileSet.terrainTiles[terrainType];
                renderer.addGlyph(x, y, x+1, y+1, tile, lv);
            }
            //Draw border for water
            if(terrainType===TerrainType.GroundWater) {
                const ledge = renderer.tileSet.ledgeTiles;
                let ctr = 0;
                for(let adj of [[0,1],[0,-1],[-1,0],[1,0]]) {
                    const cell = state.gameMap.cells.at(x+adj[0],y+adj[1]);
                    if(cell.type!==TerrainType.GroundWater) {
                        renderer.addGlyph(x, y, x+1, y+1, ledge[ctr], lv);
                    }
                    ctr++;
                }
            }

            const ind = state.gameMap.cells.index(x, y);
            if(!(ind in mappedItems)) continue;
            for(let item of mappedItems[ind]) {
                const lv = litVertices(x, y, state.gameMap.cells, state.lightStates, state.seeAll);
                if([TerrainType.PortcullisEW].includes(terrainType)
                    && state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                    renderer.addGlyph(x, y, x + 1, y + 1, renderer.tileSet.itemTiles[ItemType.PortcullisNS], lv);    
                } else {
                    if([TerrainType.DoorEW, TerrainType.DoorNS].includes(terrainType)) {
                        if(state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y) || state.player.pos[0]==x && state.player.pos[1]==y) {
                            continue; //Don't draw the door if someone standing in it                        
                        }
                    }
                    const ti = item.animation? 
                    item.animation.currentTile():
                    renderer.tileSet.itemTiles[item.type];
                    if (item.animation instanceof SpriteAnimation) {
                        const o = item.animation.offset;
                        renderer.addGlyph(x+o[0], y+o[1], x+o[0] + 1, y+o[1] + 1, ti, lv);
                    } else {
                        renderer.addGlyph(x, y, x + 1, y + 1, ti, lv);
                    }
                }
            }
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
        renderer.addGlyph(x0 + 0.25, y0 + 0.25, x0 + 0.75, y0 + 0.75, tile, 1);
        renderer.addGlyph(x1 + 0.25, y1 + 0.25, x1 + 0.75, y1 + 0.75, tile, 1);
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

        renderer.addGlyph(x0, y0, x1, y1, tile, 1);
    }
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

    let tileInfo:TileInfo;
    if (a) {
        tileInfo = a.currentTile();
    } else {
        const p = renderer.tileSet.playerTiles;
        tileInfo =
            player.health<=0 ? p.dead :
            player.damagedLastTurn ? p.wounded :
            player.noisy ? p.noisy :
            hidden ? p.hidden :
            !lit ? p.unlit :
            p.normal;
    }

    renderer.addGlyph(x, y, x+1, y+1, tileInfo, lit);
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
        const tileInfo = renderer.tileSet.npcTiles[tileIndex];
        const gate = state.gameMap.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
        const offX = (gate!==undefined && gate.pos.equals(guard.pos))? 0.25 : 0;

        let offset = guard.animation?.offset?? vec2.create();
        const x = guard.pos[0] + offset[0] + offX;
        const y = guard.pos[1] + offset[1];
    
        if(guard.hasTorch || guard.hasPurse || guard.hasVaultKey) {
            let t0 = x+guard.dir[0]*0.375+guard.dir[1]*0.375;
            let t1 = y-0.125;
            const tti = guard.torchAnimation?.currentTile() ?? renderer.tileSet.itemTiles[ItemType.TorchCarry];
            let p0 = x-guard.dir[0]*0.250+(guard.dir[1]<0?0.375:0);
            let p1 = y-0.125;
            const pti = guard.hasVaultKey?tileSet.itemTiles[ItemType.KeyCarry]:renderer.tileSet.itemTiles[ItemType.PurseCarry];
            if(guard.dir[1]>0) {
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
            } else if(guard.dir[1]<0) {
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);    
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
            } else {
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);    
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
                if(guard.hasPurse || guard.hasVaultKey) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
            }
        }
        else renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);
        // renderer.addGlyph(guard.pos[0], guard.pos[1], guard.pos[0] + 1, guard.pos[1] + 1, tileInfo, lit);
    }
}

function renderParticles(state: State, renderer: Renderer) {
    for(let p of state.particles) {
        if(p.animation) {
            const a = p.animation
            const offset = a instanceof SpriteAnimation ? a.offset : vec2.create();
            const x = p.pos[0] + offset[0];
            const y = p.pos[1] + offset[1];
            const tileInfo = a.currentTile();
            renderer.addGlyph(x, y, x+1, y+1, tileInfo);
        }
    }
}

function renderIconOverlays(state: State, renderer: Renderer) {
    const player = state.player
    const bubble_right = renderer.tileSet.namedTiles['speechBubbleR'];
    const bubble_left = renderer.tileSet.namedTiles['speechBubbleL'];
    for (const guard of state.gameMap.guards) {
        const cell = state.gameMap.cells.atVec(guard.pos);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        let offset = guard.animation?.offset?? vec2.create();
        const x = guard.pos[0] + offset[0];
        const y = guard.pos[1] + offset[1];

        if(guard.speaking) {
            const dir = guard.dir[0];
            if(dir>=0) {
                renderer.addGlyph(x+1, y, x+2, y+1, bubble_right, 1);
            } else {
                renderer.addGlyph(x-1, y, x, y+1, bubble_left, 1);
            }
        }

        const guardState = guard.overheadIcon();
        if (guardState!==GuardStates.Relaxed) {
            const gtile = renderer.tileSet.guardStateTiles[guardState]
            renderer.addGlyph(x, y+0.625, x+1, y+1.625, gtile, 1);
        }
        if (guard === player.pickTarget) {
            // Render the shadowing indicator if player is shadowing a guard
            const gtile = tileSet.namedTiles['pickTarget'];
            renderer.addGlyph(x, y+0.625, x+1, y+1.625, gtile, 1);
        } 
    }

    // DISABLING BUT MIGHT BE USEFUL AS AN ACCESSIBILITY OPTION
    // Render the light status indicator if player is standing in the light
    // const litVal = state.gameMap.cells.atVec(player.pos).lit?1:0;
    // if(litVal) {
    //     const litTile = tileSet.namedTiles['litPlayer'];
    //     const offset = player.animation?.offset?? vec2.create();
    //     const x = player.pos[0] + offset[0];
    //     const y = player.pos[1] + offset[1];
    //     renderer.addGlyph(x, y+0.625, x+1, y+1.625, litTile, litVal);                
    // }

    // Render an icon over the player if the player is being noisy
    if (player.noisy) {
        const x = player.pos[0];
        const y = player.pos[1] - 0.5;
        renderer.addGlyph(x, y, x+1, y+1, tileSet.namedTiles['noise'], 1);
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
        const maxSightCutoff = 3;
        const xMin = Math.max(0, Math.floor(guard.pos[0] - maxSightCutoff));
        const xMax = Math.min(mapSizeX, Math.floor(guard.pos[0] + maxSightCutoff) + 1);
        const yMin = Math.max(0, Math.floor(guard.pos[1] - maxSightCutoff));
        const yMax = Math.min(mapSizeY, Math.floor(guard.pos[1] + maxSightCutoff) + 1);
        for (let y = yMin; y < yMax; ++y) {
            for (let x = xMin; x < xMax; ++x) {
                vec2.set(pos, x, y);
                vec2.subtract(dpos, pos, guard.pos);
                const cell = state.gameMap.cells.at(x, y);

                if (seenByGuard.get(x, y)) {
                    continue;
                }
                if (cell.blocksPlayerMove) {
                    continue;
                }
                if (!state.seeAll && !cell.seen) {
                    continue;
                }
                if (vec2.dot(guard.dir, dpos) < 0) {
                    continue;
                }
                if (vec2.squaredLen(dpos) >= guard.sightCutoff(cell.lit>0)) {
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
                renderer.addGlyph(x, y, x+1, y+1, tileSet.namedTiles['crossHatch'], 1);
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
            renderer.addGlyph(pos[0], pos[1], pos[0]+1, pos[1]+1, tileSet.namedTiles['patrolRoute'], 1);
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
        zoom: zoomLevel,
        zoomVelocity: 0,
        scale: Math.pow(zoomPower, zoomLevel),
        anchor: vec2.create(),
        snapped: false,
        panning: false,
    };

    vec2.copy(camera.position, posPlayer);
    vec2.zero(camera.velocity);

    return camera;
}

//TODO: should do some runtime type checking here to validate what's being written
export function getStat<T>(name:string):T {
    return JSON.parse(String(window.localStorage.getItem('LLL/stat/'+name)));
}

export function setStat<T>(name:string, value:T) {
    window.localStorage.setItem('LLL/stat/'+name, JSON.stringify(value));
}

export function loadStats(): PersistedStats {
    return {
        highScores: getStat('highScores') ?? [],
        dailyScores: getStat('dailyScores') ?? [],
        lastDaily: getStat('lastDaily') ?? undefined,
        dailyWinStreak: getStat('dailyWinStreak') ?? 0,
        dailyPlays: getStat('dailyPlays') ?? 0,
        dailyWins: getStat('dailyWins') ?? 0,
        bestScore: getStat('bestScore') ?? 0,
        bestDailyScore: getStat('bestDailyScore') ?? 0,
        totalGold: getStat('totalGold') ?? 0,
        totalPlays: getStat('totalPlays') ?? 0,
        totalWins: getStat('totalWins') ?? 0,
        totalPerfect: getStat('totalPerfect') ?? 0,
        totalGhosts: getStat('totalGhosts') ?? 0,
        totalLootSweeps: getStat('totalLootSweeps') ?? 0,
        achievements: getStat('achievements') ?? new Set(),
    };
}

function saveStats(persistedStats: PersistedStats) {
    setStat('highScores', persistedStats.highScores);
    setStat('dailyScores', persistedStats.dailyScores);
    setStat('lastDaily', persistedStats.lastDaily);
    setStat('dailyWinStreak', persistedStats.dailyWinStreak);
    setStat('dailyPlays', persistedStats.dailyPlays);
    setStat('dailyWins', persistedStats.dailyWins);
    setStat('bestScore', persistedStats.bestScore);
    setStat('bestDailyScore', persistedStats.bestDailyScore);
    setStat('totalGold', persistedStats.totalGold);
    setStat('totalPlays', persistedStats.totalPlays);
    setStat('totalWins', persistedStats.totalWins);
    setStat('totalPerfect', persistedStats.totalPerfect);
    setStat('totalGhosts', persistedStats.totalGhosts);
    setStat('totalLootSweeps', persistedStats.totalLootSweeps);
    setStat('achievements', persistedStats.achievements);
}

function initState(sounds:Howls, subtitledSounds: SubtitledHowls, activeSoundPool:ActiveHowlPool, touchController:TouchController): State {
    const rng = new RNG();  
    const initialLevel = 0;
    const gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, rng);
    const gameMap = createGameMap(initialLevel, gameMapRoughPlans[initialLevel]);
    const stats = loadStats();
    const touchMode = window.localStorage.getItem('LLL/touchMode')?? 'Gamepad';
    const touchAsGamepad = touchMode==='Gamepad';
    let keyRepeatRate = parseInt(window.localStorage.getItem('LLL/keyRepeatRate')??'175');
    if(isNaN(keyRepeatRate)) keyRepeatRate = 175;
    let keyRepeatDelay = parseInt(window.localStorage.getItem('LLL/keyRepeatDelay')??'250');
    if(isNaN(keyRepeatDelay)) keyRepeatDelay = 250;

    const state: State = {
        gameStats: {    
            loot: 0,
            lootStolen: 0,
            totalScore: 0,
            turns: 0,
            numLevels: 0,
            numCompletedLevels: 0,
            numGhostedLevels: 0,
            win: false,
            daily: null,
        },
        persistedStats: stats,
        levelStats: {
            numKnockouts: 0,
            numSpottings: 0,
            damageTaken: 0,
        },
        lightStates: Array(gameMap.lightCount).fill(0),
        particles:[],
        tLast: undefined,
        dt: 0,
        idleTimer: 0,
        rng: rng,
        dailyRun: null,
        leapToggleActive: false,
        gameMode: GameMode.HomeScreen,
        helpScreen: new HelpScreen(),
        textWindows: {
            [GameMode.HomeScreen]: new HomeScreen(),
            [GameMode.OptionsScreen]: new OptionsScreen(),
            [GameMode.StatsScreen]: new StatsScreen(),
            [GameMode.DailyHub]: new DailyHubScreen(),
            [GameMode.BetweenMansions]: new BetweenMansionsScreen(),
            [GameMode.Dead]: new DeadScreen(),
            [GameMode.Win]: new WinScreen(),
        },
        helpActive: false,
        player: new Player(gameMap.playerStartPos),
        topStatusMessage: '',
        topStatusMessageSticky: false,
        topStatusMessageAnim: 0,
        numStepMoves: 0,
        numLeapMoves: 0,
        numWaitMoves: 0,
        hasOpenedMenu: false,
        finishedLevel: false,
        zoomLevel: initZoomLevel,
        seeAll: false,
        seeGuardSight: false,
        seeGuardPatrols: false,
        camera: createCamera(gameMap.playerStartPos, initZoomLevel),
        level: initialLevel,
        turns: 0,
        totalTurns: 0,
        lootStolen: 0,
        lootAvailable: gameMapRoughPlans[initialLevel].totalLoot,
        gameMapRoughPlans: gameMapRoughPlans,
        gameMap: gameMap,
        sounds: sounds,
        subtitledSounds: subtitledSounds,
        activeSoundPool: activeSoundPool,
        guardMute: false,
        volumeMute: false,
        keyRepeatActive: undefined,
        keyRepeatRate: keyRepeatRate,
        keyRepeatDelay: keyRepeatDelay,
        touchAsGamepad: touchAsGamepad,
        touchController: touchController,
        gamepadManager: new GamepadManager(),
        keyboardController: new KeyboardController(),
        popups: new Popups,
    };

    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    postTurn(state);

    return state;
}

export function zoomIn(state: State) {
    state.zoomLevel = Math.min(maxZoomLevel, state.zoomLevel + 1);
    state.camera.panning = false;
}

export function zoomOut(state: State) {
    state.zoomLevel = Math.max(minZoomLevel, state.zoomLevel - 1);
    state.camera.panning = false;
}

function setCellAnimations(gameMap: GameMap, state: State) {
    for(let c of gameMap.cells.values) {
        if(c.type===TerrainType.GroundWater) {
            c.animation = new FrameAnimator(tileSet.waterAnimation, .5);
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
}

export function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, state.rng);
    state.level = 0;

    state.persistedStats.totalPlays++;
    setStat('totalPlays',state.persistedStats.totalPlays);
    if(state.dailyRun) {
        state.persistedStats.dailyPlays++;
        setStat('dailyPlays',state.persistedStats.dailyPlays);    
    }

    state.gameStats = { 
        loot: 0,   
        lootStolen: 0,
        totalScore: 0,
        turns: 0,
        numLevels: 0,
        numCompletedLevels: 0,
        numGhostedLevels: 0,
        win: false,
        daily: state.dailyRun,
    };
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.lightStates = Array(gameMap.lightCount).fill(0);
    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    state.gameMode = GameMode.Mansion;
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = 0;
    state.numStepMoves = 0;
    state.numLeapMoves = 0;
    state.numWaitMoves = 0;
    state.hasOpenedMenu = false;
    state.finishedLevel = false;
    state.turns = 0;
    state.totalTurns = 0;
    state.lootStolen = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    clearLevelStats(state.levelStats);
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos, state.zoomLevel);
    state.gameMap = gameMap;
    state.activeSoundPool.empty();
    state.popups.clear();

    postTurn(state);

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
    clearLevelStats(state.levelStats);

    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
    state.topStatusMessageAnim = 0;
    state.finishedLevel = false;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos, state.zoomLevel);
    state.gameMap = gameMap;
    state.popups.clear();
    state.activeSoundPool.empty();

    postTurn(state);

    Howler.stop();
}


function updateIdle(state:State, dt:number) {
    state.idleTimer -= dt;
    if(state.idleTimer<=0 && state.player.health>0 && state.player.animation===null) {
        state.idleTimer = 5;
        const player = state.player;
        const start = vec2.create();
        const left = vec2.fromValues(-0.125, 0);
        const right = vec2.fromValues(0.125, 0);
        const up = vec2.fromValues(0,0.125);
        const hid = player.hidden(state.gameMap);
        const p = tileSet.playerTiles;
        let tweenSeq, tiles;
        if(hid || Math.random()>0.5) {
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
    }
}

function updateAndRender(now: number, renderer: Renderer, state: State) {
    const t = now / 1000;
    const dt = (state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.dt = dt;
    state.tLast = t;

    updateControllerState(state);

    state.topStatusMessageAnim = Math.max(0, state.topStatusMessageAnim - 4 * dt);

    const screenSize = vec2.create();
    renderer.getScreenSize(screenSize);

    if (!state.camera.snapped) {
        state.camera.panning = false;
        state.camera.snapped = true;
        snapCamera(state, screenSize);
    }

    if (dt > 0) {
        updateState(state, screenSize, dt);
    }

    if(state.helpActive) {
        const hs = state.helpScreen;
        hs.update(state);
        hs.parseUI(screenSize);
    } else {
        const tw = state.textWindows[state.gameMode];
        if(tw !== undefined) {
            tw.update(state);
            tw.parseUI(screenSize);
        }
    }

    updateTouchButtons(state.touchController, renderer, screenSize, state);

    renderScene(renderer, screenSize, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}


function updateState(state: State, screenSize: vec2, dt: number) {
    updateCamera(state, screenSize, dt);

    updateIdle(state, dt);

    if(state.player.animation) {
        if(state.player.animation.update(dt)) {
            state.player.animation = null;
        }
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
    state.gameMap.items = state.gameMap.items.filter( (i) => {
        const done = i.animation?.update(dt);
        if(i.animation instanceof SpriteAnimation) {
            return !(i.animation.removeOnFinish && done);
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
    if (state.gameMode === GameMode.Mansion ||
        state.gameMode === GameMode.BetweenMansions ||
        state.gameMode === GameMode.Win ||
        state.gameMode === GameMode.Dead) {
        if ((state.gameMode !== GameMode.BetweenMansions && state.gameMode !== GameMode.Win) || state.player.animation) {
            renderPlayer(state, renderer);
        }
    }
    renderParticles(state, renderer);
    if(state.gameMode===GameMode.Mansion) {
        renderIconOverlays(state, renderer);
    }
    renderer.flush();

    const menuWindow = state.textWindows[state.gameMode];
    if(menuWindow !== undefined) {
        menuWindow.render(renderer);    
    }

    if(state.gameMode===GameMode.Mansion || state.gameMode===GameMode.BetweenMansions) {
        if (state.helpActive) {
            state.helpScreen.render(renderer);
            renderBottomStatusBar(renderer, screenSize, state);
        } else {
            renderTopStatusBar(renderer, screenSize, state);
            renderBottomStatusBar(renderer, screenSize, state);
        }    
    }

    if(lastController===state.touchController) {
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

    const touchAsGamepad = state.touchAsGamepad && !(lastController===state.touchController && state.touchController.mouseActive);
    state.touchController.setTouchConfig(touchAsGamepad);

    const menu = state.helpActive? state.helpScreen: state.textWindows[state.gameMode];

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

    if (touchAsGamepad) {
        updateTouchButtonsGamepad(touchController, renderer, screenSize, state);
    } else {
        updateTouchButtonsMouse(touchController, renderer, screenSize, state);
    }

    touchController.activateTouchTargets(menu ? menu.touchTargets : undefined);
}

function updateTouchButtonsGamepad(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    const tt = (renderer.tileSet.touchButtons !== undefined) ? renderer.tileSet.touchButtons : {};

    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const x = 0;
    const y = statusBarPixelSizeY;
    const w = screenSize[0];
    const h = screenSize[1] - 2*statusBarPixelSizeY;

    const buttonSizePixels = Math.min(96, Math.floor(Math.min(w,h)/6));
    const bw = buttonSizePixels;
    const bh = buttonSizePixels;

    const inGame = state.gameMode===GameMode.Mansion && !state.helpActive;
    const inStartMenus =
            state.gameMode===GameMode.HomeScreen ||
            state.gameMode===GameMode.DailyHub ||
            state.gameMode===GameMode.StatsScreen ||
            state.gameMode===GameMode.OptionsScreen;

    const buttonData: Array<{action:string,rect:Rect,tileInfo:TileInfo,visible:boolean}> = [
        {action:'menu',       rect:new Rect(x,          y+h-bh,    bw,     bh),     tileInfo:tt['menu'],       visible:!inStartMenus},
        {action:'zoomIn',     rect:new Rect(x+w-bw,     y+h-bh,    bw,     bh),     tileInfo:tt['zoomIn'],     visible:!inStartMenus},
        {action:'zoomOut',    rect:new Rect(x+w-bw,     y+h-2*bh,  bw,     bh),     tileInfo:tt['zoomOut'],    visible:!inStartMenus},
        {action:'left',       rect:new Rect(x,          y+bh,      bw,     bh),     tileInfo:tt['left'],       visible:!inStartMenus},
        {action:'right',      rect:new Rect(x+2*bw,     y+bh,      bw,     bh),     tileInfo:tt['right'],      visible:!inStartMenus},
        {action:'up',         rect:new Rect(x+bw,       y+2*bh,    bw,     bh),     tileInfo:tt['up'],         visible:true},
        {action:'down',       rect:new Rect(x+bw,       y,         bw,     bh),     tileInfo:tt['down'],       visible:true},
        {action:'wait',       rect:new Rect(x+bw,       y+bh,      bw,     bh),     tileInfo:tt['wait'],       visible:inGame},
        {action:'jump',       rect:new Rect(x+w-1.5*bw, y+0.75*bw, 1.5*bw, 1.5*bh), tileInfo:tt['jump'],       visible:inGame},
        {action:'menuAccept', rect:new Rect(x+w-1.5*bw, y+0.75*bw, 1.5*bw, 1.5*bh), tileInfo:tt['menuAccept'], visible:!inGame},
    ];

    const emptyRect = new Rect();

    for(const b of buttonData) {
        touchController.updateCoreTouchTarget(b.action, emptyRect, b.visible ? b.rect : emptyRect, b.tileInfo);
    }
}

function updateTouchButtonsMouse(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    const tt = (renderer.tileSet.touchButtons !== undefined) ? renderer.tileSet.touchButtons : {};

    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const x = 0;
    const y = statusBarPixelSizeY;
    const w = screenSize[0];
    const h = screenSize[1] - 2*statusBarPixelSizeY;

    const buttonSizePixels = Math.min(64, Math.floor(Math.min(w,h)/6));
    const bw = buttonSizePixels;
    const bh = buttonSizePixels;

    const buttonData: Array<{action:string,rect:Rect,tileInfo:TileInfo,visible:boolean}> = [
        {action:'menu',    rect:new Rect(x, y+h-bh,   bw, bh), tileInfo:tt['menu'],    visible:true},
        {action:'zoomIn',  rect:new Rect(x, y+h-2*bh, bw, bh), tileInfo:tt['zoomIn'],  visible:true},
        {action:'zoomOut', rect:new Rect(x, y+h-3*bh, bw, bh), tileInfo:tt['zoomOut'], visible:true},
    ];

    const moveActions = [
        {action:'wait',      dx: 0,dy: 0},
        {action:'left',      dx:-1,dy: 0},
        {action:'right',     dx: 1,dy: 0},
        {action:'up',        dx: 0,dy: 1},
        {action:'down',      dx: 0,dy:-1},
        {action:'jumpLeft',  dx:-2,dy: 0},
        {action:'jumpRight', dx: 2,dy: 0},
        {action:'jumpUp',    dx: 0,dy: 2},
        {action:'jumpDown',  dx: 0,dy:-2},
    ];

    const worldSizeX = state.gameMap.cells.sizeX;
    const worldSizeY = state.gameMap.cells.sizeY;
    const pp = state.player.pos;

    const showMoveButton =
        state.gameMode === GameMode.Mansion &&
        !state.helpActive;

    const showExitButton =
        showMoveButton &&
        state.finishedLevel &&
        (pp[0]===0 || pp[1]===0 || pp[0]===worldSizeX-1 || pp[1]===worldSizeY-1);

    buttonData.push({action:'exitLevel', rect:new Rect(x,y+h-4*bh,bw,bh), tileInfo:tt['exitLevel'], visible:showExitButton});

    const worldToPixelScaleX = pixelsPerTileX * state.camera.scale;
    const worldToPixelScaleY = pixelsPerTileY * state.camera.scale;
    const viewportPixelOffsetX = screenSize[0] / 2 - state.camera.position[0] * worldToPixelScaleX;
    const viewportPixelOffsetY = screenSize[1] / 2 - state.camera.position[1] * worldToPixelScaleY;

    for (const moveAction of moveActions) {
        const wx = pp[0] + moveAction.dx;
        const wy = pp[1] + moveAction.dy;
        const sx = wx * worldToPixelScaleX + viewportPixelOffsetX;
        const sy = wy * worldToPixelScaleY + viewportPixelOffsetY;
        const rect = new Rect(sx, sy, worldToPixelScaleX, worldToPixelScaleY);
        const showButton =
            showMoveButton &&
            wx >= 0 &&
            wy >= 0 &&
            wx < worldSizeX &&
            wy < worldSizeY;
        buttonData.push({action:moveAction.action, rect:rect, tileInfo:tt['picker'], visible:showButton});
    }

    const emptyRect = new Rect();

    for(const b of buttonData) {
        touchController.updateCoreTouchTarget(b.action, emptyRect, b.visible ? b.rect : emptyRect, b.tileInfo);
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
            lastController===state.touchController && !state.touchController.mouseActive,
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
}

function snapCamera(state: State, screenSize: vec2) {
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
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

    state.camera.zoom = state.zoomLevel;
    state.camera.zoomVelocity = 0;
    state.camera.scale = Math.pow(zoomPower, state.camera.zoom);
    cameraTargetCenterPosition(
        state.camera.position,
        vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY),
        state.camera.scale,
        lastController===state.touchController && !state.touchController.mouseActive,
        screenSize,
        state.player.pos
    );
    vec2.zero(state.camera.velocity);
}

function cameraTargetCenterPosition(posCameraCenter: vec2, worldSize: vec2, zoomScale: number, showGamepad: boolean, screenSize: vec2, posPlayer: vec2) {
    const posCenterMin = vec2.create();
    const posCenterMax = vec2.create();
    cameraCenterPositionLegalRange(worldSize, screenSize, zoomScale, showGamepad, posCenterMin, posCenterMax);

    posCameraCenter[0] = Math.max(posCenterMin[0], Math.min(posCenterMax[0], posPlayer[0] + 0.5));
    posCameraCenter[1] = Math.max(posCenterMin[1], Math.min(posCenterMax[1], posPlayer[1] + 0.5));
}

function cameraCenterPositionLegalRange(worldSize: vec2, screenSize: vec2, zoomScale: number, showGamepad: boolean, posLegalMin: vec2, posLegalMax: vec2) {
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - 2 * statusBarPixelSizeY);
    const buttonSizePixels = Math.min(96, Math.floor(Math.min(viewportPixelSize[0],viewportPixelSize[1])/6));
    const pixelsPerTileZoomedX = pixelsPerTileX * zoomScale;
    const pixelsPerTileZoomedY = pixelsPerTileY * zoomScale;
    const minPlayerPixelX = showGamepad ? 3 * buttonSizePixels : 0;
    const maxPlayerPixelX = showGamepad ? 1.5 * buttonSizePixels : 0;
    const viewWorldSizeY = viewportPixelSize[1] / pixelsPerTileZoomedY;

    let viewCenterMinX = (viewportPixelSize[0] / 2 - minPlayerPixelX) / pixelsPerTileZoomedX;
    let viewCenterMaxX = worldSize[0] - (viewportPixelSize[0] / 2 - maxPlayerPixelX) / pixelsPerTileZoomedX;

    if (viewCenterMinX > viewCenterMaxX) {
        viewCenterMinX = viewCenterMaxX = worldSize[0] / 2 - (minPlayerPixelX - maxPlayerPixelX) / (2 * pixelsPerTileZoomedX);
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
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - 2 * statusBarPixelSizeY);
    const [viewWorldSizeX, viewWorldSizeY] = viewWorldSize(viewportPixelSize, state.camera.scale);

    const viewWorldCenterX = state.camera.position[0];
    const viewWorldCenterY = state.camera.position[1];

    const statusBarWorldSizeY = statusBarPixelSizeY / (pixelsPerTileY * state.camera.scale);

    const viewWorldMinX = viewWorldCenterX - viewWorldSizeX / 2;
    const viewWorldMinY = viewWorldCenterY - viewWorldSizeY / 2;

    mat4.ortho(
        matScreenFromWorld,
        viewWorldMinX,
        viewWorldMinX + viewWorldSizeX,
        viewWorldMinY - statusBarWorldSizeY,
        viewWorldMinY + viewWorldSizeY + statusBarWorldSizeY,
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

function statusBarZoom(screenSizeX: number): number {
    return Math.max(1, Math.floor(screenSizeX / (targetStatusBarWidthInChars * statusBarCharPixelSizeX)));
}

function renderTopStatusBar(renderer: Renderer, screenSize: vec2, state: State) {
    const tileZoom = statusBarZoom(screenSize[0]);

    const statusBarPixelSizeY = tileZoom * statusBarCharPixelSizeY;

    const screenSizeInTilesX = screenSize[0] / (tileZoom * statusBarCharPixelSizeX);
    const screenSizeInTilesY = screenSize[1] / statusBarPixelSizeY;

    const offsetTilesY = 1 - screenSizeInTilesY;

    const matScreenFromWorld = mat4.create();

    mat4.ortho(
        matScreenFromWorld,
        0, screenSizeInTilesX,
        offsetTilesY, screenSizeInTilesY + offsetTilesY,
        1, -1
    );

    renderer.start(matScreenFromWorld, 0);

    const statusBarTileSizeX = Math.ceil(screenSizeInTilesX);
    const colorBackground = colorLerp(0xff101010, 0xff404040, 1 - (1 - state.topStatusMessageAnim)**2);
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, {textureIndex: fontTileSet.background.textureIndex, color: colorBackground, unlitColor: colorBackground});

    if(state.dailyRun) {
        putString(renderer, 0, 'Daily run', colorPreset.lightYellow);    
    }

    const message = state.topStatusMessage;
    const messageX = Math.floor((statusBarTileSizeX - message.length) / 2 + 0.5);
    putString(renderer, messageX, message, colorPreset.lightGray);

    renderer.flush();
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

    return r + (b << 8) + (g << 16) + (a << 24);
}

function putString(renderer: Renderer, x: number, s: string, color: number) {
    for (let i = 0; i < s.length; ++i) {
        const glyphIndex = s.charCodeAt(i);
        renderer.addGlyph(x + i, 0, x + i + 1, 1, {textureIndex:glyphIndex, color:color});
    }
}

function renderBottomStatusBar(renderer: Renderer, screenSize: vec2, state: State) {
    const tileZoom = statusBarZoom(screenSize[0]);

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

    const statusBarTileSizeX = Math.ceil(screenSizeInTilesX);
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, fontTileSet.background);

    let leftSideX = 1;

    const playerUnderwater = state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater && state.player.turnsRemainingUnderwater > 0;
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

    const msgLeapToggle = 'Leap';
    if (state.leapToggleActive) {
        ++leftSideX;
        putString(renderer, leftSideX, msgLeapToggle, colorPreset.lightGreen);
        leftSideX += msgLeapToggle.length;
    }

    let rightSideX = statusBarTileSizeX;

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

    const msgLevel = 'Lvl ' + (state.level + 1);

    let msgTimer;
    const speedScore = calculateTimeBonus(state);
    if (speedScore > 0) {
        msgTimer = 'Speed ' + speedScore;
    } else {
        msgTimer = 'Turns ' + state.turns;
    }

    const centeredX = Math.floor((leftSideX + rightSideX - (msgLevel.length + msgTimer.length + 1)) / 2);
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
  
  