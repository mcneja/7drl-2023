"use strict";

window.onload = main;

class Float64Grid {
    constructor(sizeX, sizeY, initialValue) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Float64Array(sizeX * sizeY);
        this.fill(initialValue);
    }

    fill(value) {
        this.values.fill(value);
    }

    get(x, y) {
        return this.values[this.sizeX * y + x];
    }

    set(x, y, value) {
        this.values[this.sizeX * y + x] = value;
    }
}

function main() {

    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl", { alpha: false, depth: false });

    if (gl == null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    const glResources = initGlResources(gl);
    const state = initState();

    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;

    canvas.onclick = () => {
        if (state.paused) {
            canvas.requestPointerLock();
        } else {
            resetState(state);
            document.exitPointerLock();
        }
    };

    function requestUpdateAndRender() {
        requestAnimationFrame(now => updateAndRender(now, gl, glResources, state));
    }

    function onLockChanged() {
        const mouseCaptured =
            document.pointerLockElement === canvas ||
            document.mozPointerLockElement === canvas;
        if (mouseCaptured) {
            document.addEventListener("mousemove", onMouseMoved, false);
            if (state.paused) {
                state.paused = false;
                state.tLast = undefined;
                state.player.velocity.x = 0;
                state.player.velocity.y = 0;
                requestUpdateAndRender();
            }
        } else {
            document.removeEventListener("mousemove", onMouseMoved, false);
            state.paused = true;
        }
    }

    function onMouseMoved(e) {
        updatePosition(state, e);
    }

    function onWindowResized() {
        requestUpdateAndRender();
    }

    document.addEventListener('pointerlockchange', onLockChanged, false);
    document.addEventListener('mozpointerlockchange', onLockChanged, false);

    window.addEventListener('resize', onWindowResized);

    requestUpdateAndRender();
}

function updatePosition(state, e) {
    if (!state.player.dead) {
        const sensitivity = 0.002;
        state.player.velocity.x += e.movementX * sensitivity;
        state.player.velocity.y -= e.movementY * sensitivity;
    }
}

function initGlResources(gl) {
    gl.getExtension('OES_standard_derivatives');

    const glResources = {
        renderField: createFieldRenderer(gl),
        renderDiscs: createDiscRenderer(gl),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0.95, 0.94, 0.94, 1);

    return glResources;
}

function initState() {
    const state = {};
    resetState(state);
    return state;
}

function resetState(state) {
    const gridSizeX = 64;
    const gridSizeY = 64;

    const player = {
        radius: 0.0125,
        position: { x: 0.5, y: 0.5 },
        velocity: { x: 0, y: 0 },
        color: { r: 0.8, g: 0.6, b: 0 },
        dead: false,
    };

    const enemyRadius = 0.0125;

    const obstacles = createObstacles(player.position);
    const collectibles = createCollectibles(obstacles);
    const costRateField = createCostRateField(gridSizeX, gridSizeY, enemyRadius, obstacles);
    const distanceFromWallsField = createDistanceFromWallsField(costRateField);
    const costRateFieldSmooth = createSmoothedCostRateField(distanceFromWallsField);
    const distanceField = createDistanceField(costRateFieldSmooth, player.position);
    const discs = createEnemies(obstacles, enemyRadius, player.position);

    state.costRateField = costRateFieldSmooth;
    state.distanceField = distanceField;
    state.paused = true;
    state.gameOver = false;
    state.tLast = undefined;
    state.discs = discs;
    state.obstacles = obstacles;
    state.collectibles = collectibles;
    state.player = player;
}

function createEnemies(obstacles, enemyRadius, playerPosition) {
    const enemies = [];
    const separationFromObstacle = 0.02 + enemyRadius;
    const separationFromAlly = 0.05;
    const enemyColor = { r: 0, g: 0.25, b: 0.85 };
    const playerDisc = { radius: 0.25, position: playerPosition };
    const angle = Math.random() * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    for (let i = 0; i < 1000 && enemies.length < 128; ++i) {
        const enemy = {
            radius: enemyRadius,
            position: {
                x: separationFromObstacle + (1 - 2*separationFromObstacle) * Math.random(),
                y: separationFromObstacle + (1 - 2*separationFromObstacle) * Math.random(),
            },
            velocity: {
                x: 0,
                y: 0,
            },
            color: enemyColor,
            dead: false,
        };
        const dx = enemy.position.x - 0.5;
        const dy = enemy.position.y - 0.5;
        const d = dirX * dx + dirY * dy;
        if (d < 0) {
            continue;
        }
        if (!discOverlapsDiscs(enemy, obstacles, separationFromObstacle - enemyRadius) &&
            !discOverlapsDiscs(enemy, enemies, separationFromAlly) &&
            !discsOverlap(enemy, playerDisc)) {
            enemies.push(enemy);
        }
    }
    return enemies;
}

function createObstacles(playerPosition) {
    const obstacles = [];
    const radius = 0.05;
    const separation = -0.02;
    const playerDisc = { radius: 0.05, position: playerPosition };
    const color = { r: 0.25, g: 0.25, b: 0.25 };
    for (let i = 0; i < 1000 && obstacles.length < 16; ++i) {
        const obstacle = {
            radius: radius,
            position: {
                x: radius + (1 - 2*radius) * Math.random(),
                y: radius + (1 - 2*radius) * Math.random(),
            },
            color: color,
        };
        if (!discOverlapsDiscs(obstacle, obstacles, separation) &&
            !discsOverlap(obstacle, playerDisc)) {
            obstacles.push(obstacle);
        }
    }
    return obstacles;
}

function createCollectibles(obstacles) {
    const collectibles = [];
    const radius = 0.01;
    const separationFromObstacle = 0.02;
    const separationFromCollectible = 0.05;
    const color = { r: 0, g: 0.9, b: 0 };
    for (let i = 0; i < 1000 && collectibles.length < 128; ++i) {
        const collectible = {
            radius: radius,
            position: {
                x: radius + separationFromObstacle + (1 - 2*(radius + separationFromObstacle)) * Math.random(),
                y: radius + separationFromObstacle + (1 - 2*(radius + separationFromObstacle)) * Math.random(),
            },
            color: color,
        };
        if (!discOverlapsDiscs(collectible, obstacles, separationFromObstacle) &&
            !discOverlapsDiscs(collectible, collectibles, separationFromCollectible)) {
            collectibles.push(collectible);
        }
    }
    return collectibles;
}

function discOverlapsDiscs(disc, discs, minSeparation) {
    for (const disc2 of discs) {
        const dx = disc2.position.x - disc.position.x;
        const dy = disc2.position.y - disc.position.y;
        if (dx**2 + dy**2 < (disc2.radius + disc.radius + minSeparation)**2) {
            return true;
        }
    }
    return false;
}

function discsOverlap(disc0, disc1) {
    const dx = disc1.position.x - disc0.position.x;
    const dy = disc1.position.y - disc0.position.y;
    return dx**2 + dy**2 < (disc1.radius + disc0.radius)**2;
}

function createFieldRenderer(gl) {
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
    projectionMatrix[0] = 1;
    projectionMatrix[5] = 1;
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

    const vertexBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const stride = 28; // seven 4-byte floats
    gl.vertexAttribPointer(vertexAttributeLoc.position, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribPointer(vertexAttributeLoc.distance, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribPointer(vertexAttributeLoc.speed, 2, gl.FLOAT, false, stride, 20);

    const contourTexture = createStripeTexture(gl);

    return (costRateField, distanceField, uScroll) => {
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

        const vertexInfo = createVertexInfo(costRateField, distanceField);
        gl.bufferData(gl.ARRAY_BUFFER, vertexInfo, gl.DYNAMIC_DRAW);

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

        const gridSizeX = costRateField.sizeX;
        const gridSizeY = costRateField.sizeY;

        projectionMatrix[0] = 2 / (gridSizeX - 1);
        projectionMatrix[5] = 2 / (gridSizeY - 1);
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
        #extension GL_OES_standard_derivatives : enable

        varying highp vec2 fPosition;

        uniform highp vec3 uColor;

        void main() {
            highp float r = length(fPosition);
            highp float aaf = fwidth(r);
            highp float opacity = 1.0 - smoothstep(1.0 - aaf, 1.0, r);
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

            projectionMatrix[0] = 2 * disc.radius;
            projectionMatrix[5] = 2 * disc.radius;
            projectionMatrix[12] = 2 * disc.position.x - 1;
            projectionMatrix[13] = 2 * disc.position.y - 1;
            gl.uniformMatrix4fv(projectionMatrixLoc, false, projectionMatrix);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
    
        gl.disableVertexAttribArray(vertexPositionLoc);
    };
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

function createVertexInfo(costRateField, distanceField) {
    const sizeX = costRateField.sizeX;
    const sizeY = costRateField.sizeY;
    const v = new Float32Array(7 * 6 * (sizeX - 1) * (sizeY - 1));
    let i = 0;

    function distance(x, y) {
        return distanceField.get(x, y);
    }

    function speed(x, y) {
        return 1 / costRateField.get(x, y);
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

    for (let y = 0; y < sizeY - 1; ++y) {
        for (let x = 0; x < sizeX - 1; ++x) {
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
    const dt = (state.paused || state.tLast === undefined) ? 0 : Math.min(1/30, t - state.tLast);
    state.tLast = t;

    if (dt > 0) {
        updateState(state, dt);
    }

    drawScreen(gl, glResources, state);

    if (!state.paused) {
        requestAnimationFrame(now => updateAndRender(now, gl, glResources, state));
    }
}

function updateState(state, dt) {

    if (state.player.dead) {
        const r = Math.exp(-dt);
        state.player.velocity.x *= r;
        state.player.velocity.y *= r;
    }

    state.player.position.x += state.player.velocity.x * dt;
    state.player.position.y += state.player.velocity.y * dt;

    for (const obstacle of state.obstacles) {
        fixupPositionAndVelocityAgainstDisc(state.player, obstacle);
    }

    fixupPositionAndVelocityAgainstBoundary(state.player);

    state.collectibles = state.collectibles.filter(collectible => !discsOverlap(state.player, collectible));
    if (state.collectibles.length <= 0) {
        state.gameOver = true;
    }

    updateDistanceField(state.costRateField, state.distanceField, state.player.position);

    const discSpeed = 0.2 - 0.15 * Math.min(state.collectibles.length, 80) / 80;

    let enemyDied = false;
    for (const disc of state.discs) {
        updateEnemy(state.distanceField, dt, discSpeed, state.player, disc);
        if (disc.dead) {
            enemyDied = true;
            if (!state.gameOver) {
                state.player.dead = true;
                state.player.color.r *= 0.5;
                state.player.color.g *= 0.5;
                state.player.color.b *= 0.5;
                state.gameOver = true;
            }
        }
    }

    if (enemyDied) {
        state.discs = state.discs.filter(disc => !disc.dead);
    }

    for (let k = 0; k < 3; ++k) {
        for (let i = 0; i < state.discs.length; ++i) {
            for (let j = i + 1; j < state.discs.length; ++j) {
                fixupDiscPairs(state.discs[i], state.discs[j]);
            }

            for (const obstacle of state.obstacles) {
                fixupPositionAndVelocityAgainstDisc(state.discs[i], obstacle);
            }

            fixupPositionAndVelocityAgainstBoundary(state.discs[i]);
        }
    }
}

function updateEnemy(distanceField, dt, discSpeed, player, disc) {
    if (discsOverlap(disc, player)) {
        disc.dead = true;
        return;
    }

    const gradient = estimateGradient(distanceField, disc.position.x, disc.position.y);

    const gradientLen = Math.sqrt(gradient.x**2 + gradient.y**2);

    const scale = discSpeed / Math.max(1e-8, gradientLen);

    const vxPrev = disc.velocity.x;
    const vyPrev = disc.velocity.y;

    const vxTarget = gradient.x * -scale;
    const vyTarget = gradient.y * -scale;

    let dvx = vxTarget - disc.velocity.x;
    let dvy = vyTarget - disc.velocity.y;
    const dv = Math.sqrt(dvx**2 + dvy**2);

    const maxDv = 25 * (discSpeed**2) * dt;

    if (dv > maxDv) {
        dvx *= maxDv / dv;
        dvy *= maxDv / dv;
    }

    disc.velocity.x += dvx;
    disc.velocity.y += dvy;

    disc.position.x += (vxPrev + disc.velocity.x) * dt / 2;
    disc.position.y += (vyPrev + disc.velocity.y) * dt / 2;
}

function fixupDiscPairs(disc0, disc1) {
    const dx = disc1.position.x - disc0.position.x;
    const dy = disc1.position.y - disc0.position.y;
    const d = Math.sqrt(dx**2 + dy**2);
    const dist = d - (disc0.radius + disc1.radius);

    if (dist < 0) {
        disc0.position.x += dx * dist / (2 * d);
        disc0.position.y += dy * dist / (2 * d);
        disc1.position.x -= dx * dist / (2 * d);
        disc1.position.y -= dy * dist / (2 * d);

        const vx = disc1.velocity.x - disc0.velocity.x;
        const vy = disc1.velocity.y - disc0.velocity.y;
        const vn = vx * dx + vy * dy;
        if (vn < 0) {
            disc0.velocity.x += vn * dx / (2 * d**2);
            disc0.velocity.y += vn * dy / (2 * d**2);
            disc1.velocity.x -= vn * dx / (2 * d**2);
            disc1.velocity.y -= vn * dy / (2 * d**2);
        }
    }
}

function fixupPositionAndVelocityAgainstBoundary(disc) {
    if (disc.position.x < disc.radius) {
        disc.position.x = disc.radius;
        disc.velocity.x = 0;
    } else if (disc.position.x > 1 - disc.radius) {
        disc.position.x = 1 - disc.radius;
        disc.velocity.x = 0;
    }
    if (disc.position.y < disc.radius) {
        disc.position.y = disc.radius;
        disc.velocity.y = 0;
    } else if (disc.position.y > 1 - disc.radius) {
        disc.position.y = 1 - disc.radius;
        disc.velocity.y = 0;
    }
}

function fixupPositionAndVelocityAgainstDisc(disc, obstacle) {
    const dx = disc.position.x - obstacle.position.x;
    const dy = disc.position.y - obstacle.position.y;
    const d = Math.sqrt(dx**2 + dy**2);
    const dist = d - (disc.radius + obstacle.radius);

    if (dist < 0) {
        disc.position.x -= dx * dist / d;
        disc.position.y -= dy * dist / d;

        const vn = disc.velocity.x * dx + disc.velocity.y * dy;
        if (vn < 0) {
            disc.velocity.x -= vn * dx / d**2;
            disc.velocity.y -= vn * dy / d**2;
        }
    }
}

function drawScreen(gl, glResources, state) {
    resizeCanvasToDisplaySize(gl.canvas);

    const screenX = gl.canvas.clientWidth;
    const screenY = gl.canvas.clientHeight;

    gl.viewport(0, 0, screenX, screenY);
    gl.clear(gl.COLOR_BUFFER_BIT);

    glResources.renderField(state.costRateField, state.distanceField, 0);
    glResources.renderDiscs(state.obstacles);
    glResources.renderDiscs(state.collectibles);
    glResources.renderDiscs(state.discs);
    glResources.renderDiscs([state.player]);
}

function resizeCanvasToDisplaySize(canvas) {
    const rect = canvas.parentNode.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
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

function createCostRateField(sizeX, sizeY, enemyRadius, obstacles) {
    const costRate = new Float64Grid(sizeX, sizeY, 1);

    function dist(x, y) {
        let minDist = Infinity;
        x /= sizeX - 1;
        y /= sizeY - 1;
        for (const obstacle of obstacles) {
            const dx = x - obstacle.position.x;
            const dy = y - obstacle.position.y;
            const dist = Math.sqrt(dx**2 + dy**2) - (obstacle.radius + enemyRadius);
            minDist = Math.min(minDist, dist);
        }
        minDist = Math.max(0, minDist);
        return minDist * (sizeX - 1);
    }

    for (let y = 0; y < sizeY; ++y) {
        for (let x = 0; x < sizeX; ++x) {
            const d = dist(x, y);
            costRate.set(x, y, (d <= 0) ? 1000 : 1);
        }
    }

    return costRate;
}

function createSmoothedCostRateField(distanceFromWallsField) {
    const sizeX = distanceFromWallsField.sizeX;
    const sizeY = distanceFromWallsField.sizeY;

    const costRateFieldSmooth = new Float64Grid(sizeX, sizeY, 1);

    for (let y = 0; y < sizeY; ++y) {
        for (let x = 0; x < sizeX; ++x) {
            const distance = distanceFromWallsField.get(x, y);

            const costRate = 1 + Math.min(1e6, 10 / distance**2);

            costRateFieldSmooth.set(x, y, costRate);
        }
    }
    return costRateFieldSmooth;
}

function createDistanceFromWallsField(costRateField) {
    const sizeX = costRateField.sizeX;
    const sizeY = costRateField.sizeY;
    const toVisit = [];
    for (let y = 0; y < sizeY; ++y) {
        for (let x = 0; x < sizeX; ++x) {
            if (costRateField.get(x, y) > 1.0) {
                toVisit.push({priority: 0, x: x, y: y});
            }
        }
    }

    const distanceField = new Float64Grid(sizeX, sizeY, Infinity);
    fastMarchFill(distanceField, toVisit, (x, y) => estimatedDistance(distanceField, x, y));

    const scale = 128 / sizeX;
    distanceField.values.forEach((x, i, d) => d[i] *= scale);

    return distanceField;
}

function createDistanceField(costRateField, goal) {
    const sizeX = costRateField.sizeX;
    const sizeY = costRateField.sizeY;
    const distanceField = new Float64Grid(costRateField.sizeX, costRateField.sizeY, Infinity);
    updateDistanceField(costRateField, distanceField, goal);
    return distanceField;
}

function updateDistanceField(costRateField, distanceField, goal) {
    const sizeX = costRateField.sizeX;
    const sizeY = costRateField.sizeY;
    const goalX = goal.x * (sizeX - 1);
    const goalY = goal.y * (sizeY - 1);
    const r = 2;
    const xMin = Math.min(sizeX - 1, Math.max(0, Math.floor(goalX + 0.5) - r));
    const yMin = Math.min(sizeY - 1, Math.max(0, Math.floor(goalY + 0.5) - r));
    const xMax = Math.min(sizeX, xMin + 2*r+1);
    const yMax = Math.min(sizeY, yMin + 2*r+1);

    distanceField.fill(Infinity);

    for (let y = yMin; y < yMax; ++y) {
        for (let x = xMin; x < xMax; ++x) {
            const dx = x - goalX;
            const dy = y - goalY;
            const dist = Math.sqrt(dx**2 + dy**2);
            const costRate = costRateField.get(x, y);
            const cost = dist * costRate;
            distanceField.set(x, y, cost);
        }
    }

    let toVisit = [];
    for (let y = Math.max(0, yMin - 1); y < Math.min(sizeY, yMax + 1); ++y) {
        for (let x = Math.max(0, xMin - 1); x < Math.min(sizeX, xMax + 1); ++x) {
            if (distanceField.get(x, y) === Infinity) {
                const cost = estimatedDistanceWithSpeed(distanceField, costRateField, x, y);
                priorityQueuePush(toVisit, {priority: cost, x: x, y: y});
            }
        }
    }

    fastMarchFill(distanceField, toVisit, (x, y) => estimatedDistanceWithSpeed(distanceField, costRateField, x, y));

    const scale = 32 / sizeX;
    distanceField.values.forEach((x, i, d) => d[i] *= scale);
}

function fastMarchFill(field, toVisit, estimatedDistance) {
    while (toVisit.length > 0) {
        const {priority, x, y} = priorityQueuePop(toVisit);

        if (field.get(x, y) <= priority) {
            continue;
        }

        field.set(x, y, priority);

        if (x < field.sizeX - 1) {
            const d = estimatedDistance(x + 1, y);
            if (d < field.get(x+1, y)) {
                priorityQueuePush(toVisit, {priority: d, x: x+1, y: y});
            }
        }

        if (x > 0) {
            const d = estimatedDistance(x - 1, y);
            if (d < field.get(x-1, y)) {
                priorityQueuePush(toVisit, {priority: d, x: x-1, y: y});
            }
        }

        if (y < field.sizeY - 1) {
            const d = estimatedDistance(x, y + 1);
            if (d < field.get(x, y+1)) {
                priorityQueuePush(toVisit, {priority: d, x: x, y: y+1});
            }
        }

        if (y > 0) {
            const d = estimatedDistance(x, y - 1);
            if (d < field.get(x, y-1)) {
                priorityQueuePush(toVisit, {priority: d, x: x, y: y-1});
            }
        }
    }
}

function estimatedDistance(field, x, y) {
    const dXNeg = (x > 0) ? field.get(x-1, y) : Infinity;
    const dXPos = (x < field.sizeX - 1) ? field.get(x+1, y) : Infinity;
    const dYNeg = (y > 0) ? field.get(x, y-1) : Infinity;
    const dYPos = (y < field.sizeY - 1) ? field.get(x, y+1) : Infinity;

    const dXMin = Math.min(dXNeg, dXPos);
    const dYMin = Math.min(dYNeg, dYPos);

    const timeHorizontal = 1.0;

    const d = (Math.abs(dXMin - dYMin) <= timeHorizontal) ?
        ((dXMin + dYMin) + Math.sqrt((dXMin + dYMin)**2 - 2 * (dXMin**2 + dYMin**2 - timeHorizontal**2))) / 2:
        Math.min(dXMin, dYMin) + timeHorizontal;

    return d;
}

function estimatedDistanceWithSpeed(field, speed, x, y) {
    const dXNeg = (x > 0) ? field.get(x-1, y) : Infinity;
    const dXPos = (x < field.sizeX - 1) ? field.get(x+1, y) : Infinity;
    const dYNeg = (y > 0) ? field.get(x, y-1) : Infinity;
    const dYPos = (y < field.sizeY - 1) ? field.get(x, y+1) : Infinity;

    const dXMin = Math.min(dXNeg, dXPos);
    const dYMin = Math.min(dYNeg, dYPos);

    const timeHorizontal = speed.get(x, y);

    const d = (Math.abs(dXMin - dYMin) <= timeHorizontal) ?
        ((dXMin + dYMin) + Math.sqrt((dXMin + dYMin)**2 - 2 * (dXMin**2 + dYMin**2 - timeHorizontal**2))) / 2:
        Math.min(dXMin, dYMin) + timeHorizontal;

    return d;
}

function safeDistance(distanceField, x, y) {
    if (x < 0 || y < 0 || x >= distanceField.sizeX || y >= distanceField.sizeY)
        return 1e4;

    return distanceField.get(x, y);
}

function estimateGradient(distanceField, x, y) {

    x *= (distanceField.sizeX - 1);
    y *= (distanceField.sizeY - 1);

    const uX = x - Math.floor(x);
    const uY = y - Math.floor(y);

    const gridX = Math.floor(x);
    const gridY = Math.floor(y);

    const d00 = safeDistance(distanceField, gridX, gridY);
    const d10 = safeDistance(distanceField, gridX + 1, gridY);
    const d01 = safeDistance(distanceField, gridX, gridY + 1);
    const d11 = safeDistance(distanceField, gridX + 1, gridY + 1);

    const gradX = (d10 - d00) * (1 - uY) + (d11 - d01) * uY;
    const gradY = (d01 - d00) * (1 - uX) + (d11 - d10) * uX;

    return { x: gradX, y: gradY };
}

function estimateDistance(distanceField, x, y) {

    x *= (distanceField.sizeX - 1);
    y *= (distanceField.sizeY - 1);

    const uX = x - Math.floor(x);
    const uY = y - Math.floor(y);

    const gridX = Math.floor(x);
    const gridY = Math.floor(y);

    const d00 = safeDistance(distanceField, gridX, gridY);
    const d10 = safeDistance(distanceField, gridX + 1, gridY);
    const d01 = safeDistance(distanceField, gridX, gridY + 1);
    const d11 = safeDistance(distanceField, gridX + 1, gridY + 1);

    const d0 = d00 + (d10 - d00) * uX;
    const d1 = d01 + (d11 - d01) * uX;
    const d = d0 + (d1 - d0) * uY;

    return d;
}
