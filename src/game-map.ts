export {
    BooleanGrid,
    Cell,
    CellGrid,
    Float64Grid,
    Int32Grid,
    Item,
    ItemType,
    GameMap,
    GameMapRoughPlan,
    Player,
    TerrainType,
    GuardStates,
    guardMoveCostForItemType,
    isWindowTerrainType,
    maxPlayerHealth,
};

import { Guard, GuardMode } from './guard';
import { vec2 } from './my-matrix';

const cardinalDirections: Array<vec2> = [
    vec2.fromValues(-1, 0),
    vec2.fromValues(1, 0),
    vec2.fromValues(0, -1),
    vec2.fromValues(0, 1),
];

// TODO: Figure out how to make a generic grid data structure

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

class Int32Grid {
    sizeX: number;
    sizeY: number;
    values: Int32Array;

    constructor(sizeX: number, sizeY: number, initialValue: number) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Int32Array(sizeX * sizeY);
        this.fill(initialValue);
    }

    fill(value: number) {
        this.values.fill(value);
    }

    get(x: number, y: number): number {
        return this.values[this.sizeX * y + x];
    }

    set(x: number, y: number, value: number) {
        this.values[this.sizeX * y + x] = value;
    }
}

class Float64Grid {
    sizeX: number;
    sizeY: number;
    values: Float64Array;

    constructor(sizeX: number, sizeY: number, initialValue: number) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Float64Array(sizeX * sizeY);
        this.fill(initialValue);
    }

    fill(value: number) {
        this.values.fill(value);
    }

    get(x: number, y: number): number {
        return this.values[this.sizeX * y + x];
    }

    set(x: number, y: number, value: number) {
        this.values[this.sizeX * y + x] = value;
    }
}

type GameMapRoughPlan = {
    numRoomsX: number;
    numRoomsY: number;
    totalLoot: number;
}

enum TerrainType {
    GroundNormal,
    GroundGrass,
    GroundWater,
    GroundMarble,
    GroundWood,
    GroundWoodCreaky,

    //  NSEW
    Wall0000,
    Wall0001,
    Wall0010,
    Wall0011,
    Wall0100,
    Wall0101,
    Wall0110,
    Wall0111,
    Wall1000,
    Wall1001,
    Wall1010,
    Wall1011,
    Wall1100,
    Wall1101,
    Wall1110,
    Wall1111,

    OneWayWindowE,
    OneWayWindowW,
    OneWayWindowN,
    OneWayWindowS,
    PortcullisNS,
    PortcullisEW,
    DoorNS,
    DoorEW,
    GardenDoorNS,
    GardenDoorEW,
}

type Cell = {
    type: TerrainType;
    moveCost: number;
    blocksPlayerMove: boolean;
    blocksPlayerSight: boolean;
    blocksSight: boolean;
    blocksSound: boolean;
    hidesPlayer: boolean;
    lit: boolean;
    seen: boolean;
}

class CellGrid {
    sizeX: number;
    sizeY: number;
    values: Array<Cell>;

    constructor(sizeX: number, sizeY: number) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        const size = sizeX * sizeY;
        this.values = new Array<Cell>(size);
        for (let i = 0; i < size; ++i) {
            this.values[i] = {
                type: TerrainType.GroundNormal,
                moveCost: Infinity,
                blocksPlayerMove: false,
                blocksPlayerSight: false,
                blocksSight: false,
                blocksSound: false,
                hidesPlayer: false,
                lit: false,
                seen: false,
            };
        }
    }

    at(x: number, y: number): Cell {
        const i = this.sizeX * y + x;
        console.assert(i >= 0);
        console.assert(i < this.values.length);
        return this.values[i];
    }

    index(x: number, y:number): number {
        return this.sizeX * y + x;
    }
}

enum GuardStates {
    Relaxed,
    Alerted,
    Chasing,
}

enum ItemType {
    Chair,
    Table,
    Bush,
    Coin,
    DoorNS,
    DoorEW,
    PortcullisNS,
    PortcullisEW,
    TorchUnlit,
    TorchLit,
    TorchCarry, //TODO: Doesn't belong here because it is guard carried but solves a problem for now.
}

type Item = {
    pos: vec2;
    type: ItemType;
}

function guardMoveCostForItemType(itemType: ItemType): number {
    switch (itemType) {
        case ItemType.Chair: return 4;
        case ItemType.Table: return 10;
        case ItemType.Bush: return 10;
        case ItemType.Coin: return 0;
        case ItemType.DoorNS: return 0;
        case ItemType.DoorEW: return 0;
        case ItemType.PortcullisNS: return 0;
        case ItemType.PortcullisEW: return 0;
        case ItemType.TorchUnlit: return Infinity;
        case ItemType.TorchLit: return Infinity;
        case ItemType.TorchCarry: return 0;
    }
}

const maxPlayerHealth: number = 5;

class Player {
    pos: vec2;
    dir: vec2;
    dpos: vec2;
    health: number;
    loot: number;
    noisy: boolean; // did the player make noise last turn?
    damagedLastTurn: boolean;
    turnsRemainingUnderwater: number;
    bump: boolean; // used for animating bumping into things

    constructor(pos: vec2) {
        this.pos = vec2.clone(pos);
        this.dir = vec2.fromValues(0, -1);
        this.dpos = [0, 0];
        this.health = maxPlayerHealth;
        this.loot = 0;
        this.noisy = false;
        this.damagedLastTurn = false;
        this.turnsRemainingUnderwater = 0;
        this.bump = false;
    }

    applyDamage(d: number) {
        this.health -= Math.min(d, this.health);
        this.damagedLastTurn = true;
    }

    hidden(map: GameMap): boolean {
        if (map.guards.find((guard) => guard.mode == GuardMode.ChaseVisibleTarget) !== undefined) {
            return false;
        }

        if (map.cells.at(this.pos[0], this.pos[1]).hidesPlayer) {
            return true;
        }

        let cellType = map.cells.at(this.pos[0], this.pos[1]).type;

        if (cellType == TerrainType.GroundWater && this.turnsRemainingUnderwater > 0) {
            return true;
        }

        return false;
    }

    getPosAnimated(pos: vec2, uAnimateTurn: number) {
        uAnimateTurn = Math.max(0, uAnimateTurn * 2 - 1);
        if (this.bump) {
            uAnimateTurn = Math.min(uAnimateTurn, 1.0 - uAnimateTurn);
        }
        uAnimateTurn *= uAnimateTurn;
        vec2.scaleAndAdd(pos, this.pos, this.dpos, uAnimateTurn);
    }
}

type Rect = {
    posMin: vec2;
    posMax: vec2;
}

type PortalInfo = {
    // offset of left corner of portal relative to lower-left corner of cell:
    lx: number;
    ly: number;
    // offset of right corner of portal relative to lower-left-corner of cell:
    rx: number;
    ry: number;
    // offset of neighboring cell relative to this cell's coordinates:
    nx: number;
    ny: number;
}

const portals: Array<PortalInfo> = [
    { lx: -1, ly: -1, rx: -1, ry:  1, nx: -1, ny:  0 },
    { lx: -1, ly:  1, rx:  1, ry:  1, nx:  0, ny:  1 },
    { lx:  1, ly:  1, rx:  1, ry: -1, nx:  1, ny:  0 },
    { lx:  1, ly: -1, rx: -1, ry: -1, nx:  0, ny: -1 },
];

function aRightOfB(ax: number, ay: number, bx: number, by: number): boolean {
    return ax * by > ay * bx;
}

type AdjacentMove = {
    dx: number;
    dy: number;
    cost: number;
}

const adjacentMoves: Array<AdjacentMove> = [
    { dx:  1, dy:  0, cost: 2 },
    { dx: -1, dy:  0, cost: 2 },
    { dx:  0, dy:  1, cost: 2 },
    { dx:  0, dy: -1, cost: 2 },
    { dx: -1, dy: -1, cost: 3 },
    { dx:  1, dy: -1, cost: 3 },
    { dx: -1, dy:  1, cost: 3 },
    { dx:  1, dy:  1, cost: 3 },
];

type DistPos = {
    priority: number; // = distance; needs to be named priority for PriorityQueueElement
    pos: vec2;
}

class GameMap {
    cells: CellGrid;
    patrolRegions: Array<Rect>;
    patrolRoutes: Array<[number, number]>;
    items: Array<Item>;
    guards: Array<Guard>;
    playerStartPos: vec2;

    constructor(cells: CellGrid) {
        this.cells = cells;
        this.patrolRegions = [];
        this.patrolRoutes = [];
        this.items = [];
        this.guards = [];
        this.playerStartPos = vec2.create();
    }

    collectLootAt(x: number, y: number): number {
        let gold = 0;
        this.items = this.items.filter((item) => {
            if (item.type == ItemType.Coin && item.pos[0] == x && item.pos[1] == y) {
                ++gold;
                return false;
            } else {
                return true;
            }
        });
        return gold;
    }
    
    collectAllLoot(): number {
        let gold = 0;
        this.items = this.items.filter((item) => {
            if (item.type != ItemType.Coin) {
                return true;
            } else {
                ++gold;
                return false;
            }
        });
        return gold;
    }

    allSeen(): boolean {
        for (const cell of this.cells.values) {
            if (!cell.seen) {
                return false;
            }
        }
        return true;
    }

    percentSeen(): number {
        let numSeen = 0;
        for (const cell of this.cells.values) {
            if (cell.seen) {
                ++numSeen;
            }
        }
    
        return Math.floor((numSeen * 100) / this.cells.values.length);
    }
    
    markAllSeen() {
        for (const cell of this.cells.values) {
            cell.seen = true;
        }
    }
    
    markAllUnseen() {
        for (const cell of this.cells.values) {
            cell.seen = false;
        }
    }

    recomputeVisibility(posViewer: vec2) {
        this.recomputeVisibilityFromPos(posViewer);

        const pos = vec2.create();

        for (const dir of cardinalDirections) {
            if (this.playerCanSeeInDirection(posViewer, dir)) {
                vec2.add(pos, posViewer, dir);
                this.recomputeVisibilityFromPos(pos);
            }
        }
    }

    recomputeVisibilityFromPos(posViewer: vec2) {
        for (const portal of portals) {
            this.computeVisibility
            (
                posViewer[0], posViewer[1],
                posViewer[0], posViewer[1],
                portal.lx, portal.ly,
                portal.rx, portal.ry
            );
        }
    }
    
    playerCanSeeInDirection(posViewer: vec2, dir: vec2): boolean {
        const posTarget = vec2.create();
        vec2.add(posTarget, posViewer, dir);
        if (posTarget[0] < 0 ||
            posTarget[1] < 0 ||
            posTarget[0] >= this.cells.sizeX ||
            posTarget[1] >= this.cells.sizeY) {
            return true;
        }
    
        return !this.cells.at(posTarget[0], posTarget[1]).blocksPlayerSight;
    }

    computeVisibility(
        // Viewer map coordinates:
        viewerX: number,
        viewerY: number,
        // Target cell map coordinates:
        targetX: number,
        targetY: number,
        // Left edge of current view frustum (relative to viewer):
        ldx: number,
        ldy: number,
        // Right edge of current view frustum (relative to viewer):
        rdx: number,
        rdy: number
    ) {
        // End recursion if the target cell is out of bounds.
        if (targetX < 0 || targetY < 0 || targetX >= this.cells.sizeX || targetY >= this.cells.sizeY) {
            return;
        }
    
        // End recursion if the target square is too far away.
        const dx = 2 * (targetX - viewerX);
        const dy = 2 * (targetY - viewerY);
    
        if (dx*dx + dy*dy > 1600) {
            return;
        }
    
        // This square is visible.
        this.cells.at(targetX, targetY).seen = true;
    
        // End recursion if the target square occludes the view.
        if (this.cells.at(targetX, targetY).blocksPlayerSight) {
            return;
        }
    
        // Mark diagonally-adjacent squares as visible if their corners are visible
        for (let x = 0; x < 2; ++x) {
            for (let y = 0; y < 2; ++y) {
                let nx = targetX + 2*x - 1;
                let ny = targetY + 2*y - 1;
                let cdx = dx + 2*x - 1;
                let cdy = dy + 2*y - 1;
                
                if (nx >= 0 &&
                    ny >= 0 &&
                    nx < this.cells.sizeX &&
                    ny < this.cells.sizeY &&
                    !aRightOfB(ldx, ldy, cdx, cdy) &&
                    !aRightOfB(cdx, cdy, rdx, rdy)) {
                    this.cells.at(nx, ny).seen = true;
                }
            }
        }
    
        // Clip portals to adjacent squares and recurse through the visible portions
        for (const portal of portals) {
            // Relative positions of the portal's left and right endpoints:
            const pldx = dx + portal.lx;
            const pldy = dy + portal.ly;
            const prdx = dx + portal.rx;
            const prdy = dy + portal.ry;
    
            // Clip portal against current view frustum:
            const [cldx, cldy] = aRightOfB(ldx, ldy, pldx, pldy) ? [ldx, ldy] : [pldx, pldy];
            const [crdx, crdy] = aRightOfB(rdx, rdy, prdx, prdy) ? [prdx, prdy] : [rdx, rdy];
    
            // If we can see through the clipped portal, recurse through it.
            if (aRightOfB(crdx, crdy, cldx, cldy)) {
                this.computeVisibility
                (
                    viewerX, viewerY,
                    targetX + portal.nx, targetY + portal.ny,
                    cldx, cldy,
                    crdx, crdy
                );
            }
        }
    }

    computeLighting() {
        for (const cell of this.cells.values) {
            cell.lit = false;
        }
        for (const item of this.items) {
            if (item.type == ItemType.TorchLit) {
                this.castLight(item.pos, 45);
            }
        }
        for (const guard of this.guards) {
            if (guard.hasTorch) {
                this.castLight(guard.pos, 15);
            }
        }
    }

    castLight(posLight: vec2, radiusSquared: number) {
        this.cells.at(posLight[0], posLight[1]).lit = true;
        for (const portal of portals) {
            this.castLightRecursive(
                posLight[0], posLight[1],
                posLight[0] + portal.nx, posLight[1] + portal.ny,
                portal.lx, portal.ly,
                portal.rx, portal.ry,
                radiusSquared
            );
        }
    }

    castLightRecursive(
        // Light source map coordinates:
        lightX: number,
        lightY: number,
        // Target cell map coordinates:
        targetX: number,
        targetY: number,
        // Left edge of current view frustum (relative to viewer):
        ldx: number,
        ldy: number,
        // Right edge of current view frustum (relative to viewer):
        rdx: number,
        rdy: number,
        // Max radius of light source
        radiusSquared: number) {
        // End recursion if the target cell is out of bounds.
        if (targetX < 0 || targetY < 0 || targetX >= this.cells.sizeX || targetY >= this.cells.sizeY) {
            return;
        }
    
        // End recursion if the target square is too far away.
        let dx = (targetX - lightX);
        let dy = (targetY - lightY);
    
        if (dx**2 + dy**2 > radiusSquared) {
            return;
        }

        dx *= 2;
        dy *= 2;

        // The cell is lit
        const cell = this.cells.at(targetX, targetY);
        cell.lit = true;

        // A solid target square blocks all further light through it.
        if (cell.blocksSight) {
            return;
        }
    
        // Mark diagonally-adjacent squares as lit if their corners are lit
        for (let x = 0; x < 2; ++x) {
            for (let y = 0; y < 2; ++y) {
                let nx = targetX + 2*x - 1;
                let ny = targetY + 2*y - 1;
                let cdx = dx + 2*x - 1;
                let cdy = dy + 2*y - 1;
                
                if (nx >= 0 &&
                    ny >= 0 &&
                    nx < this.cells.sizeX &&
                    ny < this.cells.sizeY &&
                    !aRightOfB(ldx, ldy, cdx, cdy) &&
                    !aRightOfB(cdx, cdy, rdx, rdy)) {
                    this.cells.at(nx, ny).lit = true;
                }
            }
        }
    
        // Clip portals to adjacent squares and recurse through the visible portions
        for (const portal of portals) {
            // Relative positions of the portal's left and right endpoints:
            const pldx = dx + portal.lx;
            const pldy = dy + portal.ly;
            const prdx = dx + portal.rx;
            const prdy = dy + portal.ry;
    
            // Clip portal against current view frustum:
            const [cldx, cldy] = aRightOfB(ldx, ldy, pldx, pldy) ? [ldx, ldy] : [pldx, pldy];
            const [crdx, crdy] = aRightOfB(rdx, rdy, prdx, prdy) ? [prdx, prdy] : [rdx, rdy];
    
            // If we can see through the clipped portal, recurse through it.
            if (aRightOfB(crdx, crdy, cldx, cldy)) {
                this.castLightRecursive(
                    lightX, lightY,
                    targetX + portal.nx, targetY + portal.ny,
                    cldx, cldy,
                    crdx, crdy,
                    radiusSquared
                );
            }
        }
    }
    
    allLootCollected(): boolean {
        return this.items.find((item) => item.type == ItemType.Coin) === undefined;
    }

    isGuardAt(x: number, y: number): boolean {
        return this.guards.find((guard) => guard.hasMoved && guard.pos[0] == x && guard.pos[1] == y) != undefined;
    }

    guardMoveCost(posOld: vec2, posNew: vec2): number {
        const cost = this.cells.at(posNew[0], posNew[1]).moveCost;
    
        if (cost === Infinity) {
            return cost;
        }
    
        // Guards are not allowed to move diagonally around corners.
    
        if (posOld[0] != posNew[0] &&
            posOld[1] != posNew[1] &&
            (this.cells.at(posOld[0], posNew[1]).moveCost === Infinity ||
             this.cells.at(posNew[0], posOld[1]).moveCost === Infinity)) {
            return Infinity;
        }
    
        return cost;
    }

    computeDistancesToPatrolPath(patrolPositions: Array<vec2>): Float64Grid {
        const goal: Array<DistPos> = [];
    
        for (const pos of patrolPositions) {
            const cost = this.cells.at(pos[0], pos[1]).moveCost;
            goal.push({ priority: cost, pos: pos });
        }
    
        return this.computeDistanceField(goal);
    }

    computeDistancesToPosition(pos_goal: vec2): Float64Grid {
        console.assert(pos_goal[0] >= 0);
        console.assert(pos_goal[1] >= 0);
        console.assert(pos_goal[0] < this.cells.sizeX);
        console.assert(pos_goal[1] < this.cells.sizeY);
    
        return this.computeDistanceField([{ priority: 0, pos: pos_goal }]);
    }

    computeDistancesToAdjacentToPosition(pos_goal: vec2): Float64Grid {
        const goal: Array<DistPos> = [];
        for (const dir of cardinalDirections) {
            const pos = vec2.create();
            vec2.add(pos, pos_goal, dir);
            if (pos[0] < 0 || pos[1] < 0 || pos[0] >= this.cells.sizeX || pos[1] >= this.cells.sizeY) {
                continue;
            }
            const cell = this.cells.at(pos[0], pos[1]);
            if (cell.moveCost !== Infinity) {
                goal.push({ priority: cell.moveCost, pos: pos });
            }
        }
        return this.computeDistanceField(goal);
    }

    computeDistanceField(initialDistances: Array<DistPos>): Float64Grid {
        let sizeX = this.cells.sizeX;
        let sizeY = this.cells.sizeY;

        const toVisit: PriorityQueue<DistPos> = [];
        const distField = new Float64Grid(sizeX, sizeY, Infinity);
    
        for (const distPos of initialDistances) {
            priorityQueuePush(toVisit, distPos);
        }
    
        while (toVisit.length > 0) {
            const distPos = priorityQueuePop(toVisit);
            if (distPos.priority >= distField.get(distPos.pos[0], distPos.pos[1])) {
                continue;
            }
    
            distField.set(distPos.pos[0], distPos.pos[1], distPos.priority);
    
            for (const adjacentMove of adjacentMoves) {
                const posNew = vec2.fromValues(distPos.pos[0] + adjacentMove.dx, distPos.pos[1] + adjacentMove.dy);
                if (posNew[0] < 0 || posNew[1] < 0 || posNew[0] >= sizeX || posNew[1] >= sizeY) {
                    continue;
                }
    
                const moveCost = this.guardMoveCost(distPos.pos, posNew);
                if (moveCost == Infinity) {
                    continue;
                }
    
                const distNew = distPos.priority + moveCost + adjacentMove.cost;
    
                if (distNew < distField.get(posNew[0], posNew[1])) {
                    priorityQueuePush(toVisit, { priority: distNew, pos: posNew });
                }
            }
        }
    
        return distField;
    }

    guardsInEarshot(soundPos: vec2, radius: number): Array<Guard> {
        const coords = this.coordsInEarshot(soundPos, radius);
        return this.guards.filter(guard => coords.has(this.cells.sizeX * guard.pos[1] + guard.pos[0]));
    }

    coordsInEarshot(soundPos: vec2, costCutoff: number): Set<number> {
        let sizeX = this.cells.sizeX;
        let sizeY = this.cells.sizeY;
    
        const toVisit: PriorityQueue<DistPos> = [];
        const distField = new Float64Grid(sizeX, sizeY, Infinity);
        const coordsVisited: Set<number> = new Set();
    
        priorityQueuePush(toVisit, { priority: 0, pos: soundPos });
    
        while (toVisit.length > 0) {
            const distPos = priorityQueuePop(toVisit);
            if (distPos.priority >= distField.get(distPos.pos[0], distPos.pos[1])) {
                continue;
            }
    
            distField.set(distPos.pos[0], distPos.pos[1], distPos.priority);
            coordsVisited.add(sizeX * distPos.pos[1] + distPos.pos[0]);
    
            for (const adjacentMove of adjacentMoves) {
                const posNew = vec2.fromValues(distPos.pos[0] + adjacentMove.dx, distPos.pos[1] + adjacentMove.dy);
                if (posNew[0] < 0 || posNew[1] < 0 || posNew[0] >= sizeX || posNew[1] >= sizeY) {
                    continue;
                }
    
                const costNew = distPos.priority + adjacentMove.cost;
                if (costNew > costCutoff) {
                    continue;
                }
    
                if (this.cells.at(posNew[0], posNew[1]).blocksSound) {
                    continue;
                }
    
                if (costNew >= distField.get(posNew[0], posNew[1])) {
                    continue;
                }
    
                priorityQueuePush(toVisit, { priority: costNew, pos: posNew });
            }
        }
    
        return coordsVisited;
    }
}

function isWindowTerrainType(terrainType: TerrainType): boolean {
    return terrainType >= TerrainType.OneWayWindowE && terrainType <= TerrainType.OneWayWindowS;
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
