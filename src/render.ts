export { Renderer, GlyphRenderer, createRenderer };

import { vec2, mat4 } from './my-matrix';

function createRenderer(name:string='webgl', canvas:HTMLCanvasElement, images: Array<HTMLImageElement>):Renderer {
    if(name==='webgl') {
        const ctx = canvas.getContext("webgl2", { alpha: false, depth: false }) as WebGL2RenderingContext;
        return new WebGLRenderer(ctx, images); 
    } 
    if(name==='canvas') {
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        return new CanvasRenderer(ctx, images); 
    } 
    if(name==='null') {
        return new Renderer(); 
    } 
    throw new Error(`Invalid renderer ${name}`)    
}

class GlyphRenderer {
    start(matScreenFromWorld: mat4, textureIndex: number):void {}
    addGlyph(x0: number, y0: number, x1: number, y1: number, glyphIndex: number|[number,number], color: number):void {}
    flush():void {}
}

class Renderer {
    name: string = 'null';
    renderGlyphs: GlyphRenderer;
    constructor() {
        this.renderGlyphs = new GlyphRenderer();
    }
    beginFrame(screenSize: vec2, mapSize:vec2) {
    };
    endFrame() {}
} 

// #####################
// Web-GL Renderer
// #####################

class WebGLRenderer extends Renderer {
    gl: WebGL2RenderingContext;
    constructor(gl: WebGL2RenderingContext, images: Array<HTMLImageElement>) {
        super();
        this.gl = gl;
        const textures = images.map((image) => createTextureFromImage(gl, image));
    
        this.name = 'webgl';
        this.renderGlyphs = new WebGLGlyphRenderer(gl, textures),
    
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
    }
    beginFrame(screenSize:vec2, mapSize:vec2) {
        const gl = this.gl;
        const canvas = gl.canvas as HTMLCanvasElement;

        resizeCanvasToDisplaySize(canvas); //TODO: Put this in a listener for window size changes

        const screenX = canvas.clientWidth;
        const screenY = canvas.clientHeight;
    
        gl.viewport(0, 0, screenX, screenY);
        gl.clear(gl.COLOR_BUFFER_BIT);

        vec2.set(screenSize, screenX, screenY);
    }
    endFrame() {}
}

class WebGLGlyphRenderer extends GlyphRenderer {
    constructor(gl: WebGL2RenderingContext, textures: Array<WebGLTexture>) {
        super();
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

        this.start = (matScreenFromWorld: mat4, textureIndex: number) => {
            mat4.copy(matScreenFromWorldCached, matScreenFromWorld);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures[textureIndex]);
        }

        this.addGlyph = (x0: number, y0: number, x1: number, y1: number, glyphIndex: number, color: number) => {
            if (numQuads >= maxQuads) {
                this.flush();
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

// #####################
// Canvas-based Renderer
// #####################

class CanvasRenderer extends Renderer {
    ctx: CanvasRenderingContext2D;
    shake: vec2;
    offset: vec2;
    gridCellSize: vec2;
    renderGlyphs: CanvasGlyphRenderer;
    constructor(ctx: CanvasRenderingContext2D, images: Array<HTMLImageElement>) {
        super();
        const textures = images.map(im => new SpriteSheet(ctx, flattenImage(im), [16,16]));
        this.name = 'canvas';
        this.ctx = ctx;
        this.renderGlyphs = new CanvasGlyphRenderer(textures);
//        this.gridCellSize = [24,24];
        this.gridCellSize = [16,16]; //size in pixel of each cell
        this.offset = [0,0];
        this.shake = [0,0];
    }
    beginFrame(screenSize:vec2, mapSize:vec2) {
        resizeCanvasToDisplaySize(this.ctx.canvas);
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.offset[0] + this.shake[0], this.offset[1] + this.shake[1]);
        this.ctx.scale(...this.gridCellSize);
        // this.ctx.translate(this.offset[0] + this.shake[0], this.ctx.canvas.height - this.offset[1] - this.shake[1]);
        // this.ctx.scale(this.gridCellSize[0], -this.gridCellSize[1]);
        this.renderGlyphs.mapSize = mapSize;
        vec2.set(screenSize, this.ctx.canvas.width, this.ctx.canvas.height);
    }
    endFrame() {
        this.ctx.restore();
    }
}

class CanvasGlyphRenderer extends GlyphRenderer {
    textures: Array<SpriteSheet>;
    activeTexture: SpriteSheet|null;
    tileSize: vec2;
    mapSize: vec2;
    constructor(textures: Array<SpriteSheet>) { //ctx: CanvasRenderingContext2D, 
        super();
        this.textures = textures;
        this.activeTexture = null;
//        this.tileSize = [24,36];
        this.tileSize = [16,16];
        this.mapSize = [0,0];
    }
    start(matScreenFromWorld: mat4, textureIndex: number) {
        this.activeTexture = this.textures[textureIndex];
        this.activeTexture.ctx.imageSmoothingEnabled = false;
    }
    addGlyph(x0: number, y0: number, x1: number, y1: number, glyphIndex: number|[number, number], color: number) {
        //todo: use color
        if(this.activeTexture!==null) this.activeTexture.draw(glyphIndex, x0, this.mapSize[1]-y0);
    }
    flush() {
    }
}

class SpriteSheet {
    spriteSize:[number,number];
    sheet:HTMLImageElement;
    ctx:CanvasRenderingContext2D;
    constructor(ctx: CanvasRenderingContext2D, src_file:string, spriteSize:[number,number]=[16,16]) {
        this.spriteSize = spriteSize;
        this.sheet = new Image();
        this.sheet.src = src_file;
        this.ctx = ctx;
    }
    draw(spriteLoc:number|[number,number], x:number, y:number, flipx:boolean=false):void {
        if(typeof spriteLoc==='number') spriteLoc = [0,spriteLoc];
        let flipped = 1 - 2*Number(flipx);
        if(flipx) {
            this.ctx.scale(-1,1);
        }
        this.ctx.drawImage(
            this.sheet,
            spriteLoc[0]*this.spriteSize[0],
            spriteLoc[1]*this.spriteSize[1],
            this.spriteSize[0],
            this.spriteSize[1],
            flipped*x,
            y,
            flipped,
            1
        );
        if(flipx) {
            this.ctx.scale(-1,1);
        }
    }
    drawScaled(spriteLoc:[number,number], x:number, y:number, scale:number, flipx=false):void {
        let flipped = 1 - 2*Number(flipx);
        if(flipx) {
            this.ctx.scale(-1,1);
        }
        this.ctx.drawImage(
            this.sheet,
            spriteLoc[0]*this.spriteSize[0],
            spriteLoc[1]*this.spriteSize[1],
            this.spriteSize[0],
            this.spriteSize[1],
            flipped*(x),
            y,
            flipped*scale,
            scale
        );
        if(flipx) {
            this.ctx.scale(-1,1);
        }
    }
    drawRotated(spriteLoc:[number,number], x:number, y:number, angle:number, flipx:boolean=false, 
            anchor:[number,number]|'center'='center'):void {
        this.ctx.save();
        if(anchor=='center') anchor = [0.5, 0.5];
        this.ctx.translate(x, y);
        this.ctx.rotate(angle * Math.PI / 180);
        if(flipx) this.ctx.scale(-1,1);
        this.ctx.translate(-anchor[0], -anchor[1]);
        this.ctx.drawImage(
            this.sheet,
            spriteLoc[0]*this.spriteSize[0],
            spriteLoc[1]*this.spriteSize[1],
            this.spriteSize[0],
            this.spriteSize[1],
            0,
            0,
            1,
            1
        );
        this.ctx.restore();
    }
    drawRotatedMultitile(spriteLoc:[number,number,number,number], x:number, y:number, angle:number, 
            flipx:boolean=false, anchor:[number,number]|'center'='center'):void { 
        //same as drawRotated but spriteloc is 4-item array referencing the sprite location: [x,y,w,h]
        this.ctx.save();
        let tw = spriteLoc[2];
        let th = spriteLoc[3];
        if(anchor == 'center') anchor = [tw/2,th/2];
        this.ctx.translate(x + anchor[0], y + anchor[1]);
        this.ctx.rotate(angle * Math.PI / 180);
        if(flipx) {
            this.ctx.scale(-1,1);
        }
        this.ctx.translate(-anchor[0], -anchor[1]);
        this.ctx.drawImage(
            this.sheet,
            spriteLoc[0]*this.spriteSize[0],
            spriteLoc[1]*this.spriteSize[1],
            this.spriteSize[0]*tw,
            this.spriteSize[1]*th,
            0,
            0,
            tw,
            th
        );
        this.ctx.restore();
    }
}


function flattenImage(image: HTMLImageElement): string {
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
    return canvas.toDataURL();
}