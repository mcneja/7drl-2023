"use strict";

window.onload = loadResourcesThenRun;

const {mat2, mat3, mat4, vec2, vec3, vec4} = glMatrix;

const ttSolid = 0;
const ttWall = 1;
const ttHall = 2;
const ttRoom = 3;

const gsActive = 0;
const gsDied = 1;
const gsWon = 2;

const playerRadius = 0.5;
const playerMaxHitPoints = 4;
const bulletRadius = 0.25;
const bulletMinSpeed = 4;
const bulletMaxCapacity = 3;
const bulletRefillRate = 2;
const monsterRadius = 0.5;
const lootRadius = 0.5;
const turretFireDelayStart = 4.0;
const turretFireDelayEnd = 2.0;
const turretFireSpeed = 10.0;
const turretBulletLifetime = 4.0;
const invulnerabilityDuration = 6.0;
const swarmerAttackCooldownDuration = 2.0;
const pickupMessageDuration = 2.0;

const numCellsX = 4;
const numCellsY = 4;
const corridorWidth = 3;

const lavaStateInactive = 0;
const lavaStatePrimed = 1;
const lavaStateActive = 2;

const potionTypeHealth = 0;
const potionTypeInvulnerability = 1;

const damageDisplayDuration = 1.5;
const delayGameEndMessage = 2;

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
    const gl = canvas.getContext("webgl2", { alpha: false, depth: false });

    if (gl == null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    const renderer = createRenderer(gl, fontImage);
    const state = initState(renderer.createFieldRenderer, renderer.createLightingRenderer, renderer.createColoredTrianglesRenderer);

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
            resetState(state, renderer.createFieldRenderer, renderer.createLightingRenderer, renderer.createColoredTrianglesRenderer);
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
        } else if (e.code == 'Period') {
            e.preventDefault();
            state.mouseSensitivity += 1;
            if (state.paused) {
                requestUpdateAndRender();
            } else {
                setPickupMessage(state, ['Mouse sensitivity: ' + state.mouseSensitivity]);
            }
        } else if (e.code == 'Comma') {
            e.preventDefault();
            state.mouseSensitivity -= 1;
            if (state.paused) {
                requestUpdateAndRender();
            } else {
                setPickupMessage(state, ['Mouse sensitivity: ' + state.mouseSensitivity]);
            }
        } else if (e.code == 'Space') {
            e.preventDefault();
            if (!state.paused) {
                tryDrinkInvulnerabilityPotion(state);
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
            if (state.paused) {
                state.paused = false;
                state.tLast = undefined;
                state.timeToGameEndMessage = delayGameEndMessage;
                requestUpdateAndRender();
            }
        } else {
            document.removeEventListener("mousemove", onMouseMoved, false);
            document.removeEventListener("mousedown", onMouseDown, false);
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
            tryShootBullet(state);
        } else if (e.button == 2) {
            tryDrinkInvulnerabilityPotion(state);
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
    if (state.player.hitPoints <= 0) {
        return;
    }

    const movement = vec2.fromValues(e.movementX, -e.movementY);
    const scale = 0.05 * Math.pow(1.1, state.mouseSensitivity);
    vec2.scaleAndAdd(state.player.velocity, state.player.velocity, movement, scale);
}

function tryDrinkInvulnerabilityPotion(state) {
    if (state.player.hitPoints <= 0) {
        return;
    }

    if (state.player.numInvulnerabilityPotions < 1) {
        setPickupMessage(state, ['No Invulnerability Potion']);
        return;
    }

    state.player.numInvulnerabilityPotions -= 1;
    state.player.invulnerabilityTimer = Math.max(state.player.invulnerabilityTimer, invulnerabilityDuration);
}

function tryShootBullet(state) {
    if (state.player.hitPoints <= 0 || state.player.numBullets < 1) {
        return;
    }

    state.player.numBullets -= 1;

    const pos = vec2.create();
    vec2.copy(pos, state.player.position);
    const vel = vec2.create();
    const playerSpeed = vec2.length(state.player.velocity);
    const scale = Math.max(2 * playerSpeed, bulletMinSpeed) / Math.max(playerSpeed, 0.001);
    vec2.scale(vel, state.player.velocity, scale);

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

    let hitSomething = false;

    for (const spike of state.level.spikes) {
        if (spike.dead) {
            continue;
        }

        if (areDiscsTouching(bullet.position, bulletRadius, spike.position, monsterRadius)) {
            spike.dead = true;
            hitSomething = true;
        }
    }

    for (const turret of state.level.turrets) {
        if (turret.dead) {
            continue;
        }

        if (areDiscsTouching(bullet.position, bulletRadius, turret.position, monsterRadius)) {
            vec2.scaleAndAdd(turret.velocity, turret.velocity, bullet.velocity, 0.2);
            turret.dead = true;
            hitSomething = true;
        }
    }

    for (const swarmer of state.level.swarmers) {
        if (swarmer.dead) {
            continue;
        }

        if (areDiscsTouching(bullet.position, bulletRadius, swarmer.position, swarmer.radius)) {
            swarmer.dead = true;
            vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, bullet.velocity, 0.2);
            hitSomething = true;
        }
    }

    if (hitSomething) {
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

function renderPlayer(state, renderer, matScreenFromWorld) {
    state.player.color = (state.player.invulnerabilityTimer > 0) ? { r: 0, g: 1, b: 1 } : { r: 0, g: 0, b: 0 };
    renderer.renderDiscs(matScreenFromWorld, [state.player]);

    {
        const tx = 0.0625;
        const ty = 0.0625;

        const x = state.player.position[0];
        const y = state.player.position[1];
        const rx = 0.25;
        const ry = 0.5;
        const yOffset = -0.06;

        const glyphColor = (state.player.hitPoints > 0) ? 0xff00ffff : 0xff0020ff;

        renderer.renderGlyphs.start(matScreenFromWorld);
        renderer.renderGlyphs.add(x - rx, y + yOffset - ry, x + rx, y + yOffset + ry, 1*tx, ty, 2*tx, 0, glyphColor);
        renderer.renderGlyphs.flush();
    }
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

    const playerMass = 1;
    const bulletMass = 0.125;
    const elasticity = 1;

    if (areDiscsTouching(bullet.position, bulletRadius, state.player.position, playerRadius)) {
        elasticCollision(state.player, bullet, playerMass, bulletMass, elasticity);
        if (state.player.invulnerabilityTimer <= 0) {
            damagePlayer(state, 1);
        }
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

function updateSpikes(state, dt) {
    const velPrev = vec2.create();
    const dpos = vec2.create();
    for (const spike of state.level.spikes) {
        vec2.copy(velPrev, spike.velocity);
        slideToStop(spike, dt);
        vec2.scaleAndAdd(spike.position, spike.position, velPrev, dt / 2);
        vec2.scaleAndAdd(spike.position, spike.position, spike.velocity, dt / 2);

        // Disable cooldown once spike is no longer near player.

        if (spike.onContactCooldown) {
            vec2.subtract(dpos, spike.position, state.player.position);
            if (vec2.length(dpos) >= 1.5 * monsterRadius + playerRadius) {
                spike.onContactCooldown = false;
            }
        }
    }

    // Fix up spike positions relative to the environment and other objects.

    for (let i = 0; i < state.level.spikes.length; ++i)
    {
        const spike0 = state.level.spikes[i];

        fixupPositionAndVelocityAgainstLevel(spike0.position, spike0.velocity, spike0.radius, state.level.grid);

        if (spike0.dead)
            continue;

        for (let j = i + 1; j < state.level.spikes.length; ++j)
        {
            const spike1 = state.level.spikes[j];
            if (spike1.dead)
                continue;

            fixupDiscPair(spike0, spike1);
        }
    }
}

function setPickupMessage(state, message) {
    state.pickupMessage = message;
    state.pickupMessageTimer = pickupMessageDuration;
}

function fractionOfLootCollected(state) {
    return (state.level.numLootItemsTotal - state.level.lootItems.length) / state.level.numLootItemsTotal;
}

function turretFireDelay(state) {
    return lerp(turretFireDelayStart, turretFireDelayEnd, fractionOfLootCollected(state));
}

function updateTurrets(state, dt) {
    const dpos = vec2.create();

    for (const turret of state.level.turrets) {
        slideToStop(turret, dt);
        vec2.scaleAndAdd(turret.position, turret.position, turret.velocity, dt);

        // Disable cooldown once spike is no longer near player.

        if (turret.onContactCooldown) {
            vec2.subtract(dpos, turret.position, state.player.position);
            if (vec2.length(dpos) >= 1.5 * monsterRadius + playerRadius) {
                turret.onContactCooldown = false;
            }
        }

        if (!turret.dead) {
            turret.timeToFire -= dt;
            if (turret.timeToFire <= 0) {
                turret.timeToFire += turretFireDelay(state);

                if (distanceBetween(turret.position, state.player.position) < 20) {
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

    // Fix up turret positions relative to the environment and other objects.

    for (let i = 0; i < state.level.turrets.length; ++i)
    {
        const turret0 = state.level.turrets[i];

        fixupPositionAndVelocityAgainstLevel(turret0.position, turret0.velocity, turret0.radius, state.level.grid);

        if (turret0.dead)
            continue;

        for (const spike of state.level.spikes) {
            if (spike.dead)
                continue;

            fixupDiscPair(turret0, spike);
        }

        for (let j = i + 1; j < state.level.turrets.length; ++j)
        {
            const turret1 = state.level.turrets[j];
            if (turret1.dead)
                continue;

            fixupDiscPair(turret0, turret1);
        }
    }
}

function updateSwarmers(state, dt) {
    const uLoot = fractionOfLootCollected(state);
    const accelerationRate = lerp(10, 20, uLoot);
    const dragAccelerationRate = 3;
    const perturbationAccelerationRate = 8;
    const separationDist = 5;
    const separationForce = 1;

    const velPrev = vec2.create();
    const perturbationDir = vec2.create();
    const dpos = vec2.create();

    for (const swarmer of state.level.swarmers) {
        vec2.copy(velPrev, swarmer.velocity);

        swarmer.heading += swarmer.headingRate * dt;
        swarmer.heading -= Math.floor(swarmer.heading);

        if (swarmer.dead) {
            slideToStop(swarmer, dt);
        } else {
            const heading = swarmer.heading * 2 * Math.PI;
            vec2.set(perturbationDir, Math.cos(heading), Math.sin(heading));

            if (state.player.hitPoints > 0 && state.player.swarmerAttackCooldown <= 0) {
                const dposToTarget = vec2.create();
                vec2.subtract(dposToTarget, swarmer.position, state.player.position);
                const distToTarget = vec2.length(dposToTarget);
    
                if (distToTarget < 24 && clearLineOfSight(state.level, swarmer.position, state.player.position)) {            
                    vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, dposToTarget, -accelerationRate * dt / distToTarget);
                }
            }

            vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, perturbationDir, perturbationAccelerationRate * dt);
            vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, velPrev, -dragAccelerationRate * dt);

            // Avoid other spikes, turrets, and swarmers

            for (const spike of state.level.spikes) {
                if (spike.dead)
                    continue;
                vec2.subtract(dpos, spike.position, swarmer.position);
                const dist = vec2.length(dpos);
                if (dist < separationDist) {
                    const scale = (dist - separationDist) * (separationForce * dt / dist);
                    vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, dpos, scale);
                }
            }

            for (const turret of state.level.turrets) {
                if (turret.dead)
                    continue;
                vec2.subtract(dpos, turret.position, swarmer.position);
                const dist = vec2.length(dpos);
                if (dist < separationDist) {
                    const scale = (dist - separationDist) * (separationForce * dt / dist);
                    vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, dpos, scale);
                }
            }

            for (const swarmerOther of state.level.swarmers) {
                if (swarmerOther.dead)
                    continue;
                if (swarmerOther == swarmer)
                    continue;

                vec2.subtract(dpos, swarmerOther.position, swarmer.position);
                const dist = vec2.length(dpos);
                if (dist < separationDist) {
                    const scale = (dist - separationDist) * (separationForce * dt / dist);
                    vec2.scaleAndAdd(swarmer.velocity, swarmer.velocity, dpos, scale);
                }
            }
        }

        vec2.scaleAndAdd(swarmer.position, swarmer.position, velPrev, dt / 2);
        vec2.scaleAndAdd(swarmer.position, swarmer.position, swarmer.velocity, dt / 2);

        // Disable cooldown once swarmer is no longer near player.

        if (swarmer.onContactCooldown) {
            vec2.subtract(dpos, swarmer.position, state.player.position);
            if (vec2.length(dpos) >= 1.5 * monsterRadius + playerRadius) {
                swarmer.onContactCooldown = false;
            }
        }
    }

    // Fix up swarmer positions relative to the environment and other objects.

    for (let i = 0; i < state.level.swarmers.length; ++i)
    {
        const swarmer0 = state.level.swarmers[i];

        fixupPositionAndVelocityAgainstLevel(swarmer0.position, swarmer0.velocity, swarmer0.radius, state.level.grid);

        if (swarmer0.dead)
            continue;

        for (let j = i + 1; j < state.level.swarmers.length; ++j)
        {
            const swarmer1 = state.level.swarmers[j];
            if (swarmer1.dead)
                continue;

            fixupDiscPair(swarmer0, swarmer1);
        }
    }
}

function renderSpikesDead(spikes, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = spikes.filter(spike => spike.dead).map(spike => ({
        position: spike.position,
        color: color,
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(111);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const glyphColor = 0xff808080;

    for (const spike of spikes) {
        if (spike.dead) {
            const x = spike.position[0];
            const y = spike.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                glyphColor
            );
        }
    }

    renderer.renderGlyphs.flush();
}

function renderSpikesAlive(spikes, renderer, matScreenFromWorld) {
    const color = { r: 0.25, g: 0.34375, b: 0.25 };
    const discs = spikes.filter(spike => !spike.dead).map(spike => ({
        position: spike.position,
        color: color,
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(111);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const glyphColor = 0xff80b080;

    for (const spike of spikes) {
        if (!spike.dead) {
            const x = spike.position[0];
            const y = spike.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                glyphColor
            );
        }
    }

    renderer.renderGlyphs.flush();
}

function renderTurretsDead(turrets, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = turrets.filter(turret => turret.dead).map(turret => ({
        position: turret.position,
        color: color,
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

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

    renderer.renderGlyphs.flush();
}

function renderTurretsAlive(state, turrets, renderer, matScreenFromWorld) {
    const colorWindup = { r: 1, g: 0.5, b: 0.25 };
    const color = { r: 0.34375, g: 0.25, b: 0.25 };
    const discs = turrets.filter(turret => !turret.dead).map(turret => ({
        position: turret.position,
        color: colorLerp(colorWindup, color, Math.min(1, 4 * turret.timeToFire / turretFireDelay(state))),
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

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

    renderer.renderGlyphs.flush();
}

function renderSwarmersDead(swarmers, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = swarmers.filter(swarmer => swarmer.dead).map(swarmer => ({
        position: swarmer.position,
        color: color,
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(98);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const glyphColor = 0xff808080;

    for (const swarmer of swarmers) {
        if (swarmer.dead) {
            const x = swarmer.position[0];
            const y = swarmer.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                glyphColor
            );
        }
    }

    renderer.renderGlyphs.flush();
}

function renderSwarmersAlive(swarmers, renderer, matScreenFromWorld) {
    const color = { r: 0.125, g: 0.125, b: 0.125 };
    const discs = swarmers.filter(swarmer => !swarmer.dead).map(swarmer => ({
        position: swarmer.position,
        color: color,
        radius: monsterRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(98);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = 0;
    const glyphColor = 0xff5555ff;

    for (const swarmer of swarmers) {
        if (!swarmer.dead) {
            const x = swarmer.position[0];
            const y = swarmer.position[1];
            renderer.renderGlyphs.add(
                x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                glyphColor
            );
        }
    }

    renderer.renderGlyphs.flush();
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
    const renderer = {
        beginFrame: createBeginFrame(gl),
        createFieldRenderer: createFieldRenderer(gl),
        createLightingRenderer: createLightingRenderer(gl),
        renderDiscs: createDiscRenderer(gl),
        renderGlyphs: createGlyphRenderer(gl, fontImage),
        createColoredTrianglesRenderer: createColoredTrianglesRenderer(gl),
        renderVignette: createVignetteRenderer(gl),
    };

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    return renderer;
}

function initState(createFieldRenderer, createLightingRenderer, createColoredTrianglesRenderer) {
    const state = {
        paused: true,
        showMap: false,
        mapZoom: 1,
        mapZoomVelocity: 0,
        mouseSensitivity: 0,
    };
    resetState(state, createFieldRenderer, createLightingRenderer, createColoredTrianglesRenderer);
    return state;
}

function resetState(state, createFieldRenderer, createLightingRenderer, createColoredTrianglesRenderer) {
    const level = createLevel();

    const distanceFieldFromExit = createDistanceField(level.grid, level.amuletPos);
    const distanceFieldFromEntrance = createDistanceField(level.grid, level.playerStartPos);

    const renderField = createFieldRenderer(level, distanceFieldFromExit);
    const renderLighting = createLightingRenderer(level, distanceFieldFromEntrance, distanceFieldFromExit);
    const renderColoredTriangles = createColoredTrianglesRenderer(level.vertexData);

    const player = {
        position: vec2.create(),
        velocity: vec2.create(),
        radius: playerRadius,
        color: { r: 0, g: 0, b: 0 },
        numInvulnerabilityPotions: 1,
        invulnerabilityTimer: 0,
        numBullets: 3,
        amuletCollected: false,
        hitPoints: playerMaxHitPoints,
        damageDisplayTimer: 0,
        swarmerAttackCooldown: 0,
        dead: false,
    };

    vec2.copy(player.position, level.playerStartPos);
    vec2.zero(player.velocity);

    const camera = {
        position: vec2.create(),
        velocity: vec2.create(),
        joltOffset: vec2.create(),
        joltVelocity: vec2.create(),
    };

    vec2.copy(camera.position, player.position);
    vec2.zero(camera.velocity);
    vec2.zero(camera.joltOffset);
    vec2.zero(camera.joltVelocity);

    const lava = {
        state: lavaStateInactive,
        textureScroll: 0,
        levelTarget: 0,
        levelBase: 0,
        levelBaseVelocity: 0,
    };

    state.distanceFieldFromEntrance = distanceFieldFromEntrance;
    state.distanceFieldFromExit = distanceFieldFromExit;
    state.renderField = renderField;
    state.renderLighting = renderLighting;
    state.renderColoredTriangles = renderColoredTriangles;
    state.tLast = undefined;
    state.player = player;
    state.gameState = gsActive;
    state.timeToGameEndMessage = delayGameEndMessage;
    state.playerBullets = [];
    state.turretBullets = [];
    state.camera = camera;
    state.level = level;
    state.lava = lava;
    state.pickupMessage = [];
    state.pickupMessageTimer = 0;
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
    const vsSource = `#version 300 es
        in vec3 vPosition;
        in vec2 vDistance;

        uniform mat4 uMatScreenFromField;

        out highp float fYBlend;
        out highp vec2 fDistance;

        void main() {
            gl_Position = uMatScreenFromField * vec4(vPosition.xy, 0, 1);
            fYBlend = vPosition.z;
            fDistance = vDistance;
        }
    `;

    const fsSource = `#version 300 es
        in highp float fYBlend;
        in highp vec2 fDistance;

        uniform highp float uDistCutoff;
        uniform highp float uScroll;
        uniform sampler2D uContour;

        out lowp vec4 fragColor;

        void main() {
            highp float distance = mix(fDistance.x, fDistance.y, fYBlend);
            highp float s = distance - uDistCutoff;
            highp vec4 contourColor = texture(uContour, vec2(s - uScroll, 0));
            highp vec4 lavaColor = contourColor * vec4(1, 0.25, 0, 1);
            highp vec4 floorColor = vec4(1, 1, 1, 0);
            highp vec4 color = mix(lavaColor, floorColor, max(0.0, sign(s)));
            fragColor = color;
        }
    `;

    const attribs = {
        vPosition: 0,
        vDistance: 1,
    };

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const uniformLoc = {
        uMatScreenFromField: gl.getUniformLocation(program, 'uMatScreenFromField'),
        uDistCutoff: gl.getUniformLocation(program, 'uDistCutoff'),
        uScroll: gl.getUniformLocation(program, 'uScroll'),
        uContour: gl.getUniformLocation(program, 'uContour'),
    };

    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    const contourTexture = createStripeTexture(gl);

    return (level, distanceField) => {
        // First, count how many quads will be created, so we can size the buffers.
        const gridSizeX = level.grid.sizeX;
        const gridSizeY = level.grid.sizeY;
        let numQuads = 0;
        for (let y = 0; y < gridSizeY; ++y) {
            for (let x = 0; x < gridSizeX; ++x) {
                const tileType = level.grid.get(x, y);
                if (tileType != ttHall && tileType != ttRoom)
                    continue;
                ++numQuads;
            }
        }

        // Allocate buffers for vertex data and triangle indices.
        const floatsPerVertex = 5;
        const numIndices = numQuads * 6;
        const vertexData = new Float32Array(numQuads * floatsPerVertex * 4);
        const indexData = new Uint16Array(numIndices);

        // Fill in the buffers with vertex and index information.
        let cVertex = 0;
        let iVertexData = 0;
        let iIndexData = 0;

        function makeVert(x, y, s, d0, d1) {
            vertexData[iVertexData++] = x;
            vertexData[iVertexData++] = y;
            vertexData[iVertexData++] = s;
            vertexData[iVertexData++] = d0;
            vertexData[iVertexData++] = d1;
        }

        for (let y0 = 0; y0 < gridSizeY; ++y0) {
            for (let x0 = 0; x0 < gridSizeX; ++x0) {
                const tileType = level.grid.get(x0, y0);
                if (tileType != ttHall && tileType != ttRoom)
                    continue;

                const x1 = x0 + 1;
                const y1 = y0 + 1;

                const d00 = distanceField.get(x0, y0);
                const d10 = distanceField.get(x1, y0);
                const d01 = distanceField.get(x0, y1);
                const d11 = distanceField.get(x1, y1);

                makeVert(x0, y0, 0, d00, d01);
                makeVert(x1, y0, 0, d10, d11);
                makeVert(x0, y1, 1, d00, d01);
                makeVert(x1, y1, 1, d10, d11);

                indexData[iIndexData++] = cVertex;
                indexData[iIndexData++] = cVertex + 1;
                indexData[iIndexData++] = cVertex + 2;
                indexData[iIndexData++] = cVertex + 2;
                indexData[iIndexData++] = cVertex + 1;
                indexData[iIndexData++] = cVertex + 3;

                cVertex += 4;
            }
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(attribs.vPosition);
        gl.enableVertexAttribArray(attribs.vDistance);

        // Fill the GL buffers with vertex and index data.
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        const stride = floatsPerVertex * 4;
        gl.vertexAttribPointer(attribs.vPosition, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(attribs.vDistance, 2, gl.FLOAT, false, stride, 12);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        // Return a function that will take a matrix and do the actual rendering.
        return (matScreenFromWorld, distCutoff, uScroll) => {
            gl.useProgram(program);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, contourTexture);
    
            gl.uniform1i(uniformLoc.uContour, 0);
            gl.uniformMatrix4fv(uniformLoc.uMatScreenFromField, false, matScreenFromWorld);
            gl.uniform1f(uniformLoc.uDistCutoff, distCutoff);
            gl.uniform1f(uniformLoc.uScroll, uScroll);

            gl.bindVertexArray(vao);
            gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        };
    };
}

function createLightingRenderer(gl) {
    const vsSource = `#version 300 es
        in vec3 vPosition;
        in vec2 vDistanceFromEntrance;
        in vec2 vDistanceFromExit;

        uniform mat4 uMatScreenFromField;

        out highp float fYBlend;
        out highp vec2 fDistanceFromEntrance;
        out highp vec2 fDistanceFromExit;

        void main() {
            gl_Position = uMatScreenFromField * vec4(vPosition.xy, 0, 1);
            fYBlend = vPosition.z;
            fDistanceFromEntrance = vDistanceFromEntrance;
            fDistanceFromExit = vDistanceFromExit;
        }
    `;

    const fsSource = `#version 300 es
        in highp float fYBlend;
        in highp vec2 fDistanceFromEntrance;
        in highp vec2 fDistanceFromExit;

        uniform highp float uDistCenterFromEntrance;
        uniform highp float uDistCenterFromExit;
        uniform highp float uAlphaEntrance;

        out lowp vec4 fragColor;

        void main() {
            highp float distanceFromEntrance = mix(fDistanceFromEntrance.x, fDistanceFromEntrance.y, fYBlend);
            highp float distanceFromExit = mix(fDistanceFromExit.x, fDistanceFromExit.y, fYBlend);
            highp float uEntrance = 1.0 - smoothstep(uDistCenterFromEntrance - 8.0, uDistCenterFromEntrance, distanceFromEntrance);
            highp float uExit = clamp((uDistCenterFromExit - distanceFromExit + 6.0) * 0.0625, 0.0, 1.0);
            fragColor.rgb = vec3(0.22, 0.3, 0.333) * uEntrance * uEntrance * uAlphaEntrance + vec3(1, 0, 0) * uExit;
        }
    `;

    const attribs = {
        vPosition: 0,
        vDistanceFromEntrance: 1,
        vDistanceFromExit: 2,
    };

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const uniformLoc = {
        uMatScreenFromField: gl.getUniformLocation(program, 'uMatScreenFromField'),
        uDistCenterFromEntrance: gl.getUniformLocation(program, 'uDistCenterFromEntrance'),
        uDistCenterFromExit: gl.getUniformLocation(program, 'uDistCenterFromExit'),
        uAlphaEntrance: gl.getUniformLocation(program, 'uAlphaEntrance'),
    };

    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    return (level, distanceFromEntrance, distanceFromExit) => {
        // First, count how many quads will be created, so we can size the buffers.
        const gridSizeX = level.grid.sizeX;
        const gridSizeY = level.grid.sizeY;
        let numQuads = 0;
        for (let y = 0; y < gridSizeY; ++y) {
            for (let x = 0; x < gridSizeX; ++x) {
                const tileType = level.grid.get(x, y);
                if (tileType != ttHall && tileType != ttRoom)
                    continue;
                ++numQuads;
            }
        }

        // Allocate buffers for vertex data and triangle indices.
        const floatsPerVertex = 7;
        const numIndices = numQuads * 6;
        const vertexData = new Float32Array(numQuads * floatsPerVertex * 4);
        const indexData = new Uint16Array(numIndices);

        // Fill in the buffers with vertex and index information.
        let cVertex = 0;
        let iVertexData = 0;
        let iIndexData = 0;

        function makeVert(x, y, s, d0, d1, e0, e1) {
            vertexData[iVertexData++] = x;
            vertexData[iVertexData++] = y;
            vertexData[iVertexData++] = s;
            vertexData[iVertexData++] = d0;
            vertexData[iVertexData++] = d1;
            vertexData[iVertexData++] = e0;
            vertexData[iVertexData++] = e1;
        }

        for (let y0 = 0; y0 < gridSizeY; ++y0) {
            for (let x0 = 0; x0 < gridSizeX; ++x0) {
                const tileType = level.grid.get(x0, y0);
                if (tileType != ttHall && tileType != ttRoom)
                    continue;

                const x1 = x0 + 1;
                const y1 = y0 + 1;

                const d00 = distanceFromEntrance.get(x0, y0);
                const d10 = distanceFromEntrance.get(x1, y0);
                const d01 = distanceFromEntrance.get(x0, y1);
                const d11 = distanceFromEntrance.get(x1, y1);

                const e00 = distanceFromExit.get(x0, y0);
                const e10 = distanceFromExit.get(x1, y0);
                const e01 = distanceFromExit.get(x0, y1);
                const e11 = distanceFromExit.get(x1, y1);

                makeVert(x0, y0, 0, d00, d01, e00, e01);
                makeVert(x1, y0, 0, d10, d11, e10, e11);
                makeVert(x0, y1, 1, d00, d01, e00, e01);
                makeVert(x1, y1, 1, d10, d11, e10, e11);

                indexData[iIndexData++] = cVertex;
                indexData[iIndexData++] = cVertex + 1;
                indexData[iIndexData++] = cVertex + 2;
                indexData[iIndexData++] = cVertex + 2;
                indexData[iIndexData++] = cVertex + 1;
                indexData[iIndexData++] = cVertex + 3;

                cVertex += 4;
            }
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.enableVertexAttribArray(attribs.vPosition);
        gl.enableVertexAttribArray(attribs.vDistanceFromEntrance);
        gl.enableVertexAttribArray(attribs.vDistanceFromExit);

        // Fill the GL buffers with vertex and index data.
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        const stride = floatsPerVertex * 4;
        gl.vertexAttribPointer(attribs.vPosition, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(attribs.vDistanceFromEntrance, 2, gl.FLOAT, false, stride, 12);
        gl.vertexAttribPointer(attribs.vDistanceFromExit, 2, gl.FLOAT, false, stride, 20);
        gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        // Return a function that will take a matrix and do the actual rendering.
        return (matScreenFromWorld, distCenterFromEntrance, distCenterFromExit, alphaEntrance) => {
            gl.useProgram(program);

            gl.uniformMatrix4fv(uniformLoc.uMatScreenFromField, false, matScreenFromWorld);
            gl.uniform1f(uniformLoc.uDistCenterFromEntrance, distCenterFromEntrance);
            gl.uniform1f(uniformLoc.uDistCenterFromExit, distCenterFromExit);
            gl.uniform1f(uniformLoc.uAlphaEntrance, alphaEntrance);

            gl.bindVertexArray(vao);
            gl.blendFunc(gl.ONE, gl.ONE);

            gl.drawElements(gl.TRIANGLES, numIndices, gl.UNSIGNED_SHORT, 0);

            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindVertexArray(null);
        };
    };
}

function createDiscRenderer(gl) {
    const vsSource = `#version 300 es
        in vec2 vPosition;
        
        uniform mat4 uMatScreenFromDisc;

        out highp vec2 fPosition;

        void main() {
            fPosition = vPosition;
            gl_Position = uMatScreenFromDisc * vec4(vPosition.xy, 0, 1);
        }
    `;

    const fsSource = `#version 300 es
        in highp vec2 fPosition;

        uniform highp vec3 uColor;

        out lowp vec4 fragColor;

        void main() {
            highp float r = length(fPosition);
            highp float aaf = fwidth(r);
            highp float opacity = 1.0 - smoothstep(1.0 - aaf, 1.0, r);
            fragColor = vec4(uColor, opacity);
        }
    `;

    const attribs = {
        vPosition: 0,
    };

    const matWorldFromDisc = mat4.create();
    const matScreenFromDisc = mat4.create();

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const projectionMatrixLoc = gl.getUniformLocation(program, 'uMatScreenFromDisc');
    const colorLoc = gl.getUniformLocation(program, 'uColor');
    const vertexBuffer = createDiscVertexBuffer(gl);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    gl.enableVertexAttribArray(attribs.vPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    const stride = 8; // two 4-byte floats
    gl.vertexAttribPointer(attribs.vPosition, 2, gl.FLOAT, false, stride, 0);

    gl.bindVertexArray(null);

    return (matScreenFromWorld, discs) => {
        gl.useProgram(program);
        gl.bindVertexArray(vao);

        for (const disc of discs) {
            matWorldFromDisc[0] = disc.radius;
            matWorldFromDisc[5] = disc.radius;
            matWorldFromDisc[12] = disc.position[0];
            matWorldFromDisc[13] = disc.position[1];
            mat4.multiply(matScreenFromDisc, matScreenFromWorld, matWorldFromDisc);

            gl.uniform3f(colorLoc, disc.color.r, disc.color.g, disc.color.b);
            gl.uniformMatrix4fv(projectionMatrixLoc, false, matScreenFromDisc);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.bindVertexArray(null);
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

        uniform sampler2D uOpacity;

        out lowp vec4 fragColor;

        void main() {
            fragColor = fColor * vec4(1, 1, 1, texture(uOpacity, fTexcoord));
        }
    `;

    const attribs = {
        vPositionTexcoord: 0,
        vColor: 1,
    };

    const fontTexture = createTextureFromImage(gl, fontImage);

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

    function setMatScreenFromWorld(matScreenFromWorld) {
        mat4.copy(matScreenFromWorldCached, matScreenFromWorld);
    }

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

    function flushQuads() {
        if (numQuads <= 0) {
            return;
        }

        gl.useProgram(program);

        gl.bindVertexArray(vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fontTexture);
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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

function createColoredTrianglesRenderer(gl) {
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

function createVignetteRenderer(gl) {
    const vsSource = `#version 300 es
        in vec2 vPositionScreen;

        uniform mat4 uMatDiscFromScreen;

        out highp vec2 fPositionDisc;

        void main() {
            highp vec4 posScreen = vec4(vPositionScreen.xy, 0, 1);
            fPositionDisc = (uMatDiscFromScreen * posScreen).xy;
            gl_Position = posScreen;
        }
    `;

    const fsSource = `#version 300 es
        in highp vec2 fPositionDisc;

        uniform highp vec4 uColorInner;
        uniform highp vec4 uColorOuter;
        uniform highp float uRadiusInner;

        out lowp vec4 fragColor;

        void main() {
            highp float r = length(fPositionDisc);
            highp float u = smoothstep(uRadiusInner, 1.0, r);
            fragColor = mix(uColorInner, uColorOuter, u);
        }
    `;

    const attribs = {
        vPositionScreen: 0,
    };

    const program = initShaderProgram(gl, vsSource, fsSource, attribs);

    const uLocMatDiscFromScreen = gl.getUniformLocation(program, 'uMatDiscFromScreen');
    const uLocColorInner = gl.getUniformLocation(program, 'uColorInner');
    const uLocColorOuter = gl.getUniformLocation(program, 'uColorOuter');
    const uLocRadiusInner = gl.getUniformLocation(program, 'uRadiusInner');

    const vertexData = new Float32Array(6 * 2);
    {
        let i = 0;

        function makeVert(x, y) {
            vertexData[i++] = x;
            vertexData[i++] = y;
        }

        makeVert(-1, -1);
        makeVert( 1, -1);
        makeVert( 1,  1);
        makeVert( 1,  1);
        makeVert(-1,  1);
        makeVert(-1, -1);
    }

    const vertexBuffer = gl.createBuffer();

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(attribs.vLocPositionScreen);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(attribs.vLocPositionScreen, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    return (matDiscFromScreen, radiusInner, colorInner, colorOuter) => {
        gl.useProgram(program);

        gl.uniformMatrix4fv(uLocMatDiscFromScreen, false, matDiscFromScreen);
        gl.uniform1f(uLocRadiusInner, radiusInner);
        gl.uniform4fv(uLocColorInner, colorInner);
        gl.uniform4fv(uLocColorOuter, colorOuter);

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
    };
}

function slideToStop(body, dt) {
    const r = Math.exp(-3 * dt);
    vec2.scale(body.velocity, body.velocity, r);
}

function posInRect(position, rect) {
    return (position[0] >= rect.minX &&
            position[1] >= rect.minY &&
            position[0] < rect.minX + rect.sizeX &&
            position[1] < rect.minY + rect.sizeY);
}

function updateState(state, dt) {

    // Player

    if (state.player.hitPoints <= 0) {
        slideToStop(state.player, dt);
    }

    state.pickupMessageTimer = Math.max(0, state.pickupMessageTimer - dt);
    state.player.swarmerAttackCooldown = Math.max(0, state.player.swarmerAttackCooldown - dt);
    state.player.damageDisplayTimer = Math.max(0, state.player.damageDisplayTimer - dt);
    state.player.invulnerabilityTimer = Math.max(0, state.player.invulnerabilityTimer - dt);
    if (state.player.hitPoints > 0) {
        state.player.numBullets = Math.min(bulletMaxCapacity, state.player.numBullets + bulletRefillRate * dt);
    }

    vec2.scaleAndAdd(state.player.position, state.player.position, state.player.velocity, dt);

    // Game-end message

    state.timeToGameEndMessage = Math.max(0, state.timeToGameEndMessage - dt);

    if (state.player.amuletCollected &&
        state.gameState == gsActive &&
        posInRect(state.player.position, state.level.startRoom)) {
        state.gameState = gsWon;
        state.timeToGameEndMessage = delayGameEndMessage;
    }

    // Other

    updateLootItems(state);
    updatePotions(state);
    updateCamera(state, dt);
    updateLava(state, dt);
    updateSpikes(state, dt);
    updateTurrets(state, dt);
    updateSwarmers(state, dt);
    updatePlayerBullets(state, dt);
    updateTurretBullets(state, dt);

    // Collide player against objects and the environment

    const spikeElasticity = 0.2;
    const turretElasticity = 0.5;
    const swarmerElasticity = 0.8;
    const spikeMass = 1.5;
    const turretMass = 1;
    const swarmerMass = 0.25;

    for (let i = 0; i < 4; ++i) {
        for (const spike of state.level.spikes) {
            if (!spike.dead) {
                if (collideDiscs(state.player, spike, 1, spikeMass, spikeElasticity)) {
                    if (state.player.invulnerabilityTimer > 0) {
                        spike.dead = true;
                    } else if (!spike.onContactCooldown) {
                        damagePlayer(state, 1);
                        spike.onContactCooldown = true;
                    }
                }
            }
        }

        for (const turret of state.level.turrets) {
            if (!turret.dead) {
                if (collideDiscs(state.player, turret, 1, turretMass, turretElasticity)) {
                    if (state.player.invulnerabilityTimer > 0) {
                        turret.dead = true;
                    } else if (!turret.onContactCooldown) {
                        damagePlayer(state, 1);
                        turret.onContactCooldown = true;
                    }
                }
            }
        }

        for (const swarmer of state.level.swarmers) {
            if (!swarmer.dead) {
                if (collideDiscs(state.player, swarmer, 1, swarmerMass, swarmerElasticity)) {
                    if (state.player.invulnerabilityTimer > 0) {
                        swarmer.dead = true;
                    } else if (!swarmer.onContactCooldown) {
                        damagePlayer(state, 1);
                        state.player.swarmerAttackCooldown = swarmerAttackCooldownDuration;
                        swarmer.onContactCooldown = true;
                    }
                }
            }
        }
    
        fixupPositionAndVelocityAgainstLevel(state.player.position, state.player.velocity, state.player.radius, state.level.grid);
    }
}

function updateLava(state, dt) {
    // Lava texture animation

    state.lava.textureScroll += dt;
    state.lava.textureScroll -= Math.floor(state.lava.textureScroll);

    // Activate lava when player reaches the exit and then leaves

    if (state.lava.state == lavaStatePrimed) {
        if (!posInRect(state.player.position, state.level.amuletRoom)) {
            state.lava.state = lavaStateActive;
        }
    } else if (state.lava.state == lavaStateInactive) {
        const dposAmulet = vec2.create();
        vec2.subtract(dposAmulet, state.player.position, state.level.amuletPos);
        const distPlayerFromAmulet = vec2.length(dposAmulet);
        if (distPlayerFromAmulet < playerRadius + lootRadius) {
            state.lava.state = lavaStatePrimed;
            state.player.amuletCollected = true;
            setPickupMessage(state, ['Amulet']);
        }
    }

    // Update lava's flow

    if (state.lava.state != lavaStateActive) {
        return;
    }

    const entranceDistFromExit = estimateDistance(state.distanceFieldFromExit, state.level.playerStartPos);
    const playerDistFromExit = estimateDistance(state.distanceFieldFromExit, state.player.position);

    const maxLevelTarget = entranceDistFromExit - 4;

    state.lava.levelTarget = Math.min(maxLevelTarget, Math.max(state.lava.levelTarget, playerDistFromExit + 10));

    const levelError = state.lava.levelTarget - state.lava.levelBase;
    const levelVelocityError = -state.lava.levelBaseVelocity;

    const lavaLevelSpring = 1.25;

    const levelAcceleration = levelError * lavaLevelSpring**2 + levelVelocityError * 2 * lavaLevelSpring;

    const levelBaseVelocityNew = state.lava.levelBaseVelocity + levelAcceleration * dt;
    state.lava.levelBase += (state.lava.levelBaseVelocity + levelBaseVelocityNew) * (dt / 2);
    state.lava.levelBaseVelocity = levelBaseVelocityNew;

    // Test objects against lava to see if it kills them

    if (isPosInLava(state, state.player.position) && state.player.invulnerabilityTimer <= 0) {
        damagePlayer(state, 100);
    }

    for (const spike of state.level.spikes) {
        if (!spike.dead && isPosInLava(state, spike.position)) {
            spike.dead = true;
        }
    }

    for (const turret of state.level.turrets) {
        if (!turret.dead && isPosInLava(state, turret.position)) {
            turret.dead = true;
        }
    }

    for (const swarmer of state.level.swarmers) {
        if (!swarmer.dead && isPosInLava(state, swarmer.position)) {
            swarmer.dead = true;
        }
    }
}

function updateCamera(state, dt) {

    // Animate map zoom

    const mapZoomTarget = state.showMap ? 0 : 1;
    const kSpringMapZoom = 12;
    const mapZoomAccel = ((mapZoomTarget - state.mapZoom) * kSpringMapZoom - 2 * state.mapZoomVelocity) * kSpringMapZoom;
    const mapZoomVelNew = state.mapZoomVelocity + mapZoomAccel * dt;
    state.mapZoom += (state.mapZoomVelocity + mapZoomVelNew) * (dt / 2);
    state.mapZoomVelocity = mapZoomVelNew;

    // Animate jolt

    if (state.lava.state != lavaStateInactive) {
        const joltScale = (state.lava.state == lavaStateActive) ? Math.min(3, state.lava.levelBaseVelocity) : 1;
        const randomOffset = vec2.create();
        generateRandomGaussianPair(0, joltScale, randomOffset);
        vec2.add(state.camera.joltVelocity, state.camera.joltVelocity, randomOffset);
    }

    // Update jolt

    const kSpringJolt = 12;

    const accJolt = vec2.create();
    vec2.scale(accJolt, state.camera.joltOffset, -(kSpringJolt**2));
    vec2.scaleAndAdd(accJolt, accJolt, state.camera.joltVelocity, -kSpringJolt);

    const velJoltNew = vec2.create();
    vec2.scaleAndAdd(velJoltNew, state.camera.joltVelocity, accJolt, dt);
    vec2.scaleAndAdd(state.camera.joltOffset, state.camera.joltOffset, state.camera.joltVelocity, 0.5 * dt);
    vec2.scaleAndAdd(state.camera.joltOffset, state.camera.joltOffset, velJoltNew, 0.5 * dt);
    vec2.copy(state.camera.joltVelocity, velJoltNew);

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

function generateRandomGaussianPair(mean, stdDev, pairOut) {
    let s;
    do {
        pairOut[0] = Math.random() * 2 - 1;
        pairOut[1] = Math.random() * 2 - 1;
        s = vec2.squaredLength(pairOut);
    } while (s >= 1 || s == 0);
    s = stdDev * Math.sqrt(-2.0 * Math.log(s) / s);
    vec2.scale(pairOut, pairOut, s);
    vec2.add(pairOut, pairOut, vec2.fromValues(mean, mean));
}

function isPosInLava(state, position) {
    const distFromExit = estimateDistance(state.distanceFieldFromExit, position);
    return distFromExit < state.lava.levelBase;
}

function damagePlayer(state, numHitPoints) {
    const hitPointsPrev = state.player.hitPoints;
    state.player.hitPoints = Math.max(0, state.player.hitPoints - numHitPoints);
    if (state.player.hitPoints >= hitPointsPrev)
        return;

    if (hitPointsPrev > 0) {
        state.player.damageDisplayTimer = damageDisplayDuration;
    }

    state.player.invulnerabilityTimer = 0;

    if (state.player.hitPoints <= 0 && state.gameState != gsDied) {
        state.gameState = gsDied;
        state.timeToGameEndMessage = delayGameEndMessage;
    }
}

function fixupDiscPair(disc0, disc1) {
    collideDiscs(disc0, disc1, 1, 1, 0);
}

function collideDiscs(disc0, disc1, mass0, mass1, elasticity) {
    const dpos = vec2.create();
    vec2.subtract(dpos, disc1.position, disc0.position);
    const d = vec2.length(dpos);
    const dist = d - (disc0.radius + disc1.radius);

    if (dist >= 0) {
        return false;
    }

    const scalePosFixup = dist / (d * (mass0 + mass1));
    vec2.scaleAndAdd(disc0.position, disc0.position, dpos, scalePosFixup * mass1);
    vec2.scaleAndAdd(disc1.position, disc1.position, dpos, -scalePosFixup * mass0);

    const dvel = vec2.create();
    vec2.subtract(dvel, disc1.velocity, disc0.velocity);
    const vn = vec2.dot(dpos, dvel);

    if (vn >= 0) {
        return false;
    }

    const scaleVelFixup = ((1 + elasticity) * vn) / (d * d * (mass0 + mass1));
    vec2.scaleAndAdd(disc0.velocity, disc0.velocity, dpos, scaleVelFixup * mass1);
    vec2.scaleAndAdd(disc1.velocity, disc1.velocity, dpos, -scaleVelFixup * mass0);

    return true;
}

function elasticCollision(disc0, disc1, mass0, mass1, elasticity) {
    const dpos = vec2.create();
    vec2.subtract(dpos, disc1.position, disc0.position);
    const d = vec2.length(dpos);

    const dvel = vec2.create();
    vec2.subtract(dvel, disc1.velocity, disc0.velocity);
    const vn = vec2.dot(dpos, dvel);

    if (vn >= 0) {
        return false;
    }

    const scaleVelFixup = ((1 + elasticity) * vn) / (d * d * (mass0 + mass1));
    vec2.scaleAndAdd(disc0.velocity, disc0.velocity, dpos, scaleVelFixup * mass1);
    vec2.scaleAndAdd(disc1.velocity, disc1.velocity, dpos, -scaleVelFixup * mass0);

    return true;
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

    let vNormalMin = 0;

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
            vNormalMin = Math.min(vNormalMin, vNormal);
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

    return -vNormalMin;
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

function distanceBetween(pos0, pos1) {
    const dpos = vec2.create();
    vec2.subtract(dpos, pos1, pos0);
    return vec2.length(dpos);
}

function clearLineOfSight(level, pos0, pos1) {
    const dx = Math.abs(pos1[0] - pos0[0]);
    const dy = Math.abs(pos1[1] - pos0[1]);

    let x = Math.floor(pos0[0]);
    let y = Math.floor(pos0[1]);

    let n = 1;
    let xInc, yInc, error;

    if (pos1[0] > pos0[0]) {
        xInc = 1;
        n += Math.floor(pos1[0]) - x;
        error = (Math.floor(pos0[0]) + 1 - pos0[0]) * dy;
    } else {
        xInc = -1;
        n += x - Math.floor(pos1[0]);
        error = (pos0[0] - Math.floor(pos0[0])) * dy;
    }

    if (pos1[1] > pos0[1]) {
        yInc = 1;
        n += Math.floor(pos1[1]) - y;
        error -= (Math.floor(pos0[1]) + 1 - pos0[1]) * dx;
    } else {
        yInc = -1;
        n += y - Math.floor(pos1[1]);
        error -= (pos0[1] - Math.floor(pos0[1])) * dx;
    }

    while (n > 0) {
        if (x < 0 || y < 0 || x >= level.grid.sizeX || y >= level.grid.sizeY)
            return false;

        const tileType = level.grid.get(x, y);
        if (tileType != ttRoom && tileType != ttHall)
            return false;

        if (error > 0) {
            y += yInc;
            error -= dx;
        } else {
            x += xInc;
            error += dy;
        }

        --n;
    }

    return true;
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

function lerp(a, b, u) {
    return a + (b - a) * u;
}

function renderScene(renderer, state) {
    const screenSize = vec2.create();
    renderer.beginFrame(screenSize);

    const matScreenFromWorld = mat4.create();
    setupViewMatrix(state, screenSize, matScreenFromWorld);

    state.renderColoredTriangles(matScreenFromWorld);

    renderSpikesDead(state.level.spikes, renderer, matScreenFromWorld);
    renderTurretsDead(state.level.turrets, renderer, matScreenFromWorld);
    renderSwarmersDead(state.level.swarmers, renderer, matScreenFromWorld);

    renderLootItems(state, renderer, matScreenFromWorld);
    renderPotions(state, renderer, matScreenFromWorld);

    if (state.lava.state == lavaStateActive) {
        state.renderField(matScreenFromWorld, state.lava.levelBase, state.lava.textureScroll);
    }

    renderSpikesAlive(state.level.spikes, renderer, matScreenFromWorld);
    renderTurretsAlive(state, state.level.turrets, renderer, matScreenFromWorld);
    renderSwarmersAlive(state.level.swarmers, renderer, matScreenFromWorld);

    renderTurretBullets(state.turretBullets, renderer, matScreenFromWorld);
    renderPlayerBullets(state, renderer, matScreenFromWorld);

    renderPlayer(state, renderer, matScreenFromWorld);

    const distFromEntrance = Math.max(30, estimateDistance(state.distanceFieldFromEntrance, state.camera.position));
    state.renderLighting(matScreenFromWorld, distFromEntrance - 10, state.lava.levelBase, state.mapZoom);

    // Damage vignette

    renderDamageVignette(state.player.invulnerabilityTimer, state.player.hitPoints, state.player.damageDisplayTimer, renderer, screenSize);

    // Status displays

    renderHealthMeter(state, renderer, screenSize);
    renderLootCounter(state, renderer, screenSize);
    renderBulletAndPotionCounter(state, renderer, screenSize);

    // Text

    if (state.paused) {
        renderTextLines(renderer, screenSize, [
            '          AMULET RAIDER',
            '',
            '     Paused: Click to unpause',
            '',
            'Jacin said the amulet is cursed.',
            'Having magic of my own, though,',
            'I prefer to judge for myself.',
            '',
            '   Retrieve cursed amulet: \x0c',
            '',
            'Move with mouse',
            'LMB shoots while moving',
            'RMB or Space drinks potion',
            '',
            '<>: Mouse sensitivity: ' + state.mouseSensitivity,
            'Esc: Pause, R: Retry, M: Map',
            '',
            '     James McNeill - 2022 7DRL',
            '   Special thanks: Mendi Carroll',
        ]);
    } else if (state.gameState == gsWon && state.timeToGameEndMessage <= 0) {
        renderTextLines(renderer, screenSize, [
            'I HOLD THE AMULET AND I LIVE!',
            '   Esc: Pause, R: Restart',
        ]);
    } else if (state.gameState == gsDied && state.timeToGameEndMessage <= 0) {
        renderTextLines(renderer, screenSize, [
            '   DEATH HAS COME',
            'Esc: Pause, R: Retry',
        ]);
    } else if (state.pickupMessageTimer > 0) {
        renderTextLines(renderer, screenSize, state.pickupMessage);
    }
}

function setupViewMatrix(state, screenSize, matScreenFromWorld) {
    const mapSizeX = state.level.grid.sizeX + 2;
    const mapSizeY = state.level.grid.sizeY + 2;

    let rxMap, ryMap;
    if (screenSize[0] * mapSizeY < screenSize[1] * mapSizeX) {
        // horizontal is limiting dimension
        rxMap = mapSizeX / 2;
        ryMap = rxMap * screenSize[1] / screenSize[0];
    } else {
        // vertical is limiting dimension
        ryMap = mapSizeY / 2;
        rxMap = ryMap * screenSize[0] / screenSize[1];
    }
    const cxMap = state.level.grid.sizeX / 2;
    const cyMap = state.level.grid.sizeY / 2;

    const cxGame = state.camera.position[0] + state.camera.joltOffset[0];
    const cyGame = state.camera.position[1] + state.camera.joltOffset[1];
    const rGame = 18;
    let rxGame, ryGame;
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

function renderDamageVignette(invulnerabilityTimer, hitPoints, damageDisplayTimer, renderer, screenSize) {
    let u = 0;
    let colorInner, colorOuter;

    if (invulnerabilityTimer > 0) {
        if (invulnerabilityTimer > 1) {
            u = 1 - 0.65 * ((1 - invulnerabilityTimer / invulnerabilityDuration) ** 2);
        } else {
            u = (Math.floor(invulnerabilityTimer * 10) % 2) == 0 ? 0.8 : 0.2;
        }
        colorInner = [0, 1, 1, 0.05];
        colorOuter = [0, 1, 1, 0.5];
    } else if (damageDisplayTimer > 0) {
        u = Math.max(1, (playerMaxHitPoints - hitPoints)) * damageDisplayTimer / damageDisplayDuration;
        colorInner = [1, 0, 0, Math.min(1.0, u * 0.05)];
        colorOuter = [1, 0, 0, Math.min(1.0, u * 0.5)];
    }

    if (u <= 0)
        return;

    colorInner[3] = Math.min(1, colorInner[3] * u);
    colorOuter[3] = Math.min(1, colorOuter[3] * u);

    const radiusInner = 0.8;
    const radiusOuter = 1.5;

    const matDiscFromScreen = mat4.create();
    if (screenSize[0] < screenSize[1]) {
        matDiscFromScreen[0] = screenSize[0] / screenSize[1];
    } else {
        matDiscFromScreen[5] = screenSize[1] / screenSize[0];
    }

    matDiscFromScreen[0] /= radiusOuter;
    matDiscFromScreen[5] /= radiusOuter;

    renderer.renderVignette(matDiscFromScreen, radiusInner / radiusOuter, colorInner, colorOuter);
}

function renderHealthMeter(state, renderer, screenSize) {
    const minCharsX = 40;
    const minCharsY = 20;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = -1;
    const offsetY = 0;

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

    const rect = glyphRect(3);
    const glyphColorHeartFilled = 0xff0000aa;
    const glyphColorHeartEmpty = 0xff202020;
    const glyphColorHeartOvercharge = 0xff5555ff;

    for (let i = 0; i < playerMaxHitPoints; ++i) {
        renderer.renderGlyphs.add(
            i, 0, i + 1, 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            i < state.player.hitPoints ? glyphColorHeartFilled : glyphColorHeartEmpty
        );
    }

    for (let i = playerMaxHitPoints; i < state.player.hitPoints; ++i) {
        renderer.renderGlyphs.add(
            i, 0, i + 1, 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            glyphColorHeartOvercharge
        );
    }

    renderer.renderGlyphs.flush();
}

function renderLootCounter(state, renderer, screenSize) {
    const numLootItemsTotal = state.level.numLootItemsTotal;
    const numLootItemsCollected = numLootItemsTotal - state.level.lootItems.length;

    const strMsg = numLootItemsCollected + '/' + numLootItemsTotal + '\x0f';
    const cCh = strMsg.length;

    const minCharsX = 40;
    const minCharsY = 20;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = (cCh + 1) - numCharsX;
    const offsetY = 0;

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

    const color = 0xff55ffff;

    for (let i = 0; i < cCh; ++i) {
        const rect = glyphRect(strMsg.charCodeAt(i));
        renderer.renderGlyphs.add(
            i, 0, i + 1, 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            color
        );
    }

    renderer.renderGlyphs.flush();
}

function renderBulletAndPotionCounter(state, renderer, screenSize) {
    const strMsg = '     ' + state.player.numInvulnerabilityPotions + '\xad';
    const cCh = strMsg.length;

    const color = 0xffffff55;
    const colorDim = 0xff202000;

    const minCharsX = 40;
    const minCharsY = 20;
    const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (8 * minCharsX)));
    const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (16 * minCharsY)));
    const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
    const pixelsPerCharX = 8 * scaleFactor;
    const pixelsPerCharY = 16 * scaleFactor;
    const numCharsX = screenSize[0] / pixelsPerCharX;
    const numCharsY = screenSize[1] / pixelsPerCharY;
    const offsetX = -Math.floor((screenSize[0] - (cCh + bulletMaxCapacity) * pixelsPerCharX) / 2) / pixelsPerCharX;
    const offsetY = 0;

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

    const numBullets = Math.floor(state.player.numBullets);

    for (let i = 0; i < bulletMaxCapacity; ++i) {
        const rect = glyphRect(157);
        renderer.renderGlyphs.add(
            i, 0, i + 1, 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            (i < numBullets) ? color : colorDim
        );
    }

    for (let i = 0; i < cCh; ++i) {
        const rect = glyphRect(strMsg.charCodeAt(i));
        renderer.renderGlyphs.add(
            i + bulletMaxCapacity, 0, i + bulletMaxCapacity + 1, 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            color
        );
    }

    renderer.renderGlyphs.flush();
}

function renderTextLines(renderer, screenSize, lines) {
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

    {
        // Draw a stretched box to make a darkened background for the text.
        const rect = glyphRect(219);

        renderer.renderGlyphs.add(
            -1, -1, maxLineLength + 1, lines.length + 1,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            colorBackground
        );
    }

    for (let i = 0; i < lines.length; ++i) {
        const row = lines.length - (1 + i);
        for (let j = 0; j < lines[i].length; ++j) {
            const col = j;
            const ch = lines[i];
            if (ch === ' ') {
                continue;
            }
            const rect = glyphRect(lines[i].charCodeAt(j));
            renderer.renderGlyphs.add(
                col, row, col + 1, row + 1,
                rect.minX, rect.minY, rect.maxX, rect.maxY,
                colorText
            );
        }
    }

    renderer.renderGlyphs.flush();
}

function resizeCanvasToDisplaySize(canvas) {
    const rect = canvas.parentNode.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
}

function initShaderProgram(gl, vsSource, fsSource, attribs) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    for (const attrib in attribs) {
        gl.bindAttribLocation(program, attribs[attrib], attrib);
    }

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
        stripeImage[j] = 223 + j / 2;
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

function createDistanceField(grid, posSource) {
    const fieldSizeX = grid.sizeX + 1;
    const fieldSizeY = grid.sizeY + 1;
    const distanceField = new Float64Grid(fieldSizeX, fieldSizeY, Infinity);
    updateDistanceField(grid, distanceField, posSource);
    return distanceField;
}

function updateDistanceField(grid, distanceField, posSource) {
    const sourceX = Math.floor(posSource[0]);
    const sourceY = Math.floor(posSource[1]);

    distanceField.fill(Infinity);

    let toVisit = [{priority: 0, x: sourceX, y: sourceY}];

    fastMarchFill(distanceField, toVisit, (x, y) => estimatedDistance(grid, distanceField, x, y));

    floodFillImpassableAreas(distanceField);
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

function estimatedDistance(grid, distanceField, x, y) {
    function isSolid(x, y) {
        if (x < 0 || y < 0 || x >= grid.sizeX || y >= grid.sizeY)
            return true;
        const tileType = grid.get(x, y);
        return tileType != ttHall && tileType != ttRoom;
    }

    const solidSW = isSolid(x-1, y-1);
    const solidSE = isSolid(x, y-1);
    const solidNW = isSolid(x-1, y);
    const solidNE = isSolid(x, y);

    const dXNeg = (x > 0 && !(solidNW && solidSW)) ? distanceField.get(x-1, y) : Infinity;
    const dXPos = (x < distanceField.sizeX - 1 && !(solidNE && solidSE)) ? distanceField.get(x+1, y) : Infinity;
    const dYNeg = (y > 0 && !(solidSW && solidSE)) ? distanceField.get(x, y-1) : Infinity;
    const dYPos = (y < distanceField.sizeY - 1 && !(solidNW && solidNE)) ? distanceField.get(x, y+1) : Infinity;

    const dXMin = Math.min(dXNeg, dXPos);
    const dYMin = Math.min(dYNeg, dYPos);

    const timeHorizontal = 1.0;

    const d = (Math.abs(dXMin - dYMin) <= timeHorizontal) ?
        ((dXMin + dYMin) + Math.sqrt((dXMin + dYMin)**2 - 2 * (dXMin**2 + dYMin**2 - timeHorizontal**2))) / 2:
        Math.min(dXMin, dYMin) + timeHorizontal;

    return d;
}

function floodFillImpassableAreas(field) {
    const toVisit = [];

    for (let y = 0; y < field.sizeY; ++y) {
        for (let x = 0; x < field.sizeX; ++x) {
            const d = field.get(x, y);
            if (d === Infinity)
                continue;

            if (x < field.sizeX - 1) {
                const d = estimatedDistanceSimple(field, x + 1, y);
                if (d < field.get(x+1, y)) {
                    priorityQueuePush(toVisit, {priority: d, x: x+1, y: y});
                }
            }

            if (x > 0) {
                const d = estimatedDistanceSimple(field, x - 1, y);
                if (d < field.get(x-1, y)) {
                    priorityQueuePush(toVisit, {priority: d, x: x-1, y: y});
                }
            }

            if (y < field.sizeY - 1) {
                const d = estimatedDistanceSimple(field, x, y + 1);
                if (d < field.get(x, y+1)) {
                    priorityQueuePush(toVisit, {priority: d, x: x, y: y+1});
                }
            }

            if (y > 0) {
                const d = estimatedDistanceSimple(field, x, y - 1);
                if (d < field.get(x, y-1)) {
                    priorityQueuePush(toVisit, {priority: d, x: x, y: y-1});
                }
            }
        }
    }

    fastMarchFill(field, toVisit, (x, y) => estimatedDistanceSimple(field, x, y));
}

function estimatedDistanceSimple(distanceField, x, y) {
    // Only fill unfilled squares
    if (distanceField.get(x, y) !== Infinity)
        return Infinity;

    const dXNeg = (x > 0) ? distanceField.get(x-1, y) : Infinity;
    const dXPos = (x < distanceField.sizeX - 1) ? distanceField.get(x+1, y) : Infinity;
    const dYNeg = (y > 0) ? distanceField.get(x, y-1) : Infinity;
    const dYPos = (y < distanceField.sizeY - 1) ? distanceField.get(x, y+1) : Infinity;

    const dXMin = Math.min(dXNeg, dXPos);
    const dYMin = Math.min(dYNeg, dYPos);

    const timeHorizontal = 1.0;

    const d = (Math.abs(dXMin - dYMin) <= timeHorizontal) ?
        ((dXMin + dYMin) + Math.sqrt((dXMin + dYMin)**2 - 2 * (dXMin**2 + dYMin**2 - timeHorizontal**2))) / 2:
        Math.min(dXMin, dYMin) + timeHorizontal;

    return d;
}

function estimateDistance(distanceField, position) {
    const x = position[0];
    const y = position[1];

    const gridX = Math.max(0, Math.min(distanceField.sizeX - 1, Math.floor(x)));
    const gridY = Math.max(0, Math.min(distanceField.sizeY - 1, Math.floor(y)));

    const uX = x - gridX;
    const uY = y - gridY;

    const d00 = distanceField.get(gridX, gridY);
    const d10 = distanceField.get(gridX + 1, gridY);
    const d01 = distanceField.get(gridX, gridY + 1);
    const d11 = distanceField.get(gridX + 1, gridY + 1);

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

function createLevel() {
    // Create some rooms in a grid.

    const roomGrid = [];
    for (let roomY = 0; roomY < numCellsY; ++roomY) {
        roomGrid[roomY] = [];
        for (let roomX = 0; roomX < numCellsX; ++roomX) {
            roomGrid[roomY][roomX] = roomY * numCellsX + roomX;
        }
    }

    // Build a minimum spanning tree of the rooms.

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

    // Add edges between as-yet-unconnected sub-graphs

    for (const edge of potentialEdges) {
        const group0 = roomGroup[edge[0]];
        const group1 = roomGroup[edge[1]];

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

    const dist = [];
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

    let maxDistPairs = [];
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

    const roomDistanceFromEntrance = [];
    const roomDistanceFromExit = [];
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
        const numEdgesCur = edges.reduce((count, edge) => count + (edge[0] == roomIndex || edge[1] == roomIndex) ? 1 : 0, 0);
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
    }

    // Decorate the rooms

    const roomsToDecorate = rooms.filter((room, roomIndex) => roomIndex != roomIndexEntrance && roomIndex != roomIndexExit);
    decorateRooms(roomsToDecorate, level);
    tryCreatePillarRoom(rooms[roomIndexExit], level);

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
    const hallColor = 0xff707070;
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

    // Pick a starting position within the starting room

    const startRoom = rooms[roomIndexEntrance];
    const playerStartPos = vec2.fromValues(startRoom.minX + startRoom.sizeX/2, startRoom.minY + startRoom.sizeY/2);

    // Put an exit position in the exit room

    const amuletRoom = rooms[roomIndexExit];
    const amuletPos = vec2.fromValues(amuletRoom.minX + amuletRoom.sizeX/2 - 0.5, amuletRoom.minY + amuletRoom.sizeY/2 - 0.5);
    const positionsUsed = [amuletPos];

    // Enemies

    const [spikes, turrets, swarmers] = createEnemies(rooms, roomDistanceFromEntrance, level, positionsUsed);

    // Potions

    const potions = createPotions(rooms, roomIndexEntrance, roomIndexExit, level, positionsUsed);

    // Place loot in the level. Distribute it so rooms that are far from
    // the entrance or the exit have the most? Or so dead ends have the
    // most? Bias toward the rooms that aren't on the path between the
    // entrance and the exit?

    const lootItems = createLootItems(rooms, positionsUsed, roomIndexEntrance, amuletPos, level);

    return {
        grid: level,
        vertexData: vertexData,
        playerStartPos: playerStartPos,
        startRoom: startRoom,
        amuletRoom: amuletRoom,
        amuletPos: amuletPos,
        spikes: spikes,
        turrets: turrets,
        swarmers: swarmers,
        potions: potions,
        lootItems: lootItems,
        numLootItemsTotal: lootItems.length,
    };
}

function computeDistances(roomDistance, numRooms, edges, roomIndexStart) {
    roomDistance.length = numRooms;
    roomDistance.fill(numRooms);
    const toVisit = [{priority: 0, roomIndex: roomIndexStart}];
    while (toVisit.length > 0) {
        const {priority, roomIndex} = priorityQueuePop(toVisit);

        if (roomDistance[roomIndex] <= priority) {
            continue;
        }

        roomDistance[roomIndex] = priority;

        const dist = priority + 1;

        for (const edge of edges) {
            if (edge[0] == roomIndex) {
                if (roomDistance[edge[1]] > dist) {
                    priorityQueuePush(toVisit, {priority: dist, roomIndex: edge[1]});
                }
            } else if (edge[1] == roomIndex) {
                if (roomDistance[edge[0]] > dist) {
                    priorityQueuePush(toVisit, {priority: dist, roomIndex: edge[0]});
                }
            }
        }
    }
}

function computedDistance(numRooms, edges, roomIndexStart, roomIndexEnd) {
    const roomDistance = computeDistances(numRooms, edges, roomIndexStart);
    return roomDistance[roomIndexEnd];
}

function createEnemies(rooms, roomDistance, level, positionsUsed) {
    const spikes = [];
    const turrets = [];
    const swarmers = [];

    const dMax = roomDistance.reduce((d0, d1) => Math.max(d0, d1), 0);

    for (let roomIndex = 0; roomIndex < roomDistance.length; ++roomIndex) {
        const d = roomDistance[roomIndex];
        if (d === 0)
            continue;

        const room = rooms[roomIndex];

        const depthDensity = lerp(0.005, 0.035, d / dMax);
        const maxEnemies = Math.ceil(room.sizeX * room.sizeY * depthDensity);
        let numEnemies = 0;
        for (let i = 0; i < 1024 && numEnemies < maxEnemies; ++i) {
            // Pick a kind of monster to create.
            const monsterKind = Math.random();

            let success = false;
            if (monsterKind < 0.3 || d < 2) {
                success = tryCreateSpike(room, spikes, level, positionsUsed);
            } else if ((monsterKind < 0.7 || d < 3) && d != 3) {
                success = tryCreateTurret(room, turrets, level, positionsUsed);
            } else {
                success = tryCreateSwarmer(room, swarmers, level, positionsUsed);
            }
    
            if (success) {
                ++numEnemies;
            }
        }
    }

    return [spikes, turrets, swarmers];
}

function tryCreateSpike(room, spikes, level, positionsUsed) {
    const x = Math.random() * (room.sizeX - 2 * monsterRadius) + room.minX + monsterRadius;
    const y = Math.random() * (room.sizeY - 2 * monsterRadius) + room.minY + monsterRadius;

    const position = vec2.fromValues(x, y);

    if (isDiscTouchingLevel(position, monsterRadius * 2, level)) {
        return false;
    }

    if (isPositionTooCloseToOtherPositions(positionsUsed, 4 * monsterRadius, position)) {
        return false;
    }

    spikes.push({
        position: position,
        velocity: vec2.fromValues(0, 0),
        radius: monsterRadius,
        onContactCooldown: false,
        dead: false,
    });

    positionsUsed.push(position);

    return true;
}

function tryCreateTurret(room, turrets, level, positionsUsed) {
    const x = Math.random() * (room.sizeX - 2 * monsterRadius) + room.minX + monsterRadius;
    const y = Math.random() * (room.sizeY - 2 * monsterRadius) + room.minY + monsterRadius;

    const position = vec2.fromValues(x, y);

    if (isDiscTouchingLevel(position, monsterRadius * 2, level)) {
        return false;
    }

    if (isPositionTooCloseToOtherPositions(positionsUsed, 4 * monsterRadius, position)) {
        return false;
    }

    turrets.push({
        position: position,
        velocity: vec2.fromValues(0, 0),
        radius: monsterRadius,
        onContactCooldown: false,
        dead: false,
        timeToFire: Math.random() * turretFireDelayStart,
    });

    positionsUsed.push(position);

    return true;
}

function tryCreateSwarmer(room, swarmers, level, positionsUsed) {
    const x = Math.random() * (room.sizeX - 2 * monsterRadius) + room.minX + monsterRadius;
    const y = Math.random() * (room.sizeY - 2 * monsterRadius) + room.minY + monsterRadius;

    const position = vec2.fromValues(x, y);

    if (isDiscTouchingLevel(position, monsterRadius * 2, level)) {
        return false;
    }

    if (isPositionTooCloseToOtherPositions(positionsUsed, 4 * monsterRadius, position)) {
        return false;
    }

    swarmers.push({
        position: position,
        velocity: vec2.fromValues(0, 0),
        radius: monsterRadius,
        heading: Math.random(),
        headingRate: (Math.random() * 0.15 + 0.15) * (randomInRange(2) * 2 - 1),
        onContactCooldown: false,
        dead: false,
    });

    positionsUsed.push(position);

    return true;
}

function createPotions(rooms, roomIndexEntrance, roomIndexExit, level, positionsUsed) {
    const roomIndices = [];
    for (let i = 0; i < rooms.length; ++i) {
        if (i != roomIndexEntrance && i != roomIndexExit) {
            roomIndices.push(i);
        }
    }

    shuffleArray(roomIndices);
    roomIndices.length = Math.ceil(roomIndices.length * 0.667);

    const numHealthPotions = Math.ceil(roomIndices.length * 0.667);

    const potions = [];

    for (let i = 0; i < roomIndices.length; ++i) {
        const room = rooms[roomIndices[i]];

        for (let j = 0; j < 1024; ++j) {
            const x = Math.random() * (room.sizeX - 2 * lootRadius) + room.minX + lootRadius;
            const y = Math.random() * (room.sizeY - 2 * lootRadius) + room.minY + lootRadius;

            const position = vec2.fromValues(x, y);

            if (isDiscTouchingLevel(position, lootRadius * 2, level)) {
                continue;
            }

            if (isPositionTooCloseToOtherPositions(positionsUsed, 3 * lootRadius, position)) {
                continue;
            }

            potions.push({
                position: position,
                potionType: (i < numHealthPotions) ? potionTypeHealth : potionTypeInvulnerability,
            });

            positionsUsed.push(position);
            break;
        }
    }

    return potions;
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

function decorateRooms(rooms, level) {
    const roomsShuffled = [...rooms];
    shuffleArray(roomsShuffled);

    tryPlacePillarRoom(roomsShuffled, level);
    tryPlaceCenterObstacleRoom(roomsShuffled, level);
    tryPlacePillarRoom(roomsShuffled, level);
    tryPlaceCenterObstacleRoom(roomsShuffled, level);
    tryPlacePillarRoom(roomsShuffled, level);
}

function tryPlacePillarRoom(rooms, level) {
    for (let i = 0; i < rooms.length; ++i) {
        const room = rooms[i];

        if (tryCreatePillarRoom(room, level)) {
            rooms[i] = rooms[rooms.length-1];
            --rooms.length;
            break;    
        }
    }
}

function tryCreatePillarRoom(room, level) {
    if (room.sizeX < 13 || room.sizeY < 13)
        return false;
    if (((room.sizeX - 3) % 5) != 0 && ((room.sizeY - 3) % 5) != 0)
        return false;

    function plotPillar(x, y) {
        if (Math.random() < 0.125)
            return;
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

    return true;
}

function tryPlaceCenterObstacleRoom(rooms, level) {
    for (let i = 0; i < rooms.length; ++i) {
        const room = rooms[i];
        if (room.sizeX < 15 || room.sizeY < 15)
            continue;

        rooms[i] = rooms[rooms.length-1];
        --rooms.length;

        function plotRect(minX, minY, sizeX, sizeY, type) {
            for (let x = minX; x < minX + sizeX; ++x) {
                for (let y = minY; y < minY + sizeY; ++y) {
                    level.set(x, y, type);
                }
            }
        }

        plotRect(room.minX + 6, room.minY + 6, room.sizeX - 12, room.sizeY - 12, ttWall);
        plotRect(room.minX + 7, room.minY + 7, room.sizeX - 14, room.sizeY - 14, ttSolid);

        return;
    }
}

function createLootItems(rooms, positionsUsed, roomIndexEntrance, posAmulet, level) {
    const numLoot = 100;
    const loot = [];

    for (let i = 0; i < 1024 && loot.length < numLoot; ++i) {
        const roomIndex = randomInRange(rooms.length);
        if (roomIndex == roomIndexEntrance) {
            continue;
        }

        const room = rooms[roomIndex];

        const x = Math.random() * (room.sizeX - 2 * lootRadius) + room.minX + lootRadius;
        const y = Math.random() * (room.sizeY - 2 * lootRadius) + room.minY + lootRadius;

        const position = vec2.fromValues(x, y);

        if (isDiscTouchingLevel(position, lootRadius * 2, level)) {
            continue;
        }

        if (isPositionTooCloseToOtherPositions(positionsUsed, 2 * lootRadius + monsterRadius, position)) {
            continue;
        }

        const dposAmulet = vec2.create();
        vec2.subtract(dposAmulet, posAmulet, position);
        if (vec2.length(dposAmulet) < 12 * lootRadius)
            continue;

        positionsUsed.push(position);
        loot.push({position: position});
    }

    return loot;
}

function renderLootItems(state, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = state.level.lootItems.map(lootItem => ({
        position: lootItem.position,
        color: color,
        radius: lootRadius,
    }));

    if (!state.player.amuletCollected) {
        discs.push({
            position: state.level.amuletPos,
            color: { r: 0.4, g: 0.15, b: 0.15 },
            radius: lootRadius,
        });
    }

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(15);
    const rx = 0.25;
    const ry = 0.5;
    const yOffset = -0.05;
    const lootGlyphColor = 0xff55ffff;

    for (const lootItem of state.level.lootItems) {
        const x = lootItem.position[0];
        const y = lootItem.position[1];
        renderer.renderGlyphs.add(
            x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            lootGlyphColor
        );
    }

    if (!state.player.amuletCollected) {
        const amuletColor = 0xff5555ff;
        const rectAmulet = glyphRect(12);
        const x = state.level.amuletPos[0];
        const y = state.level.amuletPos[1];
        renderer.renderGlyphs.add(
            x - rx, y + yOffset - ry, x + rx, y + yOffset + ry,
            rectAmulet.minX, rectAmulet.minY, rectAmulet.maxX, rectAmulet.maxY,
            amuletColor
        );
    }

    renderer.renderGlyphs.flush();
}

function updateLootItems(state) {
    if (state.player.hitPoints <= 0)
        return;

    const dpos = vec2.create();

    filterInPlace(state.level.lootItems, lootItem => {
        vec2.subtract(dpos, lootItem.position, state.player.position);
        return (vec2.length(dpos) > playerRadius + lootRadius);
    });
}

function renderPotions(state, renderer, matScreenFromWorld) {
    const color = { r: 0.45, g: 0.45, b: 0.45 };
    const discs = state.level.potions.map(potion => ({
        position: potion.position,
        color: color,
        radius: lootRadius,
    }));

    renderer.renderDiscs(matScreenFromWorld, discs);

    renderer.renderGlyphs.start(matScreenFromWorld);

    const rect = glyphRect(173);
    const rx = 0.25;
    const ry = 0.5;
    const potionHealthGlyphColor = 0xff5555ff;
    const potionInvulnerabilityGlyphColor = 0xffffff55;

    for (const potion of state.level.potions) {
        const x = potion.position[0];
        const y = potion.position[1];
        renderer.renderGlyphs.add(
            x - rx, y - ry, x + rx, y + ry,
            rect.minX, rect.minY, rect.maxX, rect.maxY,
            (potion.potionType == potionTypeHealth) ? potionHealthGlyphColor : potionInvulnerabilityGlyphColor
        );
    }

    renderer.renderGlyphs.flush();
}

function updatePotions(state) {
    if (state.player.hitPoints <= 0)
        return;

    const dpos = vec2.create();

    filterInPlace(state.level.potions, potion => {
        vec2.subtract(dpos, potion.position, state.player.position);
        if (vec2.length(dpos) > playerRadius + lootRadius)
            return true;
        if (potion.potionType == potionTypeHealth) {
            if (state.player.hitPoints >= playerMaxHitPoints) {
                state.player.hitPoints += 1;
                setPickupMessage(state, ['Extra Health!']);
            } else {
                state.player.hitPoints = playerMaxHitPoints;
                setPickupMessage(state, ['Healing Potion']);
            }
        } else if (potion.potionType == potionTypeInvulnerability) {
            state.player.numInvulnerabilityPotions += 1;
            setPickupMessage(state, ['+1 Invulnerability Potion']);
        }
        return false;
    });
}

function hasEdge(edges, roomIndex0, roomIndex1) {
    return edges.some(edge => edge[0] === roomIndex0 && edge[1] === roomIndex1);
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

function isPositionTooCloseToOtherPositions(positions, separationDistance, position) {
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

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; --i) {
        let j = randomInRange(i + 1);
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
