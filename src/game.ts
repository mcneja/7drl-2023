import { vec2, mat4 } from './my-matrix';
import { createGameMap } from './create-map';
import { GameMap, Player, TerrainType } from './game-map';
import { GuardMode, guardActAll } from './guard';
import { Renderer, createRenderer } from './render';
import * as colorPreset from './color-preset';

var fontImageRequire = require('./font.png');
var tilesImageRequire = require('./tiles.png');

window.onload = loadResourcesThenRun;

type Camera = {
    position: vec2;
    velocity: vec2;
}

type State = {
    tLast: number | undefined;
    shiftModifierActive: boolean;
    shiftUpLastTimeStamp: number;
    player: Player;
    finishedLevel: boolean;
    seeAll : boolean;
    camera: Camera;
    level: number;
    gameMap: GameMap;
}

function loadResourcesThenRun() {
    Promise.all([
        loadImage(fontImageRequire),
        loadImage(tilesImageRequire),
    ]).then(main);
}

function main(images: Array<HTMLImageElement>) {

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2", { alpha: false, depth: false }) as WebGL2RenderingContext;

    if (gl == null) {
        alert("Unable to initialize WebGL2. Your browser or machine may not support it.");
        return;
    }

    const renderer = createRenderer(gl, images);
    const state = initState();

    document.body.addEventListener('keydown', onKeyDown);
    document.body.addEventListener('keyup', onKeyUp);

    function onKeyDown(e: KeyboardEvent) {
        if (e.code == 'KeyF' || e.code == 'NumpadAdd') {
            state.shiftModifierActive = true;
            return;
        }

        if (e.code == 'KeyR') {
            e.preventDefault();
            resetState(state);
        } else if (e.code == 'KeyA') {
            e.preventDefault();
            if (e.ctrlKey) {
                state.seeAll = !state.seeAll;
            } else {
                const speed = (state.shiftModifierActive || e.shiftKey || (e.timeStamp - state.shiftUpLastTimeStamp) < 1.0) ? 2 : 1;
                tryMovePlayer(state, -speed, 0);
            }
        } else {
            const speed = (state.shiftModifierActive || e.shiftKey || (e.timeStamp - state.shiftUpLastTimeStamp) < 1.0) ? 2 : 1;
            if (e.code == 'ArrowLeft' || e.code == 'Numpad4' || e.code == 'KeyA' || e.code == 'KeyH') {
                e.preventDefault();
                tryMovePlayer(state, -speed, 0);
            } else if (e.code == 'ArrowRight' || e.code == 'Numpad6' || e.code == 'KeyD' || e.code == 'KeyL') {
                e.preventDefault();
                tryMovePlayer(state, speed, 0);
            } else if (e.code == 'ArrowDown' || e.code == 'Numpad2' || e.code == 'KeyS' || e.code == 'KeyJ') {
                e.preventDefault();
                tryMovePlayer(state, 0, -speed);
            } else if (e.code == 'ArrowUp' || e.code == 'Numpad8' || e.code == 'KeyW' || e.code == 'KeyK') {
                e.preventDefault();
                tryMovePlayer(state, 0, speed);
            } else if (e.code == 'Period' || e.code == 'Numpad5') {
                e.preventDefault();
                tryMovePlayer(state, 0, 0);
            }
        }

        state.shiftModifierActive = false;
    }

    function onKeyUp(e: KeyboardEvent) {
        if (e.code == 'ShiftLeft' || e.code == 'ShiftRight') {
            state.shiftUpLastTimeStamp = e.timeStamp;
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
    state.gameMap = createGameMap(state.level);
    state.finishedLevel = false;

    state.player.pos = state.gameMap.playerStartPos;
    state.player.dir = vec2.fromValues(0, -1);
    state.player.gold = 0;
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
    state.player.turnsRemainingUnderwater = 0;

    state.camera = createCamera(state.gameMap.playerStartPos);

    updateMapVisibility(state.gameMap, state.player.pos);
}

function tryMovePlayer(state: State, dx: number, dy: number) {

    const player = state.player;

    // Can't move if you're dead.

    if (player.health == 0) {
        return;
    }

    // Are we trying to exit the level?

    const posNew = vec2.fromValues(player.pos[0] + dx, player.pos[1] + dy);
    if (posNew[0] < 0 || posNew[1] < 0 || posNew[0] >= state.gameMap.cells.sizeX || posNew[1] >= state.gameMap.cells.sizeY) {
        if (state.gameMap.allSeen() && state.gameMap.allLootCollected()) {
            advanceToNextLevel(state);
        }
        return;
    }

    // Is something in the way?

    if (blocked(state.gameMap, player.pos, posNew)) {
        return;
    }

    preTurn(state);

    player.pos = posNew;
    player.gold += state.gameMap.collectLootAt(player.pos[0], player.pos[1]);

    // Generate movement noises.

    let cellType = state.gameMap.cells.at(player.pos[0], player.pos[1]).type;

    if (((dx != 0 || dy != 0) && cellType == TerrainType.GroundWoodCreaky)) {
        makeNoise(state.gameMap, player, 17 /*, state.gameMap.popups, "\u{ab}creak\u{bb}" */);
    } else if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        makeNoise(state.gameMap, player, 17 /*, state.gameMap.popups, "\u{ab}creak\u{bb}" */);
    }

    advanceTime(state);
}

function makeNoise(map: GameMap, player: Player, radius: number /*, popups: &mut Popups, noise: &'static str */) {
    player.noisy = true;
    /* TODO
    popups.noise(player.pos, noise);
    */

    for (const guard of map.guardsInEarshot(player.pos, radius)) {
        guard.heardThief = true;
    }
}

function preTurn(state: State) {
    /* TODO
    state.show_msgs = true;
    state.popups.clear();
    */
    state.player.noisy = false;
    state.player.damagedLastTurn = false;
}

function advanceTime(state: State) {
    if (state.gameMap.cells.at(state.player.pos[0], state.player.pos[1]).type == TerrainType.GroundWater) {
        if (state.player.turnsRemainingUnderwater > 0) {
            --state.player.turnsRemainingUnderwater;
        }
    } else {
        state.player.turnsRemainingUnderwater = 7;
    }

    guardActAll(/* state.popups, state.lines, */ state.gameMap, state.player);

    updateMapVisibility(state.gameMap, state.player.pos);

    if (state.gameMap.allSeen() && state.gameMap.allLootCollected()) {
        state.finishedLevel = true;
    }
}

const cardinalDirections: Array<vec2> = [
    vec2.fromValues(-1, 0),
    vec2.fromValues(1, 0),
    vec2.fromValues(0, -1),
    vec2.fromValues(0, 1),
];

function updateMapVisibility(map: GameMap, pos_viewer: vec2) {
    map.recomputeVisibility(pos_viewer);

    for (const dir of cardinalDirections) {
        if (map.playerCanSeeInDirection(pos_viewer, dir)) {
            const pos = vec2.create();
            vec2.add(pos, pos_viewer, dir);
            map.recomputeVisibility(pos);
        }
    }
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

    if (map.guards.find((guard) => guard.pos[0] == posNew[0] && guard.pos[1] == posNew[1]) !== undefined) {
        return true;
    }

    return false;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

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
]

const unlitColor: number = colorPreset.lightBlue;

type AddGlyph = (x0: number, y0: number, x1: number, y1: number, glyphIndex: number, color: number) => void;

function renderWorld(state: State, addGlyph: AddGlyph) {
    for (let x = 0; x < state.gameMap.cells.sizeX; ++x) {
        for (let y = 0; y < state.gameMap.cells.sizeY; ++y) {
            const cell = state.gameMap.cells.at(x, y);
            if (!cell.seen && !state.seeAll) {
                continue;
            }
            const terrainType = cell.type;
            const tileIndex = tileIndexForTerrainType[terrainType];
            const color = cell.lit ? colorForTerrainType[terrainType] : unlitColor;
            addGlyph(x, y, x+1, y+1, tileIndex, color);
        }
    }

    for (const item of state.gameMap.items) {
        const cell = state.gameMap.cells.at(item.pos[0], item.pos[1]);
        if (!cell.seen && !state.seeAll) {
            continue;
        }
        const tileIndex = tileIndexForItemType[item.type];
        const color = cell.lit ? colorForItemType[item.type] : unlitColor;
        addGlyph(item.pos[0], item.pos[1], item.pos[0] + 1, item.pos[1] + 1, tileIndex, color);
    }
}

function renderPlayer(state: State, addGlyph: AddGlyph) {
    const player = state.player;
    const x = player.pos[0];
    const y = player.pos[1];
    const lit = state.gameMap.cells.at(x, y).lit;
    const hidden = player.hidden(state.gameMap);
    const color =
        player.damagedLastTurn ? 0xff0000ff :
        player.noisy ? colorPreset.lightCyan :
        hidden ? 0xd0101010 :
        !lit ? colorPreset.lightBlue :
        colorPreset.lightGray;

    addGlyph(x, y, x+1, y+1, 32, color);
}

function renderGuards(state: State, addGlyph: AddGlyph) {
    for (const guard of state.gameMap.guards) {
        const tileIndex = 33 + tileIndexOffsetForDir(guard.dir);
        const cell = state.gameMap.cells.at(guard.pos[0], guard.pos[1]);

        const visible = state.seeAll || cell.seen || guard.speaking;

        if (!visible && vec2.squaredDistance(state.player.pos, guard.pos) > 36) {
            continue;
        }

        const color =
            !visible ? colorPreset.darkGray :
            (guard.mode == GuardMode.Patrol && !guard.speaking && !cell.lit) ? unlitColor :
            colorPreset.lightMagenta;

        addGlyph(guard.pos[0], guard.pos[1], guard.pos[0] + 1, guard.pos[1] + 1, tileIndex, color);
    }
}

function renderGuardOverheadIcons(state: State, addGlyph: AddGlyph) {
    for (const guard of state.gameMap.guards) {
        const overheadIcon = guard.overheadIcon(state.gameMap, state.player, state.seeAll);
        if (overheadIcon == undefined) {
            continue;
        }

        const x = guard.pos[0];
        const y = guard.pos[1] + 0.625;

        addGlyph(x, y, x+1, y+1, overheadIcon, colorPreset.lightYellow);
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
    };

    vec2.copy(camera.position, posPlayer);
    vec2.zero(camera.velocity);

    return camera;
}

function initState(): State {
    const initialLevel = 0;
    const gameMap = createGameMap(initialLevel);

    return {
        tLast: undefined,
        shiftModifierActive: false,
        shiftUpLastTimeStamp: -Infinity,
        player: new Player(gameMap.playerStartPos),
        finishedLevel: false,
        seeAll : false,
        camera: createCamera(gameMap.playerStartPos),
        level: initialLevel,
        gameMap: gameMap,
    };
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level);

    state.finishedLevel = false;
    state.player = new Player(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.gameMap = gameMap;
}

function updateAndRender(now: number, renderer: Renderer, state: State) {
    const t = now / 1000;
    const dt = (state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.tLast = t;

    if (dt > 0) {
        updateState(state, dt);
    }

    renderScene(renderer, state);

    requestAnimationFrame(now => updateAndRender(now, renderer, state));
}

function updateState(state: State, dt: number) {
    updateCamera(state, dt);
}

function updateCamera(state: State, dt: number) {

    // Update player follow

    const posError = vec2.create();
    vec2.subtract(posError, state.player.pos, state.camera.position);

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

function renderScene(renderer: Renderer, state: State) {
    const screenSize = vec2.create();
    renderer.beginFrame(screenSize);

    const matScreenFromWorld = mat4.create();
    setupViewMatrix(state, screenSize, matScreenFromWorld);

    renderer.renderGlyphs.start(matScreenFromWorld, 1);
    renderWorld(state, renderer.renderGlyphs.addGlyph);
    renderPlayer(state, renderer.renderGlyphs.addGlyph);
    renderGuards(state, renderer.renderGlyphs.addGlyph);
    renderGuardOverheadIcons(state, renderer.renderGlyphs.addGlyph);

    renderer.renderGlyphs.flush();
}

function setupViewMatrix(state: State, screenSize: vec2, matScreenFromWorld: mat4) {
    const cxGame = state.camera.position[0];
    const cyGame = state.camera.position[1];
    const rGame = 18;
    let rxGame: number, ryGame: number;
    if (screenSize[0] < screenSize[1]) {
        rxGame = rGame;
        ryGame = rGame * screenSize[1] / screenSize[0];
    } else {
        ryGame = rGame;
        rxGame = rGame * screenSize[0] / screenSize[1];
    }

    mat4.ortho(matScreenFromWorld, cxGame - rxGame, cxGame + rxGame, cyGame - ryGame, cyGame + ryGame, 1, -1);
}

function renderTextLines(renderer: Renderer, screenSize: vec2, lines: Array<string>) {
    let maxLineLength = 0;
    for (const line of lines) {
        maxLineLength = Math.max(maxLineLength, line.length);
    }

    const minCharsX = 40;
    const minCharsY = 22;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const linesPixelSizeX = maxLineLength * pixelsPerCharX;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = Math.floor((screenSize[0] - linesPixelSizeX) / -2) / pixelsPerCharX;
    const offsetY = (lines.length + 2) - numCharsY;

    const matScreenFromTextArea = mat4.create();
    mat4.ortho(
        matScreenFromTextArea,
        offsetX,
        offsetX + numCharsX,
        offsetY,
        offsetY + numCharsY,
        1,
        -1);
    renderer.renderGlyphs.start(matScreenFromTextArea, 0);

    const colorText = 0xffeeeeee;
    const colorBackground = 0xe0555555;

    // Draw a stretched box to make a darkened background for the text.
    renderer.renderGlyphs.addGlyph(
        -1, -1, maxLineLength + 1, lines.length + 1,
        219,
        colorBackground
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
            renderer.renderGlyphs.addGlyph(
                col, row, col + 1, row + 1,
                glyphIndex,
                colorText
            );
        }
    }

    renderer.renderGlyphs.flush();
}
