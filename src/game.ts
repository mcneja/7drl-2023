import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap } from './create-map';
import { BooleanGrid, Cell, ItemType, GameMap, Item, Player, TerrainType, maxPlayerHealth, GuardStates, CellGrid } from './game-map';
import { SpriteAnimation, LightSourceAnimation, Animator, tween, LightState, FrameAnimator } from './animation';
import { Guard, GuardMode, guardActAll, lineOfSight, isRelaxedGuardMode } from './guard';
import { Renderer } from './render';
import { RNG, randomInRange } from './random';
import { TileInfo, getTileSet, getFontTileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups } from './popups';
import { Controller, TouchController, GamepadManager, KeyboardController, lastController, Rect } from './controllers';
import { HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, BetweenMansionsScreen, HelpScreen, DailyHubScreen } from './ui'
import {Camera, GameMode, State, Statistics} from './types';

import * as colorPreset from './color-preset';
import { stat } from 'fs';

import {ScoreServer} from './firebase';

export const gameConfig = {
    numGameMaps: 10,
    totalGameLoot: 100
}

enum NoiseType {
    Creak,
    Splash,
}

const tileSet = getTileSet('31color'); //'34view'|'basic'|'sincity'|'31color'
const fontTileSet = getFontTileSet('font'); 

window.onload = loadResourcesThenRun;

const targetStatusBarWidthInChars: number = 65;
const statusBarCharPixelSizeX: number = 8;
const statusBarCharPixelSizeY: number = 16;
//TODO: The constants live in the tileset and code should reference the tileset
const pixelsPerTileX: number = 16; // width of unzoomed tile
const pixelsPerTileY: number = 16; // height of unzoomed tile

const startingTopStatusMessage = 'Esc or / for help';

function loadResourcesThenRun() {
    Promise.all([
        loadImage(fontTileSet.imageSrc, fontTileSet.image),
        loadImage(tileSet.imageSrc, tileSet.image),
    ]).then(main);
}

function main(images: Array<HTMLImageElement>) {

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
    document.body.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('touchstart', onTouchDown);

    const renderer = new Renderer(canvas, tileSet, fontTileSet);
    const sounds:Howls = {};
    const subtitledSounds:SubtitledHowls = {};
    const activeSoundPool:ActiveHowlPool = new ActiveHowlPool();
    const touchController = new TouchController(canvas, true);
    const state = initState(sounds, subtitledSounds, activeSoundPool, touchController);

    function onTouchDown(e: TouchEvent) {
        if (Object.keys(state.sounds).length==0) {
            setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);
            e.preventDefault();
        }
    }
    function onMouseDown(e: MouseEvent) {
        if (Object.keys(state.sounds).length==0) {
            setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);
            e.preventDefault();
        }
    }
    function onKeyDown(e: KeyboardEvent) {
        if (Object.keys(state.sounds).length==0) {
            setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);
            e.preventDefault();
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
        let result = false;
        if(lastController===null) return false;
        const controlStates = lastController.controlStates;
        if(!(action in controlStates)) return false;
        if(lastController===state.touchController) {
            const t = state.touchController;
            if(action in t.touchTargets && t.touchTargets[action].trigger=='release') {
                result = lastController.currentFrameReleases.has(action);
                if(result) lastController.controlTimes[action] = Date.now();
                return result;
            }
        }
        result = lastController.currentFramePresses.has(action) || controlStates[action] && Date.now()-lastController.controlTimes[action]>250;
        if(result) lastController.controlTimes[action] = Date.now();
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
        if(state.camera.panning) {
            state.camera.velocity[0] = 0;
            state.camera.velocity[1] = 0;
        }
        if (controller.controlStates['panLeft']) {
            state.camera.panning = true;
            state.camera.velocity[0] = -1000 * state.dt;
        }
        if (controller.controlStates['panRight']) {
            state.camera.panning = true;
            state.camera.velocity[0] = +1000 * state.dt;
        }
        if (controller.controlStates['panUp']) {
            state.camera.panning = true;
            state.camera.velocity[1] = +1000 * state.dt;
        }
        if (controller.controlStates['panDown']) {
            state.camera.panning = true;
            state.camera.velocity[1] = -1000 * state.dt;
        }
        if (controller.controlStates['snapToPlayer']) {
            state.camera.panning = false;
            state.camera.snapped = false;
        }
        if (activated('left') || activated('heal')) {
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
            state.helpActive = true;
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
                ++state.level;
                resetState(state);
            }
        } else if (activated('resetState')) {
            resetState(state);
        } else if (activated('prevLevel')) {
            if (state.level > 0) {
                --state.level;
                resetState(state);
            }
        } else if (activated('guardSight')) {
            state.seeGuardSight = !state.seeGuardSight;
        } else if (activated('guardPatrols')) {
            state.seeGuardPatrols = !state.seeGuardPatrols;
        } else if (activated('markSeen')) {
            state.gameMap.markAllSeen();
            postTurn(state);
        } else if (activated('zoomIn')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
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

export function advanceToNextLevel(state: State) {
    state.level += 1;
    if (state.level >= gameConfig.numGameMaps) {
        restartGame(state);
        return;
    }

    state.activeSoundPool.empty();
    state.gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level], state.rng);
    state.lightStates = new Array(state.gameMap.lightCount).fill(0);
    setLights(state.gameMap, state);
    setCellAnimations(state.gameMap, state);
    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.healCost += 1;

    const es = state.gameStats;
    es.lootStolen += state.lootStolen;
    es.maxLootStolen += state.lootAvailable;
    es.ghostBonuses += state.ghostBonus;
    es.maxGhostBonuses += 5;
    es.timeBonuses += calculateTimeBonus(state);
    es.maxTimeBonuses += state.maxTimeBonus;
    es.lootSpent += state.lootSpent;

    state.turns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.maxTimeBonus = 5;   

    state.player.pos = state.gameMap.playerStartPos;
    state.player.dir = vec2.fromValues(0, -1);
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
    state.player.turnsRemainingUnderwater = 0;
    state.popups.clear();

    state.camera = createCamera(state.gameMap.playerStartPos);

    state.gameMode = GameMode.Mansion;
}

export function calculateTimeBonus(state:State):number {
    const c = state.gameMap.cells;
    const s = Math.ceil((c.sizeX*c.sizeY)*(1-state.initialSeen)/4);
    const t = state.turns;
    return Math.max(5 - Math.max(Math.floor(t/s)-1,0),0);
}

function advanceToBetweenMansions(state: State) {
    const timeBonus = calculateTimeBonus(state);
    state.player.loot += timeBonus + state.ghostBonus;
    state.activeSoundPool.empty();
    state.sounds['levelCompleteJingle'].play(0.35);
    state.gameMode = GameMode.BetweenMansions;
    if(state.lootStolen === state.lootAvailable) {
        state.stats.totalLootSweeps++;
        setStat('totalLootSweeps',state.stats.totalLootSweeps);
    }
    if(state.ghostBonus>0) {
        state.stats.totalGhosts++;
        setStat('totalGhosts',state.stats.totalGhosts);
    }
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
}

function advanceToWin(state: State) {
    state.activeSoundPool.empty();
    if (state.player.loot>95 && Math.random()>0.9) state.sounds['easterEgg'].play(0.5);
    else state.sounds['victorySong'].play(0.5);
    state.stats.totalWins++;
    setStat('totalWins',state.stats.totalWins);
    state.stats.bestScore = Math.max(state.stats.bestScore, state.player.loot);
    setStat('bestScore',state.stats.bestScore);
    state.stats.totalGold+= state.player.loot;
    setStat('totalGold',state.stats.totalGold);
    const score = {score:state.player.loot, date:getCurrentDateFormatted(), turns:state.totalTurns, level:state.level+1};
    state.stats.highScores.push(score);    
    if(state.dailyRun) {
        state.stats.bestDailyScore = Math.max(state.stats.bestDailyScore, state.player.loot);
        setStat('bestDailyScore',state.stats.bestDailyScore);
        state.stats.dailyWins++;
        setStat('dailyWins',state.stats.dailyWins)    
        state.stats.dailyWinStreak++;
        setStat('dailyWinStreak',state.stats.dailyWinStreak)    
        if(state.player.loot==200) {
            state.stats.dailyPerfect++;
            setStat('dailyPerfect', state.stats.dailyPerfect);
        }
        const dscore = {score:state.player.loot, date:state.dailyRun, turns:state.totalTurns, level:state.level+1};
        state.stats.lastDaily = dscore;
        state.stats.dailyScores.push(state.stats.lastDaily);
        setStat('lastDaily', state.stats.lastDaily);
        //TODO: notify user if the game was finished after the deadline
        if(state.dailyRun===getCurrentDateFormatted()) state.scoreServer.addScore(state.player.loot, state.totalTurns, state.level+1);
    }
    state.gameMode = GameMode.Win;
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
}

function collectLoot(state: State, pos: vec2, posFlyToward: vec2) {
    const lootCollected = state.gameMap.collectLootAt(pos);
    if (lootCollected.length > 0) {
        state.sounds.coin.play(1.0);
    }
    for (const loot of lootCollected) {
        ++state.player.loot;
        ++state.lootStolen;
        const pt0 = vec2.create();
        const pt1 = vec2.fromValues((posFlyToward[0]-loot.pos[0])/2, (posFlyToward[1]-loot.pos[1])/2);
        const animation = new SpriteAnimation([{pt0:pt0, pt1:pt1, duration:0.1, fn:tween.easeOutQuad}], 
            [tileSet.itemTiles[ItemType.Coin]]);
        animation.removeOnFinish = true;
        loot.animation = animation;
        state.particles.push(loot);
    }
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
        state.gameMap.items.find((item)=>item.pos.equals(pos) && (item.type === ItemType.DoorNS || item.type === ItemType.DoorEW))) {
        return false;
    }

    // Cannot leap onto a blocking item

    if (state.gameMap.items.find((item)=>item.pos.equals(pos) && isLeapableMoveObstacle(item.type))) {
        return false;
    }

    // Cannot leap onto a stationary guard

    if (state.gameMap.guards.find((guard)=>guard.pos.equals(pos) && !guard.movingWithPlayerPosition(state.player.pos))) {
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
        [tileSet.playerTiles[0]]);
}

function bumpFail(state: State, dx: number, dy: number) {
    state.sounds['footstepTile'].play(0.1);
    bumpAnim(state, dx, dy);
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

    if (posGuardNew[0] < 0 ||
        posGuardNew[1] < 0 ||
        posGuardNew[0] >= state.gameMap.cells.sizeX ||
        posGuardNew[1] >= state.gameMap.cells.sizeY ||
        state.gameMap.cells.atVec(posGuardNew).moveCost === Infinity ||
        state.gameMap.guards.find((guard)=>guard.pos.equals(posGuardNew))) {
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

function tryPlayerWait(state: State) {
    const player = state.player;

    // Can't move if you're dead.
    if (player.health <= 0) {
        return;
    }

    // Move camera with player by releasing any panning motion
    state.camera.panning = false;
    state.touchController.clearMotion();

    preTurn(state);

    state.gameMap.identifyAdjacentCells(player.pos);

    player.pickTarget = null;

    advanceTime(state);
}

function tryPlayerStep(state: State, dx: number, dy: number) {

    // Can't move if you're dead

    const player = state.player;
    if (player.health <= 0) {
        return;
    }

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
            bumpFail(state, dx, dy);
        } else if (state.level >= gameConfig.numGameMaps - 1) {
            preTurn(state);
            advanceToWin(state);
        } else {
            preTurn(state);
            advanceToBetweenMansions(state);
        }
        return;
    }

    // Trying to move into solid terrain?

    const cellNew = state.gameMap.cells.atVec(posNew);
    if (cellNew.blocksPlayerMove) {
        bumpFail(state, dx, dy);
        return;
    }

    // Trying to go through the wrong way through a one-way window?

    if ((cellNew.type == TerrainType.OneWayWindowE && posNew[0] <= posOld[0]) ||
        (cellNew.type == TerrainType.OneWayWindowW && posNew[0] >= posOld[0]) ||
        (cellNew.type == TerrainType.OneWayWindowN && posNew[1] <= posOld[1]) ||
        (cellNew.type == TerrainType.OneWayWindowS && posNew[1] >= posOld[1])) {

        state.topStatusMessage = 'Window cannot be accessed from outside';
        state.topStatusMessageSticky = false;

        if (state.level === 0) {
            setTimeout(()=>state.sounds['tooHigh'].play(0.3),250);
        }

        bumpFail(state, dx, dy);
        return;
    }

    // Trying to move into a one-way window instead of leaping through?

    if (isOneWayWindowTerrainType(cellNew.type)) {
        state.topStatusMessage = 'Shift+move to leap';
        state.topStatusMessageSticky = false;

        if (state.level === 0) {
            setTimeout(()=>state.sounds['jump'].play(0.3), 250);
        }

        bumpFail(state, dx, dy);
        return;
    }

    // Trying to move into an item that blocks movement?

    for (const item of state.gameMap.items.filter((item) => item.pos.equals(posNew))) {
        switch (item.type) {
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
            state.topStatusMessage = 'Shift+move to leap';
            state.topStatusMessageSticky = false;
            state.sounds['gate'].play(0.3);
            if (state.level === 0) {
                setTimeout(()=>state.sounds['jump'].play(0.3), 1000);
            }
            bumpAnim(state, dx, dy);
            return;
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
        if (!isRelaxedGuardMode(guard.mode)) {
            player.pickTarget = null;
        } else if (guard.hasPurse) {
            // If we have already targeted this guard, pick their pocket; otherwise target them
            if (player.pickTarget === guard) {
                //TODO: Add a particle animation here to show the purse being removed
                player.pickTarget = null;
                guard.hasPurse = false;
                player.loot += 1;
                state.lootStolen += 1;
                state.sounds.coin.play(1.0);        
            } else {
                player.pickTarget = guard;
            }
        }

        // If the guard is stationary, pass time in place
        if (!guard.movingWithPlayerPosition(player.pos)) {
            preTurn(state);
            advanceTime(state);
            return;
        }
    }

    // Execute the move

    preTurn(state);

    vec2.copy(player.pos, posNew);

    // Identify creaky floors nearby

    state.gameMap.identifyAdjacentCells(player.pos);

    // Animate player moving

    const start = vec2.clone(posOld).subtract(posNew);
    const end = vec2.create();

    let tweenSeq;

    if (guard !== undefined && guard.mode === GuardMode.Unconscious) {
        const gp = vec2.fromValues(0.5*(posOld[0]-posNew[0]),0.5*(posOld[1]-posNew[1]));
        tweenSeq = [
            {pt0:start, pt1:gp, duration:0.2, fn:tween.easeInQuad},
            {pt0:gp, pt1:end, duration:0.1, fn:tween.easeOutQuad},
        ];
    } else {
        tweenSeq = [{pt0:start, pt1:end, duration:0.2, fn:tween.easeOutQuad}];
    }

    player.animation = new SpriteAnimation(tweenSeq, [tileSet.playerTiles[0]]);

    // Collect loot

    collectLoot(state, player.pos, posOld);

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
        if (guardMid.hasPurse) {
            guardMid.hasPurse = false;
            player.loot += 1;
            state.lootStolen += 1;
            state.sounds.coin.play(1.0);
        }
        player.pickTarget = null;
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
        state.gameMap.items.find((item)=>item.pos.equals(posMid) && (item.type === ItemType.DoorNS || item.type === ItemType.DoorEW))) {
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
        } else {
            bumpFail(state, dx, dy);
        }
        return;
    }

    // Handle a guard at the endpoint

    const guard = state.gameMap.guards.find((guard) => guard.pos.equals(posNew));
    if (guard === undefined || !guard.hasPurse) {
        player.pickTarget = null;
    } else {
        player.pickTarget = guard;
    }

    // Execute the leap

    preTurn(state);

    // Collect any loot from posMid

    collectLoot(state, posMid, posOld);

    // End level if moving off the map

    if (posNew[0] < 0 ||
        posNew[1] < 0 ||
        posNew[0] >= state.gameMap.cells.sizeX ||
        posNew[1] >= state.gameMap.cells.sizeY) {
        if (state.level >= gameConfig.numGameMaps - 1) {
            advanceToWin(state);
        } else {
            advanceToBetweenMansions(state);
        }
        return;
    }

    // Update player position

    vec2.copy(player.pos, posNew);

    // Identify creaky floor under player

    const cellNew = state.gameMap.cells.atVec(posNew);
    cellNew.identified = true;

    // Animate player moving

    const start = vec2.clone(posOld).subtract(posNew);
    const end = vec2.create();
    player.animation = new SpriteAnimation([{pt0:start, pt1:end, duration:0.2, fn:tween.easeOutQuad}], [tileSet.playerTiles[0]]);

    // Collect any loot from posNew

    collectLoot(state, posNew, posOld);

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

function isLeapableMoveObstacle(itemType: ItemType): boolean {
    switch (itemType) {
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
            return true;
        default:
            return false;
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
    if (!state.topStatusMessageSticky) {
        state.topStatusMessage = '';
    }
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
        state.player.turnsRemainingUnderwater = 7;
    }

    state.gameMap.computeLighting(state.gameMap.cells.atVec(state.player.pos));

    guardActAll(state, state.gameMap, state.popups, state.player);

    if(state.gameMap.guards.find((guard)=> guard.mode===GuardMode.ChaseVisibleTarget || guard.mode===GuardMode.Unconscious)!==undefined) {
        //TODO: Play a disappointed sound if the first time this happens on the level
        state.ghostBonus = 0;
    }

    state.gameMap.recomputeVisibility(state.player.pos);

    postTurn(state);

    if (oldHealth > state.player.health) {
        state.sounds['hitPlayer'].play(0.5);

        if (state.player.health <= 0) {
            setTimeout(()=>state.sounds['gameOverJingle'].play(0.5), 1000);
            if(state.dailyRun) {
                state.stats.dailyWinStreak=0;
                setStat('dailyWinStreak',state.stats.dailyWinStreak)    
                state.stats.lastDaily = {score:state.player.loot, date:state.dailyRun, turns: state.totalTurns, level:state.level+1};
                setStat('lastDaily', state.stats.lastDaily);
                //TODO: notify user if the game was finished after the deadline
                if(state.dailyRun===getCurrentDateFormatted()) state.scoreServer.addScore(state.player.loot, state.totalTurns, state.level);
            }       
            state.gameMode = GameMode.Dead;
        }
    }
}

function postTurn(state: State) {
    if (state.gameMap.allSeen()) {
        if(!state.finishedLevel) {
            state.sounds['levelRequirementJingle'].play(0.5);
        }
        state.finishedLevel = true;
    }

    // Update top status-bar message

    const subtitle = state.popups.endOfUpdate(state.subtitledSounds);

    if (subtitle !== '') {
        state.topStatusMessage = subtitle;
        state.topStatusMessageSticky = true;
    } else if (state.finishedLevel) {
        state.topStatusMessage = 'Mansion fully mapped! Exit any side.'
        state.topStatusMessageSticky = true;
    }
}

export function tryHealPlayer(state: State) {
    if (state.player.health >= maxPlayerHealth) {
        return;
    }

    if (state.player.loot < state.healCost) {
        return;
    }

    state.player.loot -= state.healCost;
    state.gameStats.lootSpent += state.healCost;
    state.player.health += 1;
    state.healCost *= 2;
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
    return baseVal**(1+[...srcIds].reduce((p,c)=>p+lightStates[c],0)/srcIds.size);
}

function litVertices(x:number, y:number, cells:CellGrid, lightStates:Array<number>, seeAll: boolean):[number,number,number,number] {
    const clu = cells.at(x-1,y-1);
    const cu =  cells.at(x,y-1);
    const cru = cells.at(x+1,y-1);
    const cl =  cells.at(x-1,y);
    const c =   cells.at(x,y);
    const cr =  cells.at(x+1,y);
    const cld = cells.at(x-1,y+1);
    const cd =  cells.at(x,y+1);
    const crd = cells.at(x+1,y+1);
    const llu = lightAnimator(clu.lit, lightStates, clu.litSrc, seeAll || clu.seen);
    const lu =  lightAnimator(cu.lit,  lightStates, cu.litSrc, seeAll || cu.seen);
    const lru = lightAnimator(cru.lit, lightStates, cru.litSrc, seeAll || cru.seen);
    const ll =  lightAnimator(cl.lit,  lightStates, cl.litSrc, seeAll || cl.seen);
    const l =   lightAnimator(c.lit,   lightStates, c.litSrc, seeAll || c.seen);
    const lr =  lightAnimator(cr.lit,  lightStates, cr.litSrc, seeAll || cr.seen);
    const lld = lightAnimator(cld.lit, lightStates, cld.litSrc, seeAll || cld.seen);
    const ld =  lightAnimator(cd.lit,  lightStates, cd.litSrc, seeAll || cd.seen);
    const lrd = lightAnimator(crd.lit, lightStates, crd.litSrc, seeAll || crd.seen);
    
    return [
        (llu+lu+ll+l)/4, //top left vertex
        (lru+lu+lr+l)/4, //top right
        (lld+ld+ll+l)/4, //bottom left
        (lrd+ld+lr+l)/4, //bottom right
    ];
}


function renderTouchButtons(renderer:Renderer, screenSize:vec2, touchController:TouchController) {
    for(const bkey in touchController.coreTouchTargets) {
        if(!(bkey in touchController.controlStates)) continue;
        const b = touchController.coreTouchTargets[bkey];
        const lit = touchController.controlStates[bkey] && touchController.targetOnTouchDown===bkey? 1:0;
        if(b.tileInfo===null) continue;
        if(b.show=='always' || b.show=='press' && b.id!=-1) {
            renderer.addGlyph(b.game[0],b.game[1],b.game[0]+b.game[2],b.game[1]+b.game[3],
                b.tileInfo, lit);
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
            const alwaysLit = (terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.DoorEW) ? 1:0;
            const lit = lightAnimator(Math.max(alwaysLit, cell.lit), state.lightStates, cell.litSrc, state.seeAll || cell.seen);
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
                const alwaysLit = ((item.type >= ItemType.DoorNS && item.type <= ItemType.PortcullisEW) 
                                || item.type == ItemType.Coin)? 1 : 0;
                const lit = lightAnimator(Math.max(alwaysLit, cell.lit), state.lightStates, cell.litSrc, state.seeAll || cell.seen);
                const lv = litVertices(x, y, state.gameMap.cells, state.lightStates, state.seeAll);
    
                if([TerrainType.PortcullisEW].includes(terrainType)
                    && state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                        renderer.addGlyph(x, y, x + 1, y + 1, renderer.tileSet.itemTiles[ItemType.PortcullisNS], lv);    
                } else {
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
}

function renderPlayer(state: State, renderer: Renderer) {
    const player = state.player;
    const a = state.player.animation
    const offset = a &&  a instanceof SpriteAnimation ? a.offset : vec2.create();
    const x = player.pos[0] + offset[0];
    const y = player.pos[1] + offset[1];
    const x0 = player.pos[0];
    const y0 = player.pos[1];
    const cell = state.gameMap.cells.at(x0, y0)
    const lit = lightAnimator(cell.lit, state.lightStates, cell.litSrc, state.seeAll || cell.seen);
    const hidden = player.hidden(state.gameMap);
    // const color =
    //     player.damagedLastTurn ? 0xff0000ff :
    //     player.noisy ? colorPreset.lightCyan :
    //     hidden ? 0xd0101010 :
    //     !lit ? colorPreset.lightBlue :
    //     colorPreset.lightGray;
    const p = renderer.tileSet.playerTiles;

    let tileInfo:TileInfo;
    if(state.player.animation) {
        tileInfo = state.player.animation.currentTile();
    } else {
        tileInfo = player.damagedLastTurn ? p[1] :
        player.noisy ? p[3] :
        hidden ? p[2] :
        !lit ? p[4] :
        p[0];
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
    
        if(guard.hasTorch || guard.hasPurse) {
            let t0 = x+guard.dir[0]*0.375+guard.dir[1]*0.375;
            let t1 = y-0.125;
            const tti = guard.torchAnimation?.currentTile() ?? renderer.tileSet.itemTiles[ItemType.TorchCarry];
            let p0 = x-guard.dir[0]*0.250+(guard.dir[1]<0?0.375:0);
            let p1 = y-0.125;
            const pti = renderer.tileSet.itemTiles[ItemType.PurseCarry];
            if(guard.dir[1]>0) {
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);
                if(guard.hasPurse) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
            } else if(guard.dir[1]<0) {
                if(guard.hasPurse) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);    
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
            } else {
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, lit);    
                if(guard.hasTorch) renderer.addGlyph(t0, t1, t0 + 1, t1 + 1, tti, lit);
                if(guard.hasPurse) renderer.addGlyph(p0, p1, p0 + 1, p1 + 1, pti, lit);
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
        for (const guard of state.gameMap.guards) {
        const cell = state.gameMap.cells.atVec(guard.pos);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        const guardState = guard.overheadIcon();
        let gtile:TileInfo;
        if (guardState!==GuardStates.Relaxed) {
            gtile = renderer.tileSet.guardStateTiles[guardState]
        } else {
            // Render the shadowing indicator if player is shadowing a guard
            if (guard === player.pickTarget) {
                gtile = {textureIndex:0xf1, color:0xffffffff};
            } else {
                continue;
            }
        }

        let offset = guard.animation?.offset?? vec2.create();
        const x = guard.pos[0] + offset[0];
        const y = guard.pos[1] + offset[1] + 0.625;

        renderer.addGlyph(x, y, x+1, y+1, gtile, 1);
    }

    // Render an icon over the player if the player is being noisy
    if (player.noisy) {
        const x = player.pos[0];
        const y = player.pos[1] - 0.5;
        renderer.addGlyph(x, y, x+1, y+1, {textureIndex: 104, color: 0x80ffffff}, 1);
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
                renderer.addGlyph(x, y, x+1, y+1, {textureIndex:3, color:0xffffffff}, 1);
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
            renderer.addGlyph(pos[0], pos[1], pos[0]+1, pos[1]+1, {textureIndex:92, color:0xff80ff80}, 1);
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

function createCamera(posPlayer: vec2): Camera {
    const camera = {
        position: vec2.create(),
        velocity: vec2.create(),
        anchor: vec2.create(),
        snapped: false,
        panning: false,
    };

    vec2.copy(camera.position, posPlayer);
    vec2.zero(camera.velocity);

    return camera;
}

//TODO: should do some runtime type checking here to validate what's being written
function getStat<T>(name:string):T {
    return JSON.parse(String(window.localStorage.getItem('stat.'+name)));
}

function setStat<T>(name:string, value:T) {
    window.localStorage.setItem('stat.'+name, JSON.stringify(value));
}

export function loadStats(): Statistics {
    const stats0:Statistics = {
        highScores: getStat('highScores') ?? [],
        dailyScores: getStat('dailyScores') ?? [],
        bestScore: getStat('bestScore') ?? 0,
        bestDailyScore: getStat('bestDailyScores') ?? 0,
        lastDaily: getStat('lastDaily') ?? {score:0, date:''},
        dailyWinStreak: getStat('dailyWinStreak') ?? 0,
        dailyPlays: getStat('dailyPlays') ?? 0,
        dailyWins: getStat('dailyWins') ?? 0,
        dailyPerfect: getStat('dailyPerfect') ?? 0,
        totalGold: getStat('totalGold') ?? 0,
        totalPlays: getStat('totalPlays') ?? 0,
        totalWins: getStat('totalWins') ?? 0,
        totalPerfect: getStat('totalPerfect') ?? 0,
        totalGhosts: getStat('totalGhosts') ?? 0,
        totalLootSweeps: getStat('totalLootSweeps') ?? 0,
        achievements: getStat('achievements') ?? new Set(),
    }
    return stats0;
}

function initState(sounds:Howls, subtitledSounds: SubtitledHowls, activeSoundPool:ActiveHowlPool, touchController:TouchController): State {
    const rng = new RNG();  
    const initialLevel = 0;
    const gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, rng);
    const gameMap = createGameMap(initialLevel, gameMapRoughPlans[initialLevel], rng);
    const stats = loadStats();
    const touchMode = window.localStorage.getItem('touchMode')?? 'Gamepad';
    const touchAsGamepad = touchMode==='Gamepad';

    return {
        scoreServer: new ScoreServer(),
        gameStats: {    
            lootStolen: 0,
            lootSpent: 0,
            ghostBonuses: 0,
            timeBonuses: 0,
            maxGhostBonuses: 0,
            maxTimeBonuses: 0,
            maxLootStolen: 0,
        },
        lightStates:[],
        particles:[],
        stats: stats,
        tLast: undefined,
        dt: 0,
        initialSeen: 0,
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
        topStatusMessage: startingTopStatusMessage,
        topStatusMessageSticky: true,
        finishedLevel: false,
        healCost: 1,
        zoomLevel: 3,
        seeAll: false,
        seeGuardSight: false,
        seeGuardPatrols: false,
        camera: createCamera(gameMap.playerStartPos),
        level: initialLevel,
        turns: 0,
        totalTurns: 0,
        lootStolen: 0,
        lootSpent: 0,
        lootAvailable: gameMapRoughPlans[initialLevel].totalLoot,
        ghostBonus: 5,
        maxTimeBonus: 5,   
        gameMapRoughPlans: gameMapRoughPlans,
        gameMap: gameMap,
        sounds: sounds,
        subtitledSounds: subtitledSounds,
        activeSoundPool: activeSoundPool,
        guardMute: false,
        volumeMute: false,
        touchAsGamepad: touchAsGamepad,
        touchController: touchController,
        gamepadManager: new GamepadManager(),
        keyboardController: new KeyboardController(),
        popups: new Popups,
    };
}

function setCellAnimations(gameMap: GameMap, state: State) {
    for(let c of gameMap.cells.values) {
        if(c.type===TerrainType.GroundWater) {
            c.animation = new FrameAnimator([
                {textureIndex: 0x6b}, 
                {textureIndex: 0x6c}, 
                {textureIndex: 0x6d}, 
                {textureIndex: 0x6e}], 1.5);
        }
    }
}

function setLights(gameMap: GameMap, state: State) {
    let id = 0;
    const candleSeq:Array<[TileInfo, number]> = [
        [{textureIndex: 0x77}, 0.5],
        [{textureIndex: 0x78}, 0.5],
        [{textureIndex: 0x79}, 0.5],
    ]
    const candleDim = {textureIndex: 0x7a}
    const candleOff = {textureIndex: 0x30}
    for(let i of gameMap.items) {
        if(i.type === ItemType.TorchLit) {
            i.animation = new LightSourceAnimation(LightState.idle, id, state.lightStates, i, candleSeq, candleDim, candleOff);
            id++;    
        } else if(i.type === ItemType.TorchUnlit) {
            i.animation = new LightSourceAnimation(LightState.off, id, state.lightStates, i, candleSeq, candleDim, candleOff);
            id++;
        }
    }
    const torchSeq:Array<[TileInfo, number]> = [
        [{textureIndex: 0x3c}, 0.5],
        [{textureIndex: 0x3d}, 0.5],
        [{textureIndex: 0x3e}, 0.5],
    ]
    const torchDim = {textureIndex: 0x3f}
    const torchOff = {textureIndex: 0x3f}
    for(let g of gameMap.guards) {
        if(g.hasTorch) {
            g.torchAnimation = new LightSourceAnimation(LightState.idle, id, state.lightStates, null, torchSeq, torchDim, torchOff);
            id++;
        }
    }

}

export function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(gameConfig.numGameMaps, gameConfig.totalGameLoot, state.rng);
    state.level = 0;

    state.stats.totalPlays++;
    setStat('totalPlays',state.stats.totalPlays);
    if(state.dailyRun) {
        state.stats.dailyPlays++;
        setStat('dailyPlays',state.stats.dailyPlays);    
    }

    state.gameStats = {    
        lootStolen: 0,
        lootSpent: 0,
        ghostBonuses: 0,
        timeBonuses: 0,
        maxGhostBonuses: 0,
        maxTimeBonuses: 0,
        maxLootStolen: 0,
    };
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level], state.rng);
    state.lightStates = Array(gameMap.lightCount).fill(0);
    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    state.gameMode = GameMode.Mansion;
    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.healCost = 1;
    state.turns = 0;
    state.totalTurns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.maxTimeBonus = 5;
    state.initialSeen = gameMap.percentSeen()/100;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.gameMap = gameMap;
    state.activeSoundPool.empty();
    state.popups.clear();
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level], state.rng);
    state.lightStates = Array(gameMap.lightCount).fill(0);
    setLights(gameMap, state);
    setCellAnimations(gameMap, state);
    state.turns = 0;
    state.totalTurns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.maxTimeBonus = 5;
    state.initialSeen = gameMap.percentSeen()/100;

    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.gameMap = gameMap;
    state.popups.clear();
    state.activeSoundPool.empty();
}


function updateAndRender(now: number, renderer: Renderer, state: State) {
    const t = now / 1000;
    const dt = (state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.dt = dt;
    state.tLast = t;


    const screenSize = vec2.create();
    renderer.getScreenSize(screenSize);

    if (!state.camera.snapped) {
        state.camera.panning = false;
        state.camera.snapped = true;
        snapCamera(state, screenSize);
    }

    updateControllerState(state);

    if (dt > 0) {
        updateState(state, screenSize, dt);
    }
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
        i.animation?.update(dt);
        if(i.animation instanceof SpriteAnimation) {
            return !(i.animation.removeOnFinish && i.animation.time===0)
        }
        return true;
    });
    state.particles = state.particles.filter( (p) => {
        p.animation?.update(dt);
        if(p.animation instanceof SpriteAnimation) {
            return !(p.animation.removeOnFinish && p.animation.time===0)
        }
        return true;
    });
    if(state.helpActive) {
        const hs = state.helpScreen;
        hs.update(state);
        hs.parseUI();
        hs.updateScreenSize(screenSize);
    } else {
        const tw = state.textWindows[state.gameMode];
        if(tw !== undefined) {
            tw.update(state);
            tw.parseUI();
            tw.updateScreenSize(screenSize);
        }
    }

    updateTouchButtons(state.touchController, renderer, screenSize, state);

    renderScene(renderer, screenSize, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}


function updateState(state: State, screenSize: vec2, dt: number) {
    updateCamera(state, screenSize, dt);
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
    if(state.gameMode===GameMode.Mansion || state.gameMode===GameMode.Dead) {
        renderPlayer(state, renderer);
        renderParticles(state, renderer);
    }
    if(state.gameMode===GameMode.Mansion) {
        renderIconOverlays(state, renderer);
    }
    renderer.flush();

// Needed to update the endgame stats -- move to an update method
//    const timeBonus = calculateTimeBonus(state);

    const menuWindow = state.textWindows[state.gameMode];
    if(menuWindow !== undefined) {
        menuWindow.render(renderer);    
    }

    if(state.gameMode===GameMode.Mansion || state.gameMode===GameMode.BetweenMansions) {
        if (state.helpActive) {
            state.helpScreen.render(renderer);
            renderBottomStatusBar(renderer, screenSize, state);
        } else {
            renderTopStatusBar(renderer, screenSize, state.topStatusMessage, state);
            renderBottomStatusBar(renderer, screenSize, state);
        }    
    }

    if(lastController===state.touchController) {
        renderer.start(matScreenFromWorld, 1);
        renderTouchButtons(renderer, screenSize, state.touchController);
        renderer.flush();
    } 
}

type PosTranslator = {
    screenToWorld: (vPos:vec2) => vec2;
    worldToScreen: (vPos:vec2) => vec2;
}

function createPosTranslator(screenSize:vec2, worldSize: vec2, cameraPos:vec2, zoomLevel:number): PosTranslator {
    const mapSizeX = worldSize[0];
    const mapSizeY = worldSize[1];
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - 2 * statusBarPixelSizeY);
    const vpx = viewportPixelSize[0];
    const vpy = viewportPixelSize[1];
    const vws = viewWorldSize(viewportPixelSize, mapSizeX, mapSizeY, zoomLevel);
    const vwsx = vws[0];
    const vwsy = vws[1];
    const cpx = cameraPos[0];
    const cpy = cameraPos[1];

    return {
        screenToWorld: (vPos:vec2) => {
            return vec2.fromValues(
                (vPos[0]-vpx/2)*vwsx/vpx + cpx, 
                (vPos[1]-vpy/2 - 2*statusBarCharPixelSizeY)*vwsy/vpy + cpy
            )
        },
        worldToScreen: (cPos:vec2) => {
            return vec2.fromValues(
                (cPos[0] - cpx)*vpx/vwsx + vpx/2,
                (cPos[1] - cpy)*vpy/vwsy + vpy/2 + 2*statusBarCharPixelSizeY
            )
        }
    }    
}

function updateTouchButtons(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    //TODO: Perhaps should move more of the game-specific logic from touchcontroller class into here
    if(lastController !== touchController) return;
    const menu = state.helpActive? state.helpScreen: state.textWindows[state.gameMode];

    const worldSize = vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY);
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const sw = screenSize[0];
    const sh = screenSize[1] - 2*statusBarCharPixelSizeY;
    const pt = createPosTranslator(screenSize, worldSize, state.camera.position, state.zoomLevel);
    if(touchController.lastMotion.id!==-1 && menu===undefined && touchController.targetOnTouchDown===null && touchController.lastMotion.active) {
        const p0 = pt.screenToWorld(vec2.fromValues(touchController.lastMotion.x0, touchController.lastMotion.y0));
        const p1 = pt.screenToWorld(vec2.fromValues(touchController.lastMotion.x, touchController.lastMotion.y));
        state.camera.panning = true;
        let d = p1.subtract(p0);
        state.camera.position[0] -= d[0]-state.camera.anchor[0];
        state.camera.position[1] -= d[1]-state.camera.anchor[1];
        state.camera.anchor[0] = d[0];
        state.camera.anchor[1] = d[1];
    } else {
        state.camera.anchor[0] = 0;
        state.camera.anchor[1] = 0;
    }

    const buttonAllocPixels = Math.floor(Math.min(sh,sw)/6);
    const origin = pt.screenToWorld(vec2.fromValues(0,0));
    const buttonAlloc = pt.screenToWorld(vec2.fromValues(buttonAllocPixels,buttonAllocPixels));
    const screenAlloc = pt.screenToWorld(vec2.fromValues(sw, sh));
    const x = origin[0];
    const y = origin[1];
    const w = screenAlloc[0]-x;
    const h = screenAlloc[1]-y;
    const bw = buttonAlloc[0]-x;
    const bh = buttonAlloc[1]-y;
    const offZoom = state.helpActive || state.gameMode!=GameMode.Mansion?100:0;
    const offHealNext = state.helpActive || state.gameMode!=GameMode.BetweenMansions?100:0;
    const offRestart = !state.helpActive && [GameMode.Dead, GameMode.Win].includes(state.gameMode) ? 0:100;
    const offForceRestartFullscreen = state.helpActive ? 0:100;
    let tt = renderer.tileSet.touchButtons;
    if(tt === undefined) tt = {};
    const touchAsGamepad = state.touchAsGamepad && !(lastController===state.touchController && state.touchController.mouseActive);
    state.touchController.setTouchConfig(touchAsGamepad);

    if(touchAsGamepad) {
        var buttonData:{[id:string]:{game:Rect,view:Rect,tileInfo:TileInfo}} = {
            'menu':     {game:new Rect(x,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['menu']},
            'zoomIn':  {game:new Rect(x+w-bw+offZoom,y+h-2*bh,bw,bh), view: new Rect(), tileInfo:tt['zoomIn']},
            'zoomOut':   {game:new Rect(x+w-bw+offZoom,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['zoomOut']},
            'fullscreen':  {game:new Rect(x+w-bw+offForceRestartFullscreen,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['fullscreen']},
            'restart':  {game:new Rect(x+w-bw+offRestart,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['restart']},
            'forceRestart':  {game:new Rect(x+w-bw+offForceRestartFullscreen,y+h-2*bh,bw,bh), view: new Rect(), tileInfo:tt['restart']},
            'left':     {game:new Rect(x,y+bh,bw,bh), view: new Rect(), tileInfo:tt['left']},
            'right':    {game:new Rect(x+2*bw,y+bh,bw,bh), view: new Rect(), tileInfo:tt['right']},
            'up':       {game:new Rect(x+bw,y+2*bh,bw,bh), view: new Rect(), tileInfo:tt['up']},
            'down':     {game:new Rect(x+bw,y,bw,bh), view: new Rect(), tileInfo:tt['down']},
            'wait':     {game:new Rect(x+bw,y+bh,bw,bh), view: new Rect(), tileInfo:tt['wait']},
            'jump':     {game:new Rect(x+w-bw,y+bw,bw,bh), view: new Rect(), tileInfo:tt['jump']},
        }    
    } else {
        const s = 4/state.zoomLevel;
        var buttonData:{[id:string]:{game:Rect,view:Rect,tileInfo:TileInfo}} = {
            'menu':     {game:new Rect(x,y+h-1.5*s,s,s), view: new Rect(), tileInfo:tt['menu']},
            'zoomIn':  {game:new Rect(x,y+h-2.5*s,s,s), view: new Rect(), tileInfo:tt['zoomIn']},
            'zoomOut':   {game:new Rect(x,y+h-3.5*s,s,s), view: new Rect(), tileInfo:tt['zoomOut']},
            'fullscreen':  {game:new Rect(x+offForceRestartFullscreen,y+h-4.5*s,s,s), view: new Rect(), tileInfo:tt['fullscreen']},
            'restart':  {game:new Rect(x+offRestart,y+h-5.5*s,s,s), view: new Rect(), tileInfo:tt['restart']},
            'forceRestart':  {game:new Rect(x+offForceRestartFullscreen,y+h-6.5*s,s,s), view: new Rect(), tileInfo:tt['restart']},
        }    
        const pp = state.player.pos;
        buttonData['wait'] = (state.gameMode==GameMode.Mansion && !state.helpActive)? 
                        {game:new Rect(...pp,1,1), view: new Rect(), tileInfo:tt['wait']}
                        : {game:new Rect(-1-1,1,1), view: new Rect(), tileInfo:tt['wait']};
        if(state.finishedLevel && state.gameMode==GameMode.Mansion && !state.helpActive 
                && (pp[0]==0 || pp[1]==0 || pp[0]==worldSize[0]-1 || pp[1]==worldSize[1]-1)) {
            buttonData['exitLevel'] = {game:new Rect(x,y+h-4.5*s,s,s), view: new Rect(), tileInfo:tt['exitLevel']};
        } else {
            buttonData['exitLevel'] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['exitLevel']};
        }
        for(const vals of [['left',[-1,0]],['right',[1,0]],['up',[0,1]],['down',[0,-1]]] as Array<[string, [number,number]]>) {
            const name = vals[0];
            const p = vals[1];
            const pt = vec2.fromValues(pp[0]+p[0],pp[1]+p[1]);
            if(pt[0]<0 || pt[1]<0 || pt[0]>=worldSize[0] || pt[1]>=worldSize[1]) continue;
            if(state.gameMode==GameMode.Mansion &&  !state.helpActive
                && !state.gameMap.cells.atVec(pt).blocksPlayerMove 
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowE)
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowW)
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowN)
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowS)
                && !state.gameMap.items.find((item)=>item.pos.equals(pt) 
                        && [ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type))
                && !state.gameMap.guards.find((guard)=>guard.pos.equals(pt))
                ) {
                    buttonData[name] = {game:new Rect(...pt,1,1), view: new Rect(), tileInfo:tt['picker']}
                } else {
                    buttonData[name] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['picker']}
                }
        }
        for(const vals of [['jumpLeft',[-1,0]],['jumpRight',[1,0]],['jumpUp',[0,1]],['jumpDown',[0,-1]]] as Array<[string, [number,number]]>) {
            const name = vals[0];
            const p = vec2.fromValues(...vals[1]);
            const pt = pp.add(p);
            const pt2 = pp.scaleAndAdd(p, 2);
            if( state.gameMode==GameMode.Mansion && !state.helpActive
                && !(pt[0]<0 || pt[1]<0 || pt[0]>=worldSize[0] || pt[1]>=worldSize[1]) 
                && !(pt2[0]<0 || pt2[1]<0 || pt2[0]>=worldSize[0] || pt2[1]>=worldSize[1])
                && !state.gameMap.cells.atVec(pt).blocksPlayerMove
                && !state.gameMap.cells.atVec(pt2).blocksPlayerMove 
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowE && name=='jumpLeft')
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowW && name=='jumpRight')
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowN && name=='jumpDown')
                && !(state.gameMap.cells.atVec(pt).type==TerrainType.OneWayWindowS && name=='jumpUp')
                && !state.gameMap.items.find((item)=>item.pos.equals(pt2) 
                        && [ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type))
                && !state.gameMap.guards.find((guard)=>guard.pos.equals(pt2))
                ) {
                    buttonData[name] = {game:new Rect(...pt2,1,1), view: new Rect(), tileInfo:tt['picker']}
                } else {
                    buttonData[name] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['picker']}
                }
        }    
    }
    for(const bkey in buttonData) {
        const b = buttonData[bkey];
        const game = b.game;
        const xy0 = pt.worldToScreen(vec2.fromValues(game[0],game[1]));
        const xy1 = pt.worldToScreen(vec2.fromValues(game[0]+game[2],game[1]+game[3]));
        touchController.updateCoreTouchTarget(bkey, game, 
            new Rect(
                xy0[0],xy0[1],xy1[0]-xy0[0],xy1[1]-xy0[1]
            ), 
            b.tileInfo
        )
    }
    if(menu) {
        touchController.activateTouchTargets(menu.getTouchData());
    }
}


function updateCamera(state: State, screenSize: vec2, dt: number) {

    const velNew = vec2.create();

    if(!state.camera.panning) {
        // Figure out where the camera should be pointed

        const posCameraTarget = vec2.create();
        cameraTargetCenterPosition(
            posCameraTarget,
            vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY),
            state.zoomLevel,
            screenSize,
            state.player.pos
        );

        // Update player follow

        const posError = vec2.create();
        vec2.subtract(posError, posCameraTarget, state.camera.position);

        const velError = vec2.create();
        vec2.negate(velError, state.camera.velocity);

        const kSpring = 8; // spring constant, radians/sec

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
    cameraTargetCenterPosition(
        state.camera.position,
        vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY),
        state.zoomLevel,
        screenSize,
        state.player.pos
    );
    vec2.zero(state.camera.velocity);
}

function cameraTargetCenterPosition(posCameraCenter: vec2, worldSize: vec2, zoomLevel: number, screenSize: vec2, posPlayer: vec2) {
    const posCenterMin = vec2.create();
    const posCenterMax = vec2.create();
    cameraCenterPositionLegalRange(worldSize, screenSize, zoomLevel, posCenterMin, posCenterMax);

    posCameraCenter[0] = Math.max(posCenterMin[0], Math.min(posCenterMax[0], posPlayer[0] + 0.5));
    posCameraCenter[1] = Math.max(posCenterMin[1], Math.min(posCenterMax[1], posPlayer[1] + 0.5));
}

function cameraCenterPositionLegalRange(worldSize: vec2, screenSize: vec2, zoomLevel: number, posLegalMin: vec2, posLegalMax: vec2) {
    const mapSizeX = worldSize[0];
    const mapSizeY = worldSize[1];
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - 2 * statusBarPixelSizeY);
    const [viewWorldSizeX, viewWorldSizeY] = viewWorldSize(viewportPixelSize, mapSizeX, mapSizeY, zoomLevel);

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
    const mapSizeX = state.gameMap.cells.sizeX;
    const mapSizeY = state.gameMap.cells.sizeY;
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const viewportPixelSize = vec2.fromValues(screenSize[0], screenSize[1] - 2 * statusBarPixelSizeY);
    const [viewWorldSizeX, viewWorldSizeY] = viewWorldSize(viewportPixelSize, mapSizeX, mapSizeY, state.zoomLevel);

    const viewWorldCenterX = state.camera.position[0];
    const viewWorldCenterY = state.camera.position[1];

    const tileZoom = state.zoomLevel;
    const statusBarWorldSizeY = statusBarPixelSizeY / (pixelsPerTileY * tileZoom);

    const viewWorldMinX = Math.floor(pixelsPerTileX * (viewWorldCenterX - viewWorldSizeX / 2)) / pixelsPerTileX;
    const viewWorldMinY = Math.floor(pixelsPerTileY * (viewWorldCenterY - viewWorldSizeY / 2)) / pixelsPerTileY;

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

function viewWorldSize(viewportPixelSize: vec2, mapSizeX: number, mapSizeY: number, zoomLevel: number): [number, number] {
    const tileZoom = zoomLevel;

    const zoomedPixelsPerTileX = pixelsPerTileX * tileZoom;
    const zoomedPixelsPerTileY = pixelsPerTileY * tileZoom;

    const viewWorldSizeX = viewportPixelSize[0] / zoomedPixelsPerTileX;
    const viewWorldSizeY = viewportPixelSize[1] / zoomedPixelsPerTileY;

    return [viewWorldSizeX, viewWorldSizeY];
}

function statusBarZoom(screenSizeX: number): number {
    return Math.min(2, Math.max(1, Math.floor(screenSizeX / (targetStatusBarWidthInChars * statusBarCharPixelSizeX))));
}

function renderTopStatusBar(renderer: Renderer, screenSize: vec2, message: string, state: State) {
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
    const barBackgroundColor = 0xff101010;
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, {textureIndex:219, color:barBackgroundColor});

    if(state.dailyRun) {
        putString(renderer, 0, 'Daily run', colorPreset.lightYellow);    
    }

    const messageX = Math.floor((statusBarTileSizeX - message.length) / 2 + 0.5);
    putString(renderer, messageX, message, colorPreset.lightGray);

    renderer.flush();
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
    const barBackgroundColor = 0xff101010;
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, {textureIndex:219, color:barBackgroundColor});

    const healthX = 1;

    putString(renderer, healthX, "Health", colorPreset.darkRed);

    for (let i = 0; i < maxPlayerHealth; ++i) {
        const color = (i < state.player.health) ? colorPreset.darkRed : colorPreset.black;
        const glyphHeart = 3;
        renderer.addGlyph(i + healthX + 7, 0, i + healthX + 8, 1, {textureIndex:glyphHeart, color:color});
    }

    // Underwater indicator

    const playerUnderwater = state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater && state.player.turnsRemainingUnderwater > 0;
    if (playerUnderwater) {
        const breathX = healthX + maxPlayerHealth + 10;

        putString(renderer, breathX, "Air", colorPreset.lightCyan);

        for (let i = 0; i < state.player.turnsRemainingUnderwater; ++i) {
            const glyphBubble = 9;
            renderer.addGlyph(breathX + 4 + i, 0, breathX + 5 + i, 1, {textureIndex:glyphBubble, color:colorPreset.lightCyan});
        }
    }

    // Mapping percentage

    const percentSeen = state.gameMap.percentSeen();

    const ptsLeft = calculateTimeBonus(state);
    const c = state.gameMap.cells;
    const scale = Math.ceil((c.sizeX*c.sizeY)*(1-state.initialSeen)/4);
    let turnsLeft = (6-ptsLeft)*scale + scale - 1 - state.turns;


    const turnsLeftText = ptsLeft>0 ? ' Timer ' + turnsLeft + " (+" + ptsLeft + ")" : ' Turns '+state.turns + " (--)";
    const seenMsg = 'Mansion ' + (state.level + 1) + ' - ' + percentSeen + '% Mapped - ' + turnsLeftText;

    const seenX = Math.floor((statusBarTileSizeX - seenMsg.length) / 2 + 0.5);
    putString(renderer, seenX, seenMsg, colorPreset.lightGray);

    // Total loot and turn

    let lootMsg = 'Loot ' + state.player.loot;
    const lootX = statusBarTileSizeX - (lootMsg.length + 1);
    putString(renderer, lootX, lootMsg, colorPreset.lightYellow);

    // Leap toggle indicator

    if (state.leapToggleActive) {
        const msg = 'Leap';
        const msgX = lootX - (msg.length + 2);
        putString(renderer, msgX, msg, colorPreset.lightGreen);
    }

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
  
  