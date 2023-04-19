import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap } from './create-map';
import { BooleanGrid, ItemType, GameMap, GameMapRoughPlan, Item, Player, TerrainType, maxPlayerHealth, GuardStates } from './game-map';
import { GuardMode, guardActAll, lineOfSight, isRelaxedGuardMode } from './guard';
import { Renderer } from './render';
import { randomInRange } from './random';
import { TileInfo, getTileSet, getFontTileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups, PopupType } from './popups';
import { Controller, TouchController, GamepadManager, KeyboardController, lastController, Rect } from './controllers';

import * as colorPreset from './color-preset';
import { stat } from 'fs';

const tileSet = getTileSet('31color'); //'34view'|'basic'|'sincity'|'31color'
const fontTileSet = getFontTileSet('font'); 

window.onload = loadResourcesThenRun;

const numGameMaps: number = 10;
const totalGameLoot: number = 100;

const targetStatusBarWidthInChars: number = 65;
const statusBarCharPixelSizeX: number = 8;
const statusBarCharPixelSizeY: number = 16;
//TODO: The constants live in the tileset and code should reference the tileset
const pixelsPerTileX: number = 16; // width of unzoomed tile
const pixelsPerTileY: number = 16; // height of unzoomed tile

const startingTopStatusMessage = 'Esc or / for help';

type Camera = {
    position: vec2;
    velocity: vec2;
    anchor: vec2;
    snapped: boolean;
    panning: boolean;
}

enum GameMode {
    Mansion,
    BetweenMansions,
    Dead,
    Win,
}

type EndStats = {
    lootStolen: number;
    lootSpent: number;
    levelsGhosted: number;
    timeBonuses: number;
    maxLevelsGhosted: number;
    maxTimeBonsuses: number;
    maxLootStolen: number;
}

type State = {
    endStats: EndStats;
    tLast: number | undefined;
    dt: number;
    leapToggleActive: boolean;
    gameMode: GameMode;
    helpActive: boolean;
    helpPageIndex: number;
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
    timeBonus: number;
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
        if (state.helpActive) {
            onControlsInHelp();
        } else {
            switch (state.gameMode) {
                case GameMode.Mansion: onControlsInMansion(lastController); break;
                case GameMode.BetweenMansions: onControlsInBetweenMansions(); break;
                case GameMode.Dead: onControlsInGameOver(); break;
                case GameMode.Win: onControlsInGameOver(); break;
            }
        }    
    }
    state.touchController.resetActivation();
    state.keyboardController.resetActivation();
    for(const g in state.gamepadManager.gamepads) state.gamepadManager.gamepads[g].resetActivation();
    function activated(action:string):boolean {
        let result = false;
        if(lastController==null) return false;
        const controlStates = lastController.controlStates;
        if(!(action in controlStates)) return false;
        if(lastController==null) return false
        if(lastController == state.touchController) {
            const t = state.touchController;
            if(action in t.buttonMap && t.buttonMap[action].trigger=='release') {
                result = !controlStates[action] && lastController.controlActivated[action];
                if(result) lastController.controlTimes[action] = Date.now();
                return result;
            }
        }
        result = controlStates[action] && (lastController.controlActivated[action] || Date.now()-lastController.controlTimes[action]>250);
        if(result) lastController.controlTimes[action] = Date.now();
        return result;
    }
    
    function onControlsInHelp() {
        if (activated('menu')) {
            state.helpActive = false;
        } else if (activated('fullscreen')) {
            const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
            canvas.requestFullscreen({navigationUI:"hide"});
        } else if (activated('forceRestart')) {
            restartGame(state);
        } else if (activated('gamepadStyleTouch')) {
            state.touchAsGamepad = !state.touchAsGamepad;
            state.touchController.setButtonConfig(state.touchAsGamepad);
            state.topStatusMessage = state.touchAsGamepad ? 'Touch gamepad enabled' : 'Touch gamepad disabled (touch map to move)';
        } else if (activated('left')) {
            state.helpPageIndex = Math.max(0, state.helpPageIndex - 1);
        } else if (activated('right')) {
            state.helpPageIndex = Math.min(helpPages.length - 1, state.helpPageIndex + 1);
        }
    }
        
    function onControlsInMansion(controller: Controller) {
        if(state.camera.panning) {
            state.camera.velocity[0] = 0;
            state.camera.velocity[1] = 0;
        }
        if (controller.controlStates['panLeft']) {
            state.camera.panning = true;
            state.camera.velocity[0] = -1000 * state.dt;
//            console.log(state.dt, state.camera.velocity, state.camera.position);
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
        if (activated('left')||activated('heal')) {
            const moveSpeed = (state.leapToggleActive || controller.controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, -1, 0, moveSpeed);
        } else if (activated('right')) {
            const moveSpeed = (state.leapToggleActive || controller.controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 1, 0, moveSpeed);
        } else if (activated('down')) {
            const moveSpeed = (state.leapToggleActive || controller.controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 0, -1, moveSpeed);
        } else if (activated('up')) {
            const moveSpeed = (state.leapToggleActive || controller.controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 0, 1, moveSpeed);
        } else if (activated('jumpLeft')) {
            tryMovePlayer(state, -1, 0, 2);
        } else if (activated('jumpRight')) {
            tryMovePlayer(state, 1, 0, 2);
        } else if (activated('jumpDown')) {
            tryMovePlayer(state, 0, -1, 2);
        } else if (activated('jumpUp')) {
            tryMovePlayer(state, 0, 1, 2);
        } else if (activated('wait')) {
            tryMovePlayer(state, 0, 0, 0);
        } else if (activated('exitLevel')) {
            if (state.level >= numGameMaps - 1) {
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
        } else if (activated('guardSight')) {
            state.seeGuardSight = !state.seeGuardSight;
        } else if (activated('guardPatrols')) {
            state.seeGuardPatrols = !state.seeGuardPatrols;
        } else if (activated('forceRestart')) {
            restartGame(state);
        } else if (activated('nextLevel')) {
            if (state.level < state.gameMapRoughPlans.length - 1) {
                ++state.level;
                resetState(state);
            }
        } else if (activated('resetLevel')) {
            resetState(state);
        } else if (activated('prevLevel')) {
            if (state.level > 0) {
                --state.level;
                resetState(state);
            }
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
        } else if (activated('collectLoot')) {
            state.player.loot += state.gameMap.collectAllLoot();
            postTurn(state);
        } else if (activated('guardSight')) {
            state.seeGuardSight = !state.seeGuardSight;
        } else if (activated('guardPatrols')) {
            state.seeGuardPatrols = !state.seeGuardPatrols;
        } else if (activated('forceRestart')) {
            restartGame(state);
        } else if (activated('nextLevel')) {
            if (state.level < state.gameMapRoughPlans.length - 1) {
                ++state.level;
                resetState(state);
            }
        } else if (activated('resetLevel')) {
            resetState(state);
        } else if (activated('prevLevel')) {
            if (state.level > 0) {
                --state.level;
                resetState(state);
            }
        } else if (activated('markSeen')) {
            state.gameMap.markAllSeen();
            postTurn(state);
        } else if (activated('zoomIn')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
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
    function onControlsInBetweenMansions() {
        if (activated('BracketLeft')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('BracketRight')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('restart')) {
            restartGame(state);
        } else if (activated('heal')) {
            tryHealPlayer(state);
        } else if (activated('nextLevel')) {
            advanceToNextLevel(state);
        } else if (activated('menu')) {
            state.helpActive = true;
        }
    }
        
    function onControlsInGameOver() {
        if (activated('BracketLeft')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('BracketRight')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('restart')) {
            restartGame(state);
        } else if (activated('menu')) {
            state.helpActive = true;
        }
    }
}

function advanceToNextLevel(state: State) {
    state.level += 1;
    if (state.level >= numGameMaps) {
        restartGame(state);
        return;
    }

    state.activeSoundPool.empty();
    state.gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.healCost += 1;

    const es = state.endStats;
    es.lootStolen += state.lootStolen;
    es.maxLootStolen += state.lootAvailable;
    es.levelsGhosted += state.ghostBonus;
    es.maxLevelsGhosted += 5;
    es.timeBonuses += state.timeBonus;
    es.maxTimeBonsuses += 5;
    es.lootSpent += state.lootSpent;

    state.turns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.timeBonus = 5;   

    state.player.pos = state.gameMap.playerStartPos;
    state.player.dir = vec2.fromValues(0, -1);
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
    state.player.turnsRemainingUnderwater = 0;
    state.popups.clear();

    state.camera = createCamera(state.gameMap.playerStartPos);

    state.gameMode = GameMode.Mansion;
}

function advanceToBetweenMansions(state: State) {
    const c = state.gameMap.cells;
    const scale = (c.sizeX*c.sizeY)/10;
    state.timeBonus -= Math.min(Math.floor(state.turns/scale), state.timeBonus);
    state.player.loot += state.timeBonus + state.ghostBonus;
    state.activeSoundPool.empty();
    state.sounds['levelCompleteJingle'].play(0.35);
    state.gameMode = GameMode.BetweenMansions;
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
}

function advanceToWin(state: State) {
    state.activeSoundPool.empty();
    if (state.player.loot>95 && Math.random()>0.9) state.sounds['easterEgg'].play(0.5);
    else state.sounds['victorySong'].play(0.5);
    state.gameMode = GameMode.Win;
    state.topStatusMessage = '';
    state.topStatusMessageSticky = false;
}

function tryMovePlayer(state: State, dx: number, dy: number, distDesired: number) {

    const player = state.player;

    const gate = state.gameMap.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
    const guardOnGate = gate!==undefined ? state.gameMap.guards
            .find((guard)=>guard.pos[0]==gate.pos[0] && guard.pos[1]==gate.pos[1]): undefined;


    // Can't move if you're dead.
    if (player.health <= 0) {
        return;
    }

    //Move camera with player by releasing any panning motion
    state.camera.panning = false;
    state.touchController.clearMotion();

    // If just passing time, do that.

    if ((dx === 0 && dy === 0) || distDesired <= 0) {
        const x = player.pos[0];
        const y = player.pos[1];
        for(let x1=Math.max(x-1,0);x1<=Math.min(x+1,state.gameMap.cells.sizeX-1);++x1) {
            for(let y1=Math.max(y-1,0);y1<=Math.min(y+1,state.gameMap.cells.sizeY-1);++y1) {
                state.gameMap.cells.at(x1,y1).identified = true;
            }
        }
        preTurn(state);        
        advanceTime(state);
        return;
    }

    let dist = playerMoveDistAllowed(state, dx, dy, distDesired);
    if (dist <= 0) {
        const posBump = vec2.fromValues(player.pos[0] + dx * (dist + 1), player.pos[1] + dy * (dist + 1));
        const item = state.gameMap.items.find((item) => item.pos[0] === posBump[0] && item.pos[1] === posBump[1]);
        //Bump into torch
        if (item !== undefined && (item.type === ItemType.TorchUnlit || item.type === ItemType.TorchLit)) {
            preTurn(state);
            if(item.type === ItemType.TorchUnlit) state.sounds["ignite"].play(0.08);
            else state.sounds["douse"].play(0.05);
            item.type = (item.type === ItemType.TorchUnlit) ? ItemType.TorchLit : ItemType.TorchUnlit;
            advanceTime(state);
        }
        //Bump into gate
        const bump = state.gameMap.cells.at(...posBump);
        if(bump) {
            const typeBump = bump.type;
            const typePlayer = state.gameMap.cells.at(...player.pos).type;
            if(typeBump>=TerrainType.PortcullisNS && typeBump<=TerrainType.PortcullisEW) {
                state.sounds['gate'].play(0.3);    
            }    
        }
        return;
    }

    // Execute the move. Collect loot along the way; advance to next level when moving off the edge.

    preTurn(state);

    const oldTerrain = state.gameMap.cells.at(...player.pos).type;

    const origDist = dist;
    for (; dist > 0; --dist) {
        const x = player.pos[0] + dx;
        const y = player.pos[1] + dy;

        if(origDist==1 && dist==1) {
            for(let x1=Math.max(x-1,0);x1<=Math.min(x+1,state.gameMap.cells.sizeX-1);++x1) {
                for(let y1=Math.max(y-1,0);y1<=Math.min(y+1,state.gameMap.cells.sizeY-1);++y1) {
                    state.gameMap.cells.at(x1,y1).identified = true;
                }
            }
        }

        if (x < 0 || x >= state.gameMap.cells.sizeX ||
            y < 0 || y >= state.gameMap.cells.sizeY) {
            if (state.level >= numGameMaps - 1) {
                advanceToWin(state);
            } else {
                advanceToBetweenMansions(state);
            }
            return;
        }

        player.pos[0] = x;
        player.pos[1] = y;

        const loot = state.gameMap.collectLootAt(player.pos[0], player.pos[1]);
        if (loot > 0) {
            player.loot += loot;
            state.lootStolen += loot;
            state.sounds.coin.play(1.0);
        }
    }

    // Generate movement noises.

    let cellType = state.gameMap.cells.at(player.pos[0], player.pos[1]).type;
    if (cellType == TerrainType.GroundWoodCreaky) {
        makeNoise(state.gameMap, player, 17, state.popups, state.sounds);
    }

    advanceTime(state);

    const volScale:number = 0.5+Math.random()/2;
    //console.log(volScale);
    const pCell = state.gameMap.cells.at(...player.pos)
    const changedTile = oldTerrain !== pCell.type;

    // Hide sound effect
    if(pCell.hidesPlayer) {
        state.sounds['hide'].play(0.2);
        return
    }
    //Terrain sound effects
    switch(pCell.type) {
        case TerrainType.GroundWoodCreaky:
            state.sounds["footstepCreaky"].play(0.15*volScale);
            break;
        case TerrainType.GroundWood:
            if(changedTile || Math.random()>0.9) state.sounds["footstepWood"].play(0.15*volScale);
            break;
        case TerrainType.GroundNormal:
            if(changedTile || Math.random()>0.5) state.sounds["footstepGravel"].play(0.03*volScale);
            break;
        case TerrainType.GroundGrass:
            if(changedTile || Math.random()>0.75) state.sounds["footstepGrass"].play(0.05*volScale);
            break;
        case TerrainType.GroundWater:
            if(changedTile || Math.random()>0.6) state.sounds["footstepWater"].play(0.02*volScale);
            break;
        case TerrainType.GroundMarble:
            if(changedTile || Math.random()>0.8) state.sounds["footstepTile"].play(0.05*volScale);
            break;
        default:
            if(changedTile || Math.random()>0.8) state.sounds["footstepTile"].play(0.02*volScale);
            break;
        }
        //Guard on gate sound effect
        if (gate!==undefined && guardOnGate===undefined) {
            const guard = state.gameMap.guards.find((guard)=>guard.pos[0]==gate.pos[0] && guard.pos[1]==gate.pos[1]);
            if(guard!==undefined && vec2.squaredDistance(state.player.pos, guard.pos) <= 100) state.sounds['gate'].play(0.2);
        }
    
}

function playerMoveDistAllowed(state: State, dx: number, dy: number, maxDist: number): number {
    const player = state.player;

    let posPrev = vec2.clone(player.pos);

    let distAllowed = 0;

    for (let d = 1; d <= maxDist; ++d) {
        const pos = vec2.fromValues(player.pos[0] + dx * d, player.pos[1] + dy * d);

        if (pos[0] < 0 || pos[0] >= state.gameMap.cells.sizeX ||
            pos[1] < 0 || pos[1] >= state.gameMap.cells.sizeY) {
            if (state.finishedLevel) {
                distAllowed = d;
            }
            break;
        } else if (blocked(state.gameMap, posPrev, pos, maxDist)) {
            if (isOneWayWindowTerrainType(state.gameMap.cells.at(...pos).type)) {
                state.topStatusMessage = 'Window cannot be accessed from outside';
                state.topStatusMessageSticky = false;
                if(state.level===0) state.sounds['tooHigh'].play(0.3);
                else state.sounds['footstepTile'].play(0.1);
            }
            // If jumping but there's a door in the way, we allow a move into the door
            if(d==1 && [TerrainType.DoorEW,TerrainType.DoorNS].includes(state.gameMap.cells.at(...pos).type)) {
                distAllowed = d;
            }
            break;
        } else {
            distAllowed = d;
        }

        posPrev = pos;
    }

    // If the move would end on a guard, reject it

    if (distAllowed > 0) {
        const pos = vec2.fromValues(player.pos[0] + dx * distAllowed, player.pos[1] + dy * distAllowed);
        if (state.gameMap.guards.find((guard) => guard.pos[0] == pos[0] && guard.pos[1] == pos[1]) !== undefined) {
            distAllowed = 0;
        }
    }

    // If the move would end on a door, torch, portcullis, or window, shorten it

    if (distAllowed > 0) {
        const x = player.pos[0] + dx * distAllowed;
        const y = player.pos[1] + dy * distAllowed;
        if (x >= 0 && x < state.gameMap.cells.sizeX &&
            y >= 0 && y < state.gameMap.cells.sizeY) {
            if (state.gameMap.items.find((item) => item.pos[0] === x && item.pos[1] === y &&
                    isLeapableMoveObstacle(item.type)) !== undefined ||
                isLeapableTerrainType(state.gameMap.cells.at(x, y).type)) {
                --distAllowed;
                state.topStatusMessage = 'Shift+move to leap';
                state.topStatusMessageSticky = false;
                if(state.level===0) {
                    if([TerrainType.PortcullisEW, TerrainType.PortcullisNS].includes(state.gameMap.cells.at(x, y).type)) {
                        setTimeout(()=>state.sounds['jump'].play(0.3),1000);
                    } else {
                        state.sounds['jump'].play(0.3);
                    }
                } 
                else state.sounds['footstepTile'].play(0.1);    
            }
        }
    }

    return distAllowed;
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

function isLeapableTerrainType(terrainType: TerrainType): boolean {
    switch (terrainType) {
        case TerrainType.OneWayWindowE:
        case TerrainType.OneWayWindowW:
        case TerrainType.OneWayWindowN:
        case TerrainType.OneWayWindowS:
        case TerrainType.PortcullisNS:
        case TerrainType.PortcullisEW:
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

function makeNoise(map: GameMap, player: Player, radius: number, popups: Popups, sounds: Howls) {
    player.noisy = true;

    sounds.footstepCreaky.play(0.6);

    let gDist = radius*radius;
    let closestGuard = null;
    for (const guard of map.guardsInEarshot(player.pos, radius)) {
        const dist =  (player.pos[0]-guard.pos[0])**2 + (player.pos[1]-guard.pos[1])**2 
        if(dist<=gDist && isRelaxedGuardMode(guard.mode)) closestGuard = guard;
        guard.heardThief = true;
    }
    if(closestGuard!=null) {
        closestGuard.mode = GuardMode.MoveToLastSound; //Moving to a more alert state ensures guard will move to the noise
//        closestGuard.modeTimeout = 4 + randomInRange(4);
//        vec2.copy(closestGuard.goal, player.pos);
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
    if (state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater) {
        if (state.player.turnsRemainingUnderwater > 0) {
            --state.player.turnsRemainingUnderwater;
        }
    } else {
        state.player.turnsRemainingUnderwater = 7;
    }

    guardActAll(state.gameMap, state.popups, state.player);

    if(state.gameMap.guards.find((guard)=> guard.mode==GuardMode.ChaseVisibleTarget)!==undefined) {
        state.ghostBonus = 0;
    }
    state.gameMap.computeLighting();
    state.gameMap.recomputeVisibility(state.player.pos);

    postTurn(state);

    if (oldHealth > state.player.health) {
        state.sounds['hitPlayer'].play(0.5);

        if (state.player.health <= 0) {
            setTimeout(()=>state.sounds['gameOverJingle'].play(0.5), 1000);
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

function tryHealPlayer(state: State) {
    if (state.player.health >= maxPlayerHealth) {
        return;
    }

    if (state.player.loot < state.healCost) {
        return;
    }

    state.player.loot -= state.healCost;
    state.endStats.lootSpent += state.healCost;
    state.player.health += 1;
    state.healCost *= 2;
}

function blocked(map: GameMap, posOld: vec2, posNew: vec2, dist: number): boolean {
    if (posNew[0] < 0 || posNew[1] < 0 || posNew[0] >= map.cells.sizeX || posNew[1] >= map.cells.sizeY) {
        return true;
    }

    if (posOld[0] == posNew[0] && posOld[1] == posNew[1]) {
        return false;
    }

    const cell = map.cells.at(posNew[0], posNew[1]);
    const tileType = cell.type;

    if (cell.blocksPlayerMove) {
        return true;
    }

    //Jump onto or through doors is blocked
    if(dist>1) {
        if (posNew[0]==posOld[0]) {
            if ((tileType == TerrainType.DoorNS || tileType == TerrainType.DoorEW) && Math.abs(posNew[1]-posOld[1])==1) {
                if(map.items.find((item)=>item.pos[0]==posNew[0] && item.pos[1]==posNew[1] && (item.type==ItemType.DoorNS || item.type==ItemType.DoorEW))) {
                    return true;
                }    
            }
        }
    
        if (posNew[1]==posOld[1]) {
            if ((tileType == TerrainType.DoorNS || tileType == TerrainType.DoorEW) && Math.abs(posNew[0]-posOld[0])==1) {
                if(map.items.find((item)=>item.pos[0]==posNew[0] && item.pos[1]==posNew[1] && (item.type==ItemType.DoorNS || item.type==ItemType.DoorEW))) {
                    return true;
                }    
            }
        }    
    }

    if (tileType == TerrainType.OneWayWindowE && posNew[0] <= posOld[0]) {
        return true;
    }

    if (tileType == TerrainType.OneWayWindowW && posNew[0] >= posOld[0]) {
        return true;
    }

    if (tileType == TerrainType.OneWayWindowN && posNew[1] <= posOld[1]) {
        return true;
    }

    if (tileType == TerrainType.OneWayWindowS && posNew[1] >= posOld[1]) {
        return true;
    }

    return false;
}

function loadImage(src: string, img: HTMLImageElement): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

const altTileIndexForTerrainType: Array<[number, number]> = [
    [1, 4], // TerrainType.GroundNormal,
    [7, 3], // TerrainType.GroundGrass,
    [7, 7], // TerrainType.GroundWater,
    [1, 4], // TerrainType.GroundMarble,
    [1, 4], // TerrainType.GroundWood,
    [1, 4], // TerrainType.GroundWoodCreaky,
    [0, 0], // TerrainType.Wall0000,
    [3, 2], // TerrainType.Wall0001,
    [3, 3], // TerrainType.Wall0010,
    [3, 5], // TerrainType.Wall0011,
    [3, 1], // TerrainType.Wall0100,
    [2, 3], // TerrainType.Wall0101,
    [2, 1], // TerrainType.Wall0110,
    [2, 5], // TerrainType.Wall0111,
    [3, 0], // TerrainType.Wall1000,
    [2, 3], // TerrainType.Wall1001,
    [2, 2], // TerrainType.Wall1010,
    [2, 4], // TerrainType.Wall1011,
    [3, 4], // TerrainType.Wall1100,
    [2, 7], // TerrainType.Wall1101,
    [2, 8], // TerrainType.Wall1110,
    [0, 0], // TerrainType.Wall1111,
    [0, 4], // TerrainType.OneWayWindowE,
    [0, 3], // TerrainType.OneWayWindowW,
    [0, 2], // TerrainType.OneWayWindowN,
    [1, 2], // TerrainType.OneWayWindowS,
    [1, 0], // TerrainType.PortcullisNS,
    [1, 1], // TerrainType.PortcullisEW,
    [0, 5], // TerrainType.DoorNS,
    [0, 6], // TerrainType.DoorEW,
    [0, 5], // TerrainType.GardenDoorNS,
    [0, 6], // TerrainType.GardenDoorEW,
];

const tileIndexForTerrainType: Array<number> = [
    112, // TerrainType.GroundNormal,
    116, // TerrainType.GroundGrass,
    118, // TerrainType.GroundWater,
    120, // TerrainType.GroundMarble,
    122, // TerrainType.GroundWood,
    122, // TerrainType.GroundWoodCreaky,
    64, // TerrainType.Wall0000,
    65, // TerrainType.Wall0001,
    65, // TerrainType.Wall0010,
    65, // TerrainType.Wall0011,
    66, // TerrainType.Wall0100,
    67, // TerrainType.Wall0101,
    70, // TerrainType.Wall0110,
    73, // TerrainType.Wall0111,
    66, // TerrainType.Wall1000,
    68, // TerrainType.Wall1001,
    69, // TerrainType.Wall1010,
    72, // TerrainType.Wall1011,
    66, // TerrainType.Wall1100,
    74, // TerrainType.Wall1101,
    71, // TerrainType.Wall1110,
    75, // TerrainType.Wall1111,
    52, // TerrainType.OneWayWindowE,
    53, // TerrainType.OneWayWindowW,
    54, // TerrainType.OneWayWindowN,
    55, // TerrainType.OneWayWindowS,
    50, // TerrainType.PortcullisNS,
    50, // TerrainType.PortcullisEW,
    77, // TerrainType.DoorNS,
    76, // TerrainType.DoorEW,
    77, // TerrainType.GardenDoorNS,
    76, // TerrainType.GardenDoorEW,
];

const colorForTerrainType: Array<number> = [
    colorPreset.lightGray, // TerrainType.GroundNormal,
    colorPreset.darkGreen, // TerrainType.GroundGrass,
    colorPreset.lightBlue, // TerrainType.GroundWater,
    colorPreset.darkCyan, // TerrainType.GroundMarble,
    colorPreset.darkBrown, // TerrainType.GroundWood,
    0xff004070, // TerrainType.GroundWoodCreaky,
    colorPreset.lightGray, // TerrainType.Wall0000,
    colorPreset.lightGray, // TerrainType.Wall0001,
    colorPreset.lightGray, // TerrainType.Wall0010,
    colorPreset.lightGray, // TerrainType.Wall0011,
    colorPreset.lightGray, // TerrainType.Wall0100,
    colorPreset.lightGray, // TerrainType.Wall0101,
    colorPreset.lightGray, // TerrainType.Wall0110,
    colorPreset.lightGray, // TerrainType.Wall0111,
    colorPreset.lightGray, // TerrainType.Wall1000,
    colorPreset.lightGray, // TerrainType.Wall1001,
    colorPreset.lightGray, // TerrainType.Wall1010,
    colorPreset.lightGray, // TerrainType.Wall1011,
    colorPreset.lightGray, // TerrainType.Wall1100,
    colorPreset.lightGray, // TerrainType.Wall1101,
    colorPreset.lightGray, // TerrainType.Wall1110,
    colorPreset.lightGray, // TerrainType.Wall1111,
    colorPreset.lightGray, // TerrainType.OneWayWindowE,
    colorPreset.lightGray, // TerrainType.OneWayWindowW,
    colorPreset.lightGray, // TerrainType.OneWayWindowN,
    colorPreset.lightGray, // TerrainType.OneWayWindowS,
    colorPreset.lightGray, // TerrainType.PortcullisNS,
    colorPreset.lightGray, // TerrainType.PortcullisEW,
    colorPreset.lightGray, // TerrainType.DoorNS,
    colorPreset.lightGray, // TerrainType.DoorEW,
    colorPreset.darkGreen, // TerrainType.GardenDoorNS,
    colorPreset.darkGreen, // TerrainType.GardenDoorEW,
];

const tileIndexForItemType: Array<number> = [
    100, // ItemType.Chair,
    98, // ItemType.Table,
    96, // ItemType.Bush,
    110, // ItemType.Coin,
    89, // ItemType.DoorNS,
    87, // ItemType.DoorEW,
    50, // ItemType.PortcullisNS,
    50, // ItemType.PortcullisEW,
    80, // ItemType.TorchUnlit,
    80, // ItemType.TorchLit,
];

const colorForItemType: Array<number> = [
    colorPreset.darkBrown, // ItemType.Chair,
    colorPreset.darkBrown, // ItemType.Table,
    colorPreset.darkGreen, // ItemType.Bush,
    colorPreset.lightYellow, // ItemType.Coin,
    colorPreset.darkBrown, // ItemType.DoorNS,
    colorPreset.darkBrown, // ItemType.DoorEW,
    colorPreset.lightGray, // ItemType.PortcullisNS,
    colorPreset.lightGray, // ItemType.PortcullisEW,
    colorPreset.darkGray, // ItemType.TorchUnlit,
    colorPreset.lightYellow, // ItemType.TorchLit,
]

const unlitColor: number = colorPreset.lightBlue;

function renderTouchButtons(renderer:Renderer, screenSize:vec2, touchController:TouchController) {
    for(const bkey in touchController.buttonMap) {
        if(!(bkey in touchController.controlStates)) continue;
        const b = touchController.buttonMap[bkey];
        const lit = touchController.controlStates[bkey];
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
        const ind = state.gameMap.cells.index(...item.pos);
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
            const alwaysLit = terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.DoorEW;
            const lit = alwaysLit || cell.lit;

            //Draw tile
            if([TerrainType.PortcullisEW].includes(terrainType)
                && state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                renderer.addGlyph(x, y, x+1, y+1, renderer.tileSet.terrainTiles[TerrainType.PortcullisNS], lit);
            } else {
                renderer.addGlyph(x, y, x+1, y+1, renderer.tileSet.terrainTiles[terrainType], lit);
            }
            //Draw border for water
            if(terrainType===TerrainType.GroundWater) {
                const ledge = renderer.tileSet.ledgeTiles;
                let ctr = 0;
                for(let adj of [[0,1],[0,-1],[-1,0],[1,0]]) {
                    const cell = state.gameMap.cells.at(x+adj[0],y+adj[1]);
                    if(cell.type!==TerrainType.GroundWater) {
                        renderer.addGlyph(x, y, x+1, y+1, ledge[ctr], lit);
                    }
                    ctr++;
                }
            }

            const ind = state.gameMap.cells.index(x, y);
            if(!(ind in mappedItems)) continue;
            for(let item of mappedItems[ind]) {
                const alwaysLit = (item.type >= ItemType.DoorNS && item.type <= ItemType.PortcullisEW) || item.type == ItemType.Coin;
                const lit = alwaysLit || cell.lit;

                if([TerrainType.PortcullisEW].includes(terrainType)
                    && state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                        renderer.addGlyph(x, y, x + 1, y + 1, renderer.tileSet.itemTiles[ItemType.PortcullisNS], lit);    
                } else {
                    renderer.addGlyph(x, y, x + 1, y + 1, renderer.tileSet.itemTiles[item.type], lit);    
                }
            }
        }
    }
}

function renderPlayer(state: State, renderer: Renderer) {
    const player = state.player;
    const x = player.pos[0];
    const y = player.pos[1];
    const lit = state.gameMap.cells.at(x, y).lit;
    const hidden = player.hidden(state.gameMap);
    // const color =
    //     player.damagedLastTurn ? 0xff0000ff :
    //     player.noisy ? colorPreset.lightCyan :
    //     hidden ? 0xd0101010 :
    //     !lit ? colorPreset.lightBlue :
    //     colorPreset.lightGray;

    const p = renderer.tileSet.playerTiles;

    let tileInfo:TileInfo = renderer.tileSet.unlitTile;
    tileInfo =
        player.damagedLastTurn ? p[1] :
        player.noisy ? p[3] :
        hidden ? p[2] :
        !lit ? p[4] :
        p[0];

    renderer.addGlyph(x, y, x+1, y+1, tileInfo);
}

function renderGuards(state: State, renderer: Renderer) {
    for (const guard of state.gameMap.guards) {
        let tileIndex = 0 + tileIndexOffsetForDir(guard.dir);

        const cell = state.gameMap.cells.at(guard.pos[0], guard.pos[1]);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        let lit = true;
        if(!visible) tileIndex+=4;
        else if(guard.mode == GuardMode.Patrol && !guard.speaking && !cell.lit) lit=false;
        else tileIndex+=8;
        const tileInfo = renderer.tileSet.npcTiles[tileIndex];
        const gate = state.gameMap.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
        const offX = (gate!==undefined && gate.pos[0]==guard.pos[0] && gate.pos[1]==guard.pos[1])? 0.25 : 0;
        const x = guard.pos[0] + offX;
        const y = guard.pos[1];
        if(guard.hasTorch) {
            let g0 = x+guard.dir[0]*0.375+guard.dir[1]*0.375;
            let g1 = y;
            if(guard.dir[1]>0) {
                renderer.addGlyph(g0, g1, g0 + 1, g1 + 1, renderer.tileSet.itemTiles[ItemType.TorchCarry], true);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, true);
            } else {
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo, true);    
                renderer.addGlyph(g0, g1, g0 + 1, g1 + 1, renderer.tileSet.itemTiles[ItemType.TorchCarry], true);
            }
        }
        else renderer.addGlyph(guard.pos[0], guard.pos[1], guard.pos[0] + 1, guard.pos[1] + 1, tileInfo, lit);
        // renderer.addGlyph(guard.pos[0], guard.pos[1], guard.pos[0] + 1, guard.pos[1] + 1, tileInfo, lit);
}


}

function renderIconOverlays(state: State, renderer: Renderer) {
    for (const guard of state.gameMap.guards) {
        const cell = state.gameMap.cells.at(guard.pos[0], guard.pos[1]);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        const guardState = guard.overheadIcon();
        if (guardState === GuardStates.Relaxed) {
            continue;
        }

        const x = guard.pos[0];
        const y = guard.pos[1] + 0.625;

        renderer.addGlyph(x, y, x+1, y+1, renderer.tileSet.guardStateTiles[guardState], true);
    }

    // Render an icon over the player if the player is being noisy

    if (state.player.noisy) {
        const x = state.player.pos[0];
        const y = state.player.pos[1] - 0.5;
        renderer.addGlyph(x, y, x+1, y+1, {textureIndex: 104, color: 0x80ffffff}, true);
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
                if (vec2.squaredLength(dpos) >= guard.sightCutoff(cell.lit)) {
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
                renderer.addGlyph(x, y, x+1, y+1, {textureIndex:3, color:0xffffffff}, true);
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
            renderer.addGlyph(pos[0], pos[1], pos[0]+1, pos[1]+1, {textureIndex:92, color:0xff80ff80}, true);
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

function initState(sounds:Howls, subtitledSounds: SubtitledHowls, activeSoundPool:ActiveHowlPool, touchController:TouchController): State {
    const initialLevel = 0;
    const gameMapRoughPlans = createGameMapRoughPlans(numGameMaps, totalGameLoot);
    const gameMap = createGameMap(initialLevel, gameMapRoughPlans[initialLevel]);

    return {
        endStats: {    
            lootStolen: 0,
            lootSpent: 0,
            levelsGhosted: 0,
            timeBonuses: 0,
            maxLevelsGhosted: 0,
            maxTimeBonsuses: 0,
            maxLootStolen: 0,
        },
        tLast: undefined,
        dt: 0,
        leapToggleActive: false,
        gameMode: GameMode.Mansion,
        helpActive: false,
        helpPageIndex: 0,
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
        lootStolen: 0,
        lootSpent: 0,
        lootAvailable: gameMapRoughPlans[initialLevel].totalLoot,
        ghostBonus: 5,
        timeBonus: 5,   
        gameMapRoughPlans: gameMapRoughPlans,
        gameMap: gameMap,
        sounds: sounds,
        subtitledSounds: subtitledSounds,
        activeSoundPool: activeSoundPool,
        guardMute: false,
        volumeMute: false,
        touchAsGamepad: true,
        touchController: touchController,
        gamepadManager: new GamepadManager(),
        keyboardController: new KeyboardController(),
        popups: new Popups,
    };
}

function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(numGameMaps, totalGameLoot);
    state.level = 0;

    state.endStats = {    
        lootStolen: 0,
        lootSpent: 0,
        levelsGhosted: 0,
        timeBonuses: 0,
        maxLevelsGhosted: 0,
        maxTimeBonsuses: 0,
        maxLootStolen: 0,
    };
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.gameMode = GameMode.Mansion;
    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.healCost = 1;
    state.turns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.timeBonus = 5;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.gameMap = gameMap;
    state.activeSoundPool.empty();
    state.popups.clear();
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);
    state.turns = 0;
    state.lootStolen = 0;
    state.lootSpent = 0;
    state.lootAvailable = state.gameMapRoughPlans[state.level].totalLoot;
    state.ghostBonus = 5;
    state.timeBonus = 5;

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
    updateTouchButtons(state.touchController, renderer, screenSize, state);

    renderScene(renderer, screenSize, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}


function updateState(state: State, screenSize: vec2, dt: number) {
    updateCamera(state, screenSize, dt);
}

function renderScene(renderer: Renderer, screenSize: vec2, state: State) {
    renderer.beginFrame(screenSize);

    switch (state.gameMode) {
        case GameMode.Mansion:
            {
                const matScreenFromWorld = mat4.create();
                setupViewMatrix(state, screenSize, matScreenFromWorld);
            
                renderer.start(matScreenFromWorld, 1);
                renderWorld(state, renderer);
                renderGuardSight(state, renderer);
                renderGuardPatrolPaths(state, renderer);
                renderPlayer(state, renderer);
                renderGuards(state, renderer);
                renderIconOverlays(state, renderer);
                if(lastController==state.touchController) renderTouchButtons(renderer, screenSize, state.touchController);
                renderer.flush();

                if (state.helpActive) {
                    renderHelp(renderer, screenSize, state);
                    renderBottomStatusBar(renderer, screenSize, state);
                } else {
                    renderTopStatusBar(renderer, screenSize, state.topStatusMessage);
                    renderBottomStatusBar(renderer, screenSize, state);
                }
            }
            break;

        case GameMode.BetweenMansions:
            {
                const matScreenFromWorld = mat4.create();
                setupViewMatrix(state, screenSize, matScreenFromWorld);

                renderer.start(matScreenFromWorld, 1);
                renderWorld(state, renderer);
                renderGuards(state, renderer);
                if(lastController==state.touchController) renderTouchButtons(renderer, screenSize, state.touchController);
                renderer.flush();

                if (state.helpActive) {
                    renderHelp(renderer, screenSize, state);
                    renderBottomStatusBar(renderer, screenSize, state);
                } else {
                    renderTopStatusBar(renderer, screenSize, state.topStatusMessage);
                    renderBottomStatusBar(renderer, screenSize, state);
    
                    renderTextLines(renderer, screenSize, [
                        '   Mansion ' + (state.level + 1) + ' Complete!',
                        '',
                        'Mansion Statistics',
                        'Loot stolen:     ' + (state.lootStolen)+'/'+(state.lootAvailable),
                        'Ghost bonus:     ' + (state.ghostBonus),
                        'Timely delivery: ' + (state.timeBonus),
                        'Mansion total:   ' + (state.lootStolen+state.ghostBonus+state.timeBonus),
                        '',
                        'Current loot:    ' + state.player.loot,
                        'H: Heal one heart for $' + state.healCost,
                        'N: Next mansion',
                    ]);
                }
            }
            break;

        case GameMode.Dead:
            {
                const matScreenFromWorld = mat4.create();
                setupViewMatrix(state, screenSize, matScreenFromWorld);

                renderer.start(matScreenFromWorld, 1);
                renderWorld(state, renderer);
                renderPlayer(state, renderer);
                renderGuards(state, renderer);
                if(lastController==state.touchController) renderTouchButtons(renderer, screenSize, state.touchController);
                renderer.flush();

                if (state.helpActive) {
                    renderHelp(renderer, screenSize, state);
                    renderBottomStatusBar(renderer, screenSize, state);
                } else {
                    renderTopStatusBar(renderer, screenSize, state.topStatusMessage);
                    renderBottomStatusBar(renderer, screenSize, state);
                    const es = state.endStats;
                    renderTextLines(renderer, screenSize, [
                        '   You are dead!',
                        '',
                        'Statistics',
                        'Loot stolen:   ' + es.lootStolen +'/'+es.maxLootStolen,
                        'Ghost bonuses: ' + es.levelsGhosted+'/'+es.maxLevelsGhosted,
                        'Time bonuses:  ' + es.timeBonuses+'/'+es.maxTimeBonsuses,
                        'Loot spent:    ' + es.lootSpent,
                        '',
                        'Final loot:    ' + state.player.loot,
                        '',
                        'R: Restart new game',
                    ]);
                }
            }
            break;

        case GameMode.Win:
            {
                const matScreenFromWorld = mat4.create();
                setupViewMatrix(state, screenSize, matScreenFromWorld);

                renderer.start(matScreenFromWorld, 1);
                renderWorld(state, renderer);
                renderGuards(state, renderer);
                if(lastController==state.touchController) renderTouchButtons(renderer, screenSize, state.touchController);
                renderer.flush();

                if (state.helpActive) {
                    renderHelp(renderer, screenSize, state);                    
                    renderBottomStatusBar(renderer, screenSize, state);
                } else {
                    renderTopStatusBar(renderer, screenSize, state.topStatusMessage);
                    renderBottomStatusBar(renderer, screenSize, state);
                    const es = state.endStats;
                    renderTextLines(renderer, screenSize, [
                        '   Mission Complete!',
                        '',
                        'Statistics',
                        'Loot stolen:   ' + es.lootStolen +'/'+es.maxLootStolen,
                        'Ghost bonuses: ' + es.levelsGhosted+'/'+es.maxLevelsGhosted,
                        'Time bonuses:  ' + es.timeBonuses+'/'+es.maxTimeBonsuses,
                        'Loot spent:    ' + es.lootSpent,
                        '',
                        'Score:         ' + state.player.loot,
                        '',
                        'R: Restart new game',
                    ]);
                }
            }
            break;
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
                (vPos[1]-vpy/2 - statusBarCharPixelSizeY)*vwsy/vpy + cpy
            )
        },
        worldToScreen: (cPos:vec2) => {
            return vec2.fromValues(
                (cPos[0] - cpx)*vpx/vwsx + vpx/2,
                (cPos[1] - cpy)*vpy/vwsy + vpy/2 + statusBarCharPixelSizeY
            )
        }
    }    
}

function updateTouchButtons(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    if(lastController != touchController) return;
    const worldSize = vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY);
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const sw = screenSize[0];
    const sh = screenSize[1] - 2*statusBarCharPixelSizeY;
    const pt = createPosTranslator(screenSize, worldSize, state.camera.position, state.zoomLevel);
    if(touchController.lastMotion.id!=-1 && touchController.lastMotion.active) {
        const p0 = pt.screenToWorld(vec2.fromValues(touchController.lastMotion.x0, touchController.lastMotion.y0));
        const p1 = pt.screenToWorld(vec2.fromValues(touchController.lastMotion.x, touchController.lastMotion.y));
        var d = vec2.fromValues(p1[0]-p0[0], p1[1]-p0[1]);
        state.camera.panning = true;
        vec2.subtract(d, p1, p0);
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
    const buttonData:{[id:string]:{game:Rect,view:Rect,tileInfo:TileInfo}} = {
        'zoomIn':  {game:new Rect(x+w-bw+offZoom,y+h-2*bh,bw,bh), view: new Rect(), tileInfo:tt['zoomIn']},
        'zoomOut':   {game:new Rect(x+w-bw+offZoom,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['zoomOut']},
        'heal':     {game:new Rect(x+w-bw+offHealNext,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['heal']},
        'nextLevel':{game:new Rect(x+w-bw+offHealNext,y+h-2*bh,bw,bh), view: new Rect(), tileInfo:tt['nextLevel']},
        'fullscreen':  {game:new Rect(x+w-bw+offForceRestartFullscreen,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['fullscreen']},
        'restart':  {game:new Rect(x+w-bw+offRestart,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['restart']},
        'forceRestart':  {game:new Rect(x+w-bw+offForceRestartFullscreen,y+h-2*bh,bw,bh), view: new Rect(), tileInfo:tt['restart']},
        'gamepadStyleTouch':  {game:new Rect(x+w-bw+offForceRestartFullscreen,y+h-3*bh,bw,bh), view: new Rect(), tileInfo:state.touchAsGamepad?tt['gamepadTouchOn']:tt['gamepadTouchOff']},
        'menu':     {game:new Rect(x,y+h-bh,bw,bh), view: new Rect(), tileInfo:tt['menu']},
    }
    if(state.touchAsGamepad) {
        const moveButtons:{[id:string]:{game:Rect,view:Rect,tileInfo:TileInfo}} = {
            'left':     {game:new Rect(x,y+bh,bw,bh), view: new Rect(), tileInfo:tt['left']},
            'right':    {game:new Rect(x+2*bw,y+bh,bw,bh), view: new Rect(), tileInfo:tt['right']},
            'up':       {game:new Rect(x+bw,y+2*bh,bw,bh), view: new Rect(), tileInfo:tt['up']},
            'down':     {game:new Rect(x+bw,y,bw,bh), view: new Rect(), tileInfo:tt['down']},
            'wait':     {game:new Rect(x+bw,y+bh,bw,bh), view: new Rect(), tileInfo:tt['wait']},
            'jump':     {game:new Rect(x+w-bw,y+bw,bw,bh), view: new Rect(), tileInfo:tt['jump']},
        }
        for(let mb in moveButtons) {
            buttonData[mb] = moveButtons[mb];
        }
    } 
    else {
        //TODO: For this scheme we also want to allow Button to activate on release rather than press
        // i.e., on touchend -- should be a simple mod
        //TODO: Also add an option in the constructor to handle mouseevents in the TouchController
        const pp = state.player.pos;
        buttonData['wait'] = {game:new Rect(...pp,1,1), view: new Rect(), tileInfo:tt['wait']}
        if(state.finishedLevel && state.gameMode==GameMode.Mansion && !state.helpActive 
                && (pp[0]==0 || pp[1]==0 || pp[0]==worldSize[0]-1 || pp[1]==worldSize[1]-1)) {
            buttonData['exitLevel'] = {game:new Rect(x+w-bw,y+h-3*bh,bw,bh), view: new Rect(), tileInfo:tt['exitLevel']};
        } else {
            buttonData['exitLevel'] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['exitLevel']};
        }
        for(const vals of [['left',[-1,0]],['right',[1,0]],['up',[0,1]],['down',[0,-1]]] as Array<[string, [number,number]]>) {
            const name = vals[0];
            const p = vals[1];
            const pt = vec2.fromValues(pp[0]+p[0],pp[1]+p[1]);
            if(pt[0]<0 || pt[1]<0 || pt[0]>=worldSize[0] || pt[1]>=worldSize[1]) continue;
            if(!state.gameMap.cells.at(...pt).blocksPlayerMove 
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowE)
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowW)
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowN)
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowS)
                && !state.gameMap.items.find((item)=>item.pos[0]==pt[0] && item.pos[1]==pt[1] 
                        && [ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type))
                && !state.gameMap.guards.find((guard)=>guard.pos[0]==pt[0] && guard.pos[1]==pt[1])
                ) {
                    buttonData[name] = {game:new Rect(...pt,1,1), view: new Rect(), tileInfo:tt['picker']}
                } else {
                    buttonData[name] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['picker']}
                }
        }
        for(const vals of [['jumpLeft',[-1,0]],['jumpRight',[1,0]],['jumpUp',[0,1]],['jumpDown',[0,-1]]] as Array<[string, [number,number]]>) {
            const name = vals[0];
            const p = vals[1];
            const pt = vec2.fromValues(pp[0]+p[0],pp[1]+p[1]);
            const pt2 = vec2.fromValues(pp[0]+2*p[0],pp[1]+2*p[1]);
            if( !(pt[0]<0 || pt[1]<0 || pt[0]>=worldSize[0] || pt[1]>=worldSize[1]) 
                && !(pt2[0]<0 || pt2[1]<0 || pt2[0]>=worldSize[0] || pt2[1]>=worldSize[1])
                && !state.gameMap.cells.at(...pt).blocksPlayerMove
                && !state.gameMap.cells.at(...pt2).blocksPlayerMove 
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowE && name=='jumpLeft')
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowW && name=='jumpRight')
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowN && name=='jumpDown')
                && !(state.gameMap.cells.at(...pt).type==TerrainType.OneWayWindowS && name=='jumpUp')
                && !state.gameMap.items.find((item)=>item.pos[0]==pt2[0] && item.pos[1]==pt2[1] 
                        && [ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type))
                && !state.gameMap.guards.find((guard)=>guard.pos[0]==pt2[0] && guard.pos[1]==pt2[1])
                ) {
                    buttonData[name] = {game:new Rect(...pt2,1,1), view: new Rect(), tileInfo:tt['picker']}
                } else {
                    buttonData[name] = {game:new Rect(-1,-1,0,0), view: new Rect(), tileInfo:tt['picker']}
                }
        }    
    }
    for(const bkey in buttonData) {
        const game = buttonData[bkey].game;
        const xy0 = pt.worldToScreen(vec2.fromValues(game[0],game[1]));
        const xy1 = pt.worldToScreen(vec2.fromValues(game[0]+game[2],game[1]+game[3]));
        buttonData[bkey].view = new Rect(
            xy0[0],xy0[1],xy1[0]-xy0[0],xy1[1]-xy0[1]
        )
    }
    touchController.updateButtonLocations(buttonData);
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

const helpPages: Array<Array<string>> = [
    [
        '           Lurk, Leap, Loot',
        '',
        'Your mission from the thieves\' guild is to',
        'map ' + numGameMaps + ' mansions. You can keep any loot you',
        'find (' + totalGameLoot + ' total).',
        '',
        'Mansion bonuses:',
        '- Up to 5 gold for a timely map delivery.',
        '- 5 gold if you avoid alerting guards.',
        '', 
        '                      <Escape to close help>',
        'Page 1 of 4 <Arrow right / D / L to advance>',
    ],
    [
        'Keyboard controls',
        '',
        '  Move: Arrows / WASD / HJKL',
        '  Wait: Space / Z / Period / Numpad5',
        '  Leap: Shift + move',
        '  Leap (Toggle): F / Numpad+',
        '  Zoom View: [ / ]',
        '  Volume: (Mute/Down/Up) 0 / - / =',
        '  Guard Mute (Toggle): 9',
        '',
        'Disable NumLock if using numpad',
        'Mouse, touch and gamepad also supported',
        '',
        'Page 2 of 4',
    ],
    [
        '   Thief: You!',
        '   Guard: Avoid them!',
        '   Loot: Collect for score, or to spend on healing',
        '   Tree: Hiding place',
        '   Table: Hiding place',
        '   Stool: Not a hiding place',
        '   Torch: Guards want them lit',
        '   Window: One-way escape route',
        '',
        'Page 3 of 4',
    ],
    [
        'Made for 2023 Seven-Day Roguelike Challenge',
        '',
        'by James McNeill and Damien Moore',
        '',
        'Additional voices by Evan Moore',
        'Additional assistance by Mike Gaffney',
        'Testing by Tom Elmer',
        'Special thanks to Mendi Carroll',
        '',
        'Page 4 of 4',
    ],
];

function renderHelp(renderer: Renderer, screenSize: vec2, state: State) {

    const lines = helpPages[state.helpPageIndex];

    let maxLineLength = 0;
    for (const line of lines) {
        maxLineLength = Math.max(maxLineLength, line.length);
    }

    const minCharsX = 65;
    const minCharsY = 22;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const linesPixelSizeX = maxLineLength * pixelsPerCharX;
    const linesPixelSizeY = lines.length * pixelsPerCharY;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = Math.floor((screenSize[0] - linesPixelSizeX) / -2) / pixelsPerCharX;
    const offsetY = Math.floor((screenSize[1] - linesPixelSizeY) / -2) / pixelsPerCharY;

    const matScreenFromTextArea = mat4.create();
    mat4.ortho(
        matScreenFromTextArea,
        offsetX,
        offsetX + numCharsX,
        offsetY,
        offsetY + numCharsY,
        1,
        -1);
    renderer.start(matScreenFromTextArea, 0);

    const colorText = 0xffeef0ff;
    const colorBackground = 0xf0101010;

    // Draw a stretched box to make a darkened background for the text.
    renderer.addGlyph(
        -2, -1, maxLineLength + 2, lines.length + 1,
        {textureIndex:219, color:colorBackground}
    );

    for (let i = 0; i < lines.length; ++i) {
        const row = lines.length - (1 + i);
        for (let j = 0; j < lines[i].length; ++j) {
            const col = j;
            const ch = lines[i];
            if (ch === ' ') {
                continue;
            }
            const glyphIndex = lines[i].charCodeAt(j);
            renderer.addGlyph(
                col, row, col + 1, row + 1,
                {textureIndex:glyphIndex, color:colorText}
            );
        }
    }

    renderer.flush();

    if (state.helpPageIndex == 2) {
        const pixelsPerGlyphX = 16 * scaleFactor;
        const pixelsPerGlyphY = 16 * scaleFactor;
        const numCharsX = screenSize[0] / pixelsPerGlyphX;
        const numCharsY = screenSize[1] / pixelsPerGlyphY;
        const offsetX = Math.floor((screenSize[0] - linesPixelSizeX) / -2) / pixelsPerGlyphX;
        const offsetY = Math.floor((screenSize[1] - linesPixelSizeY) / -2) / pixelsPerGlyphY;
    
        mat4.ortho(
            matScreenFromTextArea,
            offsetX,
            offsetX + numCharsX,
            offsetY,
            offsetY + numCharsY,
            1,
            -1);

        function putGlyph(x: number, y: number, glyph: number) {
            renderer.addGlyph(x, y + 0.125, x+1, y+1.125, {textureIndex: glyph, color: colorPreset.white});
        }

        renderer.start(matScreenFromTextArea, 1);
        putGlyph(0, 9, 114);
        putGlyph(0, 8, 81);
        putGlyph(0, 7, 53);
        putGlyph(0, 6, 50);
        putGlyph(0, 5, 52);
        putGlyph(0, 4, 51);
        putGlyph(0, 3, 49);
        putGlyph(0, 2, 160);
        renderer.flush();
    }

    const status = 'Esc or / to return to game; left/right for more (' + (state.helpPageIndex + 1) + ' of ' + helpPages.length + ')';
    renderTopStatusBar(renderer, screenSize, status);
}

function renderTopStatusBar(renderer: Renderer, screenSize: vec2, message: string) {
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

    const seenMsg = 'Mansion ' + (state.level + 1) + ' - ' + percentSeen + '% Mapped - ' +' Turn ' + state.turns;

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

function renderTextLines(renderer: Renderer, screenSize: vec2, lines: Array<string>) {
    let maxLineLength = 0;
    for (const line of lines) {
        maxLineLength = Math.max(maxLineLength, line.length);
    }

    const minCharsX = 65;
    const minCharsY = 22;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const linesPixelSizeX = maxLineLength * pixelsPerCharX;
    const linesPixelSizeY = lines.length * pixelsPerCharY;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = Math.floor((screenSize[0] - linesPixelSizeX) / -2) / pixelsPerCharX;
    const offsetY = Math.floor((screenSize[1] - linesPixelSizeY) / -2) / pixelsPerCharY;

    const matScreenFromTextArea = mat4.create();
    mat4.ortho(
        matScreenFromTextArea,
        offsetX,
        offsetX + numCharsX,
        offsetY,
        offsetY + numCharsY,
        1,
        -1);
    renderer.start(matScreenFromTextArea, 0);

    const colorText = 0xffeef0ff;
    const colorBackground = 0xf0101010;

    // Draw a stretched box to make a darkened background for the text.
    renderer.addGlyph(
        -2, -1, maxLineLength + 2, lines.length + 1,
        {textureIndex:219, color:colorBackground}
    );

    for (let i = 0; i < lines.length; ++i) {
        const row = lines.length - (1 + i);
        for (let j = 0; j < lines[i].length; ++j) {
            const col = j;
            const ch = lines[i];
            if (ch === ' ') {
                continue;
            }
            const glyphIndex = lines[i].charCodeAt(j);
            renderer.addGlyph(
                col, row, col + 1, row + 1,
                {textureIndex:glyphIndex, color:colorText}
            );
        }
    }

    renderer.flush();
}
