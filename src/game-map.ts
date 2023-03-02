export { BooleanGrid, Cell, CellGrid, Int32Grid, ItemType, GameMap, Player, TerrainType, guardMoveCostForItemType, invalidRegion };

import { Guard, GuardMode } from './guard';
import { vec2 } from './my-matrix';

const invalidRegion: number = -1;

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
}

type Cell = {
    type: TerrainType;
    moveCost: number;
    region: number;
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
                region: invalidRegion,
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
    }
}

const maxPlayerHealth: number = 5;

class Player {
    pos: vec2;
    dir: vec2;
    health: number;
    gold: number;
    noisy: boolean; // did the player make noise last turn?
    damagedLastTurn: boolean;
    turnsRemainingUnderwater: number;

    constructor(pos: vec2) {
        this.pos = vec2.clone(pos);
        this.dir = vec2.fromValues(0, -1);
        this.health = maxPlayerHealth;
        this.gold = 0;
        this.noisy = false;
        this.damagedLastTurn = false;
        this.turnsRemainingUnderwater = 0;
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
}

type Rect = {
    posMin: vec2;
    posMax: vec2;
}

type GameMap = {
    cells: CellGrid;
    patrolRegions: Array<Rect>,
    patrolRoutes: Array<[number, number]>,
    items: Array<Item>;
    guards: Array<Guard>;
    playerStartPos: vec2;
    totalLoot: number;
}
