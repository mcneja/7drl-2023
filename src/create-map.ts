export { createGameMap, createGameMapRoughPlans };

import { BooleanGrid, CellGrid, Int32Grid, ItemType, Float64Grid, GameMap, GameMapRoughPlan, TerrainType, guardMoveCostForItemType, isWindowTerrainType } from './game-map';
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

function createGameMapRoughPlans(numMaps: number, totalLoot: number): Array<GameMapRoughPlan> {
    const gameMapRoughPlans: Array<GameMapRoughPlan> = [];

    // First establish the sizes of the levels

    for (let level = 0; level < numMaps; ++level) {
        const sizeX = randomHouseWidth(level);
        const sizeY = randomHouseDepth(level);
        gameMapRoughPlans.push({
            numRoomsX: sizeX,
            numRoomsY: sizeY,
            totalLoot: 0
        });
    }

    // Distribute the total loot in proportion to each level's size

    let totalArea = 0;
    for (const gameMapRoughPlan of gameMapRoughPlans) {
        const area = gameMapRoughPlan.numRoomsX * gameMapRoughPlan.numRoomsY;
        totalArea += area;
    }

    let totalLootPlaced = 0;
    for (const gameMapRoughPlan of gameMapRoughPlans) {
        const area = gameMapRoughPlan.numRoomsX * gameMapRoughPlan.numRoomsY;
        const loot = Math.floor(totalLoot * area / totalArea);
        totalLootPlaced += loot;
        gameMapRoughPlan.totalLoot = loot;
    }

    // Put any leftover loot needed in the last level

    gameMapRoughPlans[gameMapRoughPlans.length - 1].totalLoot += totalLoot - totalLootPlaced;

    // Debug print the plans

    /*
    for (let i = 0; i < gameMapRoughPlans.length; ++i) {
        const plan = gameMapRoughPlans[i];
        console.log('Level', i, 'size', plan.numRoomsX, 'by', plan.numRoomsY, 'gold', plan.totalLoot);
    }
    */

    return gameMapRoughPlans;
}

function createGameMap(level: number, plan: GameMapRoughPlan): GameMap {
    const inside = makeSiheyuanRoomGrid(plan.numRoomsX, plan.numRoomsY);

    const mirrorX: boolean = true;
    const mirrorY: boolean = false;

    const [offsetX, offsetY] = offsetWalls(mirrorX, mirrorY, inside);

    const cells = plotWalls(inside, offsetX, offsetY);

    const map = new GameMap(cells);

    const [rooms, adjacencies, posStart] = createExits(level, mirrorX, mirrorY, inside, offsetX, offsetY, map);

    vec2.copy(map.playerStartPos, posStart);

    placeExteriorBushes(map);
    placeFrontPillars(map);
    placeLoot(plan.totalLoot, rooms, adjacencies, map);

    fixupWalls(cells);
    cacheCellInfo(map);

    const patrolRoutes = placePatrolRoutes(level, map, rooms, adjacencies);

    placeGuards(level, map, patrolRoutes);

    markExteriorAsSeen(map);

    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

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
            const adjacencyRow: Array<number> = [];

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
            const adjacencyRow: Array<number> = [];

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
            const adjacencyRow: Array<number> = [];

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
        let adjacencyRows: Array<Array<number>> = [];

        {
            const adjacencyRow: Array<number> = [];

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
            const adjacencyRow: Array<number> = [];

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
            const adjacencyRow: Array<number> = [];

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
    const edgeSets: Array<Array<number>> = [];

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

type PatrolNode = {
    roomIndex: number;
    nodeNext: PatrolNode | null;
    nodePrev: PatrolNode | null;
    visited: boolean;
}

function placePatrolRoutes(level: number, gameMap: GameMap, rooms: Array<Room>, adjacencies: Array<Adjacency>): Array<Array<vec2>> {

    // Keep adjacencies that connect interior rooms via a door; shuffle them

    const adjacenciesShuffled = adjacencies.filter((adj) =>
        adj.door &&
        rooms[adj.room_left].roomType !== RoomType.Exterior &&
        rooms[adj.room_right].roomType !== RoomType.Exterior);
    shuffleArray(adjacenciesShuffled);

    // Build a set of nodes for joining into routes. Initially there will be one per room.
    // More may be added if rooms participate in more than one route, or if they are
    // visited multiple times in the route.

    const nodes: Array<PatrolNode> = [];
    for (let iRoom = 0; iRoom < rooms.length; ++iRoom) {
        const node = {
            roomIndex: iRoom,
            nodeNext: null,
            nodePrev: null,
            visited: false,
        };
        nodes.push(node);
    }

    // Join rooms onto the start or end (or both) of patrol routes

    for (const adj of adjacenciesShuffled) {
        let node0 = nodes[adj.room_left];
        let node1 = nodes[adj.room_right];

        if (node0.nodeNext == null && node1.nodePrev == null) {
            node0.nodeNext = node1;
            node1.nodePrev = node0;
        } else if (node1.nodeNext == null && node0.nodePrev == null) {
            node1.nodeNext = node0;
            node0.nodePrev = node1;
        } else if (node0.nodeNext == null && node1.nodeNext == null) {
            flipReverse(node1);
            node0.nodeNext = node1;
            node1.nodePrev = node0;
        } else if (node0.nodePrev == null && node1.nodePrev == null) {
            flipForward(node0);
            node0.nodeNext = node1;
            node1.nodePrev = node0;
        }
    }

    // Split long routes into separate pieces

    for (const node of nodes) {
        if (node.visited) {
            continue;
        }

        visitRoute(node);

        if (isLoopingPatrolRoute(node)) {
            continue;
        }

        const pieceLength = Math.max(3, 10 - level);

        splitPatrolRoute(node, pieceLength);
    }

    // Convert patrol routes into directed graphs by doubling the nodes

    convertOneWayRoutesToReversibleRoutes(nodes);

    // Join orphan rooms by generating new nodes in the existing paths

    for (const adj of adjacenciesShuffled) {
        const iNode0 = adj.room_left;
        const iNode1 = adj.room_right;

        const node0 = nodes[iNode0];
        const node1 = nodes[iNode1];

        if (node0.nodeNext == null && node0.nodePrev == null && node1.nodeNext != null && node1.nodePrev != null) {
            // Old: node1 --> node3
            // New: node1 --> node0 --> node2 --> node3 (where node2 is the same room as node1)
            const node3 = node1.nodeNext;
            const node2 = {
                roomIndex: node1.roomIndex,
                nodeNext: node3,
                nodePrev: node0,
                visited: false,
            };
            nodes.push(node2);
            node1.nodeNext = node0;
            node0.nodePrev = node1;
            node0.nodeNext = node2;
            node3.nodePrev = node2;
        } else if (node0.nodeNext != null && node0.nodePrev != null && node1.nodeNext == null && node1.nodePrev == null) {
            // Old: node0 <-> node3
            // New: node0 <-> node1 <-> node2 <-> node3
            const node3 = node0.nodeNext;
            const node2 = {
                roomIndex: node0.roomIndex,
                nodeNext: node3,
                nodePrev: node1,
                visited: false,
            };
            nodes.push(node2);
            node0.nodeNext = node1;
            node1.nodeNext = node2;
            node1.nodePrev = node0;
            node3.nodePrev = node2;
        }
    }

    // Generate sub-paths within each room along the paths
    // Each room is responsible for the path from the
    // incoming door to the outgoing door, including the
    // incoming door but not the outgoing door. If there
    // is no incoming door, the path starts next to the
    // outgoing door, and if there is no outgoing door,
    // the path ends next to the incoming door.

    for (const node of nodes) {
        node.visited = false;
    }

    const patrolRoutes: Array<Array<vec2>> = [];

    for (const nodeIter of nodes) {
        if (nodeIter.visited) {
            continue;
        }

        if (nodeIter.nodeNext == null && nodeIter.nodePrev == null) {
            nodeIter.visited = true;
            continue;
        }

        const nodeStart = startingNode(nodeIter);

        const patrolPositions: Array<vec2> = [];
        for (let node: PatrolNode | null = nodeStart; node != null; node = node.nodeNext) {
            if (node.visited) {
                break;
            }
            node.visited = true;

            const nodeNext = node.nodeNext;
            const nodePrev = node.nodePrev;

            if (nodeNext == null) {
                continue;
            }

            if (nodePrev == null) {
                continue;
            }

            const iRoom = node.roomIndex;
            const iRoomNext = nodeNext.roomIndex;
            const iRoomPrev = nodePrev.roomIndex;

            const posStart = vec2.create();
            const posEnd = vec2.create();

            if (iRoomNext !== iRoomPrev) {
                posInDoor(posStart, rooms, adjacencies, iRoom, iRoomPrev);
                posInDoor(posEnd, rooms, adjacencies, iRoom, iRoomNext);
            } else {
                // Have to get ourselves from the door to an activity station and then back to the door.
                posInDoor(posStart, rooms, adjacencies, iRoom, iRoomPrev);
                const positions = activityStationPositions(gameMap, rooms[iRoom]);
                if (positions.length > 0) {
                    vec2.copy(posEnd, positions[randomInRange(positions.length)]);
                } else {
                    posBesideDoor(posEnd, rooms, adjacencies, iRoom, iRoomPrev, gameMap);
                }

                for (const pos of pathBetweenPoints(gameMap, posStart, posEnd)) {
                    patrolPositions.push(pos);
                }

                patrolPositions.push(vec2.clone(posEnd));
                patrolPositions.push(vec2.clone(posEnd));
                patrolPositions.push(vec2.clone(posEnd));

                vec2.copy(posStart, posEnd);
                posInDoor(posEnd, rooms, adjacencies, iRoom, iRoomNext);
            }

            const path = pathBetweenPoints(gameMap, posStart, posEnd);
            for (const pos of path) {
                patrolPositions.push(pos);
            }
        }

        patrolRoutes.push(patrolPositions);
    }

    // Past level 5, start including patrols around the outside of the mansion.

    if (level > 5) {
        const patrolPositions: Array<vec2> = [];
        const xMin = 2;
        const yMin = 2;
        const xMax = gameMap.cells.sizeX - 3;
        const yMax = gameMap.cells.sizeY - 3;

        for (let x = xMin; x < xMax; ++x) {
            patrolPositions.push(vec2.fromValues(x, yMin));
        }
        for (let y = yMin; y < yMax; ++y) {
            patrolPositions.push(vec2.fromValues(xMax, y));
        }
        for (let x = xMax; x > xMin; --x) {
            patrolPositions.push(vec2.fromValues(x, yMax));
        }
        for (let y = yMax; y > yMin; --y) {
            patrolPositions.push(vec2.fromValues(xMin, y));
        }

        patrolRoutes.push(patrolPositions);
        patrolRoutes.push(shiftedPathCopy(patrolPositions, Math.floor(patrolPositions.length / 2)));
    }
   
    return patrolRoutes;
}

function convertOneWayRoutesToReversibleRoutes(nodes: Array<PatrolNode>) {
    const nodesOriginal = [...nodes];

    for (const node of nodesOriginal) {
        node.visited = false;
    }

    for (const nodeOriginal of nodesOriginal) {
        if (nodeOriginal.visited) {
            continue;
        }

        visitRoute(nodeOriginal);

        if (isLoopingPatrolRoute(nodeOriginal)) {
            continue;
        }

        const nodeForward = startingNode(nodeOriginal);

        // The start and end nodes do not get duplicated, but
        // all nodes in between are duplicated and strung
        // together from the end back to the start.

        let nodeForwardNext = nodeForward.nodeNext;
        let nodeReverseNext = nodeForward;

        while (nodeForwardNext !== null && nodeForwardNext.nodeNext !== null) {
            const nodeReverse = {
                roomIndex: nodeForwardNext.roomIndex,
                nodeNext: nodeReverseNext,
                nodePrev: null,
                visited: true,
            };

            nodes.push(nodeReverse);

            nodeReverseNext.nodePrev = nodeReverse;

            nodeForwardNext = nodeForwardNext.nodeNext;
            nodeReverseNext = nodeReverse;
        }

        if (nodeForwardNext !== null) {
            nodeReverseNext.nodePrev = nodeForwardNext;
            nodeForwardNext.nodeNext = nodeReverseNext;
        }
    }
}

function shiftedPathCopy(patrolPath: Array<vec2>, offset: number): Array<vec2> {
    const patrolPathNew = [];
    for (let i = offset; i < patrolPath.length; ++i) {
        patrolPathNew.push(patrolPath[i]);
    }
    for (let i = 0; i < offset; ++i) {
        patrolPathNew.push(patrolPath[i]);
    }
    return patrolPathNew;
}

function flipReverse(node: PatrolNode | null) {
    let nodeVisited = null;
    while (node != null) {
        const nodeToVisit = node.nodePrev;
        node.nodeNext = nodeToVisit;
        node.nodePrev = nodeVisited;
        nodeVisited = node;
        node = nodeToVisit;
    }
}

function flipForward(node: PatrolNode | null) {
    let nodeVisited = null;
    while (node != null) {
        const nodeToVisit = node.nodeNext;
        node.nodePrev = nodeToVisit;
        node.nodeNext = nodeVisited;
        nodeVisited = node;
        node = nodeToVisit;
    }
}

function startingNode(node: PatrolNode): PatrolNode {
    let nodeStart = node;
    while (nodeStart.nodePrev != null) {
        nodeStart = nodeStart.nodePrev;
        if (nodeStart == node) {
            break;
        }
    }
    return nodeStart;
}

function isLoopingPatrolRoute(nodeStart: PatrolNode): boolean {
    for (let node = nodeStart.nodeNext; node != null; node = node.nodeNext) {
        if (node == nodeStart) {
            return true;
        }
    }
    return false;
}

function patrolRouteLength(nodeAny: PatrolNode): number {
    let c = 0;
    let nodeStart = startingNode(nodeAny);
    for (let node: PatrolNode | null = nodeStart; node != null; node = node.nodeNext) {
        ++c;
        if (node.nodeNext == nodeStart) {
            break;
        }
    }
    return c;
}

function visitRoute(nodeAny: PatrolNode) {
    let nodeStart = startingNode(nodeAny);
    for (let node: PatrolNode | null = nodeStart; node != null; node = node.nodeNext) {
        node.visited = true;
        if (node.nodeNext == nodeStart) {
            break;
        }
    }
}

function splitPatrolRoute(nodeAny: PatrolNode, pieceLength: number) {
    const nodeStart = startingNode(nodeAny);
    let node = nodeStart;
    let cNode = 0;
    while (true) {
        const nodeNext = node.nodeNext;
        if (nodeNext == null) {
            break;
        }

        if (patrolRouteLength(node) < 2 * pieceLength) {
            break;
        }

        ++cNode;
        if (cNode >= pieceLength) {
            cNode = 0;
            node.nodeNext = null;
            nodeNext.nodePrev = null;
        }

        node = nodeNext;

        if (node == nodeStart) {
            break;
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

function posBesideDoor(pos: vec2, rooms: Array<Room>, adjacencies: Array<Adjacency>, iRoom: number, iRoomNext: number, gameMap: GameMap) {
    // Try two squares into the room, if possible. If not, fall back to one square in, which will be clear.
    for (const iAdj of rooms[iRoom].edges) {
        const adj = adjacencies[iAdj];
        if ((adj.room_left === iRoom && adj.room_right === iRoomNext)) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, adj.doorOffset);
            const dirCross = vec2.fromValues(-adj.dir[1], adj.dir[0]);
            vec2.scaleAndAdd(pos, pos, dirCross, 2);
            if (gameMap.cells.at(pos[0], pos[1]).moveCost != 0) {
                vec2.scaleAndAdd(pos, pos, dirCross, -1);
            }
            return;
        } else if (adj.room_left === iRoomNext && adj.room_right === iRoom) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, adj.doorOffset);
            const dirCross = vec2.fromValues(adj.dir[1], -adj.dir[0]);
            vec2.scaleAndAdd(pos, pos, dirCross, 2);
            if (gameMap.cells.at(pos[0], pos[1]).moveCost != 0) {
                vec2.scaleAndAdd(pos, pos, dirCross, -1);
            }
            return;
        }
    }
    vec2.zero(pos);
}

function activityStationPositions(gameMap: GameMap, room: Room): Array<vec2> {
    const positions: Array<vec2> = [];

    // Search for positions with adjacent windows to look out of
    for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
        if (room.posMin[1] > 0) {
            const terrainType = gameMap.cells.at(x, room.posMin[1] - 1).type;
            if (terrainType == TerrainType.OneWayWindowS && gameMap.cells.at(x, room.posMin[1]).moveCost === 0) {
                positions.push(vec2.fromValues(x, room.posMin[1]));
            }
        }
        if (room.posMax[1] < gameMap.cells.sizeY) {
            const terrainType = gameMap.cells.at(x, room.posMax[1]).type;
            if (terrainType == TerrainType.OneWayWindowN && gameMap.cells.at(x, room.posMax[1] - 1).moveCost === 0) {
                positions.push(vec2.fromValues(x, room.posMax[1] - 1));
            }
        }
    }
    for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
        if (room.posMin[0] > 0) {
            const terrainType = gameMap.cells.at(room.posMin[0] - 1, y).type;
            if (terrainType == TerrainType.OneWayWindowW && gameMap.cells.at(room.posMin[0], y).moveCost === 0) {
                positions.push(vec2.fromValues(room.posMin[0], y));
            }
        }
        if (room.posMax[0] < gameMap.cells.sizeX) {
            const terrainType = gameMap.cells.at(room.posMax[0], y).type;
            if (terrainType == TerrainType.OneWayWindowE && gameMap.cells.at(room.posMax[0] - 1, y).moveCost === 0) {
                positions.push(vec2.fromValues(room.posMax[0] - 1, y));
            }
        }
    }
    if (positions.length > 0) {
        return positions;
    }

    // Search for any loot to stand next to
    for (const item of gameMap.items) {
        if (item.type == ItemType.Coin &&
            item.pos[0] >= room.posMin[0] &&
            item.pos[1] >= room.posMin[1] &&
            item.pos[0] < room.posMax[0] &&
            item.pos[1] < room.posMax[1]) {

            for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const x = item.pos[0] + dir[0];
                const y = item.pos[1] + dir[1];
                if (x < room.posMin[0] || y < room.posMin[1] || x >= room.posMax[0] || y >= room.posMax[1]) {
                    continue;
                }
                if (gameMap.cells.at(x, y).moveCost != 0) {
                    continue;
                }
                positions.push(vec2.fromValues(x, y));
            }
        }
    }
    if (positions.length > 0) {
        return positions;
    }

    // Search for chairs to sit on
    for (const item of gameMap.items) {
        if (item.type == ItemType.Chair &&
            item.pos[0] >= room.posMin[0] &&
            item.pos[1] >= room.posMin[1] &&
            item.pos[0] < room.posMax[0] &&
            item.pos[1] < room.posMax[1]) {
            positions.push(vec2.clone(item.pos));
        }
    }

    return positions;
}

function pathBetweenPoints(gameMap: GameMap, pos0: vec2, pos1: vec2): Array<vec2> {
    const distanceField = gameMap.computeDistancesToPosition(pos1);
    const pos = vec2.clone(pos0);
    const path: Array<vec2> = [];
    while (pos[0] !== pos1[0] || pos[1] !== pos1[1]) {
        path.push(vec2.clone(pos));
        const posNext = posNextBest(gameMap, distanceField, pos);
        if (posNext[0] === pos[0] && posNext[1] === pos[1]) {
            break;
        }
        vec2.copy(pos, posNext);
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

        let walls: Array<Adjacency> = [];
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

            let roomTypeLeft = rooms[a.room_left].roomType;
            let roomTypeRight = rooms[a.room_right].roomType;

            if (roomTypeLeft == RoomType.Exterior || roomTypeRight == RoomType.Exterior) {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.PortcullisNS : TerrainType.PortcullisEW;
                placeItem(map, p[0], p[1], orientNS ? ItemType.PortcullisNS : ItemType.PortcullisEW);
            } else if (isCourtyardRoomType(roomTypeLeft) && isCourtyardRoomType(roomTypeRight)) {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.GardenDoorNS : TerrainType.GardenDoorEW;
            } else if (roomTypeLeft != RoomType.PrivateRoom || roomTypeRight != RoomType.PrivateRoom || installMasterSuiteDoor) {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p[0], p[1], orientNS ? ItemType.DoorNS : ItemType.DoorEW);
            } else {
                map.cells.at(p[0], p[1]).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
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
                const itemTypes = [ItemType.Bush, ItemType.Bush, ItemType.Bush, ItemType.Bush];
                if (dx > 2 && dy > 2) {
                    itemTypes.push(randomlyLitTorch(level));
                }
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
                itemTypes.push(randomlyLitTorch(level));
                shuffleArray(itemTypes);
                for (let y = 1; y < dy-1; ++y) {
                    placeItem(map, room.posMin[0] + 1, room.posMin[1] + y, ItemType.Chair);
                    placeItem(map, room.posMin[0] + 2, room.posMin[1] + y, itemTypes[y - 1]);
                    placeItem(map, room.posMin[0] + 3, room.posMin[1] + y, ItemType.Chair);
                }
            } else if (dy == 5 && dx >= 3 && (room.roomType == RoomType.PublicRoom || Math.random() < 0.33333)) {
                const itemTypes = new Array(dx - 2).fill(ItemType.Table);
                itemTypes.push(randomlyLitTorch(level));
                shuffleArray(itemTypes);
                for (let x = 1; x < dx-1; ++x) {
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 1, ItemType.Chair);
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 2, itemTypes[x - 1]);
                    placeItem(map, room.posMin[0] + x, room.posMin[1] + 3, ItemType.Chair);
                }
            } else if (dx > dy && (dy & 1) == 1 && Math.random() < 0.66667) {
                let y = Math.floor(room.posMin[1] + dy / 2);
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = randomlyLitTorch(level);
                const itemTypes = [torchType, furnitureType];
                shuffleArray(itemTypes);
                tryPlaceItem(map, room.posMin[0] + 1, y, itemTypes[0]);
                tryPlaceItem(map, room.posMax[0] - 2, y, itemTypes[1]);
            } else if (dy > dx && (dx & 1) == 1 && Math.random() < 0.66667) {
                let x = Math.floor(room.posMin[0] + dx / 2);
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = randomlyLitTorch(level);
                const itemTypes = [torchType, furnitureType];
                shuffleArray(itemTypes);
                tryPlaceItem(map, x, room.posMin[1] + 1, itemTypes[0]);
                tryPlaceItem(map, x, room.posMax[1] - 2, itemTypes[1]);
            } else if (dx > 3 && dy > 3) {
                const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
                const torchType = randomlyLitTorch(level);
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

function randomlyLitTorch(level: number): ItemType {
    if (level === 0) {
        return ItemType.TorchUnlit;
    }

    return (Math.random() < 0.5) ? ItemType.TorchUnlit : ItemType.TorchLit;
}

function tryPlaceItem(map: GameMap, x: number, y: number, itemType: ItemType) {
    if (doorAdjacent(map.cells, x, y)) {
        return;
    }

    if ((itemType == ItemType.TorchUnlit || itemType == ItemType.TorchLit) &&
        windowAdjacent(map.cells, x, y)) {
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

function windowAdjacent(map: CellGrid, x: number, y: number): boolean {
    if (isWindowTerrainType(map.at(x - 1, y).type)) {
        return true;
    }

    if (isWindowTerrainType(map.at(x + 1, y).type)) {
        return true;
    }

    if (isWindowTerrainType(map.at(x, y - 1).type)) {
        return true;
    }

    if (isWindowTerrainType(map.at(x, y + 1).type)) {
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

function placeLoot(totalLootToPlace: number, rooms: Array<Room>, adjacencies: Array<Adjacency>, map: GameMap) {

    let totalLootPlaced = 0;

    // Dead-end rooms automatically get loot.

    for (const room of rooms) {
        if (totalLootPlaced >= totalLootToPlace) {
            break;
        }

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
            if (tryPlaceLoot(room.posMin, room.posMax, map)) {
                ++totalLootPlaced;
            }
        }
    }

    // Master-suite rooms get loot.

    for (const room of rooms)  {
        if (totalLootPlaced >= totalLootToPlace) {
            break;
        }

        if (room.roomType != RoomType.PrivateRoom) {
            continue;
        }

        if (Math.random() < 0.2) {
            continue;
        }

        if (tryPlaceLoot(room.posMin, room.posMax, map)) {
            ++totalLootPlaced;
        }
    }

    // Place extra loot to reach desired total.

    let posMin = vec2.fromValues(0, 0);
    let posMax = vec2.fromValues(map.cells.sizeX, map.cells.sizeY);
    for (let i = 1000; i > 0 && totalLootPlaced < totalLootToPlace; --i) {
        if (tryPlaceLoot(posMin, posMax, map)) {
            ++totalLootPlaced;
        }
    }

    console.assert(totalLootPlaced === totalLootToPlace);
}

function tryPlaceLoot(posMin: vec2, posMax: vec2, map: GameMap): boolean
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
        return true;
    }

    return false;
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

function placeGuards(level: number, map: GameMap, patrolRoutes: Array<Array<vec2>>) {
    if (level <= 0) {
        return;
    }

    // Old math for desired number of guards

//    let numGuards = (level == 1) ? 1 : Math.max(2, Math.floor((numRooms * Math.min(level + 18, 40)) / 100));

    // Generate guards

    for (const patrolPath of patrolRoutes) {
        let pathIndexStart = 0;
        const guard = new Guard(patrolPath, pathIndexStart, map);
        if (level > 1 && randomInRange(5 + level) < level) {
            guard.hasTorch = true;
        }
        map.guards.push(guard);
    }
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
            const isWindow = isWindowTerrainType(cellType);
            const isWater = cellType == TerrainType.GroundWater;
            cell.moveCost = (isWall || isWindow) ? Infinity : isWater ? 4096 : 0;
            cell.blocksPlayerMove = isWall;
            cell.blocksPlayerSight = isWall;
            cell.blocksSight = isWall;
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
    return terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.DoorEW;
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
