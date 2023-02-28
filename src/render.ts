export { RenderDiscs, RenderGlyphs, Renderer, createRenderer };

import { vec2, mat4 } from './my-matrix';

type GlyphDisc = {
    position: vec2;
    radius: number;
    discColor: number;
    glyphIndex: number;
    glyphColor: number;
}

type RenderGlyphs = {
    start: (matScreenFromWorld: mat4, textureIndex: number) => void;
    addGlyph: (x0: number, y0: number, x1: number, y1: number, glyphIndex: number, color: number) => void;
    flush: () => void;
}

type BeginFrame = (screenSize: vec2) => void;
type RenderDiscs = (matScreenFromWorld: mat4, discs: Array<GlyphDisc>) => void;

type Renderer = {
    beginFrame: BeginFrame;
    renderDiscs: RenderDiscs;
    renderGlyphs: RenderGlyphs;
}

function createRenderer(gl: WebGL2RenderingContext, images: Array<HTMLImageElement>): Renderer {
    const textures = images.map((image) => createTextureFromImage(gl, image));

    const renderer = {
        beginFrame: createBeginFrame(gl),
        renderDiscs: createDiscRenderer(gl, textures[0]),
        renderGlyphs: createGlyphRenderer(gl, textures),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    return renderer;
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

function createGlyphRenderer(gl: WebGL2RenderingContext, textures: Array<WebGLTexture>): RenderGlyphs {
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

    function start(matScreenFromWorld: mat4, textureIndex: number) {
        mat4.copy(matScreenFromWorldCached, matScreenFromWorld);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures[textureIndex]);
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

        gl.uniform1i(uOpacityLoc, 0);

        gl.uniformMatrix4fv(uProjectionMatrixLoc, false, matScreenFromWorldCached);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexDataAsFloat32, 0);

        gl.drawElements(gl.TRIANGLES, 6 * numQuads, gl.UNSIGNED_SHORT, 0);

        gl.bindVertexArray(null);

        numQuads = 0;
    }

    return {
        start: start,
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

function createTextureFromImage(gl: WebGL2RenderingContext, image: HTMLImageElement): WebGLTexture {
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
