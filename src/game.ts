import { vec2, mat4 } from './my-matrix';
import { createGameMapRoughPlans, createGameMap } from './create-map';
import { BooleanGrid, ItemType, GameMap, GameMapRoughPlan, Item, Player, TerrainType, maxPlayerHealth, GuardStates } from './game-map';
import { GuardMode, guardActAll, lineOfSight } from './guard';
import { Renderer } from './render';
import { TileInfo, getTileSet, getFontTileSet } from './tilesets';
import { setupSounds, Howls, SubtitledHowls, ActiveHowlPool, Howler } from './audio';
import { Popups } from './popups';

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
    uAnimateTurn : number;
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

    const renderer = new Renderer(canvas, tileSet, fontTileSet);
    const sounds:Howls = {};
    const subtitledSounds:SubtitledHowls = {};
    const activeSoundPool:ActiveHowlPool = new ActiveHowlPool();
    const state = initState(sounds, subtitledSounds, activeSoundPool);

    document.body.addEventListener('keydown', onKeyDown);

    function onKeyDown(e: KeyboardEvent) {
        if (Object.keys(state.sounds).length==0) setupSounds(state.sounds, state.subtitledSounds, state.activeSoundPool);

        if (state.helpActive) {
            onKeyDownHelp(e);
        } else {
            switch (state.gameMode) {
                case GameMode.Mansion: onKeyDownMansion(e); break;
                case GameMode.BetweenMansions: onKeyDownBetweenMansions(e); break;
                case GameMode.Dead: onKeyDownGameOver(e); break;
                case GameMode.Win: onKeyDownGameOver(e); break;
            }
        }
    }

    function onKeyDownHelp(e: KeyboardEvent) {
        if (e.code == 'Escape' || e.code == 'Slash') {
            e.preventDefault();
            state.helpActive = false;
        } else if (e.code == 'ArrowLeft' || e.code == 'Numpad4' || e.code == 'KeyA' || e.code == 'KeyH') {
            e.preventDefault();
            state.helpPageIndex = Math.max(0, state.helpPageIndex - 1);
        } else if (e.code == 'ArrowRight' || e.code == 'Numpad6' || e.code == 'KeyD' || e.code == 'KeyL') {
            e.preventDefault();
            state.helpPageIndex = Math.min(helpPages.length - 1, state.helpPageIndex + 1);
        }
    }

    function onKeyDownMansion(e: KeyboardEvent) {
        if (e.ctrlKey) {
            if (e.code === 'KeyA') {
                e.preventDefault();
                state.seeAll = !state.seeAll;
            } else if (e.code === 'KeyC') {
                e.preventDefault();
                state.player.loot += state.gameMap.collectAllLoot();
                postTurn(state);
            } else if (e.code === 'KeyV') {
                e.preventDefault();
                state.seeGuardSight = !state.seeGuardSight;
            } else if (e.code === 'KeyP') {
                e.preventDefault();
                state.seeGuardPatrols = !state.seeGuardPatrols;
            } else if (e.code === 'KeyR') {
                e.preventDefault();
                restartGame(state);
            } else if (e.code === 'Period') {
                e.preventDefault();
                if (state.level < state.gameMapRoughPlans.length - 1) {
                    ++state.level;
                    resetState(state);
                }
            } else if (e.code === 'KeyG') {
                e.preventDefault();
                resetState(state);
            } else if (e.code === 'Comma') {
                e.preventDefault();
                if (state.level > 0) {
                    --state.level;
                    resetState(state);
                }
            } else if (e.code === 'KeyS') {
                e.preventDefault();
                state.gameMap.markAllSeen();
                postTurn(state);
            }
        } else if (e.code == 'BracketLeft') {
            e.preventDefault();
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (e.code == 'BracketRight') {
            e.preventDefault();
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (e.code == 'ArrowLeft' || e.code == 'Numpad4' || e.code == 'KeyA' || e.code == 'KeyH') {
            e.preventDefault();
            const moveSpeed = (state.leapToggleActive || e.shiftKey) ? 2 : 1;
            tryMovePlayer(state, -1, 0, moveSpeed);
        } else if (e.code == 'ArrowRight' || e.code == 'Numpad6' || e.code == 'KeyD' || e.code == 'KeyL') {
            e.preventDefault();
            const moveSpeed = (state.leapToggleActive || e.shiftKey) ? 2 : 1;
            tryMovePlayer(state, 1, 0, moveSpeed);
        } else if (e.code == 'ArrowDown' || e.code == 'Numpad2' || e.code == 'KeyS' || e.code == 'KeyJ') {
            e.preventDefault();
            const moveSpeed = (state.leapToggleActive || e.shiftKey) ? 2 : 1;
            tryMovePlayer(state, 0, -1, moveSpeed);
        } else if (e.code == 'ArrowUp' || e.code == 'Numpad8' || e.code == 'KeyW' || e.code == 'KeyK') {
            e.preventDefault();
            const moveSpeed = (state.leapToggleActive || e.shiftKey) ? 2 : 1;
            tryMovePlayer(state, 0, 1, moveSpeed);
        } else if (e.code == 'Period' || e.code == 'Numpad5' || e.code == 'KeyZ' || e.code == 'Space') {
            e.preventDefault();
            tryMovePlayer(state, 0, 0, 1);
        } else if (e.code == 'Escape' || e.code == 'Slash') {
            e.preventDefault();
            state.helpActive = true;
        } else if (e.code == 'KeyF' || e.code == 'NumpadAdd') {
            e.preventDefault();
            state.leapToggleActive = !state.leapToggleActive;
        } else if (e.code == 'Digit9') {
            e.preventDefault();
            state.guardMute = !state.guardMute;
            for(const s in subtitledSounds) {
                subtitledSounds[s].mute = state.guardMute;
            }
        } else if (e.code == 'Digit0') {
            e.preventDefault();
            state.volumeMute = !state.volumeMute;
            Howler.mute(state.volumeMute);
        } else if (e.code == 'Minus') {
            e.preventDefault();
            const vol = Howler.volume();
            Howler.volume(Math.max(vol-0.1,0.1));
        } else if (e.code == 'Equal') {
            e.preventDefault();
            const vol = Howler.volume();
            Howler.volume(Math.max(vol+0.1,1.0));
        }
    }

    function onKeyDownBetweenMansions(e: KeyboardEvent) {
        if (e.code == 'BracketLeft') {
            e.preventDefault();
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (e.code == 'BracketRight') {
            e.preventDefault();
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (e.code == 'KeyR') {
            e.preventDefault();
            restartGame(state);
        } else if (e.code == 'KeyH') {
            e.preventDefault();
            tryHealPlayer(state);
        } else if (e.code == 'KeyN') {
            e.preventDefault();
            advanceToNextLevel(state);
        } else if (e.code == 'Escape' || e.code == 'Slash') {
            e.preventDefault();
            state.helpActive = true;
        }
    }

    function onKeyDownGameOver(e: KeyboardEvent) {
        if (e.code == 'BracketLeft') {
            e.preventDefault();
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (e.code == 'BracketRight') {
            e.preventDefault();
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (e.code == 'KeyR') {
            e.preventDefault();
            restartGame(state);
        } else if (e.code == 'Escape' || e.code == 'Slash') {
            e.preventDefault();
            state.helpActive = true;
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
    vec2.zero(state.player.dpos);
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

    const posPlayerAnimatedPrev = vec2.create();
    player.getPosAnimated(posPlayerAnimatedPrev, state.uAnimateTurn);

    // Can't move if you're dead.

    if (player.health <= 0) {
        return;
    }

    // If just passing time, do that.

    if ((dx === 0 && dy === 0) || distDesired <= 0) {
        preTurn(state);
        advanceTime(state);
        vec2.subtract(player.dpos, posPlayerAnimatedPrev, player.pos);
        return;
    }

    let dist = playerMoveDistAllowed(state, dx, dy, distDesired);
    if (dist <= 0) {
        const posBump = vec2.fromValues(player.pos[0] + dx * (dist + 1), player.pos[1] + dy * (dist + 1));
        const item = state.gameMap.items.find((item) => item.pos[0] === posBump[0] && item.pos[1] === posBump[1]);
        //Bump into torch
        if (item !== undefined && (item.type === ItemType.TorchUnlit || item.type === ItemType.TorchLit)) {
            preTurn(state);
            if(item.type== ItemType.TorchUnlit) state.sounds["ignite"].play(0.08);
            else state.sounds["douse"].play(0.05);
            item.type = (item.type === ItemType.TorchUnlit) ? ItemType.TorchLit : ItemType.TorchUnlit;
            advanceTime(state);
        }
        //Bump into gate
        const typeBump = state.gameMap.cells.at(...posBump).type;
        if(typeBump>=TerrainType.PortcullisNS && typeBump<=TerrainType.PortcullisEW) {
            state.sounds['gate'].play(0.3);    
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

    // Update dpos

    vec2.subtract(player.dpos, posPlayerAnimatedPrev, player.pos);

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

    guardActAll(state.gameMap, state.popups, state.player, state.uAnimateTurn);

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

    state.uAnimateTurn = 1.0;
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
            let tileInfo = renderer.tileSet.terrainTiles[terrainType];
            let tileIndex = tileInfo.textureIndex;
            if (terrainType === TerrainType.PortcullisEW &&
                state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                tileIndex = renderer.tileSet.terrainTiles[TerrainType.PortcullisNS].textureIndex;
            }
            const color = lit ? tileInfo.color : tileInfo.unlitColor;
            renderer.addGlyph(x, y, x+1, y+1, tileIndex, color);

            //Draw border for water
            if(terrainType===TerrainType.GroundWater) {
                const ledge = renderer.tileSet.ledgeTiles;
                let ctr = 0;
                for(let adj of [[0,1],[0,-1],[-1,0],[1,0]]) {
                    const cell = state.gameMap.cells.at(x+adj[0],y+adj[1]);
                    if (cell.type !== TerrainType.GroundWater) {
                        renderer.addGlyph(x, y, x+1, y+1, ledge[ctr].textureIndex, color);
                    }
                    ++ctr;
                }
            }

            const ind = state.gameMap.cells.index(x, y);
            if (!(ind in mappedItems)) {
                continue;
            }

            for (let item of mappedItems[ind]) {
                const alwaysLit = (item.type >= ItemType.DoorNS && item.type <= ItemType.PortcullisEW) || item.type == ItemType.Coin;
                const lit = alwaysLit || cell.lit;

                let itemType = item.type;
                if (terrainType === TerrainType.PortcullisEW &&
                    state.gameMap.guards.find((guard)=>guard.pos[0]==x && guard.pos[1]==y)) {
                    itemType = ItemType.PortcullisNS;
                }

                let tileInfo = renderer.tileSet.itemTiles[itemType];
                const color = lit ? tileInfo.color : tileInfo.unlitColor;

                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo.textureIndex, color);    
            }
        }
    }
}

function renderPlayer(state: State, renderer: Renderer) {
    const player = state.player;
    const posPlayerAnimated = vec2.create();
    player.getPosAnimated(posPlayerAnimated, state.uAnimateTurn);
    const x = posPlayerAnimated[0];
    const y = posPlayerAnimated[1];
    const lit = state.gameMap.cells.at(player.pos[0], player.pos[1]).lit;
    const hidden = player.hidden(state.gameMap);
    // const color =
    //     player.damagedLastTurn ? 0xff0000ff :
    //     player.noisy ? colorPreset.lightCyan :
    //     hidden ? 0xd0101010 :
    //     !lit ? colorPreset.lightBlue :
    //     colorPreset.lightGray;

    const tileInfoIndex =
        player.damagedLastTurn ? 1 :
        player.noisy ? 3 :
        hidden ? 2 :
        !lit ? 4 :
        0;

    const tileInfo = renderer.tileSet.playerTiles[tileInfoIndex];
    const color = lit ? tileInfo.color : tileInfo.unlitColor;

    renderer.addGlyph(x, y, x+1, y+1, tileInfo.textureIndex, color);
}

function renderGuards(state: State, renderer: Renderer) {
    for (const guard of state.gameMap.guards) {
        const cell = state.gameMap.cells.at(guard.pos[0], guard.pos[1]);
        const visible = state.seeAll || cell.seen || guard.speaking;
        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        let posGuardAnimated = vec2.create();
        guard.getPosAnimated(posGuardAnimated, state.uAnimateTurn);

        const lit = cell.lit || guard.speaking || guard.mode !== GuardMode.Patrol;
        const tileIndex = tileIndexOffsetForDir(guard.dir) + (visible ? 0 : 4);
        const tileInfo = renderer.tileSet.npcTiles[tileIndex];
        const color = lit ? tileInfo.color : tileInfo.unlitColor;
        const gate = state.gameMap.items.find((item)=>[ItemType.PortcullisEW, ItemType.PortcullisNS].includes(item.type));
        const offX = (gate!==undefined && gate.pos[0]==guard.pos[0] && gate.pos[1]==guard.pos[1])? 0.25 : 0;
        const x = posGuardAnimated[0] + offX;
        const y = posGuardAnimated[1];
        if (guard.hasTorch) {
            const g0 = x + guard.dir[0]*0.375 + guard.dir[1]*0.375;
            const g1 = y;
            const torchTileInfo = renderer.tileSet.itemTiles[ItemType.TorchCarry];
            if(guard.dir[1]>0) {
                renderer.addGlyph(g0, g1, g0 + 1, g1 + 1, torchTileInfo.textureIndex, torchTileInfo.color);
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo.textureIndex, color);
            } else {
                renderer.addGlyph(x, y, x + 1, y + 1, tileInfo.textureIndex, color);    
                renderer.addGlyph(g0, g1, g0 + 1, g1 + 1, torchTileInfo.textureIndex, torchTileInfo.color);
            }
        } else {
            renderer.addGlyph(x, y, x + 1, y + 1, tileInfo.textureIndex, color);
        }
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

        let posGuardAnimated = vec2.create();
        guard.getPosAnimated(posGuardAnimated, state.uAnimateTurn);

        const x = posGuardAnimated[0];
        const y = posGuardAnimated[1] + 0.625;

        const textureIndex = renderer.tileSet.guardStateIconTextureIndex[guardState];

        renderer.addGlyph(x, y, x+1, y+1, textureIndex);
    }

    // Render an icon over the player if the player is being noisy

    if (state.player.noisy) {
        const x = state.player.pos[0];
        const y = state.player.pos[1] - 0.5;
        renderer.addGlyph(x, y, x+1, y+1, 104, 0x80ffffff);
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
                renderer.addGlyph(x, y, x+1, y+1, 3, 0xffffffff);
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
            renderer.addGlyph(pos[0], pos[1], pos[0]+1, pos[1]+1, 92, 0xff80ff80);
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

function initState(sounds:Howls, subtitledSounds: SubtitledHowls, activeSoundPool:ActiveHowlPool): State {
    const initialLevel = 0;
    const gameMapRoughPlans = createGameMapRoughPlans(numGameMaps, totalGameLoot);
    const gameMap = createGameMap(initialLevel, gameMapRoughPlans[initialLevel]);

    return {
        tLast: undefined,
        leapToggleActive: false,
        uAnimateTurn: 0,
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
        popups: new Popups,
    };
}

function restartGame(state: State) {
    state.gameMapRoughPlans = createGameMapRoughPlans(numGameMaps, totalGameLoot);
    state.level = 0;

    const gameMap = createGameMap(state.level, state.gameMapRoughPlans[state.level]);

    state.uAnimateTurn = 0;
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

    state.uAnimateTurn = 0;
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

    if (dt > 0) {
        updateState(state, screenSize, dt);
    }

    renderScene(renderer, screenSize, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}

function updateState(state: State, screenSize: vec2, dt: number) {
    state.uAnimateTurn = Math.max(0, state.uAnimateTurn - 4.0 * dt);
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
    renderer.addGlyph(-2, -1, maxLineLength + 2, lines.length + 1, 219, colorBackground);

    for (let i = 0; i < lines.length; ++i) {
        const row = lines.length - (1 + i);
        for (let j = 0; j < lines[i].length; ++j) {
            const col = j;
            const ch = lines[i];
            if (ch === ' ') {
                continue;
            }
            const glyphIndex = lines[i].charCodeAt(j);
            renderer.addGlyph(col, row, col + 1, row + 1, glyphIndex, colorText);
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
            renderer.addGlyph(x, y + 0.125, x+1, y+1.125, glyph, colorPreset.white);
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
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, 219, barBackgroundColor);

    const messageX = Math.floor((statusBarTileSizeX - message.length) / 2 + 0.5);
    putString(renderer, messageX, message, colorPreset.lightGray);

    renderer.flush();
}

function putString(renderer: Renderer, x: number, s: string, color: number) {
    for (let i = 0; i < s.length; ++i) {
        const glyphIndex = s.charCodeAt(i);
        renderer.addGlyph(x + i, 0, x + i + 1, 1, glyphIndex, color);
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
    renderer.addGlyph(0, 0, statusBarTileSizeX, 1, 219, barBackgroundColor);

    const healthX = 1;

    putString(renderer, healthX, "Health", colorPreset.darkRed);

    for (let i = 0; i < maxPlayerHealth; ++i) {
        const color = (i < state.player.health) ? colorPreset.darkRed : colorPreset.black;
        const glyphHeart = 3;
        renderer.addGlyph(i + healthX + 7, 0, i + healthX + 8, 1, glyphHeart, color);
    }

    // Underwater indicator

    const playerUnderwater = state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater && state.player.turnsRemainingUnderwater > 0;
    if (playerUnderwater) {
        const breathX = healthX + maxPlayerHealth + 88;

        putString(renderer, breathX, "Air", colorPreset.lightCyan);

        for (let i = 0; i < state.player.turnsRemainingUnderwater; ++i) {
            const glyphBubble = 9;
            renderer.addGlyph(breathX + 4 + i, 0, breathX + 5 + i, 1, glyphBubble, colorPreset.lightCyan);
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
    renderer.addGlyph(-2, -1, maxLineLength + 2, lines.length + 1, 219, colorBackground);

    for (let i = 0; i < lines.length; ++i) {
        const row = lines.length - (1 + i);
        for (let j = 0; j < lines[i].length; ++j) {
            const col = j;
            const ch = lines[i];
            if (ch === ' ') {
                continue;
            }
            const glyphIndex = lines[i].charCodeAt(j);
            renderer.addGlyph(col, row, col + 1, row + 1, glyphIndex, colorText);
        }
    }

    renderer.flush();
}
