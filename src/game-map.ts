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
    LevelType,
    Player,
    Rect,
    TerrainType,
    TreasureInfo,
    GuardStates,
    guardMoveCostForItemType,
    isWindowTerrainType,
    isDoorItemType,
    levelTypeName,
    maxPlayerTurnsUnderwater,
};

import { Guard, GuardMode } from './guard';
import { vec2 } from './my-matrix';
import { Animator, LightSourceAnimation, RadialAnimation, SpriteAnimation } from './animation';
import { RNG } from './random';
import { Adjacency } from './create-map';


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

enum LevelType {
    Manor,
    ManorRed,
    Mansion,
    Fortress,
    Warrens,
}

function levelTypeName(levelType: LevelType): string {
    switch (levelType) {
        case LevelType.Manor: return 'Manor';
        case LevelType.ManorRed: return 'Manor';
        case LevelType.Mansion: return 'Mansion';
        case LevelType.Fortress: return 'Fortress';
        case LevelType.Warrens: return 'Warrens';
    }
}

type GameMapRoughPlan = {
    levelType: LevelType;
    level: number; // level for difficulty purposees
    numRoomsX: number;
    numRoomsY: number;
    totalLoot: number;
    played: boolean;
    rng: RNG;
}

enum TerrainType {
    GroundNormal,
    GroundGrass,
    GroundWater,
    GroundMarble,
    GroundWood,
    GroundWoodCreaky,
    GroundVault,
    GroundTreasure,

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
    isWindow: boolean;
    lit: number;
    litAnim: number;
    litSrc: Set<number>; //Array<number>; //TODO: this should be a set pointing to the item/guard
    seen: boolean;
    identified: boolean;
    animation?: Animator;
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
            this.values[i] = this.emptyCell();
        };
    }

    at(x: number, y: number): Cell {
        if(x<0 || x>=this.sizeX || y<0 || y>=this.sizeY) {
            return this.emptyCell();
        }
        const i = this.sizeX * y + x;
        return this.values[i];
    }

    atVec(pos:vec2): Cell {
        return this.at(pos[0], pos[1]);
    }

    index(x: number, y:number): number {
        return this.sizeX * y + x;
    }

    indexVec(pos:vec2): number {
        return this.index(pos[0], pos[1]);
    }


    emptyCell(): Cell {
        return {
            type: TerrainType.GroundGrass,
            moveCost: Infinity,
            blocksPlayerMove: false,
            blocksPlayerSight: false,
            blocksSight: false,
            blocksSound: false,
            hidesPlayer: false,
            isWindow: false,
            lit: 0,
            litAnim:0,
            litSrc: new Set<number>(),
            seen: false,
            identified: false,
        }
    }
}

enum GuardStates {
    Relaxed,
    Angry,
    Alerted,
    Chasing,
    Unconscious,
}

enum ItemType {
    Chair,
    Table,
    BedL,
    BedR,
    DrawersShort,
    DrawersTall,
    Bookshelf,
    Shelf,
    Stove,
    Bush,
    Coin,
    Health,
    DoorNS,
    DoorEW,
    LockedDoorNS,
    LockedDoorEW,
    PortcullisNS,
    PortcullisEW,
    TorchUnlit,
    TorchLit,
    TorchCarry, //TODO: Next four don't belong here because they are carried by guards but solves a problem for now.
    PurseCarry,
    Key,
    KeyCarry, 
    VaultTreasureBox,
    EmptyVaultTreasureBox,
    LootedVaultTreasureBox,
    Note,
    TreasureLock,
    TreasurePlinth,
    TreasureA,
    TreasureB,
    TreasureC,
    TreasureD,
    TreasureE,
}

export const itemLayers: Record<ItemType, boolean> = {
    [ItemType.Chair]: false,
    [ItemType.Table]: false,
    [ItemType.BedL]: false,
    [ItemType.BedR]: false,
    [ItemType.DrawersShort]: false,
    [ItemType.DrawersTall]: false,
    [ItemType.Bookshelf]: false,
    [ItemType.Shelf]: false,
    [ItemType.Stove]: false,
    [ItemType.Bush]: false,
    [ItemType.Coin]: false,
    [ItemType.Health]: false,
    [ItemType.DoorNS]: false,
    [ItemType.DoorEW]: false,
    [ItemType.LockedDoorNS]: false,
    [ItemType.LockedDoorEW]: false,
    [ItemType.PortcullisNS]: false,
    [ItemType.PortcullisEW]: false,
    [ItemType.TorchUnlit]: false,
    [ItemType.TorchLit]: false,
    [ItemType.TorchCarry]: false, //TODO: Next four don't belong here because they are carried by guards but solves a problem for now.
    [ItemType.PurseCarry]: false,
    [ItemType.Key]: false,
    [ItemType.KeyCarry]: false, 
    [ItemType.VaultTreasureBox]: false,
    [ItemType.EmptyVaultTreasureBox]: false,
    [ItemType.LootedVaultTreasureBox]: false,
    [ItemType.Note]: false,
    [ItemType.TreasureLock]: true,
    [ItemType.TreasurePlinth]: false,
    [ItemType.TreasureA]: true,
    [ItemType.TreasureB]: true,
    [ItemType.TreasureC]: true,
    [ItemType.TreasureD]: true,
    [ItemType.TreasureE]: true,
}

type Item = {
    pos: vec2;
    type: ItemType;
    animation? : Animator;
    topLayer: boolean;
}

function guardMoveCostForItemType(itemType: ItemType): number {
    switch (itemType) {
        case ItemType.Chair: return 32;
        case ItemType.Table: return 64;
        case ItemType.BedL: return 64;
        case ItemType.BedR: return 64;
        case ItemType.DrawersShort: return Infinity;
        case ItemType.DrawersTall: return Infinity;
        case ItemType.Bookshelf: return Infinity;
        case ItemType.Shelf: return Infinity;
        case ItemType.Stove: return Infinity;
        case ItemType.Bush: return 10;
        case ItemType.Coin: return 0;
        case ItemType.Health: return 0;
        case ItemType.DoorNS: return 0;
        case ItemType.DoorEW: return 0;
        case ItemType.LockedDoorNS: return 0;
        case ItemType.LockedDoorEW: return 0;
        case ItemType.PortcullisNS: return 0;
        case ItemType.PortcullisEW: return 0;
        case ItemType.TorchUnlit: return Infinity;
        case ItemType.TorchLit: return Infinity;
        case ItemType.TorchCarry: return 0;
        case ItemType.PurseCarry: return 0;
        case ItemType.Key: return 0;
        case ItemType.KeyCarry: return 0;
        case ItemType.Note: return 0;
        case ItemType.TreasureLock: return Infinity;
        case ItemType.TreasurePlinth: return Infinity;
        case ItemType.VaultTreasureBox: return Infinity;
        case ItemType.EmptyVaultTreasureBox: return Infinity;
        case ItemType.LootedVaultTreasureBox: return Infinity;
        case ItemType.TreasureA: return Infinity;
        case ItemType.TreasureB: return Infinity;
        case ItemType.TreasureC: return Infinity;
        case ItemType.TreasureD: return Infinity;
        case ItemType.TreasureE: return Infinity;
    }
}

const maxPlayerHealth: number = 5;
const maxPlayerHealthDaily: number = 3;
const maxPlayerTurnsUnderwater: number = 7;

class Player {
    pos: vec2;
    dir: vec2;
    health: number;
    healthMax: number;
    loot: number;
    noisy: boolean; // did the player make noise last turn?
    preNoisy: boolean; // did the player step at wall last turn?
    noiseOffset: vec2; // which direction was the noise made relative to the player's position?
    noisyAnim: number;
    hasVaultKey: boolean;
    damagedLastTurn: boolean;
    itemUsed: Item | null = null; // item player used last turn, if any
    turnsRemainingUnderwater: number;
    animation: SpriteAnimation|null = null;
    torchAnimation: LightSourceAnimation|null = null;
    pickTarget: Guard | Item | null = null;
    lightActive: boolean = false;
    idle: boolean = false;
    idleCursorAnimation: Animator[]|null = null;
    idleCursorType:'orbs'|'off' = 'orbs';

    constructor(pos: vec2, dailyRun: boolean) {
        this.pos = vec2.clone(pos);
        this.dir = vec2.fromValues(0, -1);
        this.healthMax = dailyRun ? maxPlayerHealthDaily : maxPlayerHealth;
        this.health = this.healthMax;
        this.loot = 0;
        this.noisy = false;
        this.preNoisy = false;
        this.noiseOffset = vec2.fromValues(0, 0);
        this.noisyAnim = 0;
        this.hasVaultKey = false;
        this.damagedLastTurn = false;
        this.turnsRemainingUnderwater = maxPlayerTurnsUnderwater;
    }

    applyDamage(d: number) {
        this.health -= Math.min(d, this.health);
        this.damagedLastTurn = true;
    }

    hidden(map: GameMap): boolean {
        if (this.lightActive) {
            return false;
        }

        if (map.guards.find((guard) => guard.mode == GuardMode.ChaseVisibleTarget) !== undefined) {
            return false;
        }

        if (map.cells.atVec(this.pos).hidesPlayer) {
            return true;
        }

        let cellType = map.cells.atVec(this.pos).type;

        if (cellType == TerrainType.GroundWater && this.turnsRemainingUnderwater > 0) {
            return true;
        }

        return false;
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

const lightPortals: Array<PortalInfo> = [
    { lx: -1, ly: -1, rx: -1, ry: -1, nx: -1, ny: -1 },
    { lx: -1, ly: -1, rx: -1, ry:  1, nx: -1, ny:  0 },
    { lx: -1, ly:  1, rx: -1, ry:  1, nx: -1, ny:  1 },
    { lx: -1, ly:  1, rx:  1, ry:  1, nx:  0, ny:  1 },
    { lx:  1, ly:  1, rx:  1, ry:  1, nx:  1, ny:  1 },
    { lx:  1, ly:  1, rx:  1, ry: -1, nx:  1, ny:  0 },
    { lx:  1, ly: -1, rx:  1, ry: -1, nx:  1, ny: -1 },
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

type TreasureInfo = {
    switches: Array<vec2>;
    numSwitchesUsed: number;
    posTreasure: vec2;
    stolen: boolean;
}

class GameMap {
    cells: CellGrid;
    patrolRegions: Array<Rect>;
    patrolRoutes: Array<[number, number]>;
    items: Array<Item>;
    guards: Array<Guard>;
    playerStartPos: vec2;
    lightCount: number;
    numPreRevealedCells: number;
    backtrackingCoefficient: number;
    bookTitle: Map<Item, string>;
    treasures: Array<TreasureInfo>;

    // Development visualization data:
    rooms: Array<Rect>;
    adjacencies: Array<Adjacency>;

    constructor(cells: CellGrid) {
        this.cells = cells;
        this.patrolRegions = [];
        this.patrolRoutes = [];
        this.items = [];
        this.guards = [];
        this.playerStartPos = vec2.create();
        this.lightCount = 0;
        this.numPreRevealedCells = 0;
        this.backtrackingCoefficient = 1;
        this.bookTitle = new Map();
        this.treasures = [];

        this.rooms = [];
        this.adjacencies = [];
    }

    hasLootAt(pos: vec2): boolean {
        return this.items.some(item =>
            item.pos.equals(pos) && (
                item.type === ItemType.Coin || 
                item.type >= ItemType.TreasureA || 
                item.type === ItemType.Health || 
                item.type === ItemType.VaultTreasureBox
            ));
    }

    collectLootAt(pos:vec2): Array<Item> {
        let items:Array<Item> = [];
        const lockedTreasure = this.items.some(item => item.type === ItemType.TreasureLock && item.pos.equals(pos));
        this.items = this.items.filter((item) => {
            if (!item.pos.equals(pos)) {
                return true;
            } else if (item.type === ItemType.Coin || item.type === ItemType.Health) {
                items.push(item);
                return false;
            } else if (item.type >= ItemType.TreasureA && !lockedTreasure) {
                items.push(item);
                return false;
            } else if (item.type === ItemType.VaultTreasureBox) {
                items.push(item);
                return false;                
            } else {
                return true;
            }
        });
        return items;
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
        for(let g of this.guards) {
            if(g.hasPurse) {
                ++gold;
                g.hasPurse = false;
            }
        }
        return gold;
    }

    identifyAdjacentCells(pos: vec2) {
        const xMin = Math.max(pos[0] - 1, 0);
        const yMin = Math.max(pos[1] - 1, 0);
        const xMax = Math.min(pos[0] + 2, this.cells.sizeX);
        const yMax = Math.min(pos[1] + 2, this.cells.sizeY);

        for (let x = xMin; x < xMax; ++x) {
            for (let y = yMin; y < yMax; ++y) {
                this.cells.at(x, y).identified = true;
            }
        }
    }

    allSeen(): boolean {
        return !this.cells.values.some(cell => !cell.seen);
    }

    numCells(): number {
        return this.cells.values.length;
    }

    numCellsSeen(): number {
        let numSeen = 0;
        for (const cell of this.cells.values) {
            if (cell.seen) {
                ++numSeen;
            }
        }
        return numSeen;
    }

    fractionRevealed(): number {
        return (this.numCellsSeen() - this.numPreRevealedCells) / (this.numCells() - this.numPreRevealedCells);
    }

    markAllSeen() {
        for (const cell of this.cells.values) {
            cell.seen = true;
            cell.identified = true;
        }
    }
    
    markAllUnseen() {
        for (const cell of this.cells.values) {
            cell.seen = false;
            cell.identified = false;
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
            return false;
        }
    
        const cell = this.cells.at(posTarget[0], posTarget[1]);
        if (cell.blocksPlayerSight)
            return false;

        return true;
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
        let dx = targetX - viewerX;
        let dy = targetY - viewerY;
    
        if (dx**2 + dy**2 > 400) {
            return;
        }

        dx *= 2;
        dy *= 2;

        // This square is visible.
        const cell = this.cells.at(targetX, targetY);
        cell.seen = true;
    
        // End recursion if the target square occludes the view.
        if (cell.blocksPlayerSight) {
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

    computeLighting(player: Player | null) {
        //TODO: These light source calculation depend on the number of lights (either on or off) 
        //not changing and not changing their order during play to avoid ugly flickering when lights
        //switch on/off
        const occupied:Set<Cell> = new Set();
        if(player!==null && this.cells.atVec(player.pos).type>=TerrainType.Wall0000) occupied.add(this.cells.atVec(player.pos));
        for(let g of this.guards) {
            const gCell = this.cells.at(g.pos[0],g.pos[1]);
            if(gCell.type>=TerrainType.Wall0000) occupied.add(gCell);
        }
        for (const cell of this.cells.values) {
            cell.lit = 0;
            cell.litSrc.clear();
        }

        let lightId = 0;

        // Environment light sources
        for (const item of this.items) {
            if (item.type === ItemType.TorchLit) {
                this.castLight(item.pos, 45, lightId, occupied);
                lightId++;
            }
            if (item.type === ItemType.Stove) {
                this.castLight(item.pos, 25, lightId, occupied);
                lightId++;
            }
            if (item.type == ItemType.TorchUnlit) {
                lightId++;
            }
        }

        // Guards' light sources
        for (const guard of this.guards) {
            if (guard.hasTorch) {
                if (guard.mode !== GuardMode.Unconscious) {
                    this.castLight(guard.pos, 15, lightId, occupied);
                }
                lightId++;
            }
        }

        // Player's light source
        if (player !== null && player.lightActive) {
            this.castLight(player.pos, 0, lightId, occupied);
        }
        lightId++;

        this.lightCount = lightId;
    }

    castLight(posLight: vec2, radiusSquared: number, lightId:number, occupied:Set<Cell>) {
        this.cells.at(posLight[0], posLight[1]).lit = 1;
        for (const portal of lightPortals) {
            this.castLightRecursive(
                posLight[0], posLight[1],
                posLight[0] + portal.nx, posLight[1] + portal.ny,
                portal.lx, portal.ly,
                portal.rx, portal.ry,
                radiusSquared,
                lightId,
                occupied
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
        radiusSquared: number,
        lightId: number,
        occupied:Set<Cell>
        ) {
        // End recursion if the target cell is out of bounds.
        if (targetX < 0 || targetY < 0 || targetX >= this.cells.sizeX || targetY >= this.cells.sizeY) {
            return;
        }

        // End recursion if the target square is too far away.
        let dx = targetX - lightX;
        let dy = targetY - lightY;
    
        if (dx**2 + dy**2 > radiusSquared) {
            return;
        }

        // Grab the cell
        const cell = this.cells.at(targetX, targetY);

        // The cell is lit
        if(!cell.litSrc.has(lightId)) {
            const dist2 = dx**2 + dy**2;
            //We apply a scale paramter of 0.5 to the dist2 to control falloff
            cell.lit += 1/(0.5*dist2+1); 
            cell.lit = Math.min(cell.lit, 1);
            cell.litSrc.add(lightId);
        }

        // A solid target square blocks all further light through it.
        if (cell.blocksSight && !occupied.has(cell)) {
            return;
        }

        // If the portal is zero-width, end here.
        if (!aRightOfB(rdx, rdy, ldx, ldy)) {
            return;
        }

        dx *= 2;
        dy *= 2;

        // Clip portals to adjacent squares and recurse through the visible portions
        for (const portal of lightPortals) {
            // Relative positions of the portal's left and right endpoints:
            const pldx = dx + portal.lx;
            const pldy = dy + portal.ly;
            const prdx = dx + portal.rx;
            const prdy = dy + portal.ry;
    
            // Clip portal against current view frustum:
            const [cldx, cldy] = aRightOfB(ldx, ldy, pldx, pldy) ? [ldx, ldy] : [pldx, pldy];
            const [crdx, crdy] = aRightOfB(rdx, rdy, prdx, prdy) ? [prdx, prdy] : [rdx, rdy];
    
            // If we can see through the clipped portal, recurse through it.
            if (!aRightOfB(cldx, cldy, crdx, crdy)) {
                this.castLightRecursive(
                    lightX, lightY,
                    targetX + portal.nx, targetY + portal.ny,
                    cldx, cldy,
                    crdx, crdy,
                    radiusSquared,
                    lightId,
                    occupied
                );
            }
        }
    }
    
    allLootCollected(): boolean {
        return this.items.find((item) => item.type == ItemType.Coin) === undefined;
    }

    isGuardAt(x: number, y: number): boolean {
        return this.guards.find((guard) => guard.hasMoved && guard.pos.equalsValues(x,y)) != undefined;
    }

    isGuardAtVec(pos: vec2): boolean {
        return this.guards.find((guard) => guard.hasMoved && guard.pos.equals(pos)) != undefined;
    }

    guardMoveCost(posOld: vec2, posNew: vec2): number {
        const cost = this.cells.atVec(posNew).moveCost;
    
        if (cost === Infinity) {
            return cost;
        }
    
        // Guards are not allowed to move diagonally around corners.
    
        // TODO: I think there may be a better way to do this. The 64 here is the current movement
        // cost for water; trying to allow diagonal movement past chairs and tables and such, but
        // not around the corner of a water pool.

        if (posOld[0] != posNew[0] &&
            posOld[1] != posNew[1] &&
            (this.cells.at(posOld[0], posNew[1]).moveCost >= 64 ||
             this.cells.at(posNew[0], posOld[1]).moveCost >= 64)) {
            return Infinity;
        }
    
        return cost;
    }

    posNextBest(distanceField: Float64Grid, posFrom: vec2): vec2 {
        let costBest = Infinity;
        let posBest = vec2.clone(posFrom);
    
        const posMin = vec2.fromValues(Math.max(0, posFrom[0] - 1), Math.max(0, posFrom[1] - 1));
        const posMax = vec2.fromValues(Math.min(this.cells.sizeX, posFrom[0] + 2), Math.min(this.cells.sizeY, posFrom[1] + 2));
    
        for (let x = posMin[0]; x < posMax[0]; ++x) {
            for (let y = posMin[1]; y < posMax[1]; ++y) {
                const cost = distanceField.get(x, y);
                if (cost == Infinity) {
                    continue;
                }
    
                let pos = vec2.fromValues(x, y);
                if (this.guardMoveCost(posFrom, pos) == Infinity) {
                    continue;
                }
    
                if (this.isGuardAtVec(pos)) {
                    continue;
                }
    
                if (cost < costBest) {
                    costBest = cost;
                    posBest = pos;
                }
            }
        }
    
        return posBest;
    }

    nextPositions(distanceField: Float64Grid, posFrom: vec2): Array<vec2> {
        const posMin = vec2.fromValues(Math.max(0, posFrom[0] - 1), Math.max(0, posFrom[1] - 1));
        const posMax = vec2.fromValues(Math.min(this.cells.sizeX, posFrom[0] + 2), Math.min(this.cells.sizeY, posFrom[1] + 2));

        const positionsAndCosts: Array<[number, number, vec2]> = [];

        for (let x = posMin[0]; x < posMax[0]; ++x) {
            for (let y = posMin[1]; y < posMax[1]; ++y) {
                const cost = distanceField.get(x, y);
                if (cost === Infinity) {
                    continue;
                }
    
                let pos = vec2.fromValues(x, y);
                if (this.guardMoveCost(posFrom, pos) === Infinity) {
                    continue;
                }

                const moveCost = Math.abs(posFrom[0] - pos[0]) + Math.abs(posFrom[1] - pos[1]);

                positionsAndCosts.push([cost, moveCost, pos]);
            }
        }

        positionsAndCosts.sort((a, b) => (a[0] !== b[0]) ? (a[0] - b[0]) : (a[1] - b[1]));

        return positionsAndCosts.map(a => a[2]);
    }
    
    patrolPathIndexForResume(patrolPositions: Array<vec2>, patrolIndexCur: number, pos: vec2): number {
        const distanceToPos = this.computeDistancesToPosition(pos, undefined);

        let patrolIndexBest = patrolIndexCur;

        // Advance along the patrol path until it's headed the same direction the
        // distance field is.
    
        for (let dPatrolIndex = 0; dPatrolIndex < patrolPositions.length; ++dPatrolIndex) {
            const posPatrol = patrolPositions[patrolIndexBest];
            const posGuardPrev = this.posNextBest(distanceToPos, posPatrol);
            const posPatrolPrev = patrolPositions[(patrolIndexBest + patrolPositions.length - 1) % patrolPositions.length];
            const dirGuard = vec2.create();
            vec2.subtract(dirGuard, posPatrol, posGuardPrev);
            const dirPatrol = vec2.create();
            vec2.subtract(dirPatrol, posPatrol, posPatrolPrev);
            if (vec2.dot(dirGuard, dirPatrol) > 0) {
                break;
            }
            patrolIndexBest = (patrolIndexBest + 1) % patrolPositions.length;
        }

        return patrolIndexBest;
    }

    computeDistancesToPosition(posGoal: vec2, queryRect: Rect | undefined): Float64Grid {
        console.assert(posGoal[0] >= 0);
        console.assert(posGoal[1] >= 0);
        console.assert(posGoal[0] < this.cells.sizeX);
        console.assert(posGoal[1] < this.cells.sizeY);
    
        return this.computeDistanceField([{ priority: 0, pos: vec2.clone(posGoal) }], queryRect);
    }

    computeDistancesToPositionSubrect(posGoal: vec2, xMin: number, yMin: number, xMax: number, yMax: number): Float64Grid {
        console.assert(posGoal[0] >= xMin);
        console.assert(posGoal[1] >= yMin);
        console.assert(posGoal[0] < xMax);
        console.assert(posGoal[1] < yMax);

        return this.computeDistanceFieldSubrect([{ priority: 0, pos: vec2.clone(posGoal) }], xMin, yMin, xMax, yMax);
    }

    computeDistancesToAdjacentToPosition(posGoal: vec2, queryRect: Rect): Float64Grid {
        const goal: Array<DistPos> = [];
        for (const dir of cardinalDirections) {
            const pos = vec2.clone(posGoal).add(dir);
            if (pos[0] < 0 || pos[1] < 0 || pos[0] >= this.cells.sizeX || pos[1] >= this.cells.sizeY) {
                continue;
            }
            const cell = this.cells.atVec(pos);
            if (cell.moveCost !== Infinity) {
                goal.push({ priority: cell.moveCost, pos: pos });
            }
        }
        return this.computeDistanceField(goal, queryRect);
    }

    computeDistanceField(initialDistances: Array<DistPos>, queryRect: Rect | undefined): Float64Grid {
        let sizeX = this.cells.sizeX;
        let sizeY = this.cells.sizeY;

        const toVisit: PriorityQueue<DistPos> = [];
        const distField = new Float64Grid(sizeX, sizeY, Infinity);
    
        for (const distPos of initialDistances) {
            priorityQueuePush(toVisit, distPos);
        }
    
        let numQuerySquaresToVisit = (queryRect === undefined) ? 1 : this.numNavigableSquaresInRect(queryRect);

        while (toVisit.length > 0 && numQuerySquaresToVisit > 0) {
            const distPos = priorityQueuePop(toVisit);
            if (distPos.priority >= distField.get(distPos.pos[0], distPos.pos[1])) {
                continue;
            }
    
            distField.set(distPos.pos[0], distPos.pos[1], distPos.priority);

            if (queryRect !== undefined &&
                distPos.pos[0] >= queryRect.posMin[0] &&
                distPos.pos[1] >= queryRect.posMin[1] &&
                distPos.pos[0] < queryRect.posMax[0] &&
                distPos.pos[1] < queryRect.posMax[1]) {
                --numQuerySquaresToVisit;
            }

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

    numNavigableSquaresInRect(rect: Rect): number {
        let n = 0;
        for (let x = rect.posMin[0]; x < rect.posMax[0]; ++x) {
            for (let y = rect.posMin[1]; y < rect.posMax[1]; ++y) {
                if (this.cells.at(x, y).moveCost !== Infinity) {
                    ++n;
                }
            }
        }
        return n;
    }

    computeDistanceFieldSubrect(initialDistances: Array<DistPos>, xMin: number, yMin: number, xMax: number, yMax: number): Float64Grid {
        console.assert(xMin >= 0);
        console.assert(yMin >= 0);
        console.assert(xMax <= this.cells.sizeX);
        console.assert(yMax <= this.cells.sizeY);

        const sizeX = xMax - xMin;
        const sizeY = yMax - yMin;

        const toVisit: PriorityQueue<DistPos> = [];
        const distField = new Float64Grid(sizeX, sizeY, Infinity);
    
        for (const distPos of initialDistances) {
            priorityQueuePush(toVisit, { priority: distPos.priority, pos: [distPos.pos[0] - xMin, distPos.pos[1] - yMin] });
        }
    
        while (toVisit.length > 0) {
            const distPos = priorityQueuePop(toVisit);
            if (distPos.priority >= distField.get(distPos.pos[0], distPos.pos[1])) {
                continue;
            }
    
            distField.set(distPos.pos[0], distPos.pos[1], distPos.priority);

            const posOldMap = vec2.fromValues(distPos.pos[0] + xMin, distPos.pos[1] + yMin);
            
            for (const adjacentMove of adjacentMoves) {
                const posNew = vec2.fromValues(distPos.pos[0] + adjacentMove.dx, distPos.pos[1] + adjacentMove.dy);
                if (posNew[0] < 0 || posNew[1] < 0 || posNew[0] >= sizeX || posNew[1] >= sizeY) {
                    continue;
                }
    
                const posNewMap = vec2.fromValues(posNew[0] + xMin, posNew[1] + yMin);

                const moveCost = this.guardMoveCost(posOldMap, posNewMap);
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

    guardsInEarshot(soundPos: vec2, costCutoff: number): Array<Guard> {
        const sizeX = this.cells.sizeX;
        const sizeY = this.cells.sizeY;

        // Make a map for quickly seeing what guard (if any) is at a given location
        const guardAtPos: Map<number, Guard> = new Map();
        for (const guard of this.guards) {
            if (guard.mode === GuardMode.Unconscious) {
                continue;
            }
            guardAtPos.set(sizeX * guard.pos[1] + guard.pos[0], guard);
        }

        // Visit squares in the map, recording guards as we encounter them.
        const toVisit: PriorityQueue<DistPos> = [];
        const distField = new Float64Grid(sizeX, sizeY, Infinity);
        const guards: Array<Guard> = [];
    
        priorityQueuePush(toVisit, { priority: 0, pos: soundPos });
    
        while (toVisit.length > 0) {
            const distPos = priorityQueuePop(toVisit);
            if (distPos.priority >= distField.get(distPos.pos[0], distPos.pos[1])) {
                continue;
            }

            distField.set(distPos.pos[0], distPos.pos[1], distPos.priority);

            const guard = guardAtPos.get(sizeX * distPos.pos[1] + distPos.pos[0]);
            if (guard !== undefined) {
                guards.push(guard);
            }

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

        return guards;
    }

    tryGetPosLookAt(pos: vec2, includeDoors: boolean): vec2 | undefined {
        const x = pos[0];
        const y = pos[1];

        if (includeDoors) {
            // If there's a locked door adjacent to us, look the opposite way
            const lockedDoorsAdj = this.items.filter((item)=>
                (Math.abs(item.pos[0] - x) < 2 &&
                Math.abs(item.pos[1] - y) < 2) &&
                (item.type === ItemType.LockedDoorEW || item.type === ItemType.LockedDoorNS));
            if (lockedDoorsAdj.find((item)=>item.pos[0] === x - 1 && item.pos[1] === y)) {
                return vec2.fromValues(x + 1, y);
            } else if (lockedDoorsAdj.find((item)=>item.pos[0] === x + 1 && item.pos[1] === y)) {
                return vec2.fromValues(x - 1, y);
            } else if (lockedDoorsAdj.find((item)=>item.pos[0] === x && item.pos[1] === y - 1)) {
                return vec2.fromValues(x, y + 1);
            } else if (lockedDoorsAdj.find((item)=>item.pos[0] === x && item.pos[1] === y + 1)) {
                return vec2.fromValues(x, y - 1);
            }

            // If there's a doorway adjacent to us, look the opposite way
            if (x > 0 && this.cells.at(x - 1, y).type === TerrainType.DoorNS) {
                return vec2.fromValues(x + 1, y);
            } else if (x < this.cells.sizeX - 1 && this.cells.at(x + 1, y).type === TerrainType.DoorNS) {
                return vec2.fromValues(x - 1, y);
            } else if (y > 0 && this.cells.at(x, y - 1).type === TerrainType.DoorEW) {
                return vec2.fromValues(x, y + 1);
            } else if (y < this.cells.sizeY - 1 && this.cells.at(x, y + 1).type == TerrainType.DoorEW) {
                return vec2.fromValues(x, y - 1);
            }
        }

        // If there's a window adjacent to us, look out it
        if (x > 0 && this.cells.at(x - 1, y).type == TerrainType.OneWayWindowW) {
            return vec2.fromValues(x - 1, y);
        } else if (x < this.cells.sizeX - 1 && this.cells.at(x + 1, y).type == TerrainType.OneWayWindowE) {
            return vec2.fromValues(x + 1, y);
        } else if (y > 0 && this.cells.at(x, y - 1).type == TerrainType.OneWayWindowS) {
            return vec2.fromValues(x, y - 1);
        } else if (y < this.cells.sizeY - 1 && this.cells.at(x, y + 1).type == TerrainType.OneWayWindowN) {
            return vec2.fromValues(x, y + 1);
        }

        // If guard is on a chair, try to come up with a direction to look
        if (this.items.find((item)=>item.pos.equals(pos) && item.type === ItemType.Chair)) {
            // If there's a table or lamp adjacent, look at it
            const tables = this.items.filter((item)=>
                (Math.abs(item.pos[0] - x) < 2 &&
                 Math.abs(item.pos[1] - y) < 2) &&
                 (item.type === ItemType.Table || item.type === ItemType.TorchLit || item.type === ItemType.TorchUnlit));
            if (tables.find((item)=>item.pos[0] === x - 1 && item.pos[1] === y)) {
                return vec2.fromValues(x - 1, y);
            }
            if (tables.find((item)=>item.pos[0] === x + 1 && item.pos[1] === y)) {
                return vec2.fromValues(x + 1, y);
            }
            if (tables.find((item)=>item.pos[0] === x && item.pos[1] === y - 1)) {
                return vec2.fromValues(x, y - 1);
            }
            if (tables.find((item)=>item.pos[0] === x && item.pos[1] === y + 1)) {
                return vec2.fromValues(x, y + 1);
            }
        }

        return undefined;
    }
}

function isWindowTerrainType(terrainType: TerrainType): boolean {
    return terrainType >= TerrainType.OneWayWindowE && terrainType <= TerrainType.OneWayWindowS;
}

function isDoorItemType(itemType: ItemType): boolean {
    return itemType >= ItemType.DoorNS && itemType <= ItemType.PortcullisEW;
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
