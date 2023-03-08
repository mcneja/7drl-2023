export { createGameMap };

import { BooleanGrid, CellGrid, Int32Grid, ItemType, Float64Grid, GameMap, TerrainType, invalidRegion, guardMoveCostForItemType } from './game-map';
import { Guard } from './guard';
import { vec2 } from './my-matrix';
import { randomInRange, shuffleArray } from './random';

const roomSizeX = 5;
const roomSizeY = 5;
const outerBorder = 3;

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
    doorOffset: number,
}

function createGameMap(level: number): GameMap {
    let map = createGameMapInternal(level);

    for (let iTry = 0; map.patrolRegions.length === 0 && iTry < 100; ++iTry) {
        map = createGameMapInternal(level);
    }

    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    return map;
}

function createGameMapInternal(level: number): GameMap {
    const sizeX = randomHouseWidth(level);
    const sizeY = randomHouseDepth(level);

    const inside = makeSiheyuanRoomGrid(sizeX, sizeY);

    const mirrorX: boolean = true;
    const mirrorY: boolean = false;

    const [offsetX, offsetY] = offsetWalls(mirrorX, mirrorY, inside);

    const cells = plotWalls(inside, offsetX, offsetY);

    const map = new GameMap(cells);

    const [rooms, adjacencies, posStart] = createExits(level, mirrorX, mirrorY, inside, offsetX, offsetY, map);

    vec2.copy(map.playerStartPos, posStart);

    placeExteriorBushes(map);
    placeFrontPillars(map);
    placeLoot(rooms, adjacencies, map);

    fixupWalls(cells);
    cacheCellInfo(map);

    generatePatrolRoutes(map, rooms, adjacencies);
    generatePatrolRoutesNew(map, rooms, adjacencies);

    placeGuards(level, rooms, map);

    markExteriorAsSeen(map);

    map.totalLoot = map.items.reduce((totalLoot, item) => totalLoot + ((item.type == ItemType.Coin) ? 1 : 0), 0);

    return map;
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

    // Super hacky: put down grass under all the rooms to plug holes.

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
    map: GameMap
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
                    doorOffset: 0,
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
                        doorOffset: 0,
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
                        doorOffset: 0,
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
                        doorOffset: 0,
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
                    doorOffset: 0,
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
                    doorOffset: 0,
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
                        doorOffset: 0,
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
                        doorOffset: 0,
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
                        doorOffset: 0,
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
                    doorOffset: 0,
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

function generatePatrolRoutes(map: GameMap, rooms: Array<Room>, adjacencies: Array<Adjacency>) {
    const includeRoom = Array(rooms.length).fill(true);

    // Exclude exterior rooms.

    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        if (rooms[iRoom].roomType == RoomType.Exterior) {
            includeRoom[iRoom] = false;
        }
    }

    // Trim dead ends out repeatedly until no more can be trimmed.

    while (true) {
        let trimmed = false;

        for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
            if (!includeRoom[iRoom]) {
                continue;
            }

            const room = rooms[iRoom];

            let numExits = 0;
            for (const iAdj of room.edges) {
                const adj = adjacencies[iAdj];

                if (!adj.door) {
                    continue;
                }

                let iRoomOther = (adj.room_left != iRoom) ? adj.room_left : adj.room_right;

                if (includeRoom[iRoomOther]) {
                    numExits += 1;
                }
            }

            if (numExits < 2) {
                includeRoom[iRoom] = false;
                trimmed = true;
            }
        }

        if (!trimmed) {
            break;
        }
    }

    // Generate patrol regions for included rooms.

    const roomPatrolRegion = Array(rooms.length).fill(invalidRegion);

    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        if (includeRoom[iRoom]) {
            roomPatrolRegion[iRoom] = addPatrolRegion(map, rooms[iRoom].posMin, rooms[iRoom].posMax);
        }
    }

    // Add connections between included rooms.

    for (const adj of adjacencies) {
        if (!adj.door) {
            continue;
        }

        let region0 = roomPatrolRegion[adj.room_left];
        let region1 = roomPatrolRegion[adj.room_right];

        if (region0 === invalidRegion || region1 === invalidRegion) {
            continue;
        }

        addPatrolRoute(map, region0, region1);
    }
}

function addPatrolRegion(map: GameMap, posMin: vec2, posMax: vec2): number {
    let iPatrolRegion = map.patrolRegions.length;

    map.patrolRegions.push({ posMin, posMax });

    // Plot the region into the map.

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            map.cells.at(x, y).region = iPatrolRegion;
        }
    }

    return iPatrolRegion;
}

function addPatrolRoute(map: GameMap, region0: number, region1: number) {
    console.assert(region0 < map.patrolRegions.length);
    console.assert(region1 < map.patrolRegions.length);
    map.patrolRoutes.push([region0, region1]);
}

function generatePatrolRoutesNew(gameMap: GameMap, rooms: Array<Room>, adjacencies: Array<Adjacency>) {
    const roomIncluded = Array(rooms.length).fill(false);
    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        const roomType = rooms[iRoom].roomType;
        if (roomType !== RoomType.Exterior && !isCourtyardRoomType(roomType)) {
            roomIncluded[iRoom] = true;
        }
    }

    const iRoomNext = Array(rooms.length);
    const iRoomPrev = Array(rooms.length);
    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        iRoomNext[iRoom] = -1;
        iRoomPrev[iRoom] = -1;
    }

    const adjacenciesShuffled = [...adjacencies];
    shuffleArray(adjacenciesShuffled);

    for (const adj of adjacenciesShuffled) {
        if (!adj.door) {
            continue;
        }
        const iRoom0 = adj.room_left;
        const iRoom1 = adj.room_right;
        if (!roomIncluded[iRoom0] || !roomIncluded[iRoom1]) {
            continue;
        }
        if (iRoomNext[iRoom0] == -1 && iRoomPrev[iRoom1] == -1) {
            iRoomNext[iRoom0] = iRoom1;
            iRoomPrev[iRoom1] = iRoom0;
        } else if (iRoomNext[iRoom1] == -1 && iRoomPrev[iRoom0] == -1) {
            iRoomNext[iRoom1] = iRoom0;
            iRoomPrev[iRoom0] = iRoom1;
        }
    }

    const posInRoom = [];
    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        if (!roomIncluded[iRoom]) {
            posInRoom.push(rooms[iRoom].posMin);
            continue;
        }
        const pos = posVacantInRoom(gameMap, rooms[iRoom]);
        posInRoom.push(pos);
    }

    // Generate sub-paths within each room along the paths
    // Each room is responsible for the path from the
    // incoming door to the outgoing door, including the
    // incoming door but not the outgoing door. If there
    // is no incoming door, the path starts next to the
    // outgoing door, and if there is no outgoing door,
    // the path ends next to the incoming door.

    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        if (!roomIncluded[iRoom]) {
            continue;
        }

        const iNext = iRoomNext[iRoom];
        const iPrev = iRoomPrev[iRoom];

        const posStart = vec2.create();
        const posEnd = vec2.create();

        if (iNext === -1) {
            if (iPrev === -1) {
                continue;
            } else {
                posInDoor(posStart, rooms, adjacencies, iRoom, iPrev);
                posBesideDoor(posEnd, rooms, adjacencies, iRoom, iPrev);
            }
        } else if (iPrev === -1) {
            posBesideDoor(posStart, rooms, adjacencies, iRoom, iNext);
            posInDoor(posEnd, rooms, adjacencies, iRoom, iNext);
        } else {
            posInDoor(posStart, rooms, adjacencies, iRoom, iPrev);
            posBesideDoor(posEnd, rooms, adjacencies, iRoom, iNext);
        }

        const path = pathBetweenPoints(gameMap, posStart, posEnd);
        for (const pos of path) {
            gameMap.patrolRoutesNew.push(pos);
        }
    }
}

function posInDoor(pos: vec2, rooms: Array<Room>, adjacencies: Array<Adjacency>, iRoom0: number, iRoom1: number) {
    for (const iAdj of rooms[iRoom0].edges) {
        const adj = adjacencies[iAdj];
        if ((adj.room_left === iRoom0 && adj.room_right === iRoom1) ||
            (adj.room_left === iRoom1 && adj.room_right === iRoom0)) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, adj.doorOffset);
            return;
        }
    }
    vec2.zero(pos);
}

function posBesideDoor(pos: vec2, rooms: Array<Room>, adjacencies: Array<Adjacency>, iRoom: number, iRoomNext: number) {
    for (const iAdj of rooms[iRoom].edges) {
        const adj = adjacencies[iAdj];
        if ((adj.room_left === iRoom && adj.room_right === iRoomNext)) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, adj.doorOffset);
            const dirCross = vec2.fromValues(-adj.dir[1], adj.dir[0]);
            vec2.add(pos, pos, dirCross);
            return;
        } else if (adj.room_left === iRoomNext && adj.room_right === iRoom) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, adj.doorOffset);
            const dirCross = vec2.fromValues(adj.dir[1], -adj.dir[0]);
            vec2.add(pos, pos, dirCross);
            return;
        }
    }
    vec2.zero(pos);
}

function posVacantInRoom(gameMap: GameMap, room: Room): vec2 {
    const positions = [];
    for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
        for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
            if (gameMap.cells.at(x, y).moveCost === 0) {
                positions.push(vec2.fromValues(x, y));
            }
        }
    }
    if (positions.length <= 0) {
        return room.posMin;
    }
    const centerX = (room.posMin[0] + room.posMax[0] - 1) / 2;
    const centerY = (room.posMin[1] + room.posMax[1] - 1) / 2;
    positions.sort((a, b) => ((a[0] - centerX)**2 + (a[1] - centerY)**2) - ((b[0] - centerX)**2 + (b[1] - centerY)**2));
    return positions[0];
}

function pathBetweenPoints(gameMap: GameMap, pos0: vec2, pos1: vec2): Array<vec2> {
    const distanceField = gameMap.computeDistancesToPosition(pos1);
    const pos = vec2.clone(pos0);
    const path = [];
    path.push(vec2.clone(pos));
    while (pos[0] !== pos1[0] || pos[1] !== pos1[1]) {
        const posNext = posNextBest(gameMap, distanceField, pos);
        if (posNext[0] === pos[0] && posNext[1] === pos[1]) {
            break;
        }
        vec2.copy(pos, posNext);
        path.push(vec2.clone(pos));
    }
    return path;
}

function posNextBest(gameMap: GameMap, distanceField: Float64Grid, posFrom: vec2): vec2 {
    let costBest = Infinity;
    let posBest = vec2.clone(posFrom);

    const posMin = vec2.fromValues(Math.max(0, posFrom[0] - 1), Math.max(0, posFrom[1] - 1));
    const posMax = vec2.fromValues(Math.min(gameMap.cells.sizeX, posFrom[0] + 2), Math.min(gameMap.cells.sizeY, posFrom[1] + 2));

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            const cost = distanceField.get(x, y);
            if (cost == Infinity) {
                continue;
            }

            let pos = vec2.fromValues(x, y);
            if (gameMap.guardMoveCost(posFrom, pos) == Infinity) {
                continue;
            }

            if (gameMap.cells.at(pos[0], pos[1]).type == TerrainType.GroundWater) {
                continue;
            }

            if (cost < costBest) {
                costBest = cost;
                posBest = pos;
            }
        }
    }

    if (posBest[0] === posFrom[0] && posBest[1] === posFrom[1]) {
        console.log('failed to proceed');
        for (let x = posMin[0]; x < posMax[0]; ++x) {
            for (let y = posMin[1]; y < posMax[1]; ++y) {
                const cost = distanceField.get(x, y);
                console.log(x, y, cost);
            }
        }
    }
    return posBest;
}

const oneWayWindowTerrainType: Array<TerrainType> = [
    TerrainType.OneWayWindowS,
    TerrainType.OneWayWindowE,
    TerrainType.OneWayWindowN,
    TerrainType.OneWayWindowW,
];

function oneWayWindowTerrainTypeFromDir(dir: vec2): number {
    return oneWayWindowTerrainType[dir[0] + 2 * Math.max(0, dir[1]) + 1];
}

function renderWalls(rooms: Array<Room>, adjacencies: Array<Adjacency>, map: GameMap) {

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
            map.cells.at(p[0], p[1]).type = TerrainType.GroundGrass;
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

                        map.cells.at(p[0], p[1]).type = oneWayWindowTerrainTypeFromDir(dir);
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

                        let windowType = oneWayWindowTerrainTypeFromDir(dir);

                        const p = vec2.create();
                        vec2.scaleAndAdd(p, a.origin, a.dir, k);
                        const q = vec2.create();
                        vec2.scaleAndAdd(q, a.origin, a.dir, a.length - (k + 1));

                        map.cells.at(p[0], p[1]).type = windowType;
                        map.cells.at(q[0], q[1]).type = windowType;
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

            a.doorOffset = offset;

            const p = vec2.create();
            vec2.scaleAndAdd(p, a.origin, a.dir, offset);

            let orientNS = (a.dir[0] == 0);

            map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;

            let roomTypeLeft = rooms[a.room_left].roomType;
            let roomTypeRight = rooms[a.room_right].roomType;

            if (roomTypeLeft == RoomType.Exterior || roomTypeRight == RoomType.Exterior) {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.PortcullisNS : TerrainType.PortcullisEW;
                placeItem(map, p[0], p[1], orientNS ? ItemType.PortcullisNS : ItemType.PortcullisEW);
            } else if (roomTypeLeft != RoomType.PrivateRoom || roomTypeRight != RoomType.PrivateRoom || installMasterSuiteDoor) {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p[0], p[1], orientNS ? ItemType.DoorNS : ItemType.DoorEW);
            }
        }
    }
}

function renderRooms(level: number, rooms: Array<Room>, map: GameMap) {
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
                if (cellType == TerrainType.GroundWood && level > 3 && Math.random() < 0.02) {
                    map.cells.at(x, y).type = TerrainType.GroundWoodCreaky;
                } else {
                    map.cells.at(x, y).type = cellType;
                }
            }
        }

        let dx = room.posMax[0] - room.posMin[0];
        let dy = room.posMax[1] - room.posMin[1];

        if (isCourtyardRoomType(room.roomType)) {
            if (dx >= 5 && dy >= 5) {
                for (let x = room.posMin[0] + 1; x < room.posMax[0] - 1; ++x) {
                    for (let y = room.posMin[1] + 1; y < room.posMax[1] - 1; ++y) {
                        map.cells.at(x, y).type = TerrainType.GroundWater;
                    }
                }
            } else if (dx >= 2 && dy >= 2) {
                const itemTypes = [ItemType.TorchLit, ItemType.Bush, ItemType.Bush, ItemType.Bush, ItemType.Bush];
                shuffleArray(itemTypes);
                const itemPositions = [
                    [room.posMin[0], room.posMin[1]],
                    [room.posMax[0] - 1, room.posMin[1]],
                    [room.posMin[0], room.posMax[1] - 1],
                    [room.posMax[0] - 1, room.posMax[1] - 1],
                ];
                for (let i = 0; i < itemPositions.length; ++i) {
                    const [x, y] = itemPositions[i];
                    if (map.cells.at(x, y).type != TerrainType.GroundGrass) {
                        continue;
                    }
                
                    tryPlaceItem(map, x, y, itemTypes[i]);
                }
            }
        } else if (room.roomType == RoomType.PublicRoom || room.roomType == RoomType.PrivateRoom) {
            if (dx >= 5 && dy >= 5) {
                if (room.roomType == RoomType.PrivateRoom) {
                    for (let x = 2; x < dx-2; ++x) {
                        for (let y = 2; y < dy-2; ++y) {
                            map.cells.at(room.posMin[0] + x, room.posMin[1] + y).type = TerrainType.GroundWater;
                        }
                    }
                }

                map.cells.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
                map.cells.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
                map.cells.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
                map.cells.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;
            } else if (dx == 5 && dy >= 3 && (room.roomType == RoomType.PublicRoom || Math.random() < 0.33333)) {
                const itemTypes = new Array(dy - 2).fill(ItemType.Table);
                itemTypes.push((Math.random() < 0.25) ? ItemType.TorchUnlit : ItemType.TorchLit);
                shuffleArray(itemTypes);
                for (let y = 1; y < dy-1; ++y) {
                    placeItem(map, room.posMin[0] + 1, room.posMin[1] + y, ItemType.Chair);
                    placeItem(map, room.posMin[0] + 2, room.posMin[1] + y, itemTypes[y - 1]);
                    placeItem(map, room.posMin[0] + 3, room.posMin[1] + y, ItemType.Chair);
                }
            } else if (dy == 5 && dx >= 3 && (room.roomType == RoomType.PublicRoom || Math.random() < 0.33333)) {
                const itemTypes = new Array(dx - 2).fill(ItemType.Table);
                itemTypes.push((Math.random() < 0.25) ? ItemType.TorchUnlit : ItemType.TorchLit);
                shuffleArray(itemTypes);
                for (let x = 1; x < dx-1; ++x) {
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 1, ItemType.Chair);
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 2, itemTypes[x - 1]);
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 3, ItemType.Chair);
                }
            } else if (dx > dy && (dy & 1) == 1 && Math.random() < 0.66667) {
                let y = Math.floor(room.posMin[1] + dy / 2);
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = (Math.random() < 0.25) ? ItemType.TorchUnlit : ItemType.TorchLit;
                const itemTypes = [torchType, furnitureType];
                shuffleArray(itemTypes);
                tryPlaceItem(map, room.posMin[0] + 1, y, itemTypes[0]);
                tryPlaceItem(map, room.posMax[0] - 2, y, itemTypes[1]);
            } else if (dy > dx && (dx & 1) == 1 && Math.random() < 0.66667) {
                let x = Math.floor(room.posMin[0] + dx / 2);
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = (Math.random() < 0.25) ? ItemType.TorchUnlit : ItemType.TorchLit;
                const itemTypes = [torchType, furnitureType];
                shuffleArray(itemTypes);
                tryPlaceItem(map, x, room.posMin[1] + 1, itemTypes[0]);
                tryPlaceItem(map, x, room.posMax[1] - 2, itemTypes[1]);
            } else if (dx > 3 && dy > 3) {
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = (Math.random() < 0.25) ? ItemType.TorchUnlit : ItemType.TorchLit;
                const itemTypes = [torchType, furnitureType, furnitureType, furnitureType];
                shuffleArray(itemTypes);
                tryPlaceItem(map, room.posMin[0], room.posMin[1], itemTypes[0]);
                tryPlaceItem(map, room.posMax[0] - 1, room.posMin[1], itemTypes[1]);
                tryPlaceItem(map, room.posMin[0], room.posMax[1] - 1, itemTypes[2]);
                tryPlaceItem(map, room.posMax[0] - 1, room.posMax[1] - 1, itemTypes[3]);
            }
        }
    }
}

function tryPlaceItem(map: GameMap, x: number, y: number, itemType: ItemType) {
    if (doorAdjacent(map.cells, x, y)) {
        return;
    }

    placeItem(map, x, y, itemType);
}

function doorAdjacent(map: CellGrid, x: number, y: number): boolean {
    if (map.at(x - 1, y).type >= TerrainType.PortcullisNS) {
        return true;
    }

    if (map.at(x + 1, y).type >= TerrainType.PortcullisNS) {
        return true;
    }

    if (map.at(x, y - 1).type >= TerrainType.PortcullisNS) {
        return true;
    }

    if (map.at(x, y + 1).type >= TerrainType.PortcullisNS) {
        return true;
    }

    return false;
}

function placeItem(map: GameMap, x: number, y: number, type: ItemType) {
    map.items.push({
        pos: vec2.fromValues(x, y),
        type: type,
    });
}

function placeLoot(rooms: Array<Room>, adjacencies: Array<Adjacency>, map: GameMap) {

    // Count number of internal rooms.

    let numRooms = 0;
    for (const room of rooms) {
        if (room.roomType == RoomType.PublicRoom || room.roomType == RoomType.PrivateRoom) {
            numRooms += 1;
        }
    }

    // Master-suite rooms get loot.

    for (const room of rooms)  {
        if (room.roomType != RoomType.PrivateRoom) {
            continue;
        }

        if (Math.random() < 0.2) {
            continue;
        }

        tryPlaceLoot(room.posMin, room.posMax, map);
    }

    // Dead-end rooms automatically get loot.

    for (const room of rooms) {
        if (room.roomType != RoomType.PublicRoom && room.roomType != RoomType.PrivateRoom) {
            continue;
        }

        let numExits = 0;
        for (const iAdj of room.edges) {
            if (adjacencies[iAdj].door) {
                numExits += 1;
            }
        }

        if (numExits < 2) {
            tryPlaceLoot(room.posMin, room.posMax, map);
        }
    }

    // Place a bit of extra loot.

    let posMin = vec2.fromValues(0, 0);
    let posMax = vec2.fromValues(map.cells.sizeX, map.cells.sizeY);
    for (let i = Math.floor(numRooms / 4 + randomInRange(4)); i > 0; --i) {
        tryPlaceLoot(posMin, posMax, map);
    }
}

function tryPlaceLoot(posMin: vec2, posMax: vec2, map: GameMap)
{
    let dx = posMax[0] - posMin[0];
    let dy = posMax[1] - posMin[1];

    for (let i = 1000; i > 0; --i) {
        let pos = vec2.fromValues(posMin[0] + randomInRange(dx), posMin[1] + randomInRange(dy));

        let cellType = map.cells.at(pos[0], pos[1]).type;

        if (cellType != TerrainType.GroundWood && cellType != TerrainType.GroundMarble) {
            continue;
        }

        if (isItemAtPos(map, pos[0], pos[1])) {
            continue;
        }

        placeItem(map, pos[0], pos[1], ItemType.Coin);
        break;
    }
}

function placeExteriorBushes(map: GameMap) {
    let sx = map.cells.sizeX;
    let sy = map.cells.sizeY;

    for (let x = 0; x < sx; ++x) {
        for (let y = sy - outerBorder + 1; y < sy; ++y) {
            if (map.cells.at(x, y).type != TerrainType.GroundNormal) {
                continue;
            }

            let cell = map.cells.at(x, y);
            cell.type = TerrainType.GroundGrass;
            cell.seen = true;
        }

        if ((x & 1) == 0 && Math.random() < 0.8) {
            placeItem(map, x, sy - 1, ItemType.Bush);
        }
    }

    for (let y = outerBorder; y < sy - outerBorder + 1; ++y) {
        for (let x = 0; x < outerBorder-1; ++x) {
            if (map.cells.at(x, y).type != TerrainType.GroundNormal) {
                continue;
            }

            let cell = map.cells.at(x, y);
            cell.type = TerrainType.GroundGrass;
            cell.seen = true;
        }

        for (let x = (sx - outerBorder + 1); x < sx; ++x) {
            if (map.cells.at(x, y).type != TerrainType.GroundNormal) {
                continue;
            }

            let cell = map.cells.at(x, y);
            cell.type = TerrainType.GroundGrass;
            cell.seen = true;
        }

        if (((sy - y) & 1) != 0) {
            if (Math.random() < 0.8) {
                placeItem(map, 0, y, ItemType.Bush);
            }
            if (Math.random() < 0.8) {
                placeItem(map, sx - 1, y, ItemType.Bush);
            }
        }
    }
}

function placeFrontPillars(map: GameMap) {
    let sx = map.cells.sizeX - 1;
    let cx = Math.floor(map.cells.sizeX / 2);

    for (let x = outerBorder; x < cx; x += 5) {
        map.cells.at(x, 1).type = TerrainType.Wall0000;
        map.cells.at(sx - x, 1).type = TerrainType.Wall0000;
    }
}

function isItemAtPos(map: GameMap, x: number, y: number): boolean {
    for (const item of map.items) {
        if (item.pos[0] == x && item.pos[1] == y) {
            return true;
        }
    }
    for (const guard of map.guards) {
        if (guard.pos[0] == x && guard.pos[1] == y) {
            return true;
        }
    }
    return false;
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

function placeGuards(level: number, rooms: Array<Room>, map: GameMap) {
    if (level <= 0) {
        return;
    }

    if (map.patrolRegions.length === 0) {
        return;
    }

    // Count number of internal rooms.

    let numRooms = 0;
    for (const room of rooms) {
        if (room.roomType != RoomType.Exterior) {
            numRooms += 1;
        }
    }

    // Generate guards

    let numGuards = 0; // (level == 1) ? 1 : Math.max(2, Math.floor((numRooms * Math.min(level + 18, 40)) / 100));

    while (numGuards > 0) {
        const pos = generateInitialGuardPos(map);
        if (pos === undefined) {
            break;
        }
        const guard = new Guard(pos, map);
        if (numGuards < 2) {
            guard.hasTorch = true;
        }
        map.guards.push(guard);
        numGuards -= 1;
    }
}

function generateInitialGuardPos(map: GameMap): vec2 | undefined {
    let sizeX = map.cells.sizeX;
    let sizeY = map.cells.sizeY;
    for (let i = 0; i < 1000; ++i) {
        let pos = vec2.fromValues(randomInRange(sizeX), randomInRange(sizeY));

        if (vec2.squaredDistance(map.playerStartPos, pos) < 64) {
            continue;
        }

        let cellType = map.cells.at(pos[0], pos[1]).type;

        if (cellType != TerrainType.GroundWood && cellType != TerrainType.GroundMarble) {
            continue;
        }

        if (isItemAtPos(map, pos[0], pos[1])) {
            continue;
        }

        return pos;
    }

    return undefined;
}

function markExteriorAsSeen(map: GameMap) {
    let sx = map.cells.sizeX;
    let sy = map.cells.sizeY;

    for (let x = 0; x < sx; ++x) {
        for (let y = 0; y < sy; ++y) {
            if (map.cells.at(x, y).type == TerrainType.GroundNormal ||
                (x > 0 && map.cells.at(x-1, y).type == TerrainType.GroundNormal) ||
                (x > 0 && y > 0 && map.cells.at(x-1, y-1).type == TerrainType.GroundNormal) ||
                (x > 0 && y+1 < sy && map.cells.at(x-1, y+1).type == TerrainType.GroundNormal) ||
                (y > 0 && map.cells.at(x, y-1).type == TerrainType.GroundNormal) ||
                (y+1 < sy && map.cells.at(x, y+1).type == TerrainType.GroundNormal) ||
                (x+1 < sx && map.cells.at(x+1, y).type == TerrainType.GroundNormal) ||
                (x+1 < sx && y > 0 && map.cells.at(x+1, y-1).type == TerrainType.GroundNormal) ||
                (x+1 < sx && y+1 < sy && map.cells.at(x+1, y+1).type == TerrainType.GroundNormal)) {
                map.cells.at(x, y).seen = true;
            }
        }
    }
}

function cacheCellInfo(map: GameMap) {
    let sx = map.cells.sizeX;
    let sy = map.cells.sizeY;

    for (let x = 0; x < sx; ++x) {
        for (let y = 0; y < sy; ++y) {
            const cell = map.cells.at(x, y);
            const cellType = cell.type;
            const isWall = cellType >= TerrainType.Wall0000 && cellType <= TerrainType.Wall1111;
            const isWindow = cellType >= TerrainType.OneWayWindowE && cellType <= TerrainType.OneWayWindowS;
            const isWater = cellType == TerrainType.GroundWater;
            cell.moveCost = (isWall || isWindow) ? Infinity : isWater ? 4096 : 0;
            cell.blocksPlayerMove = isWall;
            cell.blocksPlayerSight = isWall;
            cell.blocksSight = isWall || isWindow;
            cell.blocksSound = isWall;
            cell.hidesPlayer = false;
        }
    }

    for (const item of map.items) {
        let cell = map.cells.at(item.pos[0], item.pos[1]);
        let itemType = item.type;
        cell.moveCost = Math.max(cell.moveCost, guardMoveCostForItemType(itemType));
        if (itemType == ItemType.DoorNS || itemType == ItemType.DoorEW) {
            cell.blocksPlayerSight = true;
        }
        if (itemType == ItemType.DoorNS || itemType == ItemType.DoorEW || itemType == ItemType.PortcullisNS || itemType == ItemType.PortcullisEW || itemType == ItemType.Bush) {
            cell.blocksSight = true;
        }
        if (itemType == ItemType.Table || itemType == ItemType.Bush) {
            cell.hidesPlayer = true;
        }
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
