import { vec2, mat4 } from './my-matrix';
import { createGameMap } from './create-map';
import { BooleanGrid, GameMap, TerrainType } from './game-map';
import { Renderer, createRenderer } from './render';

var fontImageRequire = require('./font.png');
var tilesImageRequire = require('./tiles.png');

window.onload = loadResourcesThenRun;

const playerRadius = 0.5;

type Player = {
    position: vec2;
    radius: number;
};

type Camera = {
    position: vec2;
    velocity: vec2;
}

type State = {
    tLast: number | undefined;
    paused: boolean;
    shiftModifierActive: boolean;
    shiftUpLastTimeStamp: number;
    player: Player;
    camera: Camera;
    level: number;
    solid: BooleanGrid;
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

        if (e.code == 'Escape' || e.code == 'KeyP') {
            e.preventDefault();
            state.paused = !state.paused;
            if (!state.paused) {
                state.tLast = undefined;
                requestUpdateAndRender();
            }
        }
        else if (e.code == 'KeyR') {
            e.preventDefault();
            resetState(state);
            if (state.paused) {
                requestUpdateAndRender();
            }
        } else if (!state.paused) {
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

function tryMovePlayer(state: State, dx: number, dy: number) {
    const x = state.player.position[0] + dx;
    const y = state.player.position[1] + dy;
    if (x < 0 || y < 0 || x >= state.solid.sizeX || y >= state.solid.sizeY) {
        return;
    }
    if (state.solid.get(x, y)) {
        return;
    }
    state.player.position[0] = x;
    state.player.position[1] = y;
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
    0xffa8a8a8, // TerrainType.GroundNormal,
    0xff00a800, // TerrainType.GroundGrass,
    0xffa80000, // TerrainType.GroundWater,
    0xffa8a800, // TerrainType.GroundMarble,
    0xff0054a8, // TerrainType.GroundWood,
    0xffa8a8a8, // TerrainType.Wall0000,
    0xffa8a8a8, // TerrainType.Wall0001,
    0xffa8a8a8, // TerrainType.Wall0010,
    0xffa8a8a8, // TerrainType.Wall0011,
    0xffa8a8a8, // TerrainType.Wall0100,
    0xffa8a8a8, // TerrainType.Wall0101,
    0xffa8a8a8, // TerrainType.Wall0110,
    0xffa8a8a8, // TerrainType.Wall0111,
    0xffa8a8a8, // TerrainType.Wall1000,
    0xffa8a8a8, // TerrainType.Wall1001,
    0xffa8a8a8, // TerrainType.Wall1010,
    0xffa8a8a8, // TerrainType.Wall1011,
    0xffa8a8a8, // TerrainType.Wall1100,
    0xffa8a8a8, // TerrainType.Wall1101,
    0xffa8a8a8, // TerrainType.Wall1110,
    0xffa8a8a8, // TerrainType.Wall1111,
    0xffa8a8a8, // TerrainType.OneWayWindowE,
    0xffa8a8a8, // TerrainType.OneWayWindowW,
    0xffa8a8a8, // TerrainType.OneWayWindowN,
    0xffa8a8a8, // TerrainType.OneWayWindowS,
    0xffa8a8a8, // TerrainType.PortcullisNS,
    0xffa8a8a8, // TerrainType.PortcullisEW,
    0xffa8a8a8, // TerrainType.DoorNS,
    0xffa8a8a8, // TerrainType.DoorEW,
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
    0xff0054a8, // ItemType.Chair,
    0xff0054a8, // ItemType.Table,
    0xff00a800, // ItemType.Bush,
    0xff54fefe, // ItemType.Coin,
    0xff0054a8, // ItemType.DoorNS,
    0xff0054a8, // ItemType.DoorEW,
    0xffa8a8a8, // ItemType.PortcullisNS,
    0xffa8a8a8, // ItemType.PortcullisEW,
]

const unlitColor: number = 0xfffe5454;

function renderWorld(state: State, renderer: Renderer, matScreenFromWorld: mat4) {
    renderer.renderGlyphs.start(matScreenFromWorld, 1);

    for (let x = 0; x < state.gameMap.cells.sizeX; ++x) {
        for (let y = 0; y < state.gameMap.cells.sizeY; ++y) {
            const cell = state.gameMap.cells.at(x, y);
            const terrainType = cell.type;
            const tileIndex = tileIndexForTerrainType[terrainType];
            const color = cell.lit ? colorForTerrainType[terrainType] : unlitColor;
            renderer.renderGlyphs.addGlyph(x, y, x+1, y+1, tileIndex, color);
        }
    }

    for (const item of state.gameMap.items) {
        const cell = state.gameMap.cells.at(item.pos[0], item.pos[1]);
        /*
        if (!cell.seen && !state.see_all) {
            continue;
        }
        */
        const tileIndex = tileIndexForItemType[item.type];
        const color = cell.lit ? colorForItemType[item.type] : unlitColor;
        renderer.renderGlyphs.addGlyph(item.pos[0], item.pos[1], item.pos[0] + 1, item.pos[1] + 1, tileIndex, color);
    }

    renderer.renderGlyphs.flush();
}

function renderPlayer(state: State, renderer: Renderer, matScreenFromWorld: mat4) {
    const pos = vec2.fromValues(0.5, 0.5);
    vec2.add(pos, pos, state.player.position);
    const discs = [{
        position: pos,
        radius: state.player.radius,
        discColor: 0xff000000,
        glyphColor: 0xff00ffff,
        glyphIndex: 1,
    }];

    renderer.renderDiscs(matScreenFromWorld, discs);
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

function createPlayer(posStart: vec2): Player {
    const player = {
        position: vec2.create(),
        radius: playerRadius,
    };

    vec2.copy(player.position, posStart);

    return player;
}

function initState(): State {
    const level = 3;
    const gameMap = createGameMap(level);
    const solid = solidMapFromGameMap(gameMap);

    return {
        tLast: undefined,
        paused: true,
        shiftModifierActive: false,
        shiftUpLastTimeStamp: -Infinity,
        player: createPlayer(gameMap.playerStartPos),
        camera: createCamera(gameMap.playerStartPos),
        level: level,
        solid: solid,
        gameMap: gameMap,
    };
}

function resetState(state: State) {
    const gameMap = createGameMap(state.level);
    const solid = solidMapFromGameMap(gameMap);

    state.player = createPlayer(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.solid = solid;
    state.gameMap = gameMap;
}

function updateAndRender(now: number, renderer: Renderer, state: State) {
    const t = now / 1000;
    const dt = (state.paused || state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.tLast = t;

    if (dt > 0) {
        updateState(state, dt);
    }

    renderScene(renderer, state);

    if (!state.paused) {
        requestAnimationFrame(now => updateAndRender(now, renderer, state));
    }
}

function updateState(state: State, dt: number) {
    updateCamera(state, dt);
}

function updateCamera(state: State, dt: number) {

    // Update player follow

    const posError = vec2.create();
    vec2.subtract(posError, state.player.position, state.camera.position);

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

    renderWorld(state, renderer, matScreenFromWorld);
    renderPlayer(state, renderer, matScreenFromWorld);

    // Text

    if (state.paused) {
        renderTextLines(renderer, screenSize, [
            'Paused: Esc or P to unpause',
        ]);
    }
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

function solidMapFromGameMap(gameMap: GameMap): BooleanGrid {
    const solid = new BooleanGrid(gameMap.cells.sizeX, gameMap.cells.sizeY, false);

    for (let x = 0; x < gameMap.cells.sizeX; ++x) {
        for (let y = 0; y < gameMap.cells.sizeY; ++y) {
            const terrainType = gameMap.cells.at(x, y).type;
            const isSolid = terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.Wall1111;
            solid.set(x, y, isSolid);
        }
    }

    return solid;
}
