import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap } from './create-map';
import { BooleanGrid, ItemType, GameMap, GameMapRoughPlan, Item, Player, TerrainType, maxPlayerHealth, GuardStates } from './game-map';
import { GuardMode, guardActAll, lineOfSight } from './guard';
import { Renderer } from './render';
import { TileInfo, getTileSet, getFontTileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups, PopupType } from './popups';
import { TouchController, GamepadManager, KeyboardController, ControlStates, controlStates, lastController, Rect } from './controllers';

import * as colorPreset from './color-preset';

const tileSet = getTileSet('31color'); //'34view'|'basic'|'sincity'|'31color'
const fontTileSet = getFontTileSet('font'); 

window.onload = loadResourcesThenRun;

const numGameMaps: number = 10;
const totalGameLoot: number = 100;

const targetStatusBarWidthInChars: number = 65;
const statusBarCharPixelSizeX: number = 8;
const statusBarCharPixelSizeY: number = 16;
const pixelsPerTileX: number = 16; // width of unzoomed tile
const pixelsPerTileY: number = 16; // height of unzoomed tile

const startingTopStatusMessage = 'Esc or / for help';

type Camera = {
    position: vec2;
    velocity: vec2;
    snapped: boolean;
}

enum GameMode {
    Mansion,
    BetweenMansions,
    Dead,
    Win,
}

type State = {
    tLast: number | undefined;
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
    gameMapRoughPlans: Array<GameMapRoughPlan>;
    gameMap: GameMap;
    sounds: Howls;
    subtitledSounds: SubtitledHowls;
    activeSoundPool: ActiveHowlPool;
    guardMute: boolean;
    volumeMute: boolean;
    touchController: TouchController;
    keyboardController: KeyboardController;
    gamepadManager: GamepadManager;
    oldControlStates: ControlStates;
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
    const touchController = new TouchController(canvas);
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
    if (state.helpActive) {
        onControlsInHelp();
    } else {
        switch (state.gameMode) {
            case GameMode.Mansion: onControlsInMansion(); break;
            case GameMode.BetweenMansions: onControlsInBetweenMansions(); break;
            case GameMode.Dead: onControlsInGameOver(); break;
            case GameMode.Win: onControlsInGameOver(); break;
        }
    }
    state.oldControlStates = {...controlStates};

    function pressed(action:string):boolean {
        if(!(action in controlStates)) return false;
        if(lastController==null) return false
        const result = controlStates[action] && (!state.oldControlStates[action] || Date.now()-lastController.controlTimes[action]>250);
        if(result) lastController.controlTimes[action] = Date.now();
        return result;

        // if(lastController === state.keyboardController) {
        //     const result = controlStates[action] && (!state.oldControlStates[action] || Date.now()-lastController.controlTimes[action]>250);
        //     if(result) lastController.controlTimes[action] = Date.now();
        //     return result;
        // }
        // if(lastController!=null) {
        //     const result = !controlStates[action] && state.oldControlStates[action] 
        //         || controlStates[action] && Date.now()-lastController.controlTimes[action]>250;
        //     if(result) lastController.controlTimes[action] = Date.now();
        //     return result
        // }
        // return false;
    }
    
    function onControlsInHelp() {
        if (pressed('menu')) {
            state.helpActive = false;
        } else if (pressed('fullscreen')) {
            const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
            canvas.requestFullscreen({navigationUI:"hide"});
        } else if (pressed('forceRestart')) {
            restartGame(state);
        } else if (pressed('left')) {
            state.helpPageIndex = Math.max(0, state.helpPageIndex - 1);
        } else if (pressed('right')) {
            state.helpPageIndex = Math.min(helpPages.length - 1, state.helpPageIndex + 1);
        }
    }
        
    function onControlsInMansion() {
        if (pressed('seeAll')) {
            state.seeAll = !state.seeAll;
        } else if (pressed('collectLoot')) {
            state.player.loot += state.gameMap.collectAllLoot();
            postTurn(state);
        } else if (pressed('guardSight')) {
            state.seeGuardSight = !state.seeGuardSight;
        } else if (pressed('guardPatrols')) {
            state.seeGuardPatrols = !state.seeGuardPatrols;
        } else if (pressed('forceRestart')) {
            restartGame(state);
        } else if (pressed('nextLevel')) {
            if (state.level < state.gameMapRoughPlans.length - 1) {
                ++state.level;
                resetState(state);
            }
        } else if (pressed('resetLevel')) {
            resetState(state);
        } else if (pressed('prevLevel')) {
            if (state.level > 0) {
                --state.level;
                resetState(state);
            }
        } else if (pressed('markSeen')) {
            state.gameMap.markAllSeen();
            postTurn(state);
        } else if (pressed('zoomIn')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (pressed('zoomOut')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (pressed('left')) {
            const moveSpeed = (state.leapToggleActive || controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, -1, 0, moveSpeed);
        } else if (pressed('right')) {
            const moveSpeed = (state.leapToggleActive || controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 1, 0, moveSpeed);
        } else if (pressed('down')) {
            const moveSpeed = (state.leapToggleActive || controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 0, -1, moveSpeed);
        } else if (pressed('up')) {
            const moveSpeed = (state.leapToggleActive || controlStates['jump']) ? 2 : 1;
            tryMovePlayer(state, 0, 1, moveSpeed);
        } else if (pressed('wait')) {
            tryMovePlayer(state, 0, 0, 1);
        } else if (pressed('menu')) {
            state.helpActive = true;
        } else if (pressed('jumpToggle')) {
            state.leapToggleActive = !state.leapToggleActive;
        } else if (pressed('guardMute')) {
            state.guardMute = !state.guardMute;
            for(const s in state.subtitledSounds) {
                state.subtitledSounds[s].mute = state.guardMute;
            }
        } else if (pressed('volumeMute')) {
            state.volumeMute = !state.volumeMute;
            Howler.mute(state.volumeMute);
        } else if (pressed('volumeDown')) {
            const vol = Howler.volume();
            Howler.volume(Math.max(vol-0.1,0.1));
        } else if (pressed('volumeUp')) {
            const vol = Howler.volume();
            Howler.volume(Math.max(vol+0.1,1.0));
        }
    }
    function onControlsInBetweenMansions() {
        if (pressed('BracketLeft')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (pressed('BracketRight')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (pressed('restart')) {
            restartGame(state);
        } else if (pressed('heal')) {
            tryHealPlayer(state);
        } else if (pressed('nextLevel')) {
            advanceToNextLevel(state);
        } else if (pressed('menu')) {
            state.helpActive = true;
        }
    }
        
    function onControlsInGameOver() {
        if (pressed('BracketLeft')) {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (pressed('BracketRight')) {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (pressed('restart')) {
            restartGame(state);
        } else if (pressed('menu')) {
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

    // If just passing time, do that.

    if ((dx === 0 && dy === 0) || distDesired <= 0) {
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

    for (; dist > 0; --dist) {
        const x = player.pos[0] + dx;
        const y = player.pos[1] + dy;

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
        } else if (blocked(state.gameMap, posPrev, pos)) {
            if (isOneWayWindowTerrainType(state.gameMap.cells.at(...pos).type)) {
                state.topStatusMessage = 'Window cannot be accessed from outside';
                state.topStatusMessageSticky = false;
                if(state.level===0) state.sounds['tooHigh'].play(0.3);
                else state.sounds['footstepTile'].play(0.1);    
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

    // If the move would end on a torch, portcullis, or window, shorten it

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

    for (const guard of map.guardsInEarshot(player.pos, radius)) {
        guard.heardThief = true;
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
    if (state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater) {
        if (state.player.turnsRemainingUnderwater > 0) {
            --state.player.turnsRemainingUnderwater;
        }
    } else {
        state.player.turnsRemainingUnderwater = 7;
    }


    guardActAll(state.gameMap, state.popups, state.player);

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
    state.player.health += 1;
    state.healCost *= 2;
}

function blocked(map: GameMap, posOld: vec2, posNew: vec2): boolean {
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
        if(!(bkey in controlStates)) continue;
        const b = touchController.buttonMap[bkey];
        const lit = controlStates[bkey];
        renderer.addGlyph(b.game[0],b.game[1],b.game[0]+b.game[2],b.game[1]+b.game[3],
            {textureIndex:b.textureIndex, color:0xffffffff, unlitColor:0xff909090}, lit);
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
            if (terrainType == TerrainType.GroundWoodCreaky && !cell.lit) {
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
        snapped: false,
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
        tLast: undefined,
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
        gameMapRoughPlans: gameMapRoughPlans,
        gameMap: gameMap,
        sounds: sounds,
        subtitledSounds: subtitledSounds,
        activeSoundPool: activeSoundPool,
        guardMute: false,
        volumeMute: false,
        touchController: touchController,
        gamepadManager: new GamepadManager(),
        keyboardController: new KeyboardController(),
        oldControlStates: {...controlStates},
        popups: new Popups,
    };
}

function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(numGameMaps, totalGameLoot);
    state.level = 0;

    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);

    state.gameMode = GameMode.Mansion;
    state.topStatusMessage = startingTopStatusMessage;
    state.topStatusMessageSticky = true;
    state.finishedLevel = false;
    state.healCost = 1;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.gameMap = gameMap;
    state.activeSoundPool.empty();
    state.popups.clear();
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);

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
    state.tLast = t;

    const screenSize = vec2.create();
    renderer.getScreenSize(screenSize);

    if (!state.camera.snapped) {
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

                    renderTextLines(renderer, screenSize, [
                        '   You are dead!',
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
                renderer.flush();

                if (state.helpActive) {
                    renderHelp(renderer, screenSize, state);                    
                    renderBottomStatusBar(renderer, screenSize, state);
                } else {
                    renderTopStatusBar(renderer, screenSize, state.topStatusMessage);
                    renderBottomStatusBar(renderer, screenSize, state);

                    renderTextLines(renderer, screenSize, [
                        '   Mission Complete!',
                        '',
                        'Score: ' + state.player.loot + ' of ' + totalGameLoot + ' loot',
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
                (vPos[1]-vpy/2)*vwsy/vpy + cpy
            )
        },
        worldToScreen: (cPos:vec2) => {
            return vec2.fromValues(
                (cPos[0] - cpx)*vpx/vwsx + vpx/2,
                (cPos[1] - cpy)*vpy/vwsy + vpy/2
            )
        }
    }    
}

function updateTouchButtons(touchController:TouchController, renderer:Renderer, screenSize:vec2, state: State) {
    if(lastController != touchController) return;
    const worldSize = vec2.fromValues(state.gameMap.cells.sizeX, state.gameMap.cells.sizeY);
    const statusBarPixelSizeY = statusBarCharPixelSizeY * statusBarZoom(screenSize[0]);
    const sw = screenSize[0];
    const sh = screenSize[1] - 4*statusBarCharPixelSizeY;
    const pt = createPosTranslator(screenSize, worldSize, state.camera.position, state.zoomLevel);
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
    const offRestartFullscreen = state.helpActive || [GameMode.Dead, GameMode.Win].includes(state.gameMode) ? 0:100;
    const buttonData:{[id:string]:{game:Rect,view:Rect,textureIndex:number}} = {
        'left':     {game:new Rect(x,y+bh,bw,bh), view: new Rect(), textureIndex:4},
        'right':    {game:new Rect(x+2*bw,y+bh,bw,bh), view: new Rect(), textureIndex:5},
        'up':       {game:new Rect(x+bw,y+2*bh,bw,bh), view: new Rect(), textureIndex:6},
        'down':     {game:new Rect(x+bw,y,bw,bh), view: new Rect(), textureIndex:7},
        'wait':     {game:new Rect(x+bw,y+bh,bw,bh), view: new Rect(), textureIndex:8},
        'jump':     {game:new Rect(x+w-bw,y+bw,bw,bh), view: new Rect(), textureIndex:9},
        'zoomIn':  {game:new Rect(x+w-bw+offZoom,y+h-2*bh,bw,bh), view: new Rect(), textureIndex:10},
        'zoomOut':   {game:new Rect(x+w-bw+offZoom,y+h-bh,bw,bh), view: new Rect(), textureIndex:11},
        'heal':     {game:new Rect(x+w-bw+offHealNext,y+h-bh,bw,bh), view: new Rect(), textureIndex:12},
        'nextLevel':{game:new Rect(x+w-bw+offHealNext,y+h-2*bh,bw,bh), view: new Rect(), textureIndex:13},
        'fullscreen':  {game:new Rect(x+w-bw+offRestartFullscreen,y+h-bh,bw,bh), view: new Rect(), textureIndex:15+32},
        'forceRestart':  {game:new Rect(x+w-bw+offRestartFullscreen,y+h-2*bh,bw,bh), view: new Rect(), textureIndex:14},
        'menu':     {game:new Rect(x,y+h-bh,bw,bh), view: new Rect(), textureIndex:15},
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

    const velNew = vec2.create();
    vec2.scaleAndAdd(velNew, state.camera.velocity, acc, dt);

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
        '         Lurk, Leap, Loot',
        '',
        'Your mission from the thieves\' guild',
        'is to map ' + numGameMaps + ' mansions. You can keep',
        'any loot you find (' + totalGameLoot + ' total).',
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
        '',
        'Page 1 of 3',
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
        'Page 2 of 3',
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
        'Page 3 of 3',
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

    if (state.helpPageIndex == 1) {
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
        const breathX = healthX + maxPlayerHealth + 88;

        putString(renderer, breathX, "Air", colorPreset.lightCyan);

        for (let i = 0; i < state.player.turnsRemainingUnderwater; ++i) {
            const glyphBubble = 9;
            renderer.addGlyph(breathX + 4 + i, 0, breathX + 5 + i, 1, {textureIndex:glyphBubble, color:colorPreset.lightCyan});
        }
    }

    // Mapping percentage

    const percentSeen = state.gameMap.percentSeen();

    const seenMsg = 'Mansion ' + (state.level + 1) + ' - ' + percentSeen + '% Mapped';

    const seenX = Math.floor((statusBarTileSizeX - seenMsg.length) / 2 + 0.5);
    putString(renderer, seenX, seenMsg, colorPreset.lightGray);

    // Total loot

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
