"use strict";

window.onload = main;

// Functions

function main() {

    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });

    if (gl == null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    const state = initState();

    const glResources = initGlResources(gl, state.gridSizeX, state.gridSizeY, state.speedField, state.distanceField);

    requestAnimationFrame(now => {
        const t = now / 1000;
        state.tLast = t;
        state.uScroll = t/2 - Math.floor(t/2);
    
        drawScreen(gl, glResources, state);

        requestAnimationFrame(now => updateAndRender(now, gl, glResources, state));
    });
}

function initGlResources(gl, gridSizeX, gridSizeY, speedField, distanceField) {
    const glResources = {
        renderField: createFieldRenderer(gl, gridSizeX, gridSizeY, speedField, distanceField),
        renderDiscs: createDiscRenderer(gl),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1.0);

    return glResources;
}

function initState() {

    const gridSizeX = 32;
    const gridSizeY = 32;

    const speedField = createSpeedField(gridSizeX, gridSizeY);

    const distanceField = Array(gridSizeX).fill().map(() => Array(gridSizeY).fill(Infinity));
    testFastMarchFill(distanceField, speedField);

    const color = { r: 0, g: 0.25, b: 0.85 };
    const discs = Array.from({length: 32}, (_, index) => { return { radius: 0.02, position: { x: Math.random(), y: Math.random() }, color: color } });

    return {
        gridSizeX: gridSizeX,
        gridSizeY: gridSizeY,
        speedField: speedField,
        distanceField: distanceField,
        tLast: 0,
        uScroll: 0,
        discs: discs,
    };
}

function createFieldRenderer(gl, gridSizeX, gridSizeY, speedField, distanceField) {
    const vsSource = `
        attribute vec3 vPosition;
        attribute vec2 vDistance;
        attribute vec2 vSpeed;
        
        uniform mat4 uProjectionMatrix;

        varying highp float fYBlend;
        varying highp vec2 fDistance;
        varying highp vec2 fSpeed;

        void main() {
            gl_Position = uProjectionMatrix * vec4(vPosition.xy, 0, 1);
            fYBlend = vPosition.z;
            fDistance = vDistance;
            fSpeed = vSpeed;
        }
    `;

    const fsSource = `
        varying highp float fYBlend;
        varying highp vec2 fDistance;
        varying highp vec2 fSpeed;

        uniform highp float uScroll;
        uniform sampler2D uContour;

        void main() {
            highp float gamma = 2.2;
            highp float distance = mix(fDistance.x, fDistance.y, fYBlend);
            highp float speed = mix(fSpeed.x, fSpeed.y, fYBlend);
            highp vec3 speedColorLinear = vec3(1, speed, speed);
            highp float s = distance + uScroll;
            highp vec3 distanceColorLinear = pow(texture2D(uContour, vec2(s, 0)).rgb, vec3(gamma));
            highp vec3 colorLinear = speedColorLinear * distanceColorLinear;
            gl_FragColor.rgb = pow(colorLinear, vec3(1.0/gamma));
            gl_FragColor.a = 1.0;
        }
    `;

    const projectionMatrix = new Float32Array(16);
    projectionMatrix.fill(0);
    projectionMatrix[0] = 2 / (gridSizeX - 1);
    projectionMatrix[5] = 2 / (gridSizeY - 1);
    projectionMatrix[10] = 1;
    projectionMatrix[12] = -1;
    projectionMatrix[13] = -1;
    projectionMatrix[15] = 1;

    const program = initShaderProgram(gl, vsSource, fsSource);

    const vertexAttributeLoc = {
        position: gl.getAttribLocation(program, 'vPosition'),
        distance: gl.getAttribLocation(program, 'vDistance'),
        speed: gl.getAttribLocation(program, 'vSpeed'),
    };

    const uniformLoc = {
        projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
        uScroll: gl.getUniformLocation(program, 'uScroll'),
        uContour: gl.getUniformLocation(program, 'uContour'),
    };

    const vertexBuffer = createFieldVertexBuffer(gl, gridSizeX, gridSizeY, speedField, distanceField);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const stride = 28; // seven 4-byte floats
    gl.vertexAttribPointer(vertexAttributeLoc.position, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(vertexAttributeLoc.distance, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(vertexAttributeLoc.speed, 2, gl.FLOAT, false, stride, 20);

    const contourTexture = createStripeTexture(gl);

    return (uScroll) => {
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(vertexAttributeLoc.position);
        gl.enableVertexAttribArray(vertexAttributeLoc.distance);
        gl.enableVertexAttribArray(vertexAttributeLoc.speed);
        const stride = 28; // seven 4-byte floats
        gl.vertexAttribPointer(vertexAttributeLoc.position, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(vertexAttributeLoc.distance, 2, gl.FLOAT, false, stride, 12);
        gl.vertexAttribPointer(vertexAttributeLoc.speed, 2, gl.FLOAT, false, stride, 20);
    
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, contourTexture);
    
        gl.uniform1i(uniformLoc.uContour, 0);

        gl.uniformMatrix4fv(uniformLoc.projectionMatrix, false, projectionMatrix);
    
        gl.uniform1f(uniformLoc.uScroll, uScroll);
    
        gl.drawArrays(gl.TRIANGLES, 0, (gridSizeX - 1) * (gridSizeY - 1) * 6);
    
        gl.disableVertexAttribArray(vertexAttributeLoc.speed);
        gl.disableVertexAttribArray(vertexAttributeLoc.distance);
        gl.disableVertexAttribArray(vertexAttributeLoc.position);
    };
}

function createDiscRenderer(gl) {
    const vsSource = `
        attribute vec2 vPosition;
        
        uniform mat4 uProjectionMatrix;

        varying highp vec2 fPosition;

        void main() {
            fPosition = vPosition;
            gl_Position = uProjectionMatrix * vec4(vPosition.xy, 0, 1);
        }
    `;

    const fsSource = `
        varying highp vec2 fPosition;

        uniform highp vec3 uColor;

        void main() {
            highp float r = length(fPosition);
            highp float opacity = step(-1.0, -r);

            gl_FragColor = vec4(uColor, opacity);
        }
    `;

    const projectionMatrix = new Float32Array(16);
    projectionMatrix.fill(0);
    projectionMatrix[10] = 1;
    projectionMatrix[15] = 1;

    const program = initShaderProgram(gl, vsSource, fsSource);

    const vertexPositionLoc = gl.getAttribLocation(program, 'vPosition');
    const projectionMatrixLoc = gl.getUniformLocation(program, 'uProjectionMatrix');
    const colorLoc = gl.getUniformLocation(program, 'uColor');
    const vertexBuffer = createDiscVertexBuffer(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const stride = 8; // two 4-byte floats
    gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, stride, 0);

    return discs => {
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(vertexPositionLoc);
        gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, 0, 0);

        for (const disc of discs) {
            gl.uniform3f(colorLoc, disc.color.r, disc.color.g, disc.color.b);

            projectionMatrix[0] = disc.radius;
            projectionMatrix[5] = disc.radius;
            projectionMatrix[12] = 2 * disc.position.x - 1;
            projectionMatrix[13] = 2 * disc.position.y - 1;
            gl.uniformMatrix4fv(projectionMatrixLoc, false, projectionMatrix);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    
        gl.disableVertexAttribArray(vertexPositionLoc);
    };
}

function createFieldVertexBuffer(gl, sizeX, sizeY, speedField, distanceField) {
    const vertexInfo = createVertexInfo(sizeX, sizeY, speedField, distanceField);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexInfo, gl.STATIC_DRAW);

    return vertexBuffer;
}

function createDiscVertexBuffer(gl) {
    const v = new Float32Array(6 * 2);
    let i = 0;

    function makeVert(x, y) {
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

function createSpeedField(sizeX, sizeY) {
    const speed = Array(sizeX).fill().map(() => Array(sizeY).fill(1));

    function rect(x0, y0, x1, y1, value) {
        x0 = Math.max(x0, 0);
        x1 = Math.min(x1, sizeX);
        y0 = Math.max(y0, 0);
        y1 = Math.min(y1, sizeY);

        for (let x = x0; x < x1; ++x) {
            for (let y = y0; y < y1; ++y) {
                speed[x][y] = value;
            }
        }
    }

    rect(0, 0, sizeX, sizeY, 1);
    rect(6, 6, sizeX - 6, sizeY - 6, 1000);
    const xc = Math.floor(sizeX / 2);
    rect(7, 7, sizeX - 7, sizeY - 7, 1);
    rect(xc - 2, sizeY - 7, xc + 2, sizeY - 6, 1);
    rect(xc - 3, sizeY - 16, xc - 2, sizeY - 7, 1000);
    rect(xc - 3, sizeY - 17, xc + 4, sizeY - 16, 1000);
    rect(6, sizeY - 6, 14, sizeY, 3);

    return speed;
}

function createVertexInfo(sizeX, sizeY, speedField, distanceField) {
    const v = new Float32Array(7 * 6 * (sizeX - 1) * (sizeY - 1));
    let i = 0;

    function distance(x, y) {
        return distanceField[x][y];
    }

    function speed(x, y) {
        return 1 / speedField[x][y];
    }

    function makeVert(x, y, s, d0, d1, c0, c1) {
        v[i++] = x;
        v[i++] = y;
        v[i++] = s;
        v[i++] = d0;
        v[i++] = d1;
        v[i++] = c0;
        v[i++] = c1;
    }

    for (let x = 0; x < sizeX - 1; ++x) {
        for (let y = 0; y < sizeY - 1; ++y) {
            const dist00 = distance(x, y);
            const dist10 = distance(x+1, y);
            const dist01 = distance(x, y+1);
            const dist11 = distance(x+1, y+1);
            const speed00 = speed(x, y);
            const speed10 = speed(x+1, y);
            const speed01 = speed(x, y+1);
            const speed11 = speed(x+1, y+1);
            makeVert(x, y, 0, dist00, dist01, speed00, speed01);
            makeVert(x+1, y, 0, dist10, dist11, speed10, speed11);
            makeVert(x, y+1, 1, dist00, dist01, speed00, speed01);
            makeVert(x, y+1, 1, dist00, dist01, speed00, speed01);
            makeVert(x+1, y, 0, dist10, dist11, speed10, speed11);
            makeVert(x+1, y+1, 1, dist10, dist11, speed10, speed11);
        }
    }

    return v;
}

function updateAndRender(now, gl, glResources, state) {
    const t = now / 1000;
    const dt = Math.min(1/30, t - state.tLast);
    state.tLast = t;
    state.uScroll = t/2 - Math.floor(t/2);
    for (const disc of state.discs) {
        updateDisc(state.gridSizeX, state.gridSizeY, state.distanceField, dt, disc);
    }
    drawScreen(gl, glResources, state);

    requestAnimationFrame(now => updateAndRender(now, gl, glResources, state));
}

function updateDisc(gridSizeX, gridSizeY, distanceField, dt, disc) {
    const dist = estimateDistance(gridSizeX, gridSizeY, distanceField, disc.position.x, disc.position.y);
    if (dist < 0.1) {
        disc.position.x = Math.random();
        disc.position.y = Math.random();
    } else {
        const gradient = estimateGradient(gridSizeX, gridSizeY, distanceField, disc.position.x, disc.position.y);

        const gradientLen = Math.sqrt(gradient.x**2 + gradient.y**2);

        const speed = 4 / gridSizeX;
        const dist = speed * dt / Math.max(1e-8, gradientLen);
    
        disc.position.x -= gradient.x * dist;
        disc.position.y -= gradient.y * dist;
    }
}

function drawScreen(gl, glResources, state) {
    resizeCanvasToDisplaySize(gl.canvas);

    const screenX = gl.canvas.clientWidth;
    const screenY = gl.canvas.clientHeight;

    gl.viewport(0, 0, screenX, screenY);
    gl.clear(gl.COLOR_BUFFER_BIT);

    glResources.renderField(state.uScroll);
    glResources.renderDiscs(state.discs);
}

function resizeCanvasToDisplaySize(canvas) {
    const displayWidth  = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width  !== displayWidth || canvas.height !== displayHeight) {
        canvas.width  = displayWidth;
        canvas.height = displayHeight;
    }
}

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
        return null;
    }

    return program;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function createStripeTexture(gl) {
    const stripeImageWidth = 64;
    const stripeImage = new Uint8Array(stripeImageWidth);
    for (let j = 0; j < stripeImageWidth; ++j) {
        stripeImage[j] = 224 + (stripeImageWidth - j) / 4;
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const level = 0;
    const internalFormat = gl.LUMINANCE;
    const srcFormat = gl.LUMINANCE;
    const srcType = gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, stripeImageWidth, 1, 0, srcFormat, srcType, stripeImage);
    gl.generateMipmap(gl.TEXTURE_2D);

    return texture;
}

function priorityQueuePop(q) {
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

function priorityQueuePush(q, x) {
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

function testFastMarchFill(field, speed) {
    let toVisit = [{priority: 0, x: 2, y: 7}];
    fastMarchFill(field, toVisit, (x, y) => estimatedDistanceWithSpeed(field, speed, x, y));
}

function fastMarchFill(field, toVisit, estimatedDistance) {
    while (toVisit.length > 0) {
        const {priority, x, y} = priorityQueuePop(toVisit);
        if (field[x][y] <= priority) {
            continue;
        }

        field[x][y] = priority;

        if (x < field.length - 1) {
            const d = estimatedDistance(x + 1, y);
            if (d < field[x+1][y]) {
                priorityQueuePush(toVisit, {priority: d, x: x+1, y: y});
            }
        }

        if (x > 0) {
            const d = estimatedDistance(x - 1, y);
            if (d < field[x-1][y]) {
                priorityQueuePush(toVisit, {priority: d, x: x-1, y: y});
            }
        }

        if (y < field[x].length - 1) {
            const d = estimatedDistance(x, y + 1);
            if (d < field[x][y+1]) {
                priorityQueuePush(toVisit, {priority: d, x: x, y: y+1});
            }
        }

        if (y > 0) {
            const d = estimatedDistance(x, y - 1);
            if (d < field[x][y-1]) {
                priorityQueuePush(toVisit, {priority: d, x: x, y: y-1});
            }
        }
    }
}

function estimatedDistanceWithSpeed(field, speed, x, y) {
    const dXNeg = (x > 0) ? field[x-1][y] : Infinity;
    const dXPos = (x < field.length - 1) ? field[x+1][y] : Infinity;
    const dYNeg = (y > 0) ? field[x][y-1] : Infinity;
    const dYPos = (y < field[x].length - 1) ? field[x][y+1] : Infinity;

    const dXMin = Math.min(dXNeg, dXPos);
    const dYMin = Math.min(dYNeg, dYPos);

    const timeHorizontal = speed[x][y];

    const d = (Math.abs(dXMin - dYMin) <= timeHorizontal) ?
        ((dXMin + dYMin) + Math.sqrt((dXMin + dYMin)**2 - 2 * (dXMin**2 + dYMin**2 - timeHorizontal**2))) / 2:
        Math.min(dXMin, dYMin) + timeHorizontal;

    return d;
}

function safeDistance(gridSizeX, gridSizeY, distanceField, x, y) {
    if (x < 0 || y < 0 || x >= (gridSizeX - 1) || y >= (gridSizeY - 1))
        return 1e4;

    return distanceField[x][y];
}

function estimateGradient(gridSizeX, gridSizeY, distanceField, x, y) {

    x *= (gridSizeX - 1);
    y *= (gridSizeY - 1);

    const uX = x - Math.floor(x);
    const uY = y - Math.floor(y);

    const gridX = Math.floor(x);
    const gridY = Math.floor(y);

    const d00 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX, gridY);
    const d10 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX + 1, gridY);
    const d01 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX, gridY + 1);
    const d11 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX + 1, gridY + 1);

    const gradX = (d10 - d00) * (1 - uY) + (d11 - d01) * uY;
    const gradY = (d01 - d00) * (1 - uX) + (d11 - d10) * uX;

    return { x: gradX, y: gradY };
}

function estimateDistance(gridSizeX, gridSizeY, distanceField, x, y) {

    x *= (gridSizeX - 1);
    y *= (gridSizeY - 1);

    const uX = x - Math.floor(x);
    const uY = y - Math.floor(y);

    const gridX = Math.floor(x);
    const gridY = Math.floor(y);

    const d00 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX, gridY);
    const d10 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX + 1, gridY);
    const d01 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX, gridY + 1);
    const d11 = safeDistance(gridSizeX, gridSizeY, distanceField, gridX + 1, gridY + 1);

    const d0 = d00 + (d10 - d00) * uX;
    const d1 = d01 + (d11 - d01) * uX;
    const d = d0 + (d1 - d0) * uY;

    return d;
}
