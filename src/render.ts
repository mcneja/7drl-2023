export { Renderer };
import { TileSet, FontTileSet, TileInfo } from './tilesets';
import { vec2, mat4 } from './my-matrix';

// #####################
// Web-GL Renderer
// #####################

class Renderer {
    getScreenSize(screenSize: vec2) {}
    beginFrame = (screenSize:vec2) => {}
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
            in vec4 vPositionTexcoord;
            in vec4 vColor;

            uniform mat4 uMatScreenFromWorld;

            out highp vec2 fTexcoord;
            out highp vec4 fColor;

            void main() {
                fTexcoord = vPositionTexcoord.zw;
                fColor = vColor;
                gl_Position = uMatScreenFromWorld * vec4(vPositionTexcoord.xy, 0, 1);
            }
        `;

        const fsSource = `#version 300 es
            in highp vec2 fTexcoord;
            in highp vec4 fColor;

            uniform highp sampler2D uOpacity;

            out lowp vec4 fragColor;

            void main() {
                fragColor = fColor * texture(uOpacity, fTexcoord);
            }
        `;

        const attribs = {
            vPositionTexcoord: 0,
            vColor: 1,
        };

        const tileRatios = [tileSet.tileSize[0]/tileSet.cellSize[0], tileSet.tileSize[1]/tileSet.cellSize[1]]

        const program = initShaderProgram(gl, vsSource, fsSource, attribs);

        const uProjectionMatrixLoc = gl.getUniformLocation(program, 'uMatScreenFromWorld');
        const uOpacityLoc = gl.getUniformLocation(program, 'uOpacity');

        const maxQuads = 64;
        const numVertices = 4 * maxQuads;
        const bytesPerVertex = 4 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT;
        const wordsPerQuad = bytesPerVertex; // divide by four bytes per word, but also multiply by four vertices per quad

        const vertexData = new ArrayBuffer(numVertices * bytesPerVertex);
        const vertexDataAsFloat32 = new Float32Array(vertexData);
        const vertexDataAsUint32 = new Uint32Array(vertexData);

        const vertexBuffer = gl.createBuffer();

        let numQuads = 0;

        const matScreenFromWorldCached = mat4.create();

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(attribs.vPositionTexcoord);
        gl.enableVertexAttribArray(attribs.vColor);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(attribs.vPositionTexcoord, 4, gl.FLOAT, false, bytesPerVertex, 0);
        gl.vertexAttribPointer(attribs.vColor, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 16);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
        const indexBuffer = createGlyphIndexBuffer(gl, maxQuads);
        gl.bindVertexArray(null);

        this.getScreenSize = (screenSize: vec2) => {
            const canvas = gl.canvas as HTMLCanvasElement;
            resizeCanvasToDisplaySize(canvas);
            const screenX = canvas.clientWidth;
            const screenY = canvas.clientHeight;
            vec2.set(screenSize, screenX, screenY);
        }
    
        this.start = (matScreenFromWorld: mat4, textureIndex: number) => {
            mat4.copy(matScreenFromWorldCached, matScreenFromWorld);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, textures[textureIndex]);
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

            const r = 1/16;
            const texCoordMinX = r * (tileInfo.textureIndex % 16);
            const texCoordMinY = r * Math.floor(tileInfo.textureIndex / 16);
            const texCoordMaxX = texCoordMinX + r;
            const texCoordMaxY = texCoordMinY + r;

            vertexDataAsFloat32[i+0] = x0;
            vertexDataAsFloat32[i+1] = y0;
            vertexDataAsFloat32[i+2] = texCoordMinX;
            vertexDataAsFloat32[i+3] = texCoordMaxY;
            vertexDataAsUint32[i+4] = color;

            vertexDataAsFloat32[i+5] = x1;
            vertexDataAsFloat32[i+6] = y0;
            vertexDataAsFloat32[i+7] = texCoordMaxX;
            vertexDataAsFloat32[i+8] = texCoordMaxY;
            vertexDataAsUint32[i+9] = color;

            vertexDataAsFloat32[i+10] = x0;
            vertexDataAsFloat32[i+11] = y1;
            vertexDataAsFloat32[i+12] = texCoordMinX;
            vertexDataAsFloat32[i+13] = texCoordMinY;
            vertexDataAsUint32[i+14] = color;

            vertexDataAsFloat32[i+15] = x1;
            vertexDataAsFloat32[i+16] = y1;
            vertexDataAsFloat32[i+17] = texCoordMaxX;
            vertexDataAsFloat32[i+18] = texCoordMinY;
            vertexDataAsUint32[i+19] = color;

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
        this.beginFrame = (screenSize:vec2) => {
            const canvas = gl.canvas as HTMLCanvasElement;
    
            resizeCanvasToDisplaySize(canvas); //TODO: Put this in a listener for window size changes
    
            const screenX = canvas.clientWidth;
            const screenY = canvas.clientHeight;
        
            gl.viewport(0, 0, screenX, screenY);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
    }
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
    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
