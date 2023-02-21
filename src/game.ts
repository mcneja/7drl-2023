import { vec2, mat4 } from './my-matrix';

var fontImageRequire = require('./font.png');
var tilesImageRequire = require('./tiles.png');

window.onload = loadResourcesThenRun;

enum TerrainType {
    Solid,
    Wall,
    Hall,
    Room,
}

const playerRadius = 0.5;

const numCellsX = 4;
const numCellsY = 4;
const corridorWidth = 3;

class BooleanGrid {
    sizeX: number;
    sizeY: number;
    values: Uint8Array;

    constructor(sizeX: number, sizeY: number, initialValue: boolean) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Uint8Array(sizeX * sizeY);
        this.fill(initialValue);
    }

    fill(value: boolean) {
        this.values.fill(value ? 1 : 0);
    }

    get(x: number, y: number): boolean {
        return this.values[this.sizeX * y + x] !== 0;
    }

    set(x: number, y: number, value: boolean) {
        this.values[this.sizeX * y + x] = value ? 1 : 0;
    }
}

class TerrainTypeGrid {
    sizeX: number;
    sizeY: number;
    values: Uint8Array;

    constructor(sizeX: number, sizeY: number, initialValue: TerrainType) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Uint8Array(sizeX * sizeY);
        this.values.fill(initialValue);
    }

    fill(value: TerrainType) {
        this.values.fill(value);
    }

    get(x: number, y: number): TerrainType {
        return this.values[this.sizeX * y + x];
    }

    set(x: number, y: number, value: TerrainType) {
        this.values[this.sizeX * y + x] = value;
    }
}

type Rect = {
    minX: number;
    minY: number;
    sizeX: number;
    sizeY: number;
}

type Player = {
    position: vec2;
    velocity: vec2;
    radius: number;
};

type Camera = {
    position: vec2;
    velocity: vec2;
}

type Disc = {
    position: vec2;
    velocity: vec2;
    radius: number;
}

type GlyphDisc = {
    position: vec2;
    radius: number;
    discColor: number;
    glyphIndex: number;
    glyphColor: number;
}

type Level = {
    solid: BooleanGrid;
    vertexData: ArrayBuffer;
    playerStartPos: vec2;
    startRoom: Rect;
}

type RenderGlyphs = {
    start: (matScreenFromWorld: mat4) => void;
    addGlyph: (x0: number, y0: number, x1: number, y1: number, glyphIndex: number, color: number) => void;
    flush: () => void;
}

type BeginFrame = (screenSize: vec2) => void;
type RenderColoredTriangles = (matScreenFromWorld: mat4) => void;
type RenderDiscs = (matScreenFromWorld: mat4, discs: Array<GlyphDisc>) => void;

type CreateColoredTrianglesRenderer = (vertexData: ArrayBuffer) => RenderColoredTriangles;

type Renderer = {
    beginFrame: BeginFrame;
    renderDiscs: RenderDiscs;
    renderGlyphs: RenderGlyphs;
    createColoredTrianglesRenderer: CreateColoredTrianglesRenderer;
}

type State = {
    renderColoredTriangles: RenderColoredTriangles;
    tLast: number | undefined;
    paused: boolean;
    showMap: boolean;
    mapZoom: number;
    mapZoomVelocity: number;
    player: Player;
    camera: Camera;
    level: Level;
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

    canvas.onmousedown = () => {
        if (state.paused) {
            canvas.requestPointerLock();
        }
    };

    document.body.addEventListener('keydown', e => {
        if (e.code == 'KeyR') {
            e.preventDefault();
            resetState(state, renderer.createColoredTrianglesRenderer);
            if (state.paused) {
                requestUpdateAndRender();
            }
        } else if (e.code == 'KeyM') {
            e.preventDefault();
            state.showMap = !state.showMap;
            if (state.paused) {
                state.mapZoom = state.showMap ? 0 : 1;
                state.mapZoomVelocity = 0;
                requestUpdateAndRender();
            }
        }
    });

    function requestUpdateAndRender() {
        requestAnimationFrame(now => updateAndRender(now, renderer, state));
    }

    function onLockChanged() {
        const mouseCaptured = document.pointerLockElement === canvas;
        if (mouseCaptured) {
            document.addEventListener("mousemove", onMouseMoved, false);
            document.addEventListener("mousedown", onMouseDown, false);
            if (state.paused) {
                state.paused = false;
                state.tLast = undefined;
                requestUpdateAndRender();
            }
        } else {
            document.removeEventListener("mousemove", onMouseMoved, false);
            document.removeEventListener("mousedown", onMouseDown, false);
            state.paused = true;
        }
    }

    function onMouseMoved(e: MouseEvent) {
        updatePosition(state, e);
    }

    function onMouseDown(e: MouseEvent) {
        if (state.paused) {
            return;
        }
    }

    function onWindowResized() {
        requestUpdateAndRender();
    }

    document.addEventListener('pointerlockchange', onLockChanged, false);
    document.addEventListener('mozpointerlockchange', onLockChanged, false);

    window.addEventListener('resize', onWindowResized);

    requestUpdateAndRender();
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function updatePosition(state: State, e: MouseEvent) {
    const movement = vec2.fromValues(e.movementX, -e.movementY);
    const scale = 0.05;
    vec2.scaleAndAdd(state.player.velocity, state.player.velocity, movement, scale);
}

function renderPlayer(state: State, renderer: Renderer, matScreenFromWorld: mat4) {
    const discs = [{
        position: state.player.position,
        radius: state.player.radius,
        discColor: 0xff000000,
        glyphColor: 0xff00ffff,
        glyphIndex: 1,
    }];

    renderer.renderDiscs(matScreenFromWorld, discs);
}

function lerp(v0: number, v1: number, u: number): number {
    return v0 + (v1 - v0) * u;
}

function filterInPlace<T>(array: Array<T>, condition: (val: T, i: number, array: Array<T>) => boolean) {
    let i = 0, j = 0;

    while (i < array.length) {
        const val = array[i];
        if (condition(val, i, array)) {
            if (i != j) {
                array[j] = val;
            }
            ++j;
        }
        ++i;
    };

    array.length = j;
    return array;
}

function createRenderer(gl: WebGL2RenderingContext, fontImage: HTMLImageElement): Renderer {
    const glyphTexture = createGlyphTextureFromImage(gl, fontImage);

    const renderer = {
        beginFrame: createBeginFrame(gl),
        renderDiscs: createDiscRenderer(gl, glyphTexture),
        renderGlyphs: createGlyphRenderer(gl, glyphTexture),
        createColoredTrianglesRenderer: createColoredTrianglesRenderer(gl),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    return renderer;
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
        velocity: vec2.create(),
        radius: playerRadius,
    };

    vec2.copy(player.position, posStart);
    vec2.zero(player.velocity);

    return player;
}

function initState(
    createColoredTrianglesRenderer: CreateColoredTrianglesRenderer): State {

    const level = createLevel();

    return {
        renderColoredTriangles: createColoredTrianglesRenderer(level.vertexData),
        tLast: undefined,
        paused: true,
        showMap: false,
        mapZoom: 1,
        mapZoomVelocity: 0,
        player: createPlayer(level.playerStartPos),
        camera: createCamera(level.playerStartPos),
        level: level,
    };
}

function resetState(
    state: State,
    createColoredTrianglesRenderer: CreateColoredTrianglesRenderer) {

    const level = createLevel();

    state.renderColoredTriangles = createColoredTrianglesRenderer(level.vertexData);
    state.player = createPlayer(level.playerStartPos);
    state.camera = createCamera(level.playerStartPos);
    state.level = level;
}

function createBeginFrame(gl: WebGL2RenderingContext): BeginFrame {
    return (screenSize) => {
        const canvas = gl.canvas as HTMLCanvasElement;

        resizeCanvasToDisplaySize(canvas);

        const screenX = canvas.clientWidth;
        const screenY = canvas.clientHeight;
    
        gl.viewport(0, 0, screenX, screenY);
        gl.clear(gl.COLOR_BUFFER_BIT);

        vec2.set(screenSize, screenX, screenY);
    }
}

function createDiscRenderer(gl: WebGL2RenderingContext, glyphTexture: WebGLTexture): RenderDiscs {
    const vsSource = `#version 300 es
        // per-vertex parameters
        in highp vec2 vPosition;
        // per-instance parameters
        in highp vec4 vScaleAndOffset;
        in highp vec4 vDiscColorAndOpacity;
        in highp vec3 vGlyphColor;
        in highp float vGlyphIndex;

        uniform mat4 uMatScreenFromWorld;
        uniform vec4 uScaleAndOffsetGlyphFromDisc;

        out highp vec2 fDiscPosition;
        out highp vec3 fGlyphTexCoord;
        out highp vec4 fDiscColorAndOpacity;
        out highp vec3 fGlyphColor;

        void main() {
            fDiscPosition = vPosition;
            fGlyphTexCoord = vec3(vPosition * uScaleAndOffsetGlyphFromDisc.xy + uScaleAndOffsetGlyphFromDisc.zw, vGlyphIndex);
            fDiscColorAndOpacity = vDiscColorAndOpacity;
            fGlyphColor = vGlyphColor;
            gl_Position = uMatScreenFromWorld * vec4(vPosition * vScaleAndOffset.xy + vScaleAndOffset.zw, 0, 1);
        }
    `;

    const fsSource = `#version 300 es
        in highp vec2 fDiscPosition;
        in highp vec3 fGlyphTexCoord;
        in highp vec4 fDiscColorAndOpacity;
        in highp vec3 fGlyphColor;

        uniform highp sampler2DArray uGlyphOpacity;

        out lowp vec4 fragColor;

        void main() {
            highp float glyphOpacity =
                step(0.0, fGlyphTexCoord.x) *
                step(0.0, 1.0 - fGlyphTexCoord.x) *
                step(0.0, fGlyphTexCoord.y) *
                step(0.0, 1.0 - fGlyphTexCoord.y) *
                texture(uGlyphOpacity, fGlyphTexCoord).x;
            highp float r = length(fDiscPosition);
            highp float aaf = fwidth(r);
            highp float discOpacity = fDiscColorAndOpacity.w * (1.0 - smoothstep(1.0 - aaf, 1.0, r));
            highp vec3 color = mix(fDiscColorAndOpacity.xyz, fGlyphColor, glyphOpacity);
            fragColor = vec4(color, discOpacity);
        }
    `;

    const attribs = {
        vPosition: 0,
        vScaleAndOffset: 1,
        vDiscColorAndOpacity: 2,
        vGlyphColor: 3,
        vGlyphIndex: 4,
    };

    const vecScaleAndOffsetGlyphFromDisc = [1, -0.5, 0.5, 0.45];

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const locMatScreenFromWorld = gl.getUniformLocation(program, 'uMatScreenFromWorld');
    const locScaleAndOffsetGlyphFromDisc = gl.getUniformLocation(program, 'uScaleAndOffsetGlyphFromDisc');
    const locGlyphOpacity = gl.getUniformLocation(program, 'uGlyphOpacity');

    const maxInstances = 64;
    const bytesPerInstance = 24; // 2 float scale, 2 float offset, 4 byte disc color/opacity, 4 byte glyph color/index
    const instanceData = new ArrayBuffer(maxInstances * bytesPerInstance);
    const instanceDataAsFloat32 = new Float32Array(instanceData);
    const instanceDataAsUint32 = new Uint32Array(instanceData);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // per-vertex attributes
    const vertexBuffer = createDiscVertexBuffer(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.enableVertexAttribArray(attribs.vPosition);
    gl.vertexAttribPointer(attribs.vPosition, 2, gl.FLOAT, false, 0, 0);

    // per-instance attributes
    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(attribs.vScaleAndOffset);
    gl.enableVertexAttribArray(attribs.vDiscColorAndOpacity);
    gl.enableVertexAttribArray(attribs.vGlyphColor);
    gl.enableVertexAttribArray(attribs.vGlyphIndex);
    gl.vertexAttribPointer(attribs.vScaleAndOffset, 4, gl.FLOAT, false, bytesPerInstance, 0);
    gl.vertexAttribPointer(attribs.vDiscColorAndOpacity, 4, gl.UNSIGNED_BYTE, true, bytesPerInstance, 16);
    gl.vertexAttribPointer(attribs.vGlyphColor, 3, gl.UNSIGNED_BYTE, true, bytesPerInstance, 20);
    gl.vertexAttribPointer(attribs.vGlyphIndex, 1, gl.UNSIGNED_BYTE, false, bytesPerInstance, 23);
    gl.vertexAttribDivisor(attribs.vScaleAndOffset, 1);
    gl.vertexAttribDivisor(attribs.vDiscColorAndOpacity, 1);
    gl.vertexAttribDivisor(attribs.vGlyphColor, 1);
    gl.vertexAttribDivisor(attribs.vGlyphIndex, 1);

    gl.bindVertexArray(null);

    return (matScreenFromWorld, discs) => {
        gl.useProgram(program);

        gl.bindVertexArray(vao);

        gl.uniformMatrix4fv(locMatScreenFromWorld, false, matScreenFromWorld);
        gl.uniform4fv(locScaleAndOffsetGlyphFromDisc, vecScaleAndOffsetGlyphFromDisc);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, glyphTexture);
        gl.uniform1i(locGlyphOpacity, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);

        let discIndexStart = 0;
        while (discIndexStart < discs.length) {
            const numInstances = Math.min(maxInstances, discs.length - discIndexStart);

            // Load disc data into the instance buffer

            for (let i = 0; i < numInstances; ++i) {
                const disc = discs[discIndexStart + i];

                let j = i * bytesPerInstance / 4;
                instanceDataAsFloat32[j + 0] = disc.radius;
                instanceDataAsFloat32[j + 1] = disc.radius;
                instanceDataAsFloat32[j + 2] = disc.position[0];
                instanceDataAsFloat32[j + 3] = disc.position[1];
                instanceDataAsUint32[j + 4] = disc.discColor;
                instanceDataAsUint32[j + 5] = (disc.glyphColor & 0xffffff) + (disc.glyphIndex << 24);
            }

            gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData); // would like to only submit data for instances we will draw, not the whole buffer

            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, numInstances);

            discIndexStart += numInstances;
        }

        gl.bindVertexArray(null);
    };
}

function createDiscVertexBuffer(gl: WebGL2RenderingContext) {
    const v = new Float32Array(6 * 2);
    let i = 0;

    function makeVert(x: number, y: number) {
        v[i++] = x;
        v[i++] = y;
    }

    makeVert(-1, -1);
    makeVert( 1, -1);
    makeVert( 1,  1);
    makeVert( 1,  1);
    makeVert(-1,  1);
    makeVert(-1, -1);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);

    return vertexBuffer;
}

function createGlyphRenderer(gl: WebGL2RenderingContext, glyphTexture: WebGLTexture): RenderGlyphs {
    const vsSource = `#version 300 es
        in vec2 vPosition;
        in vec3 vTexcoord;
        in vec4 vColor;

        uniform mat4 uMatScreenFromWorld;

        out highp vec3 fTexcoord;
        out highp vec4 fColor;

        void main() {
            fTexcoord = vTexcoord;
            fColor = vColor;
            gl_Position = uMatScreenFromWorld * vec4(vPosition, 0, 1);
        }
    `;

    const fsSource = `#version 300 es
        in highp vec3 fTexcoord;
        in highp vec4 fColor;

        uniform highp sampler2DArray uOpacity;

        out lowp vec4 fragColor;

        void main() {
            fragColor = fColor * vec4(1, 1, 1, texture(uOpacity, fTexcoord));
        }
    `;

    const attribs = {
        vPosition: 0,
        vTexcoord: 1,
        vColor: 2,
    };

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const uProjectionMatrixLoc = gl.getUniformLocation(program, 'uMatScreenFromWorld');
    const uOpacityLoc = gl.getUniformLocation(program, 'uOpacity');

    const maxQuads = 64;
    const numVertices = 4 * maxQuads;
    const bytesPerVertex = 2 * Float32Array.BYTES_PER_ELEMENT + 2 * Uint32Array.BYTES_PER_ELEMENT;
    const wordsPerQuad = bytesPerVertex; // divide by four bytes per word, but also multiply by four vertices per quad

    const vertexData = new ArrayBuffer(numVertices * bytesPerVertex);
    const vertexDataAsFloat32 = new Float32Array(vertexData);
    const vertexDataAsUint32 = new Uint32Array(vertexData);

    const vertexBuffer = gl.createBuffer();

    let numQuads = 0;

    const matScreenFromWorldCached = mat4.create();

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(attribs.vPosition);
    gl.enableVertexAttribArray(attribs.vTexcoord);
    gl.enableVertexAttribArray(attribs.vColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(attribs.vPosition, 2, gl.FLOAT, false, bytesPerVertex, 0);
    gl.vertexAttribPointer(attribs.vTexcoord, 3, gl.UNSIGNED_BYTE, false, bytesPerVertex, 8);
    gl.vertexAttribPointer(attribs.vColor, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 12);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
    const indexBuffer = createGlyphIndexBuffer(gl, maxQuads);
    gl.bindVertexArray(null);

    function setMatScreenFromWorld(matScreenFromWorld: mat4) {
        mat4.copy(matScreenFromWorldCached, matScreenFromWorld);
    }

    function addGlyph(x0: number, y0: number, x1: number, y1: number, glyphIndex: number, color: number) {
        if (numQuads >= maxQuads) {
            flushQuads();
        }

        const i = numQuads * wordsPerQuad;
        const srcBase = glyphIndex << 16;

        vertexDataAsFloat32[i+0] = x0;
        vertexDataAsFloat32[i+1] = y0;
        vertexDataAsUint32[i+2] = srcBase + 256;
        vertexDataAsUint32[i+3] = color;

        vertexDataAsFloat32[i+4] = x1;
        vertexDataAsFloat32[i+5] = y0;
        vertexDataAsUint32[i+6] = srcBase + 257;
        vertexDataAsUint32[i+7] = color;

        vertexDataAsFloat32[i+8] = x0;
        vertexDataAsFloat32[i+9] = y1;
        vertexDataAsUint32[i+10] = srcBase;
        vertexDataAsUint32[i+11] = color;

        vertexDataAsFloat32[i+12] = x1;
        vertexDataAsFloat32[i+13] = y1;
        vertexDataAsUint32[i+14] = srcBase + 1;
        vertexDataAsUint32[i+15] = color;

        ++numQuads;
    }

    function flushQuads() {
        if (numQuads <= 0) {
            return;
        }

        gl.useProgram(program);

        gl.bindVertexArray(vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, glyphTexture);
        gl.uniform1i(uOpacityLoc, 0);

        gl.uniformMatrix4fv(uProjectionMatrixLoc, false, matScreenFromWorldCached);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexDataAsFloat32, 0);

        gl.drawElements(gl.TRIANGLES, 6 * numQuads, gl.UNSIGNED_SHORT, 0);

        gl.bindVertexArray(null);

        numQuads = 0;
    }

    return {
        start: setMatScreenFromWorld,
        addGlyph: addGlyph,
        flush: flushQuads,
    };
}

function createGlyphIndexBuffer(gl: WebGL2RenderingContext, maxQuads: number): WebGLBuffer {
    const indices = new Uint16Array(maxQuads * 6);

    for (let i = 0; i < maxQuads; ++i) {
        let j = 6*i;
        let k = 4*i;
        indices[j+0] = k+0;
        indices[j+1] = k+1;
        indices[j+2] = k+2;
        indices[j+3] = k+2;
        indices[j+4] = k+1;
        indices[j+5] = k+3;
    }

    const indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    return indexBuffer;
}

function createGlyphTextureFromImage(gl: WebGL2RenderingContext, image: HTMLImageElement): WebGLTexture {
    const numGlyphsX = 16;
    const numGlyphsY = 16;
    const numGlyphs = numGlyphsX * numGlyphsY;
    const srcGlyphSizeX = image.naturalWidth / numGlyphsX;
    const srcGlyphSizeY = image.naturalHeight / numGlyphsY;
    const scaleFactor = 4;
    const dstGlyphSizeX = srcGlyphSizeX * scaleFactor;
    const dstGlyphSizeY = srcGlyphSizeY * scaleFactor;

    // Rearrange the glyph data from a grid to a vertical array

    const canvas = document.createElement('canvas');
    canvas.width = dstGlyphSizeX;
    canvas.height = dstGlyphSizeY * numGlyphs;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < numGlyphsY; ++y) {
        for (let x = 0; x < numGlyphsX; ++x) {
            const sx = x * srcGlyphSizeX;
            const sy = y * srcGlyphSizeY;
            const dx = 0;
            const dy = (numGlyphsX * y + x) * dstGlyphSizeY;
            ctx.drawImage(image, sx, sy, srcGlyphSizeX, srcGlyphSizeY, dx, dy, dstGlyphSizeX, dstGlyphSizeY);
        }
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = new Uint8Array(imageData.data.buffer);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, dstGlyphSizeX, dstGlyphSizeY, numGlyphs, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    return texture;
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

function createColoredTrianglesRenderer(gl: WebGL2RenderingContext): CreateColoredTrianglesRenderer {
    const vsSource = `#version 300 es
        in vec2 vPosition;
        in vec4 vColor;

        uniform mat4 uProjectionMatrix;

        out highp vec4 fColor;

        void main() {
            fColor = vColor;
            gl_Position = uProjectionMatrix * vec4(vPosition.xy, 0, 1);
        }
    `;

    const fsSource = `#version 300 es
        in highp vec4 fColor;
        out lowp vec4 fragColor;
        void main() {
            fragColor = fColor;
        }
    `;

    const attribs = {
        vPosition: 0,
        vColor: 1,
    };

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const projectionMatrixLoc = gl.getUniformLocation(program, 'uProjectionMatrix');

    const vertexBuffer = gl.createBuffer();

    const bytesPerVertex = 12; // two 4-byte floats and one 32-bit color

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(attribs.vPosition);
    gl.enableVertexAttribArray(attribs.vColor);
    gl.bindVertexArray(null);

    return vertexData => {
        const numVerts = Math.floor(vertexData.byteLength / bytesPerVertex);

        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(attribs.vPosition, 2, gl.FLOAT, false, bytesPerVertex, 0);
        gl.vertexAttribPointer(attribs.vColor, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 8);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        return matScreenFromWorld => {
            gl.useProgram(program);
            gl.uniformMatrix4fv(projectionMatrixLoc, false, matScreenFromWorld);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, numVerts);
            gl.bindVertexArray(null);
        };
    };
}

function updateState(state: State, dt: number) {

    // Player

    vec2.scaleAndAdd(state.player.position, state.player.position, state.player.velocity, dt);

    // Other

    updateCamera(state, dt);

    // Collide player against objects and the environment

    for (let i = 0; i < 4; ++i) {
        fixupPositionAndVelocityAgainstLevel(state.player.position, state.player.velocity, state.player.radius, state.level.solid);
    }
}

function updateCamera(state: State, dt: number) {

    // Animate map zoom

    const mapZoomTarget = state.showMap ? 0 : 1;
    const kSpringMapZoom = 12;
    const mapZoomAccel = ((mapZoomTarget - state.mapZoom) * kSpringMapZoom - 2 * state.mapZoomVelocity) * kSpringMapZoom;
    const mapZoomVelNew = state.mapZoomVelocity + mapZoomAccel * dt;
    state.mapZoom += (state.mapZoomVelocity + mapZoomVelNew) * (dt / 2);
    state.mapZoomVelocity = mapZoomVelNew;

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

type Plane = {
    unitDir: vec2;
    d: number;
}

function fixupPositionAndVelocityAgainstLevel(position: vec2, velocity: vec2, radius: number, solid: BooleanGrid) {

    let vNormalMin = 0;

    for (let i = 0; i < 4; ++i) {
        const gridMinX = Math.max(0, Math.floor(position[0] - radius));
        const gridMinY = Math.max(0, Math.floor(position[1] - radius));
        const gridMaxX = Math.min(solid.sizeX, Math.floor(position[0] + radius + 1));
        const gridMaxY = Math.min(solid.sizeY, Math.floor(position[1] + radius + 1));

        let smallestSeparatingAxis = {unitDir: vec2.fromValues(0, 0), d: radius};

        for (let gridX = gridMinX; gridX <= gridMaxX; ++gridX) {
            for (let gridY = gridMinY; gridY <= gridMaxY; ++gridY) {
                const isSolid = solid.get(gridX, gridY);
                if (!isSolid) {
                    continue;
                }
                const dx = position[0] - (0.5 + gridX);
                const dy = position[1] - (0.5 + gridY);

                const axis = separatingAxis(dx, dy);

                if (axis.d < smallestSeparatingAxis.d) {
                    smallestSeparatingAxis = axis;
                }
            }
        }

        smallestSeparatingAxis.d -= radius;

        if (smallestSeparatingAxis.d < 0) {
            vec2.scaleAndAdd(position, position, smallestSeparatingAxis.unitDir, -smallestSeparatingAxis.d);
            const vNormal = vec2.dot(smallestSeparatingAxis.unitDir, velocity);
            vNormalMin = Math.min(vNormalMin, vNormal);
            vec2.scaleAndAdd(velocity, velocity, smallestSeparatingAxis.unitDir, -vNormal);
        }
    }

    const xMin = radius;
    const yMin = radius;
    const xMax = solid.sizeX - radius;
    const yMax = solid.sizeY - radius;

    if (position[0] < xMin) {
        position[0] = xMin;
        velocity[0] = 0;
    } else if (position[0] > xMax) {
        position[0] = xMax;
        velocity[0] = 0;
    }
    if (position[1] < yMin) {
        position[1] = yMin;
        velocity[1] = 0;
    } else if (position[1] > yMax) {
        position[1] = yMax;
        velocity[1] = 0;
    }

    return -vNormalMin;
}

function separatingAxis(dx: number, dy: number): Plane {
    const ax = Math.abs(dx) - 0.5;
    const ay = Math.abs(dy) - 0.5;
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if (ax > ay) {
        if (ay > 0) {
            const d = Math.sqrt(ax**2 + ay**2);
            return {unitDir: vec2.fromValues(sx * ax / d, sy * ay / d), d: d};
        } else {
            return {unitDir: vec2.fromValues(sx, 0), d: ax};
        }
    } else {
        if (ax > 0) {
            const d = Math.sqrt(ax**2 + ay**2);
            return {unitDir: vec2.fromValues(sx * ax / d, sy * ay / d), d: d};
        } else {
            return {unitDir: vec2.fromValues(0, sy), d: ay};
        }
    }
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
            '          7DRL 2023',
            '',
            '     Paused: Click to unpause',
            '',
            'Move with mouse',
            '',
            'Esc: Pause, R: Retry, M: Map',
        ]);
    }
}

function setupViewMatrix(state: State, screenSize: vec2, matScreenFromWorld: mat4) {
    const mapSizeX = state.level.solid.sizeX + 2;
    const mapSizeY = state.level.solid.sizeY + 2;

    let rxMap: number, ryMap: number;
    if (screenSize[0] * mapSizeY < screenSize[1] * mapSizeX) {
        // horizontal is limiting dimension
        rxMap = mapSizeX / 2;
        ryMap = rxMap * screenSize[1] / screenSize[0];
    } else {
        // vertical is limiting dimension
        ryMap = mapSizeY / 2;
        rxMap = ryMap * screenSize[0] / screenSize[1];
    }
    const cxMap = state.level.solid.sizeX / 2;
    const cyMap = state.level.solid.sizeY / 2;

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

    const rxZoom = lerp(rxMap, rxGame, state.mapZoom);
    const ryZoom = lerp(ryMap, ryGame, state.mapZoom);
    const cxZoom = lerp(cxMap, cxGame, state.mapZoom);
    const cyZoom = lerp(cyMap, cyGame, state.mapZoom);

    mat4.ortho(matScreenFromWorld, cxZoom - rxZoom, cxZoom + rxZoom, cyZoom - ryZoom, cyZoom + ryZoom, 1, -1);
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

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
    const parentElement = canvas.parentNode as HTMLElement;
    const rect = parentElement.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
}

function initShaderProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string, attribs: Record<string, number>): WebGLProgram {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    for (const attrib in attribs) {
        gl.bindAttribLocation(program, attribs[attrib], attrib);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program))!;
    }

    return program;
}

function loadShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
    }

    return shader;
}

type PriorityQueueElement = {
    priority: number;
}

type PriorityQueue<T> = Array<T>;

function priorityQueuePop<T extends PriorityQueueElement>(q: PriorityQueue<T>): T {
    const x = q[0];
    q[0] = q[q.length - 1]; // q.at(-1);
    q.pop();
    let i = 0;
    const c = q.length;
    while (true) {
        let iChild = i;
        const iChild0 = 2*i + 1;
        if (iChild0 < c && q[iChild0].priority < q[iChild].priority) {
            iChild = iChild0;
        }
        const iChild1 = iChild0 + 1;
        if (iChild1 < c && q[iChild1].priority < q[iChild].priority) {
            iChild = iChild1;
        }
        if (iChild == i) {
            break;
        }
        [q[i], q[iChild]] = [q[iChild], q[i]];
        i = iChild;
    }
    return x;
}

function priorityQueuePush<T extends PriorityQueueElement>(q: PriorityQueue<T>, x: T) {
    q.push(x);
    let i = q.length - 1;
    while (i > 0) {
        const iParent = Math.floor((i - 1) / 2);
        if (q[i].priority >= q[iParent].priority) {
            break;
        }
        [q[i], q[iParent]] = [q[iParent], q[i]];
        i = iParent;
    }
}

function randomInRange(n: number): number {
    return Math.floor(Math.random() * n);
}

// The output level data structure consists of dimensions and
// a byte array with the tile for each square. The starting
// position is also returned.

type Edge = [number, number];

function createLevel(): Level {
    // Create some rooms in a grid.

    const roomGrid: Array<Array<number>> = [];
    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        roomGrid[roomY] = [];
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            roomGrid[roomY][roomX] = roomY * numCellsX + roomX;
        }
    }

    // Build a minimum spanning tree of the rooms.

    const potentialEdges: Array<Edge> = [];
    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        for (let roomX = 1; roomX < numCellsX; ++roomX) {
            const room1 = roomY * numCellsX + roomX;
            const room0 = room1 - 1;
            potentialEdges.push([room0, room1]);
        }
    }

    for (let roomY = 1; roomY < numCellsY; ++roomY) {
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            const room1 = roomY * numCellsX + roomX;
            const room0 = room1 - numCellsX;
            potentialEdges.push([room0, room1]);
        }
    }

    shuffleArray(potentialEdges);

    const numRooms = numCellsX * numCellsY;
    const roomGroup = [];
    for (let i = 0; i < numRooms; ++i) {
        roomGroup.push(i);
    }

    const edges: Array<Edge> = [];

    // Add edges between as-yet-unconnected sub-graphs

    for (const edge of potentialEdges) {
        const group0: number = roomGroup[edge[0]];
        const group1: number = roomGroup[edge[1]];

        if (group0 == group1)
            continue;

        edges.push(edge);
        for (let i = 0; i < numRooms; ++i) {
            if (roomGroup[i] === group1) {
                roomGroup[i] = group0;
            }
        }
    }

    // Calculate all-pairs shortest path distances

    const dist: Array<Array<number>> = [];
    for (let i = 0; i < numRooms; ++i) {
        dist[i] = [];
        for (let j = 0; j < numRooms; ++j) {
            dist[i][j] = (i == j) ? 0 : Infinity;
        }
    }

    for (const edge of edges) {
        dist[edge[0]][edge[1]] = 1;
        dist[edge[1]][edge[0]] = 1;
    }

    for (let k = 0; k < numRooms; ++k) {
        for (let i = 0; i < numRooms; ++i) {
            for (let j = 0; j < numRooms; ++j) {
                if (dist[i][j] > dist[i][k] + dist[k][j]) {
                    dist[i][j] = dist[i][k] + dist[k][j];
                }
            }
        }
    }

    // Pick a starting room and an ending room that are maximally distant

    let maxDistPairs: Array<[number, number]> = [];
    let maxDist = 0;

    for (let i = 0; i < numRooms; ++i) {
        for (let j = i + 1; j < numRooms; ++j) {
            if (dist[i][j] > maxDist) {
                maxDist = dist[i][j];
                maxDistPairs = [[i, j]];
            } else if (dist[i][j] == maxDist) {
                maxDistPairs.push([i, j]);
            }
        }
    }

    shuffleArray(maxDistPairs);
    shuffleArray(maxDistPairs[0]);

    const roomIndexEntrance = maxDistPairs[0][0];
    const roomIndexExit = maxDistPairs[0][1];

    // Compute distances for each room from the entrance.

    const roomDistanceFromEntrance: Array<number> = [];
    const roomDistanceFromExit: Array<number> = [];
    computeDistances(roomDistanceFromEntrance, numRooms, edges, roomIndexEntrance);
    computeDistances(roomDistanceFromExit, numRooms, edges, roomIndexExit);

    // Find dead-end rooms and add edges to them if they don't change the length
    // of the path from the entrance to the exit.

    filterInPlace(potentialEdges, edge => !hasEdge(edges, edge[0], edge[1]));

    const roomIndexShuffled = [];
    for (let i = 0; i < numRooms; ++i) {
        roomIndexShuffled.push(i);
    }
    shuffleArray(roomIndexShuffled);

    const minDistEntranceToExit = roomDistanceFromEntrance[roomIndexExit];

    for (const roomIndex of roomIndexShuffled) {
        const numEdgesCur = edges.reduce((count, edge) => count + ((edge[0] == roomIndex || edge[1] == roomIndex) ? 1 : 0), 0);
        if (numEdgesCur != 1) {
            continue;
        }

        const edgesToAdd = potentialEdges.filter(edge => edge[0] == roomIndex || edge[1] == roomIndex);

        filterInPlace(edgesToAdd, edge => {
            const e0 = edge[0];
            const e1 = edge[1];
            if (hasEdge(edges, e0, e1)) {
                return false;
            }
            const newDistEntranceToExit = 1 + Math.min(
                roomDistanceFromEntrance[e0] + roomDistanceFromExit[e1],
                roomDistanceFromEntrance[e1] + roomDistanceFromExit[e0]
            );
            return newDistEntranceToExit >= minDistEntranceToExit;
        });

        if (edgesToAdd.length > 0) {
            edges.push(edgesToAdd[randomInRange(edgesToAdd.length)]);

            computeDistances(roomDistanceFromEntrance, numRooms, edges, roomIndexEntrance);
            computeDistances(roomDistanceFromExit, numRooms, edges, roomIndexExit);
        }
    }

    // Pick sizes for the rooms. The entrance and exit rooms are special and
    // have fixed sizes.

    const minRoomSize = corridorWidth + 6;
    const maxRoomSize = 33;
    const squaresPerBlock = maxRoomSize + corridorWidth + 2;

    const rooms = [];

    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            const roomIndex = roomY * numCellsX + roomX;

            let roomSizeX, roomSizeY;
            if (roomIndex == roomIndexEntrance) {
                roomSizeX = 7;
                roomSizeY = 7;
            } else if (roomIndex == roomIndexExit) {
                roomSizeX = maxRoomSize;
                roomSizeY = maxRoomSize;
            } else {
                const halfRoomSizeRange = 1 + Math.floor((maxRoomSize - minRoomSize) / 2);
                roomSizeX = randomInRange(halfRoomSizeRange) + randomInRange(halfRoomSizeRange) + minRoomSize;
                roomSizeY = randomInRange(halfRoomSizeRange) + randomInRange(halfRoomSizeRange) + minRoomSize;
            }

            const cellMinX = roomX * squaresPerBlock;
            const cellMinY = roomY * squaresPerBlock;
            const roomMinX = randomInRange(1 + maxRoomSize - roomSizeX) + cellMinX + 1;
            const roomMinY = randomInRange(1 + maxRoomSize - roomSizeY) + cellMinY + 1;

            const room = {
                minX: roomMinX,
                minY: roomMinY,
                sizeX: roomSizeX,
                sizeY: roomSizeY,
            };

            rooms.push(room);
        }
    }

    // Compress the rooms together where possible

    const [mapSizeX, mapSizeY] = compressRooms(roomGrid, edges, rooms);

    // Plot rooms into a grid

    const grid = new TerrainTypeGrid(mapSizeX, mapSizeY, TerrainType.Solid);

    for (const room of rooms) {
        for (let y = 0; y < room.sizeY; ++y) {
            for (let x = 0; x < room.sizeX; ++x) {
                grid.set(x + room.minX, y + room.minY, TerrainType.Room);
            }
        }

        for (let x = 0; x < room.sizeX; ++x) {
            grid.set(x + room.minX, room.minY - 1, TerrainType.Wall);
            grid.set(x + room.minX, room.minY + room.sizeY, TerrainType.Wall);
        }

        for (let y = 0; y < room.sizeY + 2; ++y) {
            grid.set(room.minX - 1, y + room.minY - 1, TerrainType.Wall);
            grid.set(room.minX + room.sizeX, y + room.minY - 1, TerrainType.Wall);
        }
    }

    // Decorate the rooms

    const roomsToDecorate = rooms.filter((room, roomIndex) => roomIndex != roomIndexEntrance && roomIndex != roomIndexExit);
    decorateRooms(roomsToDecorate, grid);
    tryCreatePillarRoom(rooms[roomIndexExit], grid);

    // Plot corridors into grid

    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        for (let roomX = 0; roomX < (numCellsX - 1); ++roomX) {
            const roomIndex0 = roomY * numCellsX + roomX;
            const roomIndex1 = roomIndex0 + 1;

            if (!hasEdge(edges, roomIndex0, roomIndex1)) {
                continue;
            }

            const room0 = rooms[roomIndex0];
            const room1 = rooms[roomIndex1];

            const xMin = room0.minX + room0.sizeX;
            const xMax = room1.minX;
            const xMid = Math.floor((xMax - (xMin + 1 + corridorWidth)) / 2) + xMin + 1;

            const yMinIntersect = Math.max(room0.minY, room1.minY) + 1;
            const yMaxIntersect = Math.min(room0.minY + room0.sizeY, room1.minY + room1.sizeY) - 1;
            const yRangeIntersect = yMaxIntersect - yMinIntersect;

            let yMinLeft, yMinRight;
            if (yRangeIntersect >= corridorWidth) {
                yMinLeft = yMinRight = yMinIntersect + Math.floor((yRangeIntersect - corridorWidth) / 2);
            } else {
                yMinLeft = Math.floor((room0.sizeY - corridorWidth) / 2) + room0.minY;
                yMinRight = Math.floor((room1.sizeY - corridorWidth) / 2) + room1.minY;
            }

            for (let x = xMin; x < xMid; ++x) {
                for (let y = 0; y < corridorWidth; ++y) {
                    grid.set(x, yMinLeft + y, TerrainType.Hall);
                }
            }

            for (let x = xMid + corridorWidth; x < xMax; ++x) {
                for (let y = 0; y < corridorWidth; ++y) {
                    grid.set(x, yMinRight + y, TerrainType.Hall);
                }
            }

            const yMin = Math.min(yMinLeft, yMinRight);
            const yMax = Math.max(yMinLeft, yMinRight);
            for (let y = yMin; y < yMax + corridorWidth; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    grid.set(xMid + x, y, TerrainType.Hall);
                }
            }
        }
    }

    for (let roomY = 0; roomY < (numCellsY - 1); ++roomY) {
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            const roomIndex0 = roomY * numCellsX + roomX;
            const roomIndex1 = roomIndex0 + numCellsX;

            if (!hasEdge(edges, roomIndex0, roomIndex1)) {
                continue;
            }

            const room0 = rooms[roomIndex0];
            const room1 = rooms[roomIndex1];

            const xMinIntersect = Math.max(room0.minX, room1.minX) + 1;
            const xMaxIntersect = Math.min(room0.minX + room0.sizeX, room1.minX + room1.sizeX) - 1;
            const xRangeIntersect = xMaxIntersect - xMinIntersect;

            let xMinLower, xMinUpper;
            if (xRangeIntersect >= corridorWidth) {
                xMinLower = xMinUpper = xMinIntersect + Math.floor((xRangeIntersect - corridorWidth) / 2);
            } else {
                xMinLower = Math.floor((room0.sizeX - corridorWidth) / 2) + room0.minX;
                xMinUpper = Math.floor((room1.sizeX - corridorWidth) / 2) + room1.minX;
            }

            const yMin = room0.minY + room0.sizeY;
            const yMax = room1.minY;
            const yMid = Math.floor((yMax - (yMin + 1 + corridorWidth)) / 2) + yMin + 1;

            for (let y = yMin; y < yMid; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    grid.set(xMinLower + x, y, TerrainType.Hall);
                }
            }

            for (let y = yMid + corridorWidth; y < yMax; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    grid.set(xMinUpper + x, y, TerrainType.Hall);
                }
            }

            const xMin = Math.min(xMinLower, xMinUpper);
            const xMax = Math.max(xMinLower, xMinUpper);
            for (let x = xMin; x < xMax + corridorWidth; ++x) {
                for (let y = 0; y < corridorWidth; ++y) {
                    grid.set(x, yMid + y, TerrainType.Hall);
                }
            }
        }
    }

    // Convert to colored squares.

    const roomColor = 0xff808080;
    const hallColor = 0xff707070;
    const wallColor = 0xff0055aa;

    const squares = [];
    for (let y = 0; y < grid.sizeY; ++y) {
        for (let x = 0; x < grid.sizeX; ++x) {
            const type = grid.get(x, y);
            if (type == TerrainType.Room) {
                squares.push({x: x, y: y, color: roomColor});
            } else if (type == TerrainType.Hall) {
                squares.push({x: x, y: y, color: hallColor});
            } else if (type == TerrainType.Wall) {
                squares.push({x: x, y: y, color: wallColor});
            }
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

    // Pick a starting position within the starting room

    const startRoom = rooms[roomIndexEntrance];
    const playerStartPos = vec2.fromValues(startRoom.minX + startRoom.sizeX/2, startRoom.minY + startRoom.sizeY/2);

    // Create a boolean grid indicating which squares on the map are solid and which are open space

    const solid = new BooleanGrid(grid.sizeX, grid.sizeY, false);
    for (let x = 0; x < grid.sizeX; ++x) {
        for (let y = 0; y < grid.sizeY; ++y) {
            const terrainType = grid.get(x, y);
            const isSolid = terrainType == TerrainType.Solid || terrainType == TerrainType.Wall;
            solid.set(x, y, isSolid);
        }
    }

    return {
        solid: solid,
        vertexData: vertexData,
        playerStartPos: playerStartPos,
        startRoom: startRoom,
    };
}

function computeDistances(roomDistance: Array<number>, numRooms: number, edges: Array<[number, number]>, roomIndexStart: number) {
    roomDistance.length = numRooms;
    roomDistance.fill(numRooms);
    const toVisit = [{priority: 0, value: roomIndexStart}];
    while (toVisit.length > 0) {
        const {priority, value: roomIndex} = priorityQueuePop(toVisit);

        if (roomDistance[roomIndex] <= priority) {
            continue;
        }

        roomDistance[roomIndex] = priority;

        const dist = priority + 1;

        for (const edge of edges) {
            if (edge[0] == roomIndex) {
                if (roomDistance[edge[1]] > dist) {
                    priorityQueuePush(toVisit, {priority: dist, value: edge[1]});
                }
            } else if (edge[1] == roomIndex) {
                if (roomDistance[edge[0]] > dist) {
                    priorityQueuePush(toVisit, {priority: dist, value: edge[0]});
                }
            }
        }
    }
}

function compressRooms(roomGrid: Array<Array<number>>, edges: Array<[number, number]>, rooms: Array<Rect>): [number, number] {
    const numRoomsX = roomGrid[0].length;
    const numRoomsY = roomGrid.length;

    // Try to shift each row downward as much as possible
    for (let roomY = 0; roomY < numRoomsY; ++roomY) {
        let gapMin = Number.MIN_SAFE_INTEGER;
        let gapMax = Number.MAX_SAFE_INTEGER;
        let hasBentCorridor = false;

        for (let roomX = 0; roomX < numRoomsX; ++roomX) {
            const roomIndex0 = (roomY > 0) ? roomGrid[roomY - 1][roomX] : null;
            const roomIndex1 = roomGrid[roomY][roomX];
            const room0 = (roomIndex0 === null) ? null : rooms[roomIndex0];
            const room1 = rooms[roomIndex1];
            const gapMinY = (room0 === null) ? 0 : room0.minY + room0.sizeY + 2;
            const gapMaxY = room1.minY - 1;
            if (room0 !== null &&
                hasEdge(edges, roomIndex0, roomIndex1) &&
                !canHaveStraightVerticalHall(room0, room1)) {
                hasBentCorridor = true;
            }
            gapMin = Math.max(gapMin, gapMinY);
            gapMax = Math.min(gapMax, gapMaxY);
        }
        // Do the shift
        let gapSize = gapMax - gapMin - (hasBentCorridor ? (corridorWidth + 2) : 0);
        if (gapSize > 0) {
            for (let roomYShift = roomY; roomYShift < numRoomsY; ++roomYShift) {
                for (let roomXShift = 0; roomXShift < numRoomsX; ++roomXShift) {
                    const room = rooms[roomGrid[roomYShift][roomXShift]];
                    room.minY -= gapSize;
                }
            }
        }
    }

    // Try to shift each column leftward as much as possible
    for (let roomX = 0; roomX < numRoomsX; ++roomX) {
        let gapMin = Number.MIN_SAFE_INTEGER;
        let gapMax = Number.MAX_SAFE_INTEGER;
        let hasBentCorridor = false;

        for (let roomY = 0; roomY < numRoomsY; ++roomY) {
            const roomIndex0 = (roomX > 0) ? roomGrid[roomY][roomX - 1] : null;
            const roomIndex1 = roomGrid[roomY][roomX];
            const room0 = (roomIndex0 === null) ? null : rooms[roomIndex0];
            const room1 = rooms[roomIndex1];
            const gapMinX = (room0 === null) ? 0 : room0.minX + room0.sizeX + 2;
            const gapMaxX = room1.minX - 1;
            if (room0 !== null &&
                hasEdge(edges, roomIndex0, roomIndex1) &&
                !canHaveStraightHorizontalHall(room0, room1)) {
                hasBentCorridor = true;
            }
            gapMin = Math.max(gapMin, gapMinX);
            gapMax = Math.min(gapMax, gapMaxX);
        }
        // Do the shift
        let gapSize = gapMax - gapMin - (hasBentCorridor ? (corridorWidth + 2) : 0);
        if (gapSize > 0) {
            for (let roomYShift = 0; roomYShift < numRoomsY; ++roomYShift) {
                for (let roomXShift = roomX; roomXShift < numRoomsX; ++roomXShift) {
                    const room = rooms[roomGrid[roomYShift][roomXShift]];
                    room.minX -= gapSize;
                }
            }
        }
    }

    // Compute the new map dimensions

    let mapSizeX = 0;
    let mapSizeY = 0;

    for (let roomY = 0; roomY < numRoomsY; ++roomY) {
        const roomIndex = roomGrid[roomY][numRoomsX - 1];
        const room = rooms[roomIndex];
        mapSizeX = Math.max(mapSizeX, room.minX + room.sizeX + 1);
    }

    for (let roomX = 0; roomX < numRoomsX; ++roomX) {
        const roomIndex = roomGrid[numRoomsY - 1][roomX];
        const room = rooms[roomIndex];
        mapSizeY = Math.max(mapSizeY, room.minY + room.sizeY + 1);
    }

    return [mapSizeX, mapSizeY];
}

function decorateRooms(rooms: Array<Rect>, grid: TerrainTypeGrid) {
    const roomsShuffled = [...rooms];
    shuffleArray(roomsShuffled);

    tryPlacePillarRoom(roomsShuffled, grid);
    tryPlaceCenterObstacleRoom(roomsShuffled, grid);
    tryPlacePillarRoom(roomsShuffled, grid);
    tryPlaceCenterObstacleRoom(roomsShuffled, grid);
    tryPlacePillarRoom(roomsShuffled, grid);
}

function tryPlacePillarRoom(rooms: Array<Rect>, grid: TerrainTypeGrid) {
    for (let i = 0; i < rooms.length; ++i) {
        const room = rooms[i];

        if (tryCreatePillarRoom(room, grid)) {
            rooms[i] = rooms[rooms.length-1];
            --rooms.length;
            break;    
        }
    }
}

function tryCreatePillarRoom(room: Rect, grid: TerrainTypeGrid): boolean {
    if (room.sizeX < 13 || room.sizeY < 13)
        return false;
    if (((room.sizeX - 3) % 5) != 0 && ((room.sizeY - 3) % 5) != 0)
        return false;

    function plotPillar(x: number, y: number) {
        if (Math.random() < 0.125)
            return;
        x += room.minX;
        y += room.minY;
        grid.set(x, y, TerrainType.Wall);
        grid.set(x+1, y, TerrainType.Wall);
        grid.set(x, y+1, TerrainType.Wall);
        grid.set(x+1, y+1, TerrainType.Wall);
    }

    plotPillar(3, 3);
    plotPillar(3, room.sizeY - 5);
    plotPillar(room.sizeX - 5, 3);
    plotPillar(room.sizeX - 5, room.sizeY - 5);

    if (((room.sizeX - 3) % 5) == 0) {
        for (let x = 8; x < room.sizeX - 5; x += 5) {
            plotPillar(x, 3);
            plotPillar(x, room.sizeY - 5);
        }
    }

    if (((room.sizeY - 3) % 5) == 0) {
        for (let y = 8; y < room.sizeY - 5; y += 5) {
            plotPillar(3, y);
            plotPillar(room.sizeX - 5, y);
        }
    }

    return true;
}

function tryPlaceCenterObstacleRoom(rooms: Array<Rect>, grid: TerrainTypeGrid) {
    for (let i = 0; i < rooms.length; ++i) {
        const room = rooms[i];
        if (room.sizeX < 15 || room.sizeY < 15)
            continue;

        rooms[i] = rooms[rooms.length-1];
        --rooms.length;

        function plotRect(minX: number, minY: number, sizeX: number, sizeY: number, type: number) {
            for (let x = minX; x < minX + sizeX; ++x) {
                for (let y = minY; y < minY + sizeY; ++y) {
                    grid.set(x, y, type);
                }
            }
        }

        plotRect(room.minX + 6, room.minY + 6, room.sizeX - 12, room.sizeY - 12, TerrainType.Wall);
        plotRect(room.minX + 7, room.minY + 7, room.sizeX - 14, room.sizeY - 14, TerrainType.Solid);

        return;
    }
}

function hasEdge(edges: Array<[number, number]>, roomIndex0: number | null, roomIndex1: number | null): boolean {
    return edges.some(edge => edge[0] === roomIndex0 && edge[1] === roomIndex1);
}

function canHaveStraightVerticalHall(room0: Rect, room1: Rect): boolean {
    const overlapMin = Math.max(room0.minX, room1.minX) + 1;
    const overlapMax = Math.min(room0.minX + room0.sizeX, room1.minX + room1.sizeX) - 1;
    const overlapSize = Math.max(0, overlapMax - overlapMin);
    return overlapSize >= corridorWidth;
}

function canHaveStraightHorizontalHall(room0: Rect, room1: Rect): boolean {
    const overlapMin = Math.max(room0.minY, room1.minY) + 1;
    const overlapMax = Math.min(room0.minY + room0.sizeY, room1.minY + room1.sizeY) - 1;
    const overlapSize = Math.max(0, overlapMax - overlapMin);
    return overlapSize >= corridorWidth;
}

function isPositionTooCloseToOtherPositions(positions: Array<vec2>, separationDistance: number, position: vec2): boolean {
    const dpos = vec2.create();
    for (const positionOther of positions) {
        vec2.subtract(dpos, position, positionOther);
        const d = vec2.length(dpos);
        if (d < separationDistance) {
            return true;
        }
    }
    return false;
}

function shuffleArray<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; --i) {
        let j = randomInRange(i + 1);
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
