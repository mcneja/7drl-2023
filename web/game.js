"use strict";

window.onload = loadResourcesThenRun;

const {mat2, mat3, mat4, vec2, vec3, vec4} = glMatrix;

const ttSolid = 0;
const ttWall = 1;
const ttHall = 2;
const ttRoom = 3;

const playerRadius = 0.5;
const bulletRadius = 0.25;
const turretRadius = 0.5;
const turretFireDelay = 2.0;
const turretFireSpeed = 10.0;
const turretBulletLifetime = 4.0;
const meleeAttackRadius = 0.75;
const meleeAttackMaxDuration = 0.5;

const numCellsX = 4;
const numCellsY = 3;
const corridorWidth = 3;

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

class Level {
    constructor(sizeX, sizeY, initialValue) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Uint8Array(sizeX * sizeY);
        this.values.fill(initialValue);
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

function loadResourcesThenRun() {
    loadImage('font.png').then((fontImage) => { main(fontImage); });
}

function main(fontImage) {

    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl", { alpha: false, depth: false });

    if (gl == null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    const renderer = createRenderer(gl, fontImage);
    const state = initState();

    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;

    canvas.onmousedown = () => {
        if (state.paused) {
            canvas.requestPointerLock();
        }
    };

    document.body.addEventListener('keydown', e => {
        if (e.code == 'KeyR') {
            e.preventDefault();
            resetState(state);
            if (state.paused) {
                requestUpdateAndRender();
            }
        } else if (e.code == 'KeyM') {
            e.preventDefault();
            state.showMap = !state.showMap;
            if (state.paused) {
                requestUpdateAndRender();
            }
        }
    });

    function requestUpdateAndRender() {
        requestAnimationFrame(now => updateAndRender(now, renderer, state));
    }

    function onLockChanged() {
        const mouseCaptured =
            document.pointerLockElement === canvas ||
            document.mozPointerLockElement === canvas;
        if (mouseCaptured) {
            document.addEventListener("mousemove", onMouseMoved, false);
            document.addEventListener("mousedown", onMouseDown, false);
            document.addEventListener("mouseup", onMouseUp, false);
            if (state.paused) {
                state.paused = false;
                state.tLast = undefined;
                requestUpdateAndRender();
            }
        } else {
            document.removeEventListener("mousemove", onMouseMoved, false);
            document.removeEventListener("mousedown", onMouseDown, false);
            document.removeEventListener("mouseup", onMouseUp, false);
            state.paused = true;
        }
    }

    function onMouseMoved(e) {
        updatePosition(state, e);
    }

    function onMouseDown(e) {
        if (state.paused) {
            return;
        }
        if (e.button == 0) {
            if (!state.player.dead && state.player.meleeAttackCooldown <= 0) {
                state.player.meleeAttacking = true;
            }
        } else if (e.button == 2) {
            shootBullet(state);
        }
    }

    function onMouseUp(e) {
        if (state.paused) {
            return;
        }
        if (e.button == 0) {
            state.player.meleeAttacking = false;
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

const loadImage = src =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

function updatePosition(state, e) {
    if (state.player.dead) {
        return;
    }

    const sensitivity = 0.05;
    const movement = vec2.fromValues(e.movementX, -e.movementY);
    vec2.scaleAndAdd(state.player.velocity, state.player.velocity, movement, sensitivity);
}

function updateMeleeAttack(state, dt) {
    // Check for any enemies hit by the attack

    if (!state.player.meleeAttacking) {
        state.player.meleeAttackCooldown = Math.max(0, state.player.meleeAttackCooldown - dt);
        return;
    }

    state.player.meleeAttackCooldown += dt;
    if (state.player.meleeAttackCooldown >= meleeAttackMaxDuration) {
        state.player.meleeAttackCooldown = meleeAttackMaxDuration;
        state.player.meleeAttacking = false;
        return;
    }

    const dpos = vec2.create();

    const r = meleeAttackRadius;

    for (const turret of state.level.turrets) {
        if (turret.dead) {
            continue;
        }

        vec2.subtract(dpos, turret.position, state.player.position);
        const dist = vec2.length(dpos);
        if (dist < r + turretRadius) {
            turret.dead = true;
            state.player.meleeAttackCooldown = 0;
            elasticCollision(state.player, turret);
        }
    }
}

function renderMeleeAttack(state, renderer, matScreenFromWorld) {
    if (!state.player.meleeAttacking) {
        return;
    }

    const disc = {
        radius: meleeAttackRadius,
        position: vec2.create(),
        color: { r: 0, g: 1, b: 1 },
    };

    vec2.copy(disc.position, state.player.position);

    renderer.renderDiscs(matScreenFromWorld, [disc]);
}

function shootBullet(state) {
    if (state.player.dead) {
        return;
    }

    const pos = vec2.create();
    vec2.copy(pos, state.player.position);
    const vel = vec2.create();
    vec2.scale(vel, state.player.velocity, 2);

    vec2.scale(state.player.velocity, state.player.velocity, 0.8);

    state.playerBullets.push({
        position: pos,
        velocity: vel,
        timeRemaining: 2,
    });
}

function updatePlayerBullets(state, dt) {
    filterInPlace(state.playerBullets, bullet => updatePlayerBullet(state, bullet, dt));
}

function updatePlayerBullet(state, bullet, dt) {
    vec2.scaleAndAdd(bullet.position, bullet.position, bullet.velocity, dt);

    bullet.timeRemaining -= dt;
    if (bullet.timeRemaining <= 0) {
        return false;
    }

    let hitTurret = false;

    for (const turret of state.level.turrets) {
        if (turret.dead) {
            continue;
        }

        if (areDiscsTouching(bullet.position, bulletRadius, turret.position, turretRadius)) {
            vec2.scaleAndAdd(turret.velocity, turret.velocity, bullet.velocity, 0.2);
            turret.dead = true;
            hitTurret = true;
        }
    }

    if (hitTurret) {
        return false;
    }

    if (isDiscTouchingLevel(bullet.position, bulletRadius, state.level.grid)) {
        return false;
    }

    return true;
}

function renderPlayerBullets(state, renderer, matScreenFromWorld) {
    const color = { r: 0.25, g: 1, b: 1 };
    const discs = state.playerBullets.map(bullet => ({
        position: bullet.position,
        color: color,
        radius: bulletRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);
}

function updateTurretBullets(state, dt) {
    filterInPlace(state.turretBullets, bullet => updateTurretBullet(state, bullet, dt));
}

function updateTurretBullet(state, bullet, dt) {
    vec2.scaleAndAdd(bullet.position, bullet.position, bullet.velocity, dt);

    bullet.timeRemaining -= dt;
    if (bullet.timeRemaining <= 0) {
        return false;
    }

    if (isDiscTouchingLevel(bullet.position, bulletRadius, state.level.grid)) {
        return false;
    }

    if (areDiscsTouching(bullet.position, bulletRadius, state.player.position, playerRadius)) {
        vec2.scaleAndAdd(state.player.velocity, state.player.velocity, bullet.velocity, 0.2);
        state.player.dead = true;
        state.player.meleeAttacking = false;
        state.player.meleeAttackCooldown = 0;
        return false;
    }

    return true;
}

function renderTurretBullets(bullets, renderer, matScreenFromWorld) {
    const color = { r: 1, g: 0.5, b: 0.25 };
    const discs = bullets.map(bullet => ({
        position: bullet.position,
        color: color,
        radius: bulletRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);
}

function updateTurrets(state, dt) {
    for (const turret of state.level.turrets) {
        slideToStop(turret, dt);
        vec2.scaleAndAdd(turret.position, turret.position, turret.velocity, dt);

        /*
        const dposToTarget = vec2.create();
        vec2.subtract(dposToTarget, turret.position, state.player.position);
        const distToTarget = vec2.length(dposToTarget);
    
        if (distToTarget < 16) {
            moveDownGradient(state.distanceField, turret.position, 1 * dt);
        }
        */

        if (!turret.dead) {
            turret.timeToFire -= dt;
            if (turret.timeToFire <= 0) {
                turret.timeToFire += turretFireDelay;

                if (hasLineOfSight(state.level, turret.position, state.player.position)) {
                    const dpos = vec2.create();
                    vec2.subtract(dpos, state.player.position, turret.position);
                    const d = Math.max(1.0e-6, vec2.length(dpos));

                    const pos = vec2.create();
                    vec2.scaleAndAdd(pos, turret.position, dpos, turret.radius / d);

                    const vel = vec2.create();
                    vec2.scale(vel, dpos, turretFireSpeed / d);

                    const bullet = {
                        position: pos,
                        velocity: vel,
                        timeRemaining: turretBulletLifetime,
                    };

                    state.turretBullets.push(bullet);
                }
            }
        }
    }

    // Fix up turret positions relative to the environment and each other.

    for (let i = 0; i < state.level.turrets.length; ++i)
    {
        const turret0 = state.level.turrets[i];

        fixupPositionAndVelocityAgainstLevel(turret0.position, turret0.velocity, turret0.radius, state.level.grid);

        if (turret0.dead)
            continue;

        for (let j = i + 1; j < state.level.turrets.length; ++j)
        {
            const turret1 = state.level.turrets[j];
            if (turret1.dead)
                continue;

            fixupDiscPairs(turret0, turret1);
        }
    }
}

function moveDownGradient(distanceField, position, distance) {
    const gradient = vec2.create();
    estimateGradient(distanceField, position, gradient);

    const gradientLen = vec2.length(gradient);

    const scale = -distance / Math.max(1e-8, gradientLen);

    vec2.scaleAndAdd(position, position, gradient, scale);
}

function renderDeadTurrets(turrets, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = turrets.filter(turret => turret.dead).map(turret => ({
        position: turret.position,
        color: color,
        radius: turretRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    const rect = glyphRect(119);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const turretGlyphColor = 0xff808080;

    for (const turret of turrets) {
        if (turret.dead) {
            const x = turret.position[0];
            const y = turret.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                turretGlyphColor
            );
        }
    }

    renderer.renderGlyphs.flush(matScreenFromWorld);
}

function renderAliveTurrets(turrets, renderer, matScreenFromWorld) {
    const colorWindup = { r: 1, g: 0.5, b: 0.25 };
    const color = { r: 0.34375, g: 0.25, b: 0.25 };
    const discs = turrets.filter(turret => !turret.dead).map(turret => ({
        position: turret.position,
        color: colorLerp(colorWindup, color, Math.min(1, 4 * turret.timeToFire / turretFireDelay)),
        radius: turretRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    const rect = glyphRect(119);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const turretGlyphColor = 0xff8080b0;

    for (const turret of turrets) {
        if (!turret.dead) {
            const x = turret.position[0];
            const y = turret.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                turretGlyphColor
            );
        }
    }

    renderer.renderGlyphs.flush(matScreenFromWorld);
}

function colorLerp(color0, color1, u) {
    return {
        r: lerp(color0.r, color1.r, u),
        g: lerp(color0.g, color1.g, u),
        b: lerp(color0.b, color1.b, u),
    };
}

function lerp(v0, v1, u) {
    return v0 + (v1 - v0) * u;
}

function glyphRect(glyphIndex) {
    const glyphRow = Math.floor(glyphIndex / 16);
    const glyphCol = glyphIndex % 16;

    const glyphSpacing = 0.0625;

    const x = glyphSpacing * glyphCol;
    const y = glyphSpacing * glyphRow;

    return { minX: x, minY: y + glyphSpacing, maxX: x + glyphSpacing, maxY: y };
}

function filterInPlace(array, condition) {
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

function createRenderer(gl, fontImage) {
    gl.getExtension('OES_standard_derivatives');

    const renderer = {
        beginFrame: createBeginFrame(gl),
        renderField: createFieldRenderer(gl),
        renderDiscs: createDiscRenderer(gl),
        renderGlyphs: createGlyphRenderer(gl, fontImage),
        renderColoredTriangles: createColoredTriangleRenderer(gl),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    return renderer;
}

function initState() {
    const state = {
        paused: true,
        showMap: false,
    };
    resetState(state);
    return state;
}

function resetState(state) {
    const level = createLevel();

    const player = {
        position: vec2.create(),
        velocity: vec2.create(),
        radius: playerRadius,
        color: { r: 0, g: 0, b: 0 },
        meleeAttacking: false,
        meleeAttackCooldown: 0,
        dead: false,
    };

    vec2.copy(player.position, level.playerStartPos);
    vec2.zero(player.velocity);

    const camera = {
        position: vec2.create(),
        velocity: vec2.create(),
    };

    vec2.copy(camera.position, player.position);
    vec2.zero(camera.velocity);

//    const enemyRadius = 0.0125;
//    const discs = createEnemies(obstacles, enemyRadius, player.position);
    const costRateField = createCostRateField(level);
    const distanceFromWallsField = createDistanceFromWallsField(costRateField);
    const costRateFieldSmooth = createSmoothedCostRateField(distanceFromWallsField);
    const distanceField = createDistanceField(costRateFieldSmooth, player.position);

    state.costRateField = costRateFieldSmooth;
    state.distanceField = distanceField;
    state.tLast = undefined;
//    state.discs = discs;
    state.player = player;
    state.playerBullets = [];
    state.turretBullets = [];
    state.camera = camera;
    state.level = level;
}

function createEnemies(obstacles, enemyRadius, playerPosition) {
    const enemies = [];
    const separationFromObstacle = 0.02 + enemyRadius;
    const separationFromAlly = 0.05;
    const enemyColor = { r: 0.25, g: 0.25, b: 0.25 };
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

function createCollectibles(obstacles) {
    const collectibles = [];
    const radius = 0.0125;
    const separationFromObstacle = 0.02;
    const separationFromCollectible = 0.05;
    const color = { r: 0.25, g: 0.25, b: 0.25 };
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

function createBeginFrame(gl) {
    return (screenSize) => {
        resizeCanvasToDisplaySize(gl.canvas);

        const screenX = gl.canvas.clientWidth;
        const screenY = gl.canvas.clientHeight;
    
        gl.viewport(0, 0, screenX, screenY);
        gl.clear(gl.COLOR_BUFFER_BIT);

        vec2.set(screenSize, screenX, screenY);
    }
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

    const matWorldFromMap = mat4.create();
    matWorldFromMap[12] = 0.5;
    matWorldFromMap[13] = 0.5;

    const matScreenFromMap = mat4.create();

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

    return (matScreenFromWorld, costRateField, distanceField, uScroll) => {

        const gridSizeX = costRateField.sizeX;
        const gridSizeY = costRateField.sizeY;

        mat4.multiply(matScreenFromMap, matScreenFromWorld, matWorldFromMap);

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

        gl.uniformMatrix4fv(uniformLoc.projectionMatrix, false, matScreenFromMap);
    
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
        
        uniform mat4 uMatScreenFromDisc;

        varying highp vec2 fPosition;

        void main() {
            fPosition = vPosition;
            gl_Position = uMatScreenFromDisc * vec4(vPosition.xy, 0, 1);
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


    const matWorldFromDisc = mat4.create();
    const matScreenFromDisc = mat4.create();

    const program = initShaderProgram(gl, vsSource, fsSource);

    const vertexPositionLoc = gl.getAttribLocation(program, 'vPosition');
    const projectionMatrixLoc = gl.getUniformLocation(program, 'uMatScreenFromDisc');
    const colorLoc = gl.getUniformLocation(program, 'uColor');
    const vertexBuffer = createDiscVertexBuffer(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const stride = 8; // two 4-byte floats
    gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, stride, 0);

    return (matScreenFromWorld, discs) => {
        gl.useProgram(program);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(vertexPositionLoc);
        gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, 0, 0);

        for (const disc of discs) {
            gl.uniform3f(colorLoc, disc.color.r, disc.color.g, disc.color.b);

            matWorldFromDisc[0] = disc.radius;
            matWorldFromDisc[5] = disc.radius;
            matWorldFromDisc[12] = disc.position[0];
            matWorldFromDisc[13] = disc.position[1];

            mat4.multiply(matScreenFromDisc, matScreenFromWorld, matWorldFromDisc);

            gl.uniformMatrix4fv(projectionMatrixLoc, false, matScreenFromDisc);

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

function createGlyphRenderer(gl, fontImage) {
    const vsSource = `
        attribute vec4 vPositionTexcoord;
        attribute vec4 vColor;

        uniform mat4 uMatScreenFromWorld;

        varying highp vec2 fTexcoord;
        varying highp vec4 fColor;

        void main() {
            fTexcoord = vPositionTexcoord.zw;
            fColor = vColor;
            gl_Position = uMatScreenFromWorld * vec4(vPositionTexcoord.xy, 0, 1);
        }
    `;

    const fsSource = `
        varying highp vec2 fTexcoord;
        varying highp vec4 fColor;

        uniform sampler2D uOpacity;

        void main() {
            gl_FragColor = fColor * vec4(1, 1, 1, texture2D(uOpacity, fTexcoord));
        }
    `;

    const fontTexture = createTextureFromImage(gl, fontImage);

    const program = initShaderProgram(gl, vsSource, fsSource);

    const vPositionTexcoordLoc = gl.getAttribLocation(program, 'vPositionTexcoord');
    const vColorLoc = gl.getAttribLocation(program, 'vColor');

    const uProjectionMatrixLoc = gl.getUniformLocation(program, 'uMatScreenFromWorld');
    const uOpacityLoc = gl.getUniformLocation(program, 'uOpacity');

    const maxQuads = 4096;
    const numVertices = 4 * maxQuads;
    const bytesPerVertex = 4 * Float32Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT;
    const wordsPerQuad = bytesPerVertex;

    const indexBuffer = createGlyphIndexBuffer(gl, maxQuads);

    const vertexBuffer = gl.createBuffer();

    const vertexData = new ArrayBuffer(numVertices * bytesPerVertex);
    const vertexDataAsFloat32 = new Float32Array(vertexData);
    const vertexDataAsUint32 = new Uint32Array(vertexData);

    let numQuads = 0;

    function addQuad(x0, y0, x1, y1, s0, t0, s1, t1, color) {
        if (numQuads >= maxQuads) {
            flushQuads();
        }

        let i = numQuads * wordsPerQuad;

        vertexDataAsFloat32[i+0] = x0;
        vertexDataAsFloat32[i+1] = y0;
        vertexDataAsFloat32[i+2] = s0;
        vertexDataAsFloat32[i+3] = t0;
        vertexDataAsUint32[i+4] = color;

        vertexDataAsFloat32[i+5] = x1;
        vertexDataAsFloat32[i+6] = y0;
        vertexDataAsFloat32[i+7] = s1;
        vertexDataAsFloat32[i+8] = t0;
        vertexDataAsUint32[i+9] = color;

        vertexDataAsFloat32[i+10] = x0;
        vertexDataAsFloat32[i+11] = y1;
        vertexDataAsFloat32[i+12] = s0;
        vertexDataAsFloat32[i+13] = t1;
        vertexDataAsUint32[i+14] = color;

        vertexDataAsFloat32[i+15] = x1;
        vertexDataAsFloat32[i+16] = y1;
        vertexDataAsFloat32[i+17] = s1;
        vertexDataAsFloat32[i+18] = t1;
        vertexDataAsUint32[i+19] = color;

        ++numQuads;
    }

    function flushQuads(matScreenFromWorld) {
        if (numQuads <= 0) {
            return;
        }

        gl.useProgram(program);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fontTexture);
        gl.uniform1i(uOpacityLoc, 0);

        gl.uniformMatrix4fv(uProjectionMatrixLoc, false, matScreenFromWorld);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(vPositionTexcoordLoc, 4, gl.FLOAT, false, bytesPerVertex, 0);
        gl.vertexAttribPointer(vColorLoc, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 16);
        gl.enableVertexAttribArray(vPositionTexcoordLoc);
        gl.enableVertexAttribArray(vColorLoc);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

        gl.drawElements(gl.TRIANGLES, 6 * numQuads, gl.UNSIGNED_SHORT, 0);

        numQuads = 0;
    }

    return {
        add: addQuad,
        flush: flushQuads,
    };
}

function createGlyphIndexBuffer(gl, maxQuads) {
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

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    return indexBuffer;
}

function createTextureFromImage(gl, image) {
    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
}

function updateAndRender(now, renderer, state) {
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

function createColoredTriangleRenderer(gl) {
    const vsSource = `
        attribute vec2 vPosition;
        attribute vec4 vColor;

        uniform mat4 uProjectionMatrix;

        varying highp vec4 fColor;

        void main() {
            fColor = vColor;
            gl_Position = uProjectionMatrix * vec4(vPosition.xy, 0, 1);
        }
    `;

    const fsSource = `
        varying highp vec4 fColor;
        void main() {
            gl_FragColor = fColor;
        }
    `;

    const program = initShaderProgram(gl, vsSource, fsSource);

    const vertexPositionLoc = gl.getAttribLocation(program, 'vPosition');
    const vertexColorLoc = gl.getAttribLocation(program, 'vColor');
    const projectionMatrixLoc = gl.getUniformLocation(program, 'uProjectionMatrix');

    const vertexBuffer = gl.createBuffer();

    const bytesPerVertex = 12; // two 4-byte floats and one 32-bit color
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, bytesPerVertex, 0);
    gl.vertexAttribPointer(vertexColorLoc, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 8);

    return (matScreenFromWorld, vertexData) => {
        const numVerts = Math.floor(vertexData.byteLength / bytesPerVertex);

        gl.useProgram(program);

        gl.uniformMatrix4fv(projectionMatrixLoc, false, matScreenFromWorld);

        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(vertexPositionLoc);
        gl.enableVertexAttribArray(vertexColorLoc);
        gl.vertexAttribPointer(vertexPositionLoc, 2, gl.FLOAT, false, bytesPerVertex, 0);
        gl.vertexAttribPointer(vertexColorLoc, 4, gl.UNSIGNED_BYTE, true, bytesPerVertex, 8);
    
        gl.drawArrays(gl.TRIANGLES, 0, numVerts);

        gl.disableVertexAttribArray(vertexColorLoc);
        gl.disableVertexAttribArray(vertexPositionLoc);
    };
}

function slideToStop(body, dt) {
    const r = Math.exp(-3 * dt);
    vec2.scale(body.velocity, body.velocity, r);
}

function updateState(state, dt) {

    // Player

    if (state.player.dead) {
        slideToStop(state.player, dt);
    }

    vec2.scaleAndAdd(state.player.position, state.player.position, state.player.velocity, dt);

    fixupPositionAndVelocityAgainstLevel(state.player.position, state.player.velocity, state.player.radius, state.level.grid);

    for (const turret of state.level.turrets) {
        if (!turret.dead) {
            fixupDiscPairs(state.player, turret);
        }
    }

    updateMeleeAttack(state, dt);

    // Camera

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

    // Turrets

    updateTurrets(state, dt);

    // Bullets

    updatePlayerBullets(state, dt);
    updateTurretBullets(state, dt);

    /*
    if (!state.gameOver) {
        state.collectibles = state.collectibles.filter(collectible => !discsOverlap(state.player, collectible));
    }
    if (state.collectibles.length <= 0) {
        state.gameOver = true;
    }
    */

    updateDistanceField(state.costRateField, state.distanceField, state.player.position);

    /*
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
    */
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
    const dpos = vec2.create();
    vec2.subtract(dpos, disc1.position, disc0.position);
    const d = vec2.length(dpos);
    const dist = d - (disc0.radius + disc1.radius);

    if (dist < 0) {
        const scalePosFixup = dist / (2 * d);
        vec2.scaleAndAdd(disc0.position, disc0.position, dpos, scalePosFixup);
        vec2.scaleAndAdd(disc1.position, disc1.position, dpos, -scalePosFixup);

        const dvel = vec2.create();
        vec2.subtract(dvel, disc1.velocity, disc0.velocity);
        const vn = vec2.dot(dpos, dvel);

        if (vn < 0) {
            const scaleVelFixup = vn / (2 * d*d);
            vec2.scaleAndAdd(disc0.velocity, disc0.velocity, dpos, scaleVelFixup);
            vec2.scaleAndAdd(disc1.velocity, disc1.velocity, dpos, -scaleVelFixup);
        }
    }
}

function elasticCollision(disc0, disc1) {
    const dpos = vec2.create();
    vec2.subtract(dpos, disc1.position, disc0.position);
    const d = vec2.length(dpos);

    const dvel = vec2.create();
    vec2.subtract(dvel, disc1.velocity, disc0.velocity);
    const vn = vec2.dot(dpos, dvel);

    if (vn < 0) {
        const scaleVelFixup = vn / (d*d);
        vec2.scaleAndAdd(disc0.velocity, disc0.velocity, dpos, scaleVelFixup);
        vec2.scaleAndAdd(disc1.velocity, disc1.velocity, dpos, -scaleVelFixup);
    }
}

function isDiscTouchingLevel(discPos, discRadius, level) {
    const gridMinX = Math.max(0, Math.floor(discPos[0] - discRadius));
    const gridMinY = Math.max(0, Math.floor(discPos[1] - discRadius));
    const gridMaxX = Math.min(level.sizeX, Math.floor(discPos[0] + discRadius + 1));
    const gridMaxY = Math.min(level.sizeY, Math.floor(discPos[1] + discRadius + 1));

    for (let gridX = gridMinX; gridX <= gridMaxX; ++gridX) {
        for (let gridY = gridMinY; gridY <= gridMaxY; ++gridY) {
            const tileType = level.get(gridX, gridY);
            if (tileType == ttRoom || tileType == ttHall) {
                continue;
            }
            let dx = discPos[0] - gridX;
            let dy = discPos[1] - gridY;

            dx = Math.max(-dx, 0, dx - 1);
            dy = Math.max(-dy, 0, dy - 1);
            const d = Math.sqrt(dx*dx + dy*dy);
            if (d < discRadius) {
                return true;
            }
        }
    }

    return false;
}

function areDiscsTouching(pos0, radius0, pos1, radius1) {
    const dpos = vec2.create();
    vec2.subtract(dpos, pos1, pos0);
    const d = vec2.length(dpos);
    return d < radius0 + radius1;
}

function fixupPositionAndVelocityAgainstLevel(position, velocity, radius, level) {

    for (let i = 0; i < 4; ++i) {
        const gridMinX = Math.max(0, Math.floor(position[0] - radius));
        const gridMinY = Math.max(0, Math.floor(position[1] - radius));
        const gridMaxX = Math.min(level.sizeX, Math.floor(position[0] + radius + 1));
        const gridMaxY = Math.min(level.sizeY, Math.floor(position[1] + radius + 1));

        let smallestSeparatingAxis = {unitDir: vec2.fromValues(0, 0), d: radius};

        for (let gridX = gridMinX; gridX <= gridMaxX; ++gridX) {
            for (let gridY = gridMinY; gridY <= gridMaxY; ++gridY) {
                const tileType = level.get(gridX, gridY);
                if (tileType == ttRoom || tileType == ttHall) {
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
            vec2.scaleAndAdd(velocity, velocity, smallestSeparatingAxis.unitDir, -vNormal);
        }
    }

    const xMin = radius;
    const yMin = radius;
    const xMax = level.sizeX - radius;
    const yMax = level.sizeY - radius;

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
}

function separatingAxis(dx, dy) {
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

function hasLineOfSight(level, pos0, pos1) {
    const dpos = vec2.create();
    vec2.subtract(dpos, pos1, pos0);
    return vec2.length(dpos) < 20;
}

function fixupPositionAndVelocityAgainstDisc(position, velocity, radius, discPosition, discRadius) {
    const dpos = vec2.create();
    vec2.subtract(dpos, position, discPosition);
    const d = vec2.length(dpos);
    const dist = d - (radius + discRadius);

    if (dist >= 0) {
        return false;
    }

    vec2.scaleAndAdd(position, position, dpos, -dist / d);

    const vn = vec2.dot(velocity, dpos);
    if (vn < 0) {
        vec2.scaleAndAdd(velocity, velocity, dpos, -vn / (d*d));
    }

    return true;
}

function renderScene(renderer, state) {
    const screenSize = vec2.create();
    renderer.beginFrame(screenSize);

    const matScreenFromWorld = mat4.create();

    if (state.showMap) {
        const mapSizeX = state.level.grid.sizeX + 2;
        const mapSizeY = state.level.grid.sizeY + 2;
        let rx, ry;
        if (screenSize[0] * mapSizeY < screenSize[1] * mapSizeX) {
            // horizontal is limiting dimension
            rx = mapSizeX / 2;
            ry = rx * screenSize[1] / screenSize[0];
        } else {
            // vertical is limiting dimension
            ry = mapSizeY / 2;
            rx = ry * screenSize[0] / screenSize[1];
        }
        const cx = state.level.grid.sizeX / 2;
        const cy = state.level.grid.sizeY / 2;
        mat4.ortho(matScreenFromWorld, cx - rx, cx + rx, cy - ry, cy + ry, 1, -1);
    } else {
        const cx = state.camera.position[0];
        const cy = state.camera.position[1];
        const r = 18;
        let rx, ry;
        if (screenSize[0] < screenSize[1]) {
            rx = r;
            ry = r * screenSize[1] / screenSize[0];
        } else {
            ry = r;
            rx = r * screenSize[0] / screenSize[1];
        }

        mat4.ortho(matScreenFromWorld, cx - rx, cx + rx, cy - ry, cy + ry, 1, -1);
    }

//    renderer.renderField(matScreenFromWorld, state.costRateField, state.distanceField, 0);
    renderer.renderColoredTriangles(matScreenFromWorld, state.level.vertexData);

    renderDeadTurrets(state.level.turrets, renderer, matScreenFromWorld);

    renderMeleeAttack(state, renderer, matScreenFromWorld);

    renderAliveTurrets(state.level.turrets, renderer, matScreenFromWorld);

    renderTurretBullets(state.turretBullets, renderer, matScreenFromWorld);
    renderPlayerBullets(state, renderer, matScreenFromWorld);

//    renderer.renderDiscs(state.collectibles);
    state.player.color = colorLerp({ r: 0, g: 0, b: 0 }, { r: 0, g: 1, b: 1 }, state.player.meleeAttackCooldown / meleeAttackMaxDuration);
    renderer.renderDiscs(matScreenFromWorld, [state.player]);

/*
    for (const c of state.collectibles) {
        const x = c.position.x * 2 - 1;
        const y = c.position.y * 2 - 1;
        renderer.renderGlyphs.add(x - rx, y - ry, x + rx, y + ry, 15*tx, ty, 16*tx, 0, 0xff00ffff);
    }

    for (const d of state.discs) {
        const x = d.position.x * 2 - 1;
        const y = d.position.y * 2 - 0.995;
        renderer.renderGlyphs.add(x - rx, y - ry, x + rx, y + ry, 7*tx, 7*ty, 8*tx, 6*ty, 0xff00a000);
    }
*/

//    renderer.renderGlyphs.add(-0.25, -0.5, 0.25, 0.5, 0, 1, 1, 0, 0xffffffff);

    {
        const tx = 0.0625;
        const ty = 0.0625;

        const x = state.player.position[0];
        const y = state.player.position[1];
        const rx = 0.25;
        const ry = 0.5;
        const yOffset = -0.06;

        const glyphColor = state.player.dead ? 0xff0020ff : 0xff00ffff;

        renderer.renderGlyphs.add(x - rx, y + yOffset - ry, x + rx, y + yOffset + ry, 1*tx, ty, 2*tx, 0, glyphColor);
        renderer.renderGlyphs.flush(matScreenFromWorld);
    }
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

function createCostRateField(level) {
    const sizeX = level.grid.sizeX;
    const sizeY = level.grid.sizeY;

    const costRate = new Float64Grid(sizeX, sizeY, 1);

    for (let y = 0; y < sizeY; ++y) {
        for (let x = 0; x < sizeX; ++x) {
            const tileType = level.grid.get(x, y);
            const cost = (tileType == ttRoom || tileType == ttHall) ? 1 : 1000;
            costRate.set(x, y, cost);
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

            const costRate = 1 + Math.min(1e6, 0.1 / distance**2);

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
    const goalX = goal[0] - 0.5;
    const goalY = goal[1] - 0.5;
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

function estimateGradient(distanceField, position, gradient) {

    const x = position[0] - 0.5;
    const y = position[1] - 0.5;

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

    vec2.set(gradient, gradX, gradY);
}

function estimateDistance(distanceField, position) {

    const x = position[0] - 0.5;
    const y = position[1] - 0.5;

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

function randomInRange(n) {
    return Math.floor(Math.random() * n);
}

// The output level data structure consists of dimensions and
// a byte array with the tile for each square. The starting
// position is also returned.

function coinFlips(total) {
    let count = 0;
    while (total > 0) {
        if (Math.random() < 0.5)
            ++count;
        --total;
    }
    return count;
}

function createLevel() {
    const maxMapSizeX = 128;
    const maxMapSizeY = 96;
    
    const squaresPerBlockX = Math.floor((maxMapSizeX + corridorWidth) / numCellsX);
    const squaresPerBlockY = Math.floor((maxMapSizeY + corridorWidth) / numCellsY);

    const minRoomSize = corridorWidth + 2;

    // Create some rooms.

    const rooms = [];
    const roomGrid = [];

    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        roomGrid[roomY] = [];
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            const cellMinX = roomX * squaresPerBlockX + 1;
            const cellMinY = roomY * squaresPerBlockY + 1;
            const cellMaxX = (roomX + 1) * squaresPerBlockX - (1 + corridorWidth);
            const cellMaxY = (roomY + 1) * squaresPerBlockY - (1 + corridorWidth);
            const maxRoomSizeX = cellMaxX - cellMinX;
            const maxRoomSizeY = cellMaxY - cellMinY;
            const halfRoomSizeRangeX = Math.floor((maxRoomSizeX - minRoomSize) / 2);
            const halfRoomSizeRangeY = Math.floor((maxRoomSizeY - minRoomSize) / 2);
            const remainderX = (maxRoomSizeX - minRoomSize) - 2 * halfRoomSizeRangeX;
            const remainderY = (maxRoomSizeY - minRoomSize) - 2 * halfRoomSizeRangeY;

            const roomSizeX = 2 * coinFlips(halfRoomSizeRangeX) + minRoomSize + remainderX;
            const roomSizeY = 2 * coinFlips(halfRoomSizeRangeY) + minRoomSize + remainderY;

            const roomMinX = randomInRange(1 + maxRoomSizeX - roomSizeX) + cellMinX;
            const roomMinY = randomInRange(1 + maxRoomSizeY - roomSizeY) + cellMinY;

            const room = {
                minX: roomMinX,
                minY: roomMinY,
                sizeX: roomSizeX,
                sizeY: roomSizeY,
            };

            rooms.push(room);
            roomGrid[roomY][roomX] = roomY * numCellsX + roomX;
        }
    }

    // Generate the graph of connections between rooms

    const potentialEdges = [];
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

    const edges = [];
    for (const edge of potentialEdges) {
        const group0 = roomGroup[edge[0]];
        const group1 = roomGroup[edge[1]];
        const span = group0 != group1;
        if (span || Math.random() < 0.5) {
            edges.push({edge: edge, span: span});
            for (let i = 0; i < numRooms; ++i) {
                if (roomGroup[i] === group1) {
                    roomGroup[i] = group0;
                }
            }
        }
    }

    // Compress the rooms together where possible

    const [mapSizeX, mapSizeY] = compressRooms(roomGrid, edges, rooms);

    // Plot rooms into a grid

    const level = new Level(mapSizeX, mapSizeY, ttSolid);

    for (const room of rooms) {
        for (let y = 0; y < room.sizeY; ++y) {
            for (let x = 0; x < room.sizeX; ++x) {
                level.set(x + room.minX, y + room.minY, ttRoom);
            }
        }

        for (let x = 0; x < room.sizeX; ++x) {
            level.set(x + room.minX, room.minY - 1, ttWall);
            level.set(x + room.minX, room.minY + room.sizeY, ttWall);
        }

        for (let y = 0; y < room.sizeY + 2; ++y) {
            level.set(room.minX - 1, y + room.minY - 1, ttWall);
            level.set(room.minX + room.sizeX, y + room.minY - 1, ttWall);
        }

        decorateRoom(room, level);
    }

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
//            const xMid = randomInRange(xMax - (xMin + 1 + corridorWidth)) + xMin + 1;
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
                    level.set(x, yMinLeft + y, ttHall);
                }
            }

            for (let x = xMid + corridorWidth; x < xMax; ++x) {
                for (let y = 0; y < corridorWidth; ++y) {
                    level.set(x, yMinRight + y, ttHall);
                }
            }

            const yMin = Math.min(yMinLeft, yMinRight);
            const yMax = Math.max(yMinLeft, yMinRight);
            for (let y = yMin; y < yMax + corridorWidth; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    level.set(xMid + x, y, ttHall);
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
//            const yMid = randomInRange(yMax - (yMin + 1 + corridorWidth)) + yMin + 1;
            const yMid = Math.floor((yMax - (yMin + 1 + corridorWidth)) / 2) + yMin + 1;

            for (let y = yMin; y < yMid; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    level.set(xMinLower + x, y, ttHall);
                }
            }

            for (let y = yMid + corridorWidth; y < yMax; ++y) {
                for (let x = 0; x < corridorWidth; ++x) {
                    level.set(xMinUpper + x, y, ttHall);
                }
            }

            const xMin = Math.min(xMinLower, xMinUpper);
            const xMax = Math.max(xMinLower, xMinUpper);
            for (let x = xMin; x < xMax + corridorWidth; ++x) {
                for (let y = 0; y < corridorWidth; ++y) {
                    level.set(x, yMid + y, ttHall);
                }
            }
        }
    }

    // Convert to colored squares.

    const roomColor = 0xff808080;
    const hallColor = 0xff404040;
    const wallColor = 0xff0055aa;

    const squares = [];
    for (let y = 0; y < level.sizeY; ++y) {
        for (let x = 0; x < level.sizeX; ++x) {
            const type = level.get(x, y);
            if (type == ttRoom) {
                squares.push({x: x, y: y, color: roomColor});
            } else if (type == ttHall) {
                squares.push({x: x, y: y, color: hallColor});
            } else if (type == ttWall) {
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

    // Count the number of connections to each room

    const roomEdges = [];
    for (let i = 0; i < rooms.length; ++i) {
        roomEdges.push([i, 0]);
    }
    for (const edge of edges) {
        ++roomEdges[edge.edge[0]][1];
        ++roomEdges[edge.edge[1]][1];
    }
    shuffleArray(roomEdges);
    roomEdges.sort((room0, room1) => room0[1] - room1[1]);

    // Pick a random room as the start position

    const playerStartPos = vec2.create();
    const startRoomIndex = roomEdges[0][0];
    for (let i = 0; i < 1024; ++i) {
        const startRoom = rooms[startRoomIndex];
        playerStartPos[0] = Math.random() * (startRoom.sizeX - 2*playerRadius) + startRoom.minX + playerRadius;
        playerStartPos[1] = Math.random() * (startRoom.sizeY - 2*playerRadius) + startRoom.minY + playerRadius;

        if (!isDiscTouchingLevel(playerStartPos, playerRadius, level)) {
            break;
        }
    }

    // Place some turrets in the level

    const turrets = [];

    for (let i = 0; i < 1000 && turrets.length < 32; ++i) {
        const roomIndex = randomInRange(rooms.length);
        if (roomIndex == startRoomIndex) {
            continue;
        }

        const room = rooms[roomIndex];

        const x = Math.random() * (room.sizeX - 2 * turretRadius) + room.minX + turretRadius;
        const y = Math.random() * (room.sizeY - 2 * turretRadius) + room.minY + turretRadius;

        const position = vec2.fromValues(x, y);

        if (isDiscTouchingLevel(position, turretRadius * 2, level)) {
            continue;
        }

        if (isPositionTooCloseToOtherTurrets(turrets, position)) {
            continue;
        }

        turrets.push({
            position: position,
            velocity: vec2.fromValues(0, 0),
            radius: turretRadius,
            dead: false,
            timeToFire: Math.random() * turretFireDelay,
        });
    }

    return {
        grid: level,
        vertexData: vertexData,
        playerStartPos: playerStartPos,
        turrets: turrets,
    };
}

function compressRooms(roomGrid, edges, rooms) {
    const numRoomsX = roomGrid[0].length;
    const numRoomsY = roomGrid.length;

    // Try to shift each row downward as much as possible
    for (let roomY = 0; roomY < numRoomsY; ++roomY) {
        let gapMin = Number.MIN_SAFE_INTEGER;
        let gapMax = Number.MAX_SAFE_INTEGER;
        let hasBentCorridor = false;

        for (let roomX = 0; roomX < numRoomsX; ++roomX) {
            const roomIndex0 = (roomY > 0) ? roomGrid[roomY - 1][roomX] : undefined;
            const roomIndex1 = roomGrid[roomY][roomX];
            const room0 = (roomIndex0 === undefined) ? undefined : rooms[roomIndex0];
            const room1 = rooms[roomIndex1];
            const gapMinY = (room0 === undefined) ? 0 : room0.minY + room0.sizeY + 2;
            const gapMaxY = room1.minY - 1;
            if (room0 !== undefined &&
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
            const roomIndex0 = (roomX > 0) ? roomGrid[roomY][roomX - 1] : undefined;
            const roomIndex1 = roomGrid[roomY][roomX];
            const room0 = (roomIndex0 === undefined) ? undefined : rooms[roomIndex0];
            const room1 = rooms[roomIndex1];
            const gapMinX = (room0 === undefined) ? 0 : room0.minX + room0.sizeX + 2;
            const gapMaxX = room1.minX - 1;
            if (room0 !== undefined &&
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

function decorateRoom(room, level) {
    if (room.sizeX < 13 || room.sizeY < 13) {
        return;
    }

    const roomType = Math.random();

    if (roomType < 0.333) {
        function plotPillar(x, y) {
            x += room.minX;
            y += room.minY;
            level.set(x, y, ttWall);
            level.set(x+1, y, ttWall);
            level.set(x, y+1, ttWall);
            level.set(x+1, y+1, ttWall);
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
    } else if (roomType < 0.667) {
        function plotRect(minX, minY, sizeX, sizeY, type) {
            for (let x = minX; x < minX + sizeX; ++x) {
                for (let y = minY; y < minY + sizeY; ++y) {
                    level.set(x, y, type);
                }
            }
        }

        plotRect(room.minX + 5, room.minY + 5, room.sizeX - 10, room.sizeY - 10, ttWall);
        plotRect(room.minX + 6, room.minY + 6, room.sizeX - 12, room.sizeY - 12, ttSolid);
    }
}

function hasEdge(edges, roomIndex0, roomIndex1) {
    return edges.some(e => e.edge[0] === roomIndex0 && e.edge[1] === roomIndex1);
}

function canHaveStraightVerticalHall(room0, room1) {
    const overlapMin = Math.max(room0.minX, room1.minX) + 1;
    const overlapMax = Math.min(room0.minX + room0.sizeX, room1.minX + room1.sizeX) - 1;
    const overlapSize = Math.max(0, overlapMax - overlapMin);
    return overlapSize >= corridorWidth;
}

function canHaveStraightHorizontalHall(room0, room1) {
    const overlapMin = Math.max(room0.minY, room1.minY) + 1;
    const overlapMax = Math.min(room0.minY + room0.sizeY, room1.minY + room1.sizeY) - 1;
    const overlapSize = Math.max(0, overlapMax - overlapMin);
    return overlapSize >= corridorWidth;
}

function isPositionTooCloseToOtherTurrets(turrets, position) {
    const dpos = vec2.create();
    for (const turret of turrets) {
        vec2.subtract(dpos, turret.position, position);
        const d = vec2.length(dpos);
        if (d < 3 * turretRadius) {
            return true;
        }
    }
    return false;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; --i) {
        let j = randomInRange(i + 1);
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
