export { Renderer };
import { TileSet, FontTileSet, TileInfo } from './tilesets';
import { vec2, mat4 } from './my-matrix';

// #####################
// Web-GL Renderer
// #####################


class Renderer {
    beginFrame = (cameraPos:vec2, screenSize:vec2, matScreenFromWorld:mat4) => {}
    start(matScreenFromWorld: mat4, textureIndex: number) {}
    addGlyph(x0: number, y0: number, x1: number, y1: number, tileInfo:TileInfo, lit:boolean=true) {}
    flush() {}
    fontTileSet: FontTileSet;
    tileSet: TileSet;

    constructor(canvas: HTMLCanvasElement, tileSet:TileSet, fontTileSet:FontTileSet) {
        this.tileSet = tileSet;
        this.fontTileSet = fontTileSet;
        const gl = canvas.getContext("webgl2", { alpha: false, depth: false }) as WebGL2RenderingContext;
        const textures = [fontTileSet.image, tileSet.image].map((image) => createTextureFromImage(gl, image));
        
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
                fragColor = fColor * texture(uOpacity, fTexcoord);
            }
        `;

        const attribs = {
            vPosition: 0,
            vTexcoord: 1,
            vColor: 2,
        };

        const tileRatios = [tileSet.tileSize[0]/tileSet.cellSize[0], tileSet.tileSize[1]/tileSet.cellSize[1]]

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

        this.start = (matScreenFromWorld: mat4, textureIndex: number) => {
            mat4.copy(matScreenFromWorldCached, matScreenFromWorld);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures[textureIndex]);
        }

        this.addGlyph = (x0: number, y0: number, x1: number, y1: number, tileInfo:TileInfo, lit:boolean=true) => {
            if (numQuads >= maxQuads) {
                this.flush();
            }

            x1 = x0+(x1-x0)*tileRatios[0];
            y1 = y0+(y1-y0)*tileRatios[1];

            const color = lit? tileInfo.color? tileInfo.color:0xffffffff
                    : tileInfo.unlitColor? tileInfo.unlitColor:0xffffffff;

            const i = numQuads * wordsPerQuad;
            const srcBase = tileInfo.textureIndex << 16;

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

        this.flush = () => {
            if (numQuads <= 0) {
                return;
            }

            gl.useProgram(program);

            gl.bindVertexArray(vao);

            gl.uniform1i(uOpacityLoc, 0);

            gl.uniformMatrix4fv(uProjectionMatrixLoc, false, matScreenFromWorldCached);

            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexDataAsFloat32, 0);

            gl.drawElements(gl.TRIANGLES, 6 * numQuads, gl.UNSIGNED_SHORT, 0);

            gl.bindVertexArray(null);

            numQuads = 0;
        }
        this.beginFrame = (cameraPos:vec2, screenSize:vec2, matScreenFromWorld:mat4) => {
            const canvas = gl.canvas as HTMLCanvasElement;
    
            resizeCanvasToDisplaySize(canvas); //TODO: Put this in a listener for window size changes
    
            const screenX = canvas.clientWidth;
            const screenY = canvas.clientHeight;
        
            gl.viewport(0, 0, screenX, screenY);
            gl.clear(gl.COLOR_BUFFER_BIT);
    
            vec2.set(screenSize, screenX, screenY);
            setupViewMatrix(cameraPos, tileSet.tileSize, screenSize, matScreenFromWorld);
            
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
    }
}

function setupViewMatrix(cameraPos: vec2, tileSize:vec2, screenSize: vec2, matScreenFromWorld: mat4) {
    const pixelsPerTileX = 16; // width of unzoomed tile
    const pixelsPerTileY = 16; // height of unzoomed tile

    const viewTileSizeDesiredX = 32; // desired minimum viewport tile width
    const viewTileSizeDesiredY = 32; // desired minimum viewport tile height

    const viewPixelSizeDesiredX = viewTileSizeDesiredX * pixelsPerTileX;
    const viewPixelSizeDesiredY = viewTileSizeDesiredY * pixelsPerTileY;

    let tileZoom;
    if (screenSize[0] * viewPixelSizeDesiredY < screenSize[1] * viewPixelSizeDesiredX) {
        tileZoom = Math.max(1, Math.floor(screenSize[0] / viewPixelSizeDesiredX + 0.5));
    } else {
        tileZoom = Math.max(1, Math.floor(screenSize[1] / viewPixelSizeDesiredY + 0.5));
    }

    const zoomedPixelsPerTileX = pixelsPerTileX * tileZoom;
    const zoomedPixelsPerTileY = pixelsPerTileY * tileZoom;

    const viewWorldSizeX = screenSize[0] / zoomedPixelsPerTileX;
    const viewWorldSizeY = screenSize[1] / zoomedPixelsPerTileY;

    const viewWorldCenterX = Math.floor(cameraPos[0]*zoomedPixelsPerTileX)/zoomedPixelsPerTileX + 0.5;
    const viewWorldCenterY = Math.floor(cameraPos[1]*zoomedPixelsPerTileX)/zoomedPixelsPerTileX + 0.5;

    const viewWorldMinX = viewWorldCenterX - viewWorldSizeX / 2;
    const viewWorldMinY = viewWorldCenterY - viewWorldSizeY / 2;

    mat4.ortho(
        matScreenFromWorld,
        viewWorldMinX,
        viewWorldMinX + viewWorldSizeX,
        viewWorldMinY,
        viewWorldMinY + viewWorldSizeY,
        1,
        -1
    );
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

function createTextureFromImage(gl: WebGL2RenderingContext, image: HTMLImageElement): WebGLTexture {
    const numGlyphsX = 16;
    const numGlyphsY = 16;
    const numGlyphs = numGlyphsX * numGlyphsY;
    const srcGlyphSizeX = image.naturalWidth / numGlyphsX;
    const srcGlyphSizeY = image.naturalHeight / numGlyphsY;
    const scaleFactor = 1;
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
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, dstGlyphSizeX, dstGlyphSizeY, numGlyphs, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return texture;
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

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
    const parentElement = canvas.parentNode as HTMLElement;
    const rect = parentElement.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
}

