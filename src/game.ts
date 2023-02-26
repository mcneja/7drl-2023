import { vec2, mat4 } from './my-matrix';
import { BooleanGrid, GameMap, TerrainType, createGameMap } from './create-map';
import { CreateColoredTrianglesRenderer, RenderColoredTriangles, Renderer, createRenderer } from './render';

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
    renderColoredTriangles: RenderColoredTriangles;
    tLast: number | undefined;
    paused: boolean;
    shiftModifierActive: boolean;
    shiftUpLastTimeStamp: number;
    player: Player;
    camera: Camera;
    solid: BooleanGrid;
}

function loadResourcesThenRun() {
    Promise.all([
        loadImage(tilesImageRequire),
        loadImage(fontImageRequire),
    ]).then(main);
}

function main([tileImage, fontImage]: Array<HTMLImageElement>) {

    const canvas = document.querySelector("#canvas") as HTMLCanvasElement;
    const gl = canvas.getContext("webgl2", { alpha: false, depth: false }) as WebGL2RenderingContext;

    if (gl == null) {
        alert("Unable to initialize WebGL2. Your browser or machine may not support it.");
        return;
    }

    const renderer = createRenderer(gl, fontImage);
    const state = initState(renderer.createColoredTrianglesRenderer);

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
            resetState(state, renderer.createColoredTrianglesRenderer);
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

function initState(createColoredTrianglesRenderer: CreateColoredTrianglesRenderer): State {
    const level = 0;
    const gameMap = createGameMap(level);
    const solid = solidMapFromGameMap(gameMap);
    const vertexData = vertexDataFromGameMap(gameMap);

    return {
        renderColoredTriangles: createColoredTrianglesRenderer(vertexData),
        tLast: undefined,
        paused: true,
        shiftModifierActive: false,
        shiftUpLastTimeStamp: -Infinity,
        player: createPlayer(gameMap.playerStartPos),
        camera: createCamera(gameMap.playerStartPos),
        solid: solid,
    };
}

function resetState(
    state: State,
    createColoredTrianglesRenderer: CreateColoredTrianglesRenderer) {

    const level = 0;
    const gameMap = createGameMap(level);
    const solid = solidMapFromGameMap(gameMap);
    const vertexData = vertexDataFromGameMap(gameMap);

    state.renderColoredTriangles = createColoredTrianglesRenderer(vertexData);
    state.player = createPlayer(gameMap.playerStartPos);
    state.camera = createCamera(gameMap.playerStartPos);
    state.solid = solid;
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

    state.renderColoredTriangles(matScreenFromWorld);

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
    renderer.renderGlyphs.start(matScreenFromTextArea);

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
    const solid = new BooleanGrid(gameMap.terrainTypeGrid.sizeX, gameMap.terrainTypeGrid.sizeY, false);

    for (let x = 0; x < gameMap.terrainTypeGrid.sizeX; ++x) {
        for (let y = 0; y < gameMap.terrainTypeGrid.sizeY; ++y) {
            const terrainType = gameMap.terrainTypeGrid.get(x, y);
            const isSolid = terrainType == TerrainType.Wall;
            solid.set(x, y, isSolid);
        }
    }

    return solid;
}

function vertexDataFromGameMap(gameMap: GameMap): ArrayBuffer {
    const grassColor = 0xff104000;
    const woodColor = 0xff004488;
    const marbleColor = 0xff606020;
    const wallColor = 0xffa0a0a0;
    const waterColor = 0xff400000;

    const squares = [];
    for (let y = 0; y < gameMap.terrainTypeGrid.sizeY; ++y) {
        for (let x = 0; x < gameMap.terrainTypeGrid.sizeX; ++x) {
            const type = gameMap.terrainTypeGrid.get(x, y);
            let color;
            switch (type) {
            case TerrainType.GroundGrass:
                color = grassColor;
                break;
            case TerrainType.GroundWater:
                color = waterColor;
                break;
            case TerrainType.GroundMarble:
                color = marbleColor;
                break;
            case TerrainType.GroundWood:
                color = woodColor;
                break;
            case TerrainType.Wall:
                color = wallColor;
                break;
            }
            squares.push({x: x, y: y, color: color});
        }
    }

    // Convert squares to triangles

    const numVertices = squares.length * 6;
    const bytesPerVertex = 12;

    const vertexData = new ArrayBuffer(numVertices * bytesPerVertex);
    const vertexDataAsFloat32 = new Float32Array(vertexData);
    const vertexDataAsUint32 = new Uint32Array(vertexData);

    for (let i = 0; i < squares.length; ++i) {
        const j = 18 * i;
        const color = squares[i].color;
        const x0 = squares[i].x;
        const y0 = squares[i].y;
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        vertexDataAsFloat32[j+0] = x0;
        vertexDataAsFloat32[j+1] = y0;
        vertexDataAsUint32[j+2] = color;

        vertexDataAsFloat32[j+3] = x1;
        vertexDataAsFloat32[j+4] = y0;
        vertexDataAsUint32[j+5] = color;

        vertexDataAsFloat32[j+6] = x0;
        vertexDataAsFloat32[j+7] = y1;
        vertexDataAsUint32[j+8] = color;

        vertexDataAsFloat32[j+9] = x0;
        vertexDataAsFloat32[j+10] = y1;
        vertexDataAsUint32[j+11] = color;

        vertexDataAsFloat32[j+12] = x1;
        vertexDataAsFloat32[j+13] = y0;
        vertexDataAsUint32[j+14] = color;

        vertexDataAsFloat32[j+15] = x1;
        vertexDataAsFloat32[j+16] = y1;
        vertexDataAsUint32[j+17] = color;
    }

    return vertexData;
}
