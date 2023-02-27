export { BooleanGrid, GameMap, TerrainType, TerrainTypeGrid, createGameMap };

import { vec2 } from './my-matrix';

const numCellsX = 4;
const numCellsY = 4;
const corridorWidth = 3;

const roomSizeX = 5;
const roomSizeY = 5;
const outerBorder = 3;

enum TerrainType {
    GroundNormal,
    GroundGrass,
    GroundWater,
    GroundMarble,
    GroundWood,

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

enum RoomType
{
    Exterior,
    PublicCourtyard,
    PublicRoom,
    PrivateCourtyard,
    PrivateRoom,
}

type Room = {
    roomType: RoomType,
    group: number,
    depth: number,
    posMin: vec2,
    posMax: vec2,
    edges: Array<number>,
}

type Adjacency = {
    origin: vec2,
    dir: vec2,
    length: number,
    room_left: number,
    room_right: number,
    next_matching: number,
    door: boolean,
}

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

class TerrainTypeGrid {
    sizeX: number;
    sizeY: number;
    values: Uint8Array;

    constructor(sizeX: number, sizeY: number, initialValue: TerrainType) {
        this.sizeX = sizeX;
        this.sizeY = sizeY;
        this.values = new Uint8Array(sizeX * sizeY);
        this.values.fill(initialValue);
    }

    fill(value: TerrainType) {
        this.values.fill(value);
    }

    get(x: number, y: number): TerrainType {
        return this.values[this.sizeX * y + x];
    }

    set(x: number, y: number, value: TerrainType) {
        this.values[this.sizeX * y + x] = value;
    }
}

type Cell = {
    type: TerrainType;
    lit: boolean;
    inner: boolean;
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
                lit: false,
                inner: false,
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

type GameMap = {
    terrainTypeGrid: TerrainTypeGrid;
    playerStartPos: vec2;
}

type Rect = {
    minX: number;
    minY: number;
    sizeX: number;
    sizeY: number;
}

type Edge = [number, number];

function createGameMap(level: number): GameMap {
    const sizeX = randomHouseWidth(level);
    const sizeY = randomHouseDepth(level);

    const inside = makeSiheyuanRoomGrid(sizeX, sizeY);

    const mirrorX: boolean = true;
    const mirrorY: boolean = false;

    const [offsetX, offsetY] = offsetWalls(mirrorX, mirrorY, inside);

    const cells = plotWalls(inside, offsetX, offsetY);

    const [rooms, adjacencies, posStart] = createExits(level, mirrorX, mirrorY, inside, offsetX, offsetY, cells);

    fixupWalls(cells);

    return gameMapFromCellMap(cells, posStart);
}

function randomHouseWidth(level: number): number {
    let sizeX = 0;
    const c = Math.min(3, level);
    for (let i = 0; i < c; ++i) {
        sizeX += randomInRange(2);
    }
    return sizeX * 2 + 3;
}

function randomHouseDepth(level: number): number {
    if (level === 0) {
        return 2;
    } else {
        let sizeY = 3;
        const c = Math.min(4, level - 1);
        for (let i = 0; i < c; ++i) {
            sizeY += randomInRange(2);
        }
        return sizeY;
    }
}

function makeSiheyuanRoomGrid(sizeX: number, sizeY: number): BooleanGrid {
    const inside = new BooleanGrid(sizeX, sizeY, true);

    const halfX = Math.floor((sizeX + 1) / 2);

    const numCourtyardRoomsHalf = Math.floor((sizeY * halfX) / 4);
    for (let i = numCourtyardRoomsHalf; i > 0; --i) {
        const x = randomInRange(halfX);
        const y = randomInRange(sizeY);
        inside.set(x, y, false);
    }

    for (let y = 0; y < sizeY; ++y) {
        for (let x = halfX; x < sizeX; ++x) {
            inside.set(x, y, inside.get((sizeX - 1) - x, y));
        }
    }

    return inside;
}

function offsetWalls(
    mirrorX: boolean,
    mirrorY: boolean,
    inside: BooleanGrid): [offsetX: Int32Grid, offsetY: Int32Grid]
{
    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    const offsetX = new Int32Grid(roomsX + 1, roomsY, 0);
    const offsetY = new Int32Grid(roomsX, roomsY + 1, 0);

    let i = randomInRange(3) - 1;
    for (let y = 0; y < roomsY; ++y)
        offsetX.set(0, y, i);

    i = randomInRange(3) - 1;
    for (let y = 0; y < roomsY; ++y)
        offsetX.set(roomsX, y, i);

    i = randomInRange(3) - 1;
    for (let x = 0; x < roomsX; ++x)
        offsetY.set(x, 0, i);

    i = randomInRange(3) - 1;
    for (let x = 0; x < roomsX; ++x)
        offsetY.set(x, roomsY, i);

    for (let x = 1; x < roomsX; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            offsetX.set(x, y, randomInRange(3) - 1);
        }
    }

    for (let x = 0; x < roomsX; ++x) {
        for (let y = 1; y < roomsY; ++y) {
            offsetY.set(x, y, randomInRange(3) - 1);
        }
    }

    for (let x = 1; x < roomsX; ++x) {
        for (let y = 1; y < roomsY; ++y) {
            if (randomInRange(2) === 0) {
                offsetX.set(x, y, offsetX.get(x, y-1));
            } else {
                offsetY.set(x, y, offsetY.get(x-1, y));
            }
        }
    }

    if (mirrorX) {
        if ((roomsX & 1) === 0) {
            const xMid = Math.floor(roomsX / 2);
            for (let y = 0; y < roomsY; ++y) {
                offsetX.set(xMid, y, 0);
            }
        }

        for (let x = 0; x < Math.floor((roomsX + 1) / 2); ++x) {
            for (let y = 0; y < roomsY; ++y) {
                offsetX.set(roomsX - x, y, 1 - offsetX.get(x, y));
            }
        }

        for (let x = 0; x < Math.floor(roomsX / 2); ++x) {
            for (let y = 0; y < roomsY + 1; ++y) {
                offsetY.set((roomsX - 1) - x, y, offsetY.get(x, y));
            }
        }
    }

    if (mirrorY) {
        if ((roomsY & 1) === 0) {
            const yMid = roomsY / 2;
            for (let x = 0; x < roomsX; ++x) {
                offsetY.set(x, yMid, 0);
            }
        }

        for (let y = 0; y < Math.floor((roomsY + 1) / 2); ++y) {
            for (let x = 0; x < roomsX; ++x) {
                offsetY.set(x, roomsY - y, 1 - offsetY.get(x, y));
            }
        }

        for (let y = 0; y < Math.floor(roomsY / 2); ++y) {
            for (let x = 0; x < roomsX + 1; ++x) {
                offsetX.set(x, (roomsY - 1) - y, offsetX.get(x, y));
            }
        }
    }

    let roomOffsetX = Number.MIN_SAFE_INTEGER;
    let roomOffsetY = Number.MIN_SAFE_INTEGER;

    for (let y = 0; y < roomsY; ++y) {
        roomOffsetX = Math.max(roomOffsetX, -offsetX.get(0, y));
    }

    for (let x = 0; x < roomsX; ++x) {
        roomOffsetY = Math.max(roomOffsetY, -offsetY.get(x, 0));
    }

    roomOffsetX += outerBorder;
    roomOffsetY += outerBorder;

    for (let x = 0; x < roomsX + 1; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            const z = offsetX.get(x, y) + roomOffsetX + x * roomSizeX;
            offsetX.set(x, y, z);
        }
    }

    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY + 1; ++y) {
            offsetY.set(x, y, offsetY.get(x, y) + roomOffsetY + y * roomSizeY);
        }
    }

    return [offsetX, offsetY];
}

function plotWalls(inside: BooleanGrid, offsetX: Int32Grid, offsetY: Int32Grid): CellGrid {
    const cx = inside.sizeX;
    const cy = inside.sizeY;

    let mapSizeX = 0;
    let mapSizeY = 0;

    for (let y = 0; y < cy; ++y) {
        mapSizeX = Math.max(mapSizeX, offsetX.get(cx, y));
    }

    for (let x = 0; x < cx; ++x) {
        mapSizeY = Math.max(mapSizeY, offsetY.get(x, cy));
    }

    mapSizeX += outerBorder + 1;
    mapSizeY += outerBorder + 1;

    const map = new CellGrid(mapSizeX, mapSizeY);

    // Super hacky: put down grass under all the rooms to plug holes, and light the interior.

    for (let rx = 0; rx < cx; ++rx) {
        for (let ry = 0; ry < cy; ++ry) {
            const x0 = offsetX.get(rx, ry);
            const x1 = offsetX.get(rx + 1, ry) + 1;
            const y0 = offsetY.get(rx, ry);
            const y1 = offsetY.get(rx, ry + 1) + 1;

            for (let x = x0; x < x1; ++x) {
                for (let y = y0; y < y1; ++y) {
                    const cell = map.at(x, y);
                    cell.type = TerrainType.GroundGrass;
                    cell.lit = true;
                }
            }
        }
    }

    // Draw walls. Really this should be done in createExits, where the
    //  walls are getting decorated with doors and windows.

    for (let rx = 0; rx < cx; ++rx) {
        for (let ry = 0; ry < cy; ++ry) {
            const isInside = inside.get(rx, ry);

            const x0 = offsetX.get(rx, ry);
            const x1 = offsetX.get(rx + 1, ry);
            const y0 = offsetY.get(rx, ry);
            const y1 = offsetY.get(rx, ry + 1);

            if (rx == 0 || isInside) {
                plotNSWall(map, x0, y0, y1);
            }
            if (rx == cx - 1 || isInside) {
                plotNSWall(map, x1, y0, y1);
            }
            if (ry == 0 || isInside) {
                plotEWWall(map, x0, y0, x1);
            }
            if (ry == cy - 1 || isInside) {
                plotEWWall(map, x0, y1, x1);
            }
        }
    }

    return map;
}

function plotNSWall(map: CellGrid, x0: number, y0: number, y1: number) {
    for (let y = y0; y <= y1; ++y) {
        map.at(x0, y).type = TerrainType.Wall0000;
    }
}

function plotEWWall(map: CellGrid, x0: number, y0: number, x1: number) {
    for (let x = x0; x <= x1; ++x) {
        map.at(x, y0).type = TerrainType.Wall0000;
    }
}

function createExits(
    level: number,
    mirrorX: boolean,
    mirrorY: boolean,
    inside: BooleanGrid,
    offsetX: Int32Grid,
    offsetY: Int32Grid,
    map: CellGrid
): [Array<Room>, Array<Adjacency>, vec2] {
    // Make a set of rooms.

    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    const roomIndex = new Int32Grid(roomsX, roomsY, 0);
    const rooms: Array<Room> = [];

    // This room represents the area surrounding the map.

    rooms.push({
        roomType: RoomType.Exterior,
        group: 0,
        depth: 0,
        posMin: vec2.fromValues(0, 0), // not meaningful for this room
        posMax: vec2.fromValues(0, 0), // not meaningful for this room
        edges: [],
    });

    for (let rx = 0; rx < roomsX; ++rx) {
        for (let ry = 0; ry < roomsY; ++ry) {
            let group_index = rooms.length;

            roomIndex.set(rx, ry, group_index);

            rooms.push({
                roomType: inside.get(rx, ry) ?  RoomType.PublicRoom : RoomType.PublicCourtyard,
                group: group_index,
                depth: 0,
                posMin: vec2.fromValues(offsetX.get(rx, ry) + 1, offsetY.get(rx, ry) + 1),
                posMax: vec2.fromValues(offsetX.get(rx + 1, ry), offsetY.get(rx, ry + 1)),
                edges: [],
            });
        }
    }

    // Compute a list of room adjacencies.

    const adjacencies = computeAdjacencies(mirrorX, mirrorY, offsetX, offsetY, roomIndex);
    storeAdjacenciesInRooms(adjacencies, rooms);

    // Connect rooms together.

    let posStart = connectRooms(rooms, adjacencies);

    // Assign types to the rooms.

    assignRoomTypes(roomIndex, adjacencies, rooms);

    // Generate pathing information.

//    generate_patrol_routes(map, rooms, adjacencies);

    // Render doors and windows.

    renderWalls(rooms, adjacencies, map);

    // Render floors.

    renderRooms(level, rooms, map);

    return [rooms, adjacencies, posStart];
}

function computeAdjacencies(
    mirrorX: boolean,
    mirrorY: boolean,
    offsetX: Int32Grid,
    offsetY: Int32Grid,
    roomIndex: Int32Grid
): Array<Adjacency> {

    let roomsX = roomIndex.sizeX;
    let roomsY = roomIndex.sizeY;

    const adjacencies: Array<Adjacency> = [];

    {
        const adjacencyRows: Array<Array<number>> = [];

        {
            const adjacencyRow = [];

            let ry = 0;

            for (let rx = 0; rx < roomsX; ++rx) {
                let x0 = offsetX.get(rx, ry);
                let x1 = offsetX.get(rx+1, ry);
                let y = offsetY.get(rx, ry);

                let i = adjacencies.length;
                adjacencyRow.push(i);

                adjacencies.push({
                    origin: vec2.fromValues(x0 + 1, y),
                    dir: vec2.fromValues(1, 0),
                    length: x1 - (x0 + 1),
                    room_left: roomIndex.get(rx, ry),
                    room_right: 0,
                    next_matching: i,
                    door: false,
                });
            }

            adjacencyRows.push(adjacencyRow);
        }

        for (let ry = 1; ry < roomsY; ++ry) {
            const adjacencyRow = [];

            for (let rx = 0; rx < roomsX; ++rx) {
                let x0_upper = offsetX.get(rx, ry);
                let x0_lower = offsetX.get(rx, ry-1);
                let x1_upper = offsetX.get(rx+1, ry);
                let x1_lower = offsetX.get(rx+1, ry-1);
                let x0 = Math.max(x0_lower, x0_upper);
                let x1 = Math.min(x1_lower, x1_upper);
                let y = offsetY.get(rx, ry);

                if (rx > 0 && x0_lower - x0_upper > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x0_upper + 1, y),
                        dir: vec2.fromValues(1, 0),
                        length: x0_lower - (x0_upper + 1),
                        room_left: roomIndex.get(rx, ry),
                        room_right: roomIndex.get(rx - 1, ry - 1),
                        next_matching: i,
                        door: false,
                    });
                }

                if (x1 - x0 > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x0 + 1, y),
                        dir: vec2.fromValues(1, 0),
                        length: x1 - (x0 + 1),
                        room_left: roomIndex.get(rx, ry),
                        room_right: roomIndex.get(rx, ry - 1),
                        next_matching: i,
                        door: false,
                    });
                }

                if (rx + 1 < roomsX && x1_upper - x1_lower > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x1_lower + 1, y),
                        dir: vec2.fromValues(1, 0),
                        length: x1_upper - (x1_lower + 1),
                        room_left: roomIndex.get(rx, ry),
                        room_right: roomIndex.get(rx + 1, ry - 1),
                        next_matching: i,
                        door: false,
                    });
                }
            }

            adjacencyRows.push(adjacencyRow);
        }

        {
            const adjacencyRow = [];

            let ry = roomsY;

            for (let rx = 0; rx < roomsX; ++rx) {
                let x0 = offsetX.get(rx, ry-1);
                let x1 = offsetX.get(rx+1, ry-1);
                let y = offsetY.get(rx, ry);

                let i = adjacencies.length;
                adjacencyRow.push(i);

                adjacencies.push({
                    origin: vec2.fromValues(x0 + 1, y),
                    dir: vec2.fromValues(1, 0),
                    length: x1 - (x0 + 1),
                    room_left: 0,
                    room_right: roomIndex.get(rx, ry - 1),
                    next_matching: i,
                    door: false,
                });
            }

            adjacencyRows.push(adjacencyRow);
        }

        if (mirrorX) {
            for (let ry = 0; ry < adjacencyRows.length; ++ry) {
                let row = adjacencyRows[ry];

                let i = 0;
                let j = row.length - 1;
                while (i < j) {
                    let adj0 = row[i];
                    let adj1 = row[j];

                    adjacencies[adj0].next_matching = adj1;
                    adjacencies[adj1].next_matching = adj0;

                    // Flip edge a1 to point the opposite direction
                    {
                        let a1 = adjacencies[adj1];
                        vec2.scaleAndAdd(a1.origin, a1.origin, a1.dir, a1.length - 1);
                        vec2.negate(a1.dir, a1.dir);
                        [a1.room_left, a1.room_right] = [a1.room_right, a1.room_left];
                    }

                    i += 1;
                    j -= 1;
                }
            }
        }

        if (mirrorY) {
            let ry0 = 0;
            let ry1 = adjacencyRows.length - 1;
            while (ry0 < ry1) {
                let row0 = adjacencyRows[ry0];
                let row1 = adjacencyRows[ry1];

                console.assert(row0.length == row1.length);

                for (let i = 0; i < row0.length; ++i) {
                    let adj0 = row0[i];
                    let adj1 = row1[i];
                    adjacencies[adj0].next_matching = adj1;
                    adjacencies[adj1].next_matching = adj0;
                }

                ry0 += 1;
                ry1 -= 1;
            }
        }
    }

    {
        let adjacencyRows = [];

        {
            const adjacencyRow = [];

            let rx = 0;

            for (let ry = 0; ry < roomsY; ++ry) {
                let y0 = offsetY.get(rx, ry);
                let y1 = offsetY.get(rx, ry+1);
                let x = offsetX.get(rx, ry);

                let i = adjacencies.length;
                adjacencyRow.push(i);

                adjacencies.push({
                    origin: vec2.fromValues(x, y0 + 1),
                    dir: vec2.fromValues(0, 1),
                    length: y1 - (y0 + 1),
                    room_left: 0,
                    room_right: roomIndex.get(rx, ry),
                    next_matching: i,
                    door: false,
                });
            }

            adjacencyRows.push(adjacencyRow);
        }

        for (let rx = 1; rx < roomsX; ++rx) {
            const adjacencyRow = [];

            for (let ry = 0; ry < roomsY; ++ry) {
                let y0_left  = offsetY.get(rx-1, ry);
                let y0_right = offsetY.get(rx, ry);
                let y1_left  = offsetY.get(rx-1, ry+1);
                let y1_right = offsetY.get(rx, ry+1);
                let y0 = Math.max(y0_left, y0_right);
                let y1 = Math.min(y1_left, y1_right);
                let x = offsetX.get(rx, ry);

                if (ry > 0 && y0_left - y0_right > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x, y0_right + 1),
                        dir: vec2.fromValues(0, 1),
                        length: y0_left - (y0_right + 1),
                        room_left: roomIndex.get(rx - 1, ry - 1),
                        room_right: roomIndex.get(rx, ry),
                        next_matching: i,
                        door: false,
                    });
                }

                if (y1 - y0 > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x, y0 + 1),
                        dir: vec2.fromValues(0, 1),
                        length: y1 - (y0 + 1),
                        room_left: roomIndex.get(rx - 1, ry),
                        room_right: roomIndex.get(rx, ry),
                        next_matching: i,
                        door: false,
                    });
                }

                if (ry + 1 < roomsY && y1_right - y1_left > 1) {
                    let i = adjacencies.length;
                    adjacencyRow.push(i);

                    adjacencies.push({
                        origin: vec2.fromValues(x, y1_left + 1),
                        dir: vec2.fromValues(0, 1),
                        length: y1_right - (y1_left + 1),
                        room_left: roomIndex.get(rx - 1, ry + 1),
                        room_right: roomIndex.get(rx, ry),
                        next_matching: i,
                        door: false,
                    });
                }
            }

            adjacencyRows.push(adjacencyRow);
        }

        {
            const adjacencyRow = [];

            let rx = roomsX;

            for (let ry = 0; ry < roomsY; ++ry) {
                let y0 = offsetY.get(rx-1, ry);
                let y1 = offsetY.get(rx-1, ry+1);
                let x = offsetX.get(rx, ry);

                let i = adjacencies.length;
                adjacencies.push({
                    origin: vec2.fromValues(x, y0 + 1),
                    dir: vec2.fromValues(0, 1),
                    length: y1 - (y0 + 1),
                    room_left: roomIndex.get(rx - 1, ry),
                    room_right: 0,
                    next_matching: i,
                    door: false,
                });
                adjacencyRow.push(i);
            }

            adjacencyRows.push(adjacencyRow);
        }

        if (mirrorY) {
            for (let ry = 0; ry < adjacencyRows.length; ++ry) {
                let row = adjacencyRows[ry];
                let n = Math.floor(row.length / 2);

                for (let i = 0; i < n; ++i) {
                    let adj0 = row[i];
                    let adj1 = row[(row.length - 1) - i];

                    adjacencies[adj0].next_matching = adj1;
                    adjacencies[adj1].next_matching = adj0;

                    {
                        // Flip edge a1 to point the opposite direction
                        let a1 = adjacencies[adj1];
                        vec2.scaleAndAdd(a1.origin, a1.origin, a1.dir, a1.length - 1);
                        vec2.negate(a1.dir, a1.dir);
                        [a1.room_left, a1.room_right] = [a1.room_right, a1.room_left];
                    }
                }
            }
        }

        if (mirrorX) {
            let ry0 = 0;
            let ry1 = adjacencyRows.length - 1;
            while (ry0 < ry1) {
                let row0 = adjacencyRows[ry0];
                let row1 = adjacencyRows[ry1];

                for (let i = 0; i < row0.length; ++i) {
                    let adj0 = row0[i];
                    let adj1 = row1[i];
                    adjacencies[adj0].next_matching = adj1;
                    adjacencies[adj1].next_matching = adj0;
                }

                ry0 += 1;
                ry1 -= 1;
            }
        }
    }

    return adjacencies;
}

function storeAdjacenciesInRooms(adjacencies: Array<Adjacency>, rooms: Array<Room>) {
    for (let i = 0; i < adjacencies.length; ++i) {
        const adj = adjacencies[i];
        let i0 = adj.room_left;
        let i1 = adj.room_right;
        rooms[i0].edges.push(i);
        rooms[i1].edges.push(i);
    }
}

function connectRooms(rooms: Array<Room>, adjacencies: Array<Adjacency>): vec2 {

    // Collect sets of edges that are mirrors of each other

    let edgeSets = getEdgeSets(adjacencies);

    // Connect all adjacent courtyard rooms together.

    for (const adj of adjacencies) {
        let i0 = adj.room_left;
        let i1 = adj.room_right;
        if (rooms[i0].roomType != RoomType.PublicCourtyard || rooms[i1].roomType != RoomType.PublicCourtyard) {
            continue;
        }

        adj.door = true;
        let group0 = rooms[i0].group;
        let group1 = rooms[i1].group;
        joinGroups(rooms, group0, group1);
    }

    // Connect all the interior rooms with doors.

    for (const edgeSet of edgeSets) {

        let addedDoor = false;

        {
            let adj = adjacencies[edgeSet[0]];

            let i0 = adj.room_left;
            let i1 = adj.room_right;

            if (rooms[i0].roomType != RoomType.PublicRoom || rooms[i1].roomType != RoomType.PublicRoom) {
                continue;
            }

            let group0 = rooms[i0].group;
            let group1 = rooms[i1].group;

            if (group0 != group1 || Math.random() < 0.4) {
                adj.door = true;
                addedDoor = true;
                joinGroups(rooms, group0, group1);
            }
        }

        if (addedDoor) {
            for (let i = 1; i < edgeSet.length; ++i) {
                let adj = adjacencies[edgeSet[i]];

                let i0 = adj.room_left;
                let i1 = adj.room_right;

                let group0 = rooms[i0].group;
                let group1 = rooms[i1].group;

                adj.door = true;
                joinGroups(rooms, group0, group1);
            }
        }
    }

    // Create doors between the interiors and the courtyard areas.

    for (const edgeSet of edgeSets) {

        let addedDoor = false;

        {
            let adj = adjacencies[edgeSet[0]];

            let i0 = adj.room_left;
            let i1 = adj.room_right;

            let room_type0 = rooms[i0].roomType;
            let room_type1 = rooms[i1].roomType;

            if (room_type0 == room_type1) {
                continue;
            }

            if (room_type0 == RoomType.Exterior || room_type1 == RoomType.Exterior) {
                continue;
            }

            let group0 = rooms[i0].group;
            let group1 = rooms[i1].group;

            if (group0 != group1 || Math.random() < 0.4) {
                adj.door = true;
                addedDoor = true;
                joinGroups(rooms, group0, group1);
            }
        }

        if (addedDoor) {
            for (let i = 1; i < edgeSet.length; ++i) {
                let adj = adjacencies[edgeSet[i]];

                let i0 = adj.room_left;
                let i1 = adj.room_right;

                let group0 = rooms[i0].group;
                let group1 = rooms[i1].group;

                adj.door = true;
                joinGroups(rooms, group0, group1);
            }
        }
    }

    // Create the door to the surrounding exterior. It must be on the south side.

    let posStart = vec2.fromValues(0, 0);

    {
        let i = frontDoorAdjacencyIndex(rooms, adjacencies, edgeSets);

        // Set the player's start position based on where the door is.

        posStart[0] = adjacencies[i].origin[0] + adjacencies[i].dir[0] * Math.floor(adjacencies[i].length / 2);
        posStart[1] = outerBorder - 1;

        adjacencies[i].door = true;

        // Break symmetry if the door is off center.

        let j = adjacencies[i].next_matching;
        if (j != i) {
            adjacencies[j].next_matching = j;
            adjacencies[i].next_matching = i;
        }
    }

    return posStart;
}

function getEdgeSets(adjacencies: Array<Adjacency>): Array<Array<number>> {
    const edgeSets = [];

    for (let i = 0; i < adjacencies.length; ++i) {
        const adj = adjacencies[i];
        let j = adj.next_matching;
        if (j >= i) {
            if (j > i) {
                edgeSets.push([i, j]);
            } else {
                edgeSets.push([i]);
            }
        }
    }

    shuffleArray(edgeSets);

    return edgeSets;
}

function joinGroups(rooms: Array<Room>, groupFrom: number, groupTo: number) {
    if (groupFrom != groupTo) {
        for (const room of rooms) {
            if (room.group == groupFrom) {
                room.group = groupTo;
            }
        }
    }
}

function frontDoorAdjacencyIndex(rooms: Array<Room>, adjacencies: Array<Adjacency>, edgeSets: Array<Array<number>>): number {
    for (const edgeSet of edgeSets) {
        for (const i of edgeSet) {
            let adj = adjacencies[i];

            if (adj.dir[0] == 0) {
                continue;
            }

            if (adj.next_matching > i) {
                continue;
            }

            if (adj.next_matching == i) {
                if (rooms[adj.room_right].roomType != RoomType.Exterior) {
                    continue;
                }
            } else {
                if (rooms[adj.room_left].roomType != RoomType.Exterior) {
                    continue;
                }
            }

            return i;
        }
    }

    // Should always return above...

    return 0;
}

function assignRoomTypes(roomIndex: Int32Grid, adjacencies: Array<Adjacency>, rooms: Array<Room>) {

    // Assign rooms depth based on distance from the bottom row of rooms.

    let unvisited = rooms.length;

    rooms[0].depth = 0;

    for (let i = 1; i < rooms.length; ++i) {
        rooms[i].depth = unvisited;
    }

    const roomsToVisit: Array<number> = [];

    for (let x = 0; x < roomIndex.sizeX; ++x) {
        let iRoom = roomIndex.get(x, 0);
        rooms[iRoom].depth = 1;
        roomsToVisit.push(iRoom);
    }

    // Visit rooms in breadth-first order, assigning them distances from the seed rooms.

    let iiRoom = 0;
    while (iiRoom < roomsToVisit.length) {
        let iRoom = roomsToVisit[iiRoom];

        for (const iAdj of rooms[iRoom].edges) {
            let adj = adjacencies[iAdj];

            if (!adj.door) {
                continue;
            }

            const iRoomNeighbor = (adj.room_left == iRoom) ? adj.room_right : adj.room_left;

            if (rooms[iRoomNeighbor].depth == unvisited) {
                rooms[iRoomNeighbor].depth = rooms[iRoom].depth + 1;
                roomsToVisit.push(iRoomNeighbor);
            }
        }

        iiRoom += 1;
    }

    // Assign master-suite room type to the inner rooms.

    let maxDepth = 0;
    for (const room of rooms) {
        maxDepth = Math.max(maxDepth, room.depth);
    }

    const targetNumMasterRooms = Math.floor((roomIndex.sizeX * roomIndex.sizeY) / 4);

    let numMasterRooms = 0;

    let depth = maxDepth;
    while (depth > 0) {
        for (const room of rooms) {
            if (room.roomType != RoomType.PublicRoom && room.roomType != RoomType.PublicCourtyard) {
                continue;
            }

            if (room.depth != depth) {
                continue;
            }

            room.roomType = (room.roomType == RoomType.PublicRoom) ? RoomType.PrivateRoom : RoomType.PrivateCourtyard;
            if (room.roomType == RoomType.PrivateRoom) {
                numMasterRooms += 1;
            }
        }

        if (numMasterRooms >= targetNumMasterRooms) {
            break;
        }

        depth -= 1;
    }

    // Change any public courtyards that are adjacent to private courtyards into private courtyards

    while (true) {
        let changed = false;

        for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
            if (rooms[iRoom].roomType != RoomType.PublicCourtyard) {
                continue;
            }

            for (const iAdj of rooms[iRoom].edges) {
                const adj = adjacencies[iAdj];

                let iRoomOther = (adj.room_left != iRoom) ? adj.room_left : adj.room_right;

                if (rooms[iRoomOther].roomType == RoomType.PrivateCourtyard) {
                    rooms[iRoom].roomType = RoomType.PrivateCourtyard;
                    changed = true;
                    break;
                }
            }
        }

        if (!changed) {
            break;
        }
    }
}

const ONE_WAY_WINDOW: Array<TerrainType> = [
    TerrainType.OneWayWindowS,
    TerrainType.OneWayWindowE,
    TerrainType.OneWayWindowE, // not used
    TerrainType.OneWayWindowW,
    TerrainType.OneWayWindowN,
];

function renderWalls(rooms: Array<Room>, adjacencies: Array<Adjacency>, map: CellGrid) {

    // Render grass connecting courtyard rooms.

    for (const adj of adjacencies) {
        const type0 = rooms[adj.room_left].roomType;
        const type1 = rooms[adj.room_right].roomType;

        if (!isCourtyardRoomType(type0) || !isCourtyardRoomType(type1)) {
            continue;
        }

        for (let j = 0; j < adj.length; ++j) {
            const p = vec2.create();
            vec2.scaleAndAdd(p, adj.origin, adj.dir, j);
            map.at(p[0], p[1]).type = TerrainType.GroundGrass;
        }
    }

    // Render doors and windows for the rest of the walls.

    for (let i = 0; i < adjacencies.length; ++i) {
        const adj0 = adjacencies[i];

        const type0 = rooms[adj0.room_left].roomType;
        const type1 = rooms[adj0.room_right].roomType;

        if (isCourtyardRoomType(type0) && isCourtyardRoomType(type1)) {
            continue;
        }

        const j = adj0.next_matching;

        if (j < i) {
            continue;
        }

        let offset;
        if (j == i) {
            offset = Math.floor(adj0.length / 2);
        } else if (adj0.length > 2) {
            offset = 1 + randomInRange(adj0.length - 2);
        } else {
            offset = randomInRange(adj0.length);
        }

        let walls = [];
        walls.push(adj0);

        if (j != i) {
            walls.push(adjacencies[j]);
        }

        if (!adj0.door && type0 != type1) {
            if (type0 == RoomType.Exterior || type1 == RoomType.Exterior) {
                if ((adj0.length & 1) != 0) {
                    let k = Math.floor(adj0.length / 2);

                    for (const a of walls) {
                        const p = vec2.create();
                        vec2.scaleAndAdd(p, a.origin, a.dir, k);

                        let dir = vec2.clone(a.dir);
                        if (rooms[a.room_right].roomType == RoomType.Exterior) {
                            vec2.negate(dir, dir);
                        }

                        map.at(p[0], p[1]).type = ONE_WAY_WINDOW[2 * dir[0] + dir[1] + 2];
                    }
                }
            } else if (isCourtyardRoomType(type0) || isCourtyardRoomType(type1)) {
                let k = randomInRange(2);
                const k_end = Math.floor((adj0.length + 1) / 2);

                while (k < k_end) {
                    for (const a of walls) {
                        let dir = vec2.clone(a.dir);
                        if (isCourtyardRoomType(rooms[a.room_right].roomType)) {
                            vec2.negate(dir, dir);
                        }

                        let windowType = ONE_WAY_WINDOW[2 * dir[0] + dir[1] + 2];

                        const p = vec2.create();
                        vec2.scaleAndAdd(p, a.origin, a.dir, k);
                        const q = vec2.create();
                        vec2.scaleAndAdd(q, a.origin, a.dir, a.length - (k + 1));

                        map.at(p[0], p[1]).type = windowType;
                        map.at(q[0], q[1]).type = windowType;
                    }
                    k += 2;
                }
            }
        }

        let installMasterSuiteDoor = Math.random() < 0.3333;

        for (const a of walls) {
            if (!a.door) {
                continue;
            }

            const p = vec2.create();
            vec2.scaleAndAdd(p, a.origin, a.dir, offset);

            let orientNS = (a.dir[0] == 0);

            map.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;

            let roomTypeLeft = rooms[a.room_left].roomType;
            let roomTypeRight = rooms[a.room_right].roomType;

            if (roomTypeLeft == RoomType.Exterior || roomTypeRight == RoomType.Exterior) {
                map.at(p[0], p[1]).type = orientNS ? TerrainType.PortcullisNS : TerrainType.PortcullisEW;
//                place_item(map, p.0, p.1, if orientNS {ItemKind::PortcullisNS} else {ItemKind::PortcullisEW});
            } else if (roomTypeLeft != RoomType.PrivateRoom || roomTypeRight != RoomType.PrivateRoom || installMasterSuiteDoor) {
                map.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
//                place_item(map, p.0, p.1, if orientNS {ItemKind::DoorNS} else {ItemKind::DoorEW});
            }
        }
    }
}

function renderRooms(level: number, rooms: Array<Room>, map: CellGrid) {
    for (let iRoom = 1; iRoom < rooms.length; ++iRoom) {
        const room = rooms[iRoom];

        let cellType;
        switch (room.roomType) {
        case RoomType.Exterior: cellType = TerrainType.GroundNormal; break;
        case RoomType.PublicCourtyard: cellType = TerrainType.GroundGrass; break;
        case RoomType.PublicRoom: cellType = TerrainType.GroundWood; break;
        case RoomType.PrivateCourtyard: cellType = TerrainType.GroundGrass; break;
        case RoomType.PrivateRoom: cellType = TerrainType.GroundMarble; break;
        }

        for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
            for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
                map.at(x, y).type = cellType;
            }
        }

        if (room.roomType == RoomType.PrivateCourtyard || room.roomType == RoomType.PrivateRoom) {
            for (let x = room.posMin[0] - 1; x < room.posMax[0] + 1; ++x) {
                for (let y = room.posMin[1] - 1; y < room.posMax[1] + 1; ++y) {
                    map.at(x, y).inner = true;
                }
            }
        }

        let dx = room.posMax[0] - room.posMin[0];
        let dy = room.posMax[1] - room.posMin[1];

        if (isCourtyardRoomType(room.roomType)) {
            if (dx >= 5 && dy >= 5) {
                for (let x = room.posMin[0] + 1; x < room.posMax[0] - 1; ++x) {
                    for (let y = room.posMin[1] + 1; y < room.posMax[1] - 1; ++y) {
                        map.at(x, y).type = TerrainType.GroundWater;
                    }
                }
            } else if (dx >= 2 && dy >= 2) {
                try_place_bush(map, room.posMin[0], room.posMin[1]);
                try_place_bush(map, room.posMax[0] - 1, room.posMin[1]);
                try_place_bush(map, room.posMin[0], room.posMax[1] - 1);
                try_place_bush(map, room.posMax[0] - 1, room.posMax[1] - 1);
            }
        } else if (room.roomType == RoomType.PublicRoom || room.roomType == RoomType.PrivateRoom) {
            if (dx >= 5 && dy >= 5) {
                if (room.roomType == RoomType.PrivateRoom) {
                    for (let x = 2; x < dx-2; ++x) {
                        for (let y = 2; y < dy-2; ++y) {
                            map.at(room.posMin[0] + x, room.posMin[1] + y).type = TerrainType.GroundWater;
                        }
                    }
                }

                map.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
                map.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
                map.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
                map.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;
            } else if (dx == 5 && dy >= 3 && (room.roomType == RoomType.PublicRoom || Math.random() < 0.33333)) {
                for (let y = 1; y < dy-1; ++y) {
                    try_place_chair(map, room.posMin[0] + 1, room.posMin[1] + y);
                    try_place_table(map, room.posMin[0] + 2, room.posMin[1] + y);
                    try_place_chair(map, room.posMin[0] + 3, room.posMin[1] + y);
                }
            } else if (dy == 5 && dx >= 3 && (room.roomType == RoomType.PublicRoom || Math.random() < 0.33333)) {
                for (let x = 1; x < dx-1; ++x) {
                    try_place_chair(map, room.posMin[0] + x, room.posMin[1] + 1);
                    try_place_table(map, room.posMin[0] + x, room.posMin[1] + 2);
                    try_place_chair(map, room.posMin[0] + x, room.posMin[1] + 3);
                }
            } else if (dx > dy && (dy & 1) == 1 && Math.random() < 0.66667) {
                let y = Math.floor(room.posMin[1] + dy / 2);

                if (room.roomType == RoomType.PublicRoom) {
                    try_place_table(map, room.posMin[0] + 1, y);
                    try_place_table(map, room.posMax[0] - 2, y);
                } else {
                    try_place_chair(map, room.posMin[0] + 1, y);
                    try_place_chair(map, room.posMax[0] - 2, y);
                }
            } else if (dy > dx && (dx & 1) == 1 && Math.random() < 0.66667) {
                let x = Math.floor(room.posMin[0] + dx / 2);

                if (room.roomType == RoomType.PublicRoom) {
                    try_place_table(map, x, room.posMin[1] + 1);
                    try_place_table(map, x, room.posMax[1] - 2);
                } else {
                    try_place_chair(map, x, room.posMin[1] + 1);
                    try_place_chair(map, x, room.posMax[1] - 2);
                }
            } else if (dx > 3 && dy > 3) {
                if (room.roomType == RoomType.PublicRoom) {
                    try_place_table(map, room.posMin[0], room.posMin[1]);
                    try_place_table(map, room.posMax[0] - 1, room.posMin[1]);
                    try_place_table(map, room.posMin[0], room.posMax[1] - 1);
                    try_place_table(map, room.posMax[0] - 1, room.posMax[1] - 1);
                } else {
                    try_place_chair(map, room.posMin[0], room.posMin[1]);
                    try_place_chair(map, room.posMax[0] - 1, room.posMin[1]);
                    try_place_chair(map, room.posMin[0], room.posMax[1] - 1);
                    try_place_chair(map, room.posMax[0] - 1, room.posMax[1] - 1);
                }
            }
        }
    }
}

function try_place_bush(map: CellGrid, x: number, y: number) {
}

function try_place_table(map: CellGrid, x: number, y: number) {
}

function try_place_chair(map: CellGrid, x: number, y: number) {
}

function isCourtyardRoomType(roomType: RoomType): boolean {
    switch (roomType) {
    case RoomType.Exterior: return false;
    case RoomType.PublicCourtyard: return true;
    case RoomType.PublicRoom: return false;
    case RoomType.PrivateCourtyard: return true;
    case RoomType.PrivateRoom: return false;
    }
}

function fixupWalls(map: CellGrid) {
    for (let x = 0; x < map.sizeX; ++x) {
        for (let y = 0; y < map.sizeY; ++y) {
            const terrainType = map.at(x, y).type;
            if (terrainType == TerrainType.Wall0000) {
                map.at(x, y).type = wallTypeFromNeighbors(neighboringWalls(map, x, y));
            }
        }
    }
}

function wallTypeFromNeighbors(neighbors: number): TerrainType {
    return TerrainType.Wall0000 + neighbors;
}

function isWall(terrainType: TerrainType): boolean {
    return terrainType >= TerrainType.Wall0000;
}

function neighboringWalls(map: CellGrid, x: number, y: number): number {
    const sizeX = map.sizeX;
    const sizeY = map.sizeY;
    let wallBits = 0;

    if (y < sizeY-1 && isWall(map.at(x, y+1).type)) {
        wallBits |= 8;
    }
    if (y > 0 && isWall(map.at(x, y-1).type)) {
        wallBits |= 4;
    }
    if (x < sizeX-1 && isWall(map.at(x+1, y).type)) {
        wallBits |= 2;
    }
    if (x > 0 && isWall(map.at(x-1, y).type)) {
        wallBits |= 1;
    }

    return wallBits
}

function gameMapFromCellMap(cells: CellGrid, playerStartPos: vec2): GameMap {
    const sizeX = cells.sizeX;
    const sizeY = cells.sizeY;
    const terrainTypeGrid = new TerrainTypeGrid(sizeX, sizeY, TerrainType.GroundWood);

    for (let x = 0; x < sizeX; ++x) {
        for (let y = 0; y < sizeY; ++y) {
            terrainTypeGrid.set(x, y, cells.at(x, y).type);
        }
    }

    return {
        terrainTypeGrid: terrainTypeGrid,
        playerStartPos: playerStartPos
    };
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

function randomInRange(n: number): number {
    return Math.floor(Math.random() * n);
}

function shuffleArray<T>(array: Array<T>) {
    for (let i = array.length - 1; i > 0; --i) {
        let j = randomInRange(i + 1);
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
