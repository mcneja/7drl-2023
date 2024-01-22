export { createGameMap, createGameMapRoughPlans, Adjacency };

import { BooleanGrid, CellGrid, Int32Grid, ItemType, Float64Grid, GameMap, GameMapRoughPlan, TerrainType, isWindowTerrainType, updateCellInfo, updateCellItemInfo } from './game-map';
import { Guard, GuardMode } from './guard';
import { vec2 } from './my-matrix';
import { RNG } from './random';
import { State} from './types';

const roomSizeX = 5;
const roomSizeY = 5;
const outerBorder = 3;

const levelShapeInfo:Array<[number,number,number,number,number,number]> = [
    //xmin,xmax,ymin,ymax,areamin,areamax -- params used to constrain the map size
    [3,5,3,3,9,15],
    [3,5,2,5,6,12],
    [3,5,2,6,9,15],
    [3,5,2,6,12,18],
    [3,7,3,6,15,21],
    [3,7,3,6,18,24],
    [3,7,3,6,21,30],
    [5,7,4,6,24,36],
    [5,9,4,6,30,42],
    [7,9,4,6,36,48],
];

enum RoomType
{
    Exterior,
    PublicCourtyard,
    PublicRoom,
    PrivateCourtyard,
    PrivateRoom,
    Vault,
    Bedroom,
    Dining,
    PublicLibrary,
    PrivateLibrary,
}

type Room = {
    roomType: RoomType,
    group: number,
    depth: number,
    posMin: vec2,
    posMax: vec2,
    edges: Array<Adjacency>,
}

type Adjacency = {
    origin: vec2,
    dir: vec2,
    length: number,
    roomLeft: Room,
    roomRight: Room,
    nextMatching: Adjacency | null,
    door: boolean,
}

function createGameMapRoughPlans(numMaps: number, totalLoot: number, rng: RNG): Array<GameMapRoughPlan> {
    const gameMapRoughPlans: Array<GameMapRoughPlan> = [];

    // First establish the sizes of the levels
    for (let level = 0; level < numMaps; ++level) {
        const levelRNG = new RNG('lvl'+level+rng.random())
        const size = makeLevelSize(level, levelRNG);
        // const sizeX = randomHouseWidth(level);
        // const sizeY = randomHouseDepth(level);
        gameMapRoughPlans.push({
            numRoomsX: size[0],
            numRoomsY: size[1],
            totalLoot: 0,
            rng: levelRNG,
            played: false,
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

function makeLevelSize(level:number, rng:RNG) : [number, number] {
    let xmin, xmax, ymin, ymax, Amin, Amax;
    [xmin, xmax, ymin, ymax, Amin, Amax] = levelShapeInfo[level];
    const x = xmin + 2*rng.randomInRange(1+(xmax-xmin)/2);
    let y = ymin + rng.randomInRange(1+ymax-ymin);
    y = Math.min(Math.floor(Amax/x), y);
    y = Math.max(y, Math.ceil(Amin/x));
    return [x,y];
}


function createGameMap(level: number, plan: GameMapRoughPlan): [GameMap, undefined|((state:State)=>void)] {
    const rng = plan.rng;
    rng.reset();
    const inside = makeSiheyuanRoomGrid(plan.numRoomsX, plan.numRoomsY, rng);

    const mirrorX: boolean = true;
    const mirrorY: boolean = false;

    const [offsetX, offsetY] = offsetWalls(mirrorX, mirrorY, inside, rng);

    // Make a set of rooms.

    const [rooms, roomIndex] = createRooms(inside, offsetX, offsetY);

    // Compute a list of room adjacencies.

    const adjacencies = computeAdjacencies(mirrorX, mirrorY, offsetX, offsetY, rooms, roomIndex);
    storeAdjacenciesInRooms(adjacencies);

    // Connect rooms together.

    connectRooms(rooms, adjacencies, rng);

    // Join a pair of rooms together.
    if(level>0) makeDoubleRooms(rooms, adjacencies, rng);

    // Compute room distances from entrance.

    computeRoomDepths(rooms);

    // Assign types to the rooms.

    assignRoomTypes(rooms, level, rng);

    // Create the actual map

    const map = createBlankGameMap(rooms);

    // Render doors and windows.

    renderWalls(adjacencies, map, rng);

    // Render floors.

    renderRooms(level, rooms, map, rng);

    // Set player start position

    map.playerStartPos = playerStartPosition(adjacencies, map);

    // Additional decorations

    const outerPerimeter = outerBuildingPerimeter(map, map.playerStartPos);

    placeExteriorBushes(map, outerPerimeter, rng);
    placeFrontPillars(map);

    // Convert walls to proper straight, corner, T-junction, cross tiles

    fixupWalls(map.cells);

    // Cache info about how the cells in the map affect sound, lighting, and movement

    cacheCellInfo(map);

    // Place patrol routes

    const patrolRoutes = placePatrolRoutes(level, map, rooms, adjacencies, outerPerimeter, rng);

    // Place loot

    const needKey = map.items.find((item) => item.type === ItemType.LockedDoorNS || item.type === ItemType.LockedDoorEW) !== undefined;
    const guardsAvailableForLoot = patrolRoutes.length - (needKey ? 1 : 0);
    const guardLoot = Math.min(Math.floor(level/3), Math.min(guardsAvailableForLoot, plan.totalLoot));

    placeLoot(plan.totalLoot - guardLoot, rooms, map, rng);

    // Put guards on the patrol routes

    placeGuards(level, map, patrolRoutes, guardLoot, needKey, rng);

    const customUpdater = customizeLevelGen(level, rooms, map, rng);

    // Final setup

    markExteriorAsSeen(map);

    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    map.adjacencies = adjacencies;

    return [map, customUpdater];
}

function makeSiheyuanRoomGrid(sizeX: number, sizeY: number, rng: RNG): BooleanGrid {
    const inside = new BooleanGrid(sizeX, sizeY, true);

    const halfX = Math.floor((sizeX + 1) / 2);

    const numCourtyardRoomsHalf = Math.floor((sizeY * halfX) / 4);
    for (let i = numCourtyardRoomsHalf; i > 0; --i) {
        const x = rng.randomInRange(halfX);
        const y = rng.randomInRange(sizeY);
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
    inside: BooleanGrid,
    rng: RNG): [offsetX: Int32Grid, offsetY: Int32Grid]
{
    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    const offsetX = new Int32Grid(roomsX + 1, roomsY, 0);
    const offsetY = new Int32Grid(roomsX, roomsY + 1, 0);

    const straightOutsideWalls = false;

    if (straightOutsideWalls) {
        let i = rng.randomInRange(3) - 1;
        for (let y = 0; y < roomsY; ++y)
            offsetX.set(0, y, i);

        i = rng.randomInRange(3) - 1;
        for (let y = 0; y < roomsY; ++y)
            offsetX.set(roomsX, y, i);

        i = rng.randomInRange(3) - 1;
        for (let x = 0; x < roomsX; ++x)
            offsetY.set(x, 0, i);

        i = rng.randomInRange(3) - 1;
        for (let x = 0; x < roomsX; ++x)
            offsetY.set(x, roomsY, i);

        for (let x = 1; x < roomsX; ++x) {
            for (let y = 0; y < roomsY; ++y) {
                offsetX.set(x, y, rng.randomInRange(3) - 1);
            }
        }

        for (let x = 0; x < roomsX; ++x) {
            for (let y = 1; y < roomsY; ++y) {
                offsetY.set(x, y, rng.randomInRange(3) - 1);
            }
        }
    } else {
        for (let x = 0; x < roomsX + 1; ++x) {
            for (let y = 0; y < roomsY; ++y) {
                offsetX.set(x, y, rng.randomInRange(3) - 1);
            }
        }

        for (let x = 0; x < roomsX; ++x) {
            for (let y = 0; y < roomsY + 1; ++y) {
                offsetY.set(x, y, rng.randomInRange(3) - 1);
            }
        }
    }

    for (let x = 1; x < roomsX; ++x) {
        for (let y = 1; y < roomsY; ++y) {
            if (rng.randomInRange(2) === 0) {
                offsetX.set(x, y, offsetX.get(x, y-1));
            } else {
                offsetY.set(x, y, offsetY.get(x-1, y));
            }
        }
    }

    // Do mirroring

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

    // Add in room widths

    for (let x = 0; x < roomsX + 1; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            offsetX.set(x, y, offsetX.get(x, y) + x * roomSizeX);
        }
    }

    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY + 1; ++y) {
            offsetY.set(x, y, offsetY.get(x, y) + y * roomSizeY);
        }
    }

    // Translate the building so it abuts the X and Y axes with outerBorder padding

    let roomOffsetX = Number.MIN_SAFE_INTEGER;
    for (let y = 0; y < roomsY; ++y) {
        roomOffsetX = Math.max(roomOffsetX, -offsetX.get(0, y));
    }
    roomOffsetX += outerBorder;

    for (let x = 0; x < roomsX + 1; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            offsetX.set(x, y, offsetX.get(x, y) + roomOffsetX);
        }
    }

    let roomOffsetY = Number.MIN_SAFE_INTEGER;
    for (let x = 0; x < roomsX; ++x) {
        roomOffsetY = Math.max(roomOffsetY, -offsetY.get(x, 0));
    }
    roomOffsetY += outerBorder;

    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY + 1; ++y) {
            offsetY.set(x, y, offsetY.get(x, y) + roomOffsetY);
        }
    }

    return [offsetX, offsetY];
}

function createBlankGameMap(rooms: Array<Room>): GameMap {
    let mapSizeX = 0;
    let mapSizeY = 0;

    for (const room of rooms) {
        mapSizeX = Math.max(mapSizeX, room.posMax[0]);
        mapSizeY = Math.max(mapSizeY, room.posMax[1]);
    }

    mapSizeX += outerBorder + 1;
    mapSizeY += outerBorder + 1;

    const cells = new CellGrid(mapSizeX, mapSizeY);

    return new GameMap(cells);
}

function createRooms(
    inside: BooleanGrid,
    offsetX: Int32Grid,
    offsetY: Int32Grid): [Array<Room>, Int32Grid] {
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

    return [rooms, roomIndex];
}

function computeAdjacencies(
    mirrorX: boolean,
    mirrorY: boolean,
    offsetX: Int32Grid,
    offsetY: Int32Grid,
    rooms: Array<Room>,
    roomIndex: Int32Grid
): Array<Adjacency> {

    let roomsX = roomIndex.sizeX;
    let roomsY = roomIndex.sizeY;

    const adjacencies: Array<Adjacency> = [];

    {
        const adjacencyRows: Array<Array<Adjacency>> = [];

        // Rooms along the bottom are all adjacent along their bottoms to room 0 (the exterior)

        {
            const adjacencyRow: Array<Adjacency> = [];

            let ry = 0;

            for (let rx = 0; rx < roomsX; ++rx) {
                let x0 = offsetX.get(rx, ry);
                let x1 = offsetX.get(rx+1, ry);
                let y = offsetY.get(rx, ry);

                const adj: Adjacency = {
                    origin: vec2.fromValues(x0, y),
                    dir: vec2.fromValues(1, 0),
                    length: x1 - x0,
                    roomLeft: rooms[roomIndex.get(rx, ry)],
                    roomRight: rooms[0],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
            }

            adjacencyRows.push(adjacencyRow);
        }

        // Along the interior lines, generate adjacencies between touching pairs of rooms on either side

        for (let ry = 1; ry < roomsY; ++ry) {
            const adjacencyRow: Array<Adjacency> = [];

            function addAdj(y: number, x0: number, x1: number, iRoomLeft: number, iRoomRight: number) {
                if (x1 - x0 <= 0) {
                    return;
                }
    
                const adj: Adjacency = {
                    origin: vec2.fromValues(x0, y),
                    dir: vec2.fromValues(1, 0),
                    length: x1 - x0,
                    roomLeft: rooms[iRoomLeft],
                    roomRight: rooms[iRoomRight],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
            }
    
            let rxLeft = 0;
            let rxRight = 0;

            while (rxLeft < offsetX.sizeX && rxRight < offsetX.sizeX) {
                const xLeft = (rxLeft < offsetX.sizeX) ? offsetX.get(rxLeft, ry) : Infinity;
                const xRight = (rxRight < offsetX.sizeX) ? offsetX.get(rxRight, ry - 1) : Infinity;
                const y = offsetY.get(Math.max(0, Math.max(rxLeft, rxRight) - 1), ry);

                if (xLeft < xRight) {
                    const xLeftNext = Math.min(xRight, (rxLeft + 1 < offsetX.sizeX) ? offsetX.get(rxLeft + 1, ry) : Infinity);
                    const iRoomLeft = (rxLeft >= roomIndex.sizeX) ? 0 : roomIndex.get(rxLeft, ry);
                    const iRoomRight = (rxRight <= 0) ? 0 : roomIndex.get(rxRight - 1, ry - 1);
                    addAdj(y, xLeft, xLeftNext, iRoomLeft, iRoomRight);
                    ++rxLeft;
                } else {
                    const xRightNext = Math.min(xLeft, (rxRight + 1 < offsetX.sizeX) ? offsetX.get(rxRight + 1, ry - 1) : Infinity);
                    const iRoomLeft = (rxLeft <= 0) ? 0 : roomIndex.get(rxLeft - 1, ry);
                    const iRoomRight = (rxRight >= roomIndex.sizeX) ? 0 : roomIndex.get(rxRight, ry - 1);
                    addAdj(y, xRight, xRightNext, iRoomLeft, iRoomRight);
                    ++rxRight;
                }
            }

            adjacencyRows.push(adjacencyRow);
        }

        // Rooms along the top are all adjacent along their tops to room 0 (the exterior)

        {
            const adjacencyRow: Array<Adjacency> = [];

            let ry = roomsY;

            for (let rx = 0; rx < roomsX; ++rx) {
                let x0 = offsetX.get(rx, ry-1);
                let x1 = offsetX.get(rx+1, ry-1);
                let y = offsetY.get(rx, ry);

                const adj: Adjacency = {
                    origin: vec2.fromValues(x0, y),
                    dir: vec2.fromValues(1, 0),
                    length: x1 - x0,
                    roomLeft: rooms[0],
                    roomRight: rooms[roomIndex.get(rx, ry - 1)],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
            }

            adjacencyRows.push(adjacencyRow);
        }

        if (mirrorX) {
            for (let ry = 0; ry < adjacencyRows.length; ++ry) {
                let row = adjacencyRows[ry];

                let i = 0;
                let j = row.length - 1;
                while (i <= j) {
                    let adj0 = row[i];
                    let adj1 = row[j];

                    adj0.nextMatching = adj1;
                    adj1.nextMatching = adj0;

                    if (i !== j) {
                        // Flip edge adj1 to point the opposite direction
                        vec2.scaleAndAdd(adj1.origin, adj1.origin, adj1.dir, adj1.length);
                        vec2.negate(adj1.dir, adj1.dir);
                        [adj1.roomLeft, adj1.roomRight] = [adj1.roomRight, adj1.roomLeft];
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
                    adj0.nextMatching = adj1;
                    adj1.nextMatching = adj0;
                }

                ry0 += 1;
                ry1 -= 1;
            }
        }
    }

    {
        let adjacencyRows: Array<Array<Adjacency>> = [];

        // Rooms along the left are all adjacent on their left to room 0 (the exterior)

        {
            const adjacencyRow: Array<Adjacency> = [];

            let rx = 0;

            for (let ry = 0; ry < roomsY; ++ry) {
                let y0 = offsetY.get(rx, ry);
                let y1 = offsetY.get(rx, ry+1);
                let x = offsetX.get(rx, ry);

                const adj: Adjacency = {
                    origin: vec2.fromValues(x, y0),
                    dir: vec2.fromValues(0, 1),
                    length: y1 - y0,
                    roomLeft: rooms[0],
                    roomRight: rooms[roomIndex.get(rx, ry)],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
            }

            adjacencyRows.push(adjacencyRow);
        }

        // Along the interior lines, generate adjacencies between touching pairs of rooms on either side

        for (let rx = 1; rx < roomsX; ++rx) {
            const adjacencyRow: Array<Adjacency> = [];

            function addAdj(x: number, y0: number, y1: number, iRoomLeft: number, iRoomRight: number) {
                if (y1 - y0 <= 0) {
                    return;
                }
    
                const adj: Adjacency = {
                    origin: vec2.fromValues(x, y0),
                    dir: vec2.fromValues(0, 1),
                    length: y1 - y0,
                    roomLeft: rooms[iRoomLeft],
                    roomRight: rooms[iRoomRight],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
            }
    
            let ryLeft = 0;
            let ryRight = 0;

            while (ryLeft < offsetY.sizeY && ryRight < offsetY.sizeY) {
                const yLeft = (ryLeft < offsetY.sizeY) ? offsetY.get(rx - 1, ryLeft) : Infinity;
                const yRight = (ryRight < offsetY.sizeY) ? offsetY.get(rx, ryRight) : Infinity;
                const x = offsetX.get(rx, Math.max(0, Math.max(ryLeft, ryRight) - 1));

                if (yLeft < yRight) {
                    const yLeftNext = Math.min(yRight, (ryLeft + 1 < offsetY.sizeY) ? offsetY.get(rx - 1, ryLeft + 1) : Infinity);
                    const iRoomLeft = (ryLeft >= roomIndex.sizeY) ? 0 : roomIndex.get(rx - 1, ryLeft);
                    const iRoomRight = (ryRight <= 0) ? 0 : roomIndex.get(rx, ryRight - 1);
                    addAdj(x, yLeft, yLeftNext, iRoomLeft, iRoomRight);
                    ++ryLeft;
                } else {
                    const yRightNext = Math.min(yLeft, (ryRight + 1 < offsetY.sizeY) ? offsetY.get(rx, ryRight + 1) : Infinity);
                    const iRoomLeft = (ryLeft <= 0) ? 0 : roomIndex.get(rx - 1, ryLeft - 1);
                    const iRoomRight = (ryRight >= roomIndex.sizeY) ? 0 : roomIndex.get(rx, ryRight);
                    addAdj(x, yRight, yRightNext, iRoomLeft, iRoomRight);
                    ++ryRight;
                }
            }

            adjacencyRows.push(adjacencyRow);
        }

        // Rooms along the right are all adjacent on their right to room 0 (the exterior)

        {
            const adjacencyRow: Array<Adjacency> = [];

            let rx = roomsX;

            for (let ry = 0; ry < roomsY; ++ry) {
                let y0 = offsetY.get(rx-1, ry);
                let y1 = offsetY.get(rx-1, ry+1);
                let x = offsetX.get(rx, ry);

                const adj: Adjacency = {
                    origin: vec2.fromValues(x, y0),
                    dir: vec2.fromValues(0, 1),
                    length: y1 - y0,
                    roomLeft: rooms[roomIndex.get(rx - 1, ry)],
                    roomRight: rooms[0],
                    nextMatching: null,
                    door: false,
                };

                adjacencyRow.push(adj);
                adjacencies.push(adj);
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

                    adj0.nextMatching = adj1;
                    adj1.nextMatching = adj0;

                    // Flip edge a1 to point the opposite direction
                    vec2.scaleAndAdd(adj1.origin, adj1.origin, adj1.dir, adj1.length);
                    vec2.negate(adj1.dir, adj1.dir);
                    [adj1.roomLeft, adj1.roomRight] = [adj1.roomRight, adj1.roomLeft];
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
                    adj0.nextMatching = adj1;
                    adj1.nextMatching = adj0;
                }

                ry0 += 1;
                ry1 -= 1;
            }
        }
    }

    return adjacencies;
}

function storeAdjacenciesInRooms(adjacencies: Array<Adjacency>) {
    for (const adj of adjacencies) {
        adj.roomLeft.edges.push(adj);
        adj.roomRight.edges.push(adj);
    }
}

function connectRooms(rooms: Array<Room>, adjacencies: Array<Adjacency>, rng: RNG) {

    // Collect sets of edges that are mirrors of each other

    const edgeSets = getEdgeSets(adjacencies, rng);

    // Connect all adjacent courtyard rooms together.

    for (const adj of adjacencies) {
        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;
        if (room0.roomType != RoomType.PublicCourtyard || room1.roomType != RoomType.PublicCourtyard) {
            continue;
        }

        if (adj.length < 2) {
            continue;
        }

        adj.door = true;
        const group0 = room0.group;
        const group1 = room1.group;
        joinGroups(rooms, group0, group1);
    }

    // Connect all the interior rooms with doors.

    for (const edgeSet of edgeSets) {

        // This is pretty bad; I just want to grab one adjacency from the set to decide
        // whether to put doors in all of them, since they all should have the same
        // situation.

        let addDoor = false;

        for (const adj of edgeSet) {
            if (adj.roomLeft.roomType !== RoomType.PublicRoom) {
                break;
            }
            if (adj.roomRight.roomType !== RoomType.PublicRoom) {
                break;
            }

            if (adj.roomLeft.group !== adj.roomRight.group || rng.random() < 0.4) {
                addDoor = true;
            }

            break;
        }

        if (addDoor) {
            for (const adj of edgeSet) {
                const room0 = adj.roomLeft;
                const room1 = adj.roomRight;

                const group0 = room0.group;
                const group1 = room1.group;

                adj.door = true;
                joinGroups(rooms, group0, group1);
            }
        }
    }

    // Create doors between the interiors and the courtyard areas.

    for (const edgeSet of edgeSets) {

        let addDoor = false;

        for (const adj of edgeSet) {
            if (adj.roomLeft.roomType === adj.roomRight.roomType) {
                break;
            }
            if (adj.roomLeft.roomType === RoomType.Exterior) {
                break;
            }
            if (adj.roomRight.roomType === RoomType.Exterior) {
                break;
            }

            if (adj.roomLeft.group !== adj.roomRight.group || rng.random() < 0.4) {
                addDoor = true;
            }

            break;
        }

        if (addDoor) {
            for (const adj of edgeSet) {
                const room0 = adj.roomLeft;
                const room1 = adj.roomRight;

                const group0 = room0.group;
                const group1 = room1.group;

                adj.door = true;
                joinGroups(rooms, group0, group1);
            }
        }
    }

    // Create a door to the surrounding exterior.

    const adjDoor = frontDoorAdjacency(edgeSets);
    if (adjDoor !== null) {
        adjDoor.door = true;

        // Break symmetry if the door is off center.

        let adjDoorMirror = adjDoor.nextMatching;
        if (adjDoorMirror !== null && adjDoorMirror !== adjDoor) {
            adjDoor.nextMatching = null;
            adjDoorMirror.nextMatching = null;
        }
    }

    // Occasionally create a back door to the exterior.

    if (rng.randomInRange(100) < rooms.length) {
        const adjDoor = backDoorAdjacency(edgeSets);
        if (adjDoor !== null) {
            adjDoor.door = true;

            // Break symmetry if the door is off center.

            let adjDoorMirror = adjDoor.nextMatching;
            if (adjDoorMirror !== null && adjDoorMirror !== adjDoor) {
                adjDoor.nextMatching = null;
                adjDoorMirror.nextMatching = null;
            }
        }
    }
}

function getEdgeSets(adjacencies: Array<Adjacency>, rng: RNG): Array<Set<Adjacency>> {
    const edgeSets: Array<Set<Adjacency>> = [];
    const adjHandled: Set<Adjacency> = new Set();

    for (const adj of adjacencies) {
        if (adj.length < 2) {
            continue;
        }
        if (adjHandled.has(adj)) {
            continue;
        }
        const adjMirror = adj.nextMatching;
        const setAdjMirror: Set<Adjacency> = new Set();
        setAdjMirror.add(adj);
        adjHandled.add(adj);
        if (adjMirror !== null) {
            setAdjMirror.add(adjMirror);
            adjHandled.add(adjMirror);
        }
        edgeSets.push(setAdjMirror);
    }

    rng.shuffleArray(edgeSets);

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

function frontDoorAdjacency(edgeSets: Array<Set<Adjacency>>): Adjacency | null {
    const adjs = [];

    for (const edgeSet of edgeSets) {
        for (const adj of edgeSet) {
            if (adj.dir[0] == 0) {
                continue;
            }

            if (adj.roomLeft.roomType === RoomType.Exterior && adj.roomRight.roomType !== RoomType.Exterior && adj.dir[0] < 0) {
                adjs.push(adj);
            } else if (adj.roomLeft.roomType !== RoomType.Exterior && adj.roomRight.roomType === RoomType.Exterior && adj.dir[0] > 0) {
                adjs.push(adj);
            }
        }
    }

    adjs.sort((adj0, adj1) => (adj0.origin[0] + adj0.dir[0] * adj0.length / 2) - (adj1.origin[0] + adj1.dir[0] * adj1.length / 2));

    if (adjs.length <= 0) {
        return null;
    }

    return adjs[Math.floor(adjs.length / 2)];
}

function backDoorAdjacency(edgeSets: Array<Set<Adjacency>>): Adjacency | null {
    const adjs = [];

    for (const edgeSet of edgeSets) {
        for (const adj of edgeSet) {
            if (adj.dir[0] == 0) {
                continue;
            }

            if (adj.roomLeft.roomType === RoomType.Exterior && adj.roomRight.roomType !== RoomType.Exterior && adj.dir[0] > 0) {
                adjs.push(adj);
            } else if (adj.roomLeft.roomType !== RoomType.Exterior && adj.roomRight.roomType === RoomType.Exterior && adj.dir[0] < 0) {
                adjs.push(adj);
            }
        }
    }

    adjs.sort((adj0, adj1) => (adj0.origin[0] + adj0.dir[0] * adj0.length / 2) - (adj1.origin[0] + adj1.dir[0] * adj1.length / 2));

    if (adjs.length <= 0) {
        return null;
    }

    return adjs[Math.floor(adjs.length / 2)];
}

function computeRoomDepths(rooms: Array<Room>) {
    // Start from rooms with exterior doors

    let unvisited = rooms.length;

    const roomsToVisit: Array<Room> = [];

    for (const room of rooms) {
        if (room.roomType === RoomType.Exterior) {
            room.depth = 0;
        } else if (hasExteriorDoor(room)) {
            room.depth = 1;
            roomsToVisit.push(room);
        } else {
            room.depth = unvisited;
        }
    }

    // Visit rooms in breadth-first order, assigning them distances from the seed rooms.

    for (let iRoom = 0; iRoom < roomsToVisit.length; ++iRoom) {
        const room = roomsToVisit[iRoom];

        const depthNext = room.depth + 1;

        for (const adj of room.edges) {
            if (!adj.door) {
                continue;
            }

            const roomNeighbor = (adj.roomLeft == room) ? adj.roomRight : adj.roomLeft;

            if (roomNeighbor.depth > depthNext) {
                roomNeighbor.depth = depthNext;
                roomsToVisit.push(roomNeighbor);
            }
        }
    }
}

function hasExteriorDoor(room: Room): boolean {
    for (const adj of room.edges) {
        if (!adj.door) {
            continue;
        }
        if (adj.roomLeft === room) {
            if (adj.roomRight.roomType === RoomType.Exterior) {
                return true;
            }
        } else {
            if (adj.roomLeft.roomType === RoomType.Exterior) {
                return true;
            }
        }
    }
    return false;
}

function assignRoomTypes(rooms: Array<Room>, level: number, rng: RNG) {

    // Assign master-suite room type to the inner rooms.

    let maxDepth = 0;
    for (const room of rooms) {
        maxDepth = Math.max(maxDepth, room.depth);
    }

    const targetNumMasterRooms = Math.floor((rooms.length - 1) / 4);

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

        for (const room of rooms) {
            if (room.roomType != RoomType.PublicCourtyard) {
                continue;
            }

            for (const adj of room.edges) {
                let roomOther = (adj.roomLeft != room) ? adj.roomLeft : adj.roomRight;

                if (roomOther.roomType == RoomType.PrivateCourtyard) {
                    room.roomType = RoomType.PrivateCourtyard;
                    changed = true;
                    break;
                }
            }
        }

        if (!changed) {
            break;
        }
    }

    // Pick a dead-end room to be a Vault room

    if (level > 4) {
        const deadEndRooms = [];

        for (const room of rooms) {
            if (room.roomType === RoomType.Exterior) {
                continue;
            }

            // Bug: should be able to convert courtyard rooms to treasure rooms, but the walls are getting
            // plotted much earlier, between rooms that have been designated inside and outside. So we
            // can't change an outside room (a courtyard) into an inside room (treasure) and get correct
            // walls around it.

            if (room.roomType === RoomType.PrivateCourtyard || room.roomType === RoomType.PublicCourtyard) {
                continue;
            }

            let numDoors = 0;
            for (const adj of room.edges) {
                if (adj.door) {
                    ++numDoors;
                }
            }

            if (numDoors <= 1) {
                deadEndRooms.push(room);
            }
        }

        if (deadEndRooms.length > 0) {
            deadEndRooms[rng.randomInRange(deadEndRooms.length)].roomType = RoomType.Vault;
        }
    }

    // Assign private rooms with only one or two entrances to be bedrooms, if they are large enough
    // TODO: Ideally bedrooms need to be on a dead-end branch of the house (low betweenness)

    for (const room of rooms) {
        if (room.roomType !== RoomType.PrivateRoom) {
            continue;
        }

        const sizeX = room.posMax[0] - room.posMin[0];
        if (sizeX < 3) {
            continue;
        }

        const sizeY = room.posMax[1] - room.posMin[1];
        if (sizeY < 3) {
            continue;
        }

        if (sizeX * sizeY > 25) {
            continue;
        }

        let numDoors = 0;
        for (const adj of room.edges) {
            if (adj.door) {
                ++numDoors;
            }
        }

        if (numDoors <= 2) {
            room.roomType = RoomType.Bedroom;
        }
    }

    // TODO: All these rooms should be chosen in round-robin fashion, where we ensure we've got
    // at least one of everything important for a given mansion size, before then allocating any
    // remaining rooms.

    // Pick rooms to be dining rooms

    for (const room of chooseRooms(rooms, roomCanBeDining, Math.ceil(rooms.length / 21), rng)) {
        room.roomType = RoomType.Dining;
    }

    // Pick rooms to be libraries

    for (const room of chooseRooms(rooms, roomCanBePublicLibrary, Math.ceil(rooms.length / 42), rng)) {
        room.roomType = RoomType.PublicLibrary;
    }

    for (const room of chooseRooms(rooms, roomCanBePrivateLibrary, Math.ceil(rooms.length / 42), rng)) {
        room.roomType = RoomType.PrivateLibrary;
    }
}

function chooseRooms(rooms: Array<Room>, acceptRoom: (room: Room) => boolean, maxRooms: number, rng: RNG): Array<Room> {
    const acceptableRooms = rooms.filter(acceptRoom);
    rng.shuffleArray(acceptableRooms);
    return acceptableRooms.slice(0, maxRooms);
}

function roomCanBeDining(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    if (sizeX < 5) {
        return false;
    }

    const sizeY = room.posMax[1] - room.posMin[1];
    if (sizeY < 5) {
        return false;
    }

    return true;
}

function roomCanBePublicLibrary(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];

    if (Math.min(sizeX, sizeY) < 4) {
        return false;
    }

    if (Math.max(sizeX, sizeY) < 5) {
        return false;
    }

    return true;
}

function roomCanBePrivateLibrary(room: Room): boolean {
    if (room.roomType !== RoomType.PrivateRoom) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];

    if (Math.min(sizeX, sizeY) < 4) {
        return false;
    }

    if (Math.max(sizeX, sizeY) < 5) {
        return false;
    }

    return true;
}

function removableAdjacency(adjacencies: Array<Adjacency>, rng: RNG): Adjacency | undefined {
    const removableAdjs: Array<[Adjacency, number]> = [];

    for (const adj of adjacencies) {
        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        if (!adj.door) {
            continue;
        }

        if (room0.roomType !== room1.roomType) {
            continue;
        }

        if (adj.dir[1] === 0) {
            // Horizontal adjacency
            if (adj.length !== 1 + (room0.posMax[0] - room0.posMin[0])) {
                continue;
            }
            if (adj.length !== 1 + (room1.posMax[0] - room1.posMin[0])) {
                continue;
            }
        } else {
            // Vertical adjacency
            if (adj.length !== 1 + (room0.posMax[1] - room0.posMin[1])) {
                continue;
            }
            if (adj.length !== 1 + (room1.posMax[1] - room1.posMin[1])) {
                continue;
            }
        }

        // Compute the area of the merged room
        const xMin = Math.min(room0.posMin[0], room1.posMin[0]);
        const yMin = Math.min(room0.posMin[1], room1.posMin[1]);
        const xMax = Math.max(room0.posMax[0], room1.posMax[0]);
        const yMax = Math.max(room0.posMax[1], room1.posMax[1]);
        const rx = xMax - xMin;
        const ry = yMax - yMin;
        const area = rx * ry;

        // Don't let rooms get too big
        if (area > roomSizeX * roomSizeY * 30) {
            continue;
        }

        const aspect = Math.max(rx, ry) / Math.min(rx, ry);

        removableAdjs.push([adj, aspect]);
    }

    if (removableAdjs.length <= 0) {
        return undefined;
    }

    rng.shuffleArray(removableAdjs);
    removableAdjs.sort((a, b) => a[1] - b[1]);

    return removableAdjs[0][0];
}

function removeAdjacency(rooms: Array<Room>, adjacencies: Array<Adjacency>, adj: Adjacency) {
    const room0 = adj.roomLeft;
    const room1 = adj.roomRight;

    // Copy all adjacencies except for adj from room1 to room0
    // Adjust all of the adjacencies pointing at room1 to point to room0 instead

    for (const adjMove of room1.edges) {
        if (adjMove !== adj) {
            room0.edges.push(adjMove);
            if (adjMove.roomLeft === room1) {
                adjMove.roomLeft = room0;
            } else {
                console.assert(adjMove.roomRight === room1);
                adjMove.roomRight = room0;
            }
        }
    }

    // Resize room0 to encompass room1

    const posMin = vec2.fromValues(
        Math.min(room0.posMin[0], room1.posMin[0]),
        Math.min(room0.posMin[1], room1.posMin[1]));
    const posMax = vec2.fromValues(
        Math.max(room0.posMax[0], room1.posMax[0]),
        Math.max(room0.posMax[1], room1.posMax[1]));

    vec2.copy(room0.posMin, posMin);
    vec2.copy(room0.posMax, posMax);

    room0.depth = Math.min(room0.depth, room1.depth);

    // Remove adj from its twin

    const adjMatch = adj.nextMatching;
    if (adjMatch !== null) {
        adjMatch.nextMatching = null;
    }

    // Remove adj from adjacencies and from room0.edges

    removeByValue(adjacencies, adj);
    removeByValue(room0.edges, adj);

    // Remove room1 from rooms

    removeByValue(rooms, room1);

    // Join adjacencies between pairs of rooms to form longer adjacencies

    while (tryJoinCollinearAdjacencies(adjacencies, room0)) {
        ; // everything happens in the loop condition
    }
}

function tryJoinCollinearAdjacencies(adjacencies: Array<Adjacency>, room0: Room): boolean {
    for (const adj0 of room0.edges) {
        for (const adj1 of room0.edges) {
            if (adj0 === adj1) {
                continue;
            }

            // Edges adj0 and adj1 need to have parallel directions and have the same rooms on either side
            // Figure out which room is on the other side of the two edges from room0

            let room1;
            
            if (adj0.roomLeft === room0) {
                if (!(adj1.roomLeft  === room0 && adj0.roomRight === adj1.roomRight && adj0.dir[0] ===  adj1.dir[0] && adj0.dir[1] ===  adj1.dir[1]) &&
                    !(adj1.roomRight === room0 && adj0.roomRight === adj1.roomLeft  && adj0.dir[0] === -adj1.dir[0] && adj0.dir[1] === -adj1.dir[1])) {
                    continue;
                }
                room1 = adj0.roomRight;
            } else {
                if (!(adj1.roomRight === room0 && adj0.roomLeft === adj1.roomLeft  && adj0.dir[0] ===  adj1.dir[0] && adj1.dir[1] ===  adj1.dir[1]) &&
                    !(adj1.roomLeft  === room0 && adj0.roomLeft === adj1.roomRight && adj0.dir[0] === -adj1.dir[0] && adj1.dir[1] === -adj1.dir[1])) {
                    continue;
                }
                room1 = adj0.roomLeft;
            }

            // Compute the new origin and length for the combined edge

            const x0 = (adj0.dir[0] >= 0) ? Math.min(adj0.origin[0], adj1.origin[0]) : Math.max(adj0.origin[0], adj1.origin[0]);
            const y0 = (adj0.dir[1] >= 0) ? Math.min(adj0.origin[1], adj1.origin[1]) : Math.max(adj0.origin[1], adj1.origin[1]);
            const length = adj0.length + adj1.length;

            // Store combined origin and length on adj0, the edge we're keeping

            adj0.origin[0] = x0;
            adj0.origin[1] = y0;
            adj0.length = length;

            // Break all symmetry links

            if (adj0.nextMatching !== null) {
                adj0.nextMatching.nextMatching = null;
            }
            if (adj1.nextMatching !== null) {
                adj1.nextMatching.nextMatching = null;
            }
            adj0.nextMatching = null;

            // If either edge had a door, the combined edge must have a door, since we already established connectivity.

            adj0.door = adj0.door || adj1.door;

            // Remove edge adj1 from the rooms and the overall list of adjacencies

            removeByValue(room0.edges, adj1);
            removeByValue(room1.edges, adj1);
            removeByValue(adjacencies, adj1);

            return true;
        }
    }

    return false;
}

function removeByValue<T>(array: Array<T>, value: T) {
    const i = array.indexOf(value);
    array.splice(i, 1);
}

function makeDoubleRooms(rooms: Array<Room>, adjacencies: Array<Adjacency>, rng: RNG) {
    rng.shuffleArray(adjacencies);

    for (let numMergeAttempts = 2 * Math.floor(rooms.length / 12); numMergeAttempts > 0; --numMergeAttempts) {
        const adj = removableAdjacency(adjacencies, rng);
        if (adj === undefined) {
            return;
        }

//        const adjMirror = adj.nextMatching;

        removeAdjacency(rooms, adjacencies, adj);
//        if (adjMirror !== null && adjMirror !== adj && adjMirror.roomLeft.roomType === adjMirror.roomRight.roomType) {
//            removeAdjacency(rooms, adjacencies, adjMirror);
//        }
    }
}

type PatrolNode = {
    room: Room;
    nodeNext: PatrolNode | null;
    nodePrev: PatrolNode | null;
    visited: boolean;
}

function placePatrolRoutes(level: number, gameMap: GameMap, rooms: Array<Room>, 
    adjacencies: Array<Adjacency>, outerPerimeter: Array<vec2>, rng: RNG): Array<Array<vec2>> {

    // Keep adjacencies that connect interior rooms via a door; shuffle them

    const adjacenciesShuffled = adjacencies.filter((adj) =>
        adj.door &&
        adj.roomLeft.roomType !== RoomType.Exterior &&
        adj.roomRight.roomType !== RoomType.Exterior &&
        adj.roomLeft.roomType !== RoomType.Vault &&
        adj.roomRight.roomType !== RoomType.Vault);
    rng.shuffleArray(adjacenciesShuffled);

    // Build a set of nodes for joining into routes. Initially there will be one per room.
    // More may be added if rooms participate in more than one route, or if they are
    // visited multiple times in the route.

    const nodes: Array<PatrolNode> = [];
    const nodeForRoom: Map<Room, PatrolNode> = new Map();

    for (const room of rooms) {
        const node = {
            room: room,
            nodeNext: null,
            nodePrev: null,
            visited: false,
        };
        nodes.push(node);
        nodeForRoom.set(room, node);
    }

    // Join rooms onto the start or end (or both) of patrol routes

    for (const adj of adjacenciesShuffled) {
        let node0 = nodeForRoom.get(adj.roomLeft);
        let node1 = nodeForRoom.get(adj.roomRight);

        if (node0 === undefined || node1 === undefined) {
            continue;
        }

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
        const node0 = nodeForRoom.get(adj.roomLeft);
        const node1 = nodeForRoom.get(adj.roomRight);

        if (node0 === undefined || node1 === undefined) {
            continue;
        }

        if (node0.nodeNext == null && node0.nodePrev == null && node1.nodeNext != null && node1.nodePrev != null) {
            // Old: node1 --> node3
            // New: node1 --> node0 --> node2 --> node3 (where node2 is the same room as node1)
            const node3 = node1.nodeNext;
            const node2 = {
                room: node1.room,
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
                room: node0.room,
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

            const room = node.room;
            const roomNext = nodeNext.room;
            const roomPrev = nodePrev.room;

            const posStart = vec2.create();
            posInDoor(posStart, room, roomPrev, gameMap);

            if (roomNext === roomPrev) {
                // Have to get ourselves from the door to an activity station and then back to the door.
                const positions = activityStationPositions(gameMap, room);
                const posMid = vec2.create();
                if (positions.length > 0) {
                    vec2.copy(posMid, positions[rng.randomInRange(positions.length)]);
                } else {
                    posBesideDoor(posMid, room, roomPrev, gameMap);
                }

                for (const pos of pathBetweenPoints(gameMap, posStart, posMid)) {
                    patrolPositions.push(pos);
                }

                patrolPositions.push(vec2.clone(posMid));
                patrolPositions.push(vec2.clone(posMid));
                patrolPositions.push(vec2.clone(posMid));

                vec2.copy(posStart, posMid);
            }

            const posEnd = vec2.create();
            posInDoor(posEnd, room, roomNext, gameMap);

            const path = pathBetweenPoints(gameMap, posStart, posEnd);
            for (const pos of path) {
                patrolPositions.push(pos);
            }
        }

        patrolRoutes.push(shiftedPathCopy(patrolPositions, rng.randomInRange(patrolPositions.length)));
    }

    // Shuffle the patrol routes generated so far, since they were created by iterating over the rooms in order.

    rng.shuffleArray(patrolRoutes);

    // Past level 5, start including patrols around the outside of the mansion. Keep these ones at the end
    // so they won't get keys or purses.

    if (level > 5) {
        const patrolLength = outerPerimeter.length;

        patrolRoutes.push(shiftedPathCopy(outerPerimeter, Math.floor(patrolLength * 0.25)));
        patrolRoutes.push(shiftedPathCopy(outerPerimeter, Math.floor(patrolLength * 0.75)));
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
                room: nodeForwardNext.room,
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

function posInDoor(pos: vec2, room0: Room, room1: Room, gameMap: GameMap) {
    for (const adj of room0.edges) {
        if ((adj.roomLeft === room0 && adj.roomRight === room1) ||
            (adj.roomLeft === room1 && adj.roomRight === room0)) {
            const posAdj = vec2.create();
            for (let i = 1; i < adj.length; ++i) {
                vec2.scaleAndAdd(posAdj, adj.origin, adj.dir, i);
                const terrainType = gameMap.cells.atVec(posAdj).type;
                if (terrainType >= TerrainType.PortcullisNS && terrainType <= TerrainType.GardenDoorEW) {
                    vec2.copy(pos, posAdj);
                    return;
                }
            }
        }
    }
    vec2.zero(pos);
}

function posBesideDoor(pos: vec2, room: Room, roomNext: Room, gameMap: GameMap) {
    // Try two squares into the room, if possible. If not, fall back to one square in, which will be clear.
    for (const adj of room.edges) {
        if (adj.roomLeft === room && adj.roomRight === roomNext) {
            const posDoor = vec2.create();
            posInDoor(posDoor, room, roomNext, gameMap);
            const dirCross = vec2.fromValues(-adj.dir[1], adj.dir[0]);
            vec2.scaleAndAdd(pos, posDoor, dirCross, 2);
            if (gameMap.cells.at(pos[0], pos[1]).moveCost != 0) {
                vec2.scaleAndAdd(pos, posDoor, dirCross, 1);
            }
            return;
        } else if (adj.roomLeft === roomNext && adj.roomRight === room) {
            const posDoor = vec2.create();
            posInDoor(posDoor, room, roomNext, gameMap);
            const dirCross = vec2.fromValues(adj.dir[1], -adj.dir[0]);
            vec2.scaleAndAdd(pos, posDoor, dirCross, 2);
            if (gameMap.cells.at(pos[0], pos[1]).moveCost != 0) {
                vec2.scaleAndAdd(pos, posDoor, dirCross, 1);
            }
            return;
        }
    }
    vec2.zero(pos);
}

function playerStartPosition(adjacencies: Array<Adjacency>, gameMap: GameMap): vec2 {
    // Find lowest door to exterior

    let adjFrontDoor: Adjacency | undefined = undefined;
    let yMin = 0;

    for (const adj of adjacencies) {
        if (!adj.door) {
            continue;
        }

        if (adj.roomLeft.roomType !== RoomType.Exterior && adj.roomRight.roomType !== RoomType.Exterior) {
            continue;
        }

        const y = adj.origin[1] + Math.max(0, adj.dir[1]) * adj.length;

        if (adjFrontDoor === undefined) {
            adjFrontDoor = adj;
            yMin = y;
            continue;
        }

        if (y < yMin) {
            adjFrontDoor = adj;
            yMin = y;
        }
    }

    if (adjFrontDoor === undefined) {
        return vec2.fromValues(0, 0);
    }

    let roomFrom, roomTo;
    if (adjFrontDoor.roomLeft.roomType === RoomType.Exterior) {
        roomFrom = adjFrontDoor.roomRight;
        roomTo = adjFrontDoor.roomLeft;
    } else {
        roomFrom = adjFrontDoor.roomLeft;
        roomTo = adjFrontDoor.roomRight;
    }

    const pos = vec2.create();
    posBesideDoor(pos, roomTo, roomFrom, gameMap);
    return pos;
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
    while (!pos.equals(pos1)) {
        path.push(vec2.clone(pos));
        const posNext = posNextBest(gameMap, distanceField, pos);
        if (posNext.equals(pos)) {
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

            if (cost < costBest) {
                costBest = cost;
                posBest = pos;
            }
        }
    }

    if (posBest.equals(posFrom)) {
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

function renderWalls(adjacencies: Array<Adjacency>, map: GameMap, rng:RNG) {

    // Plot walls around all the rooms, except between courtyard rooms.

    for (const adj of adjacencies) {
        const type0 = adj.roomLeft.roomType;
        const type1 = adj.roomRight.roomType;

        if (isCourtyardRoomType(type0) && isCourtyardRoomType(type1)) {
            continue;
        }

        for (let i = 0; i < adj.length + 1; ++i) {
            const pos = vec2.create();
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, i);
            map.cells.atVec(pos).type = TerrainType.Wall0000;
        }
    }

    // Add windows and doors to the walls.

    const adjHandled: Set<Adjacency> = new Set();

    for (const adj0 of adjacencies) {
        if (adjHandled.has(adj0)) {
            continue;
        }

        adjHandled.add(adj0);

        const adjMirror = adj0.nextMatching;
        if (adjMirror !== null && adjMirror !== adj0) {
            adjHandled.add(adjMirror);
        }

        let walls: Array<Adjacency> = [];
        walls.push(adj0);

        if (adjMirror !== null && adjMirror !== adj0) {
            walls.push(adjMirror);
        }

        const type0 = adj0.roomLeft.roomType;
        const type1 = adj0.roomRight.roomType;

        if (!adj0.door && type0 !== type1) {
            if (type0 == RoomType.Exterior || type1 == RoomType.Exterior) {
                let k = 2;
                const k_end = 1 + Math.floor(adj0.length / 2);

                while (k < k_end) {
                    for (const a of walls) {
                        if (a.roomLeft.roomType === RoomType.Vault ||
                            a.roomRight.roomType === RoomType.Vault) {
                            continue;
                        }

                        const dir = vec2.clone(a.dir);
                        if (a.roomRight.roomType == RoomType.Exterior) {
                            vec2.negate(dir, dir);
                        }

                        const windowType = oneWayWindowTerrainTypeFromDir(dir);

                        const p = vec2.clone(a.origin).scaleAndAdd(a.dir, k);
                        const q = vec2.clone(a.origin).scaleAndAdd(a.dir, a.length - k);

                        map.cells.atVec(p).type = windowType;
                        map.cells.atVec(q).type = windowType;
                    }
                    k += 2;
                }
            } else if (isCourtyardRoomType(type0) || isCourtyardRoomType(type1)) {
                let k = 2;
                const k_end = 1 + Math.floor(adj0.length / 2);

                while (k < k_end) {
                    for (const a of walls) {
                        if (a.roomLeft.roomType === RoomType.Vault ||
                            a.roomRight.roomType === RoomType.Vault) {
                            continue;
                        }

                        const dir = vec2.clone(a.dir);
                        if (isCourtyardRoomType(a.roomRight.roomType)) {
                            vec2.negate(dir, dir);
                        }

                        const windowType = oneWayWindowTerrainTypeFromDir(dir);

                        const p = vec2.clone(a.origin).scaleAndAdd(a.dir, k);
                        const q = vec2.clone(a.origin).scaleAndAdd(a.dir, a.length - k);

                        map.cells.atVec(p).type = windowType;
                        map.cells.atVec(q).type = windowType;
                    }
                    k += 2;
                }
            }
        }

        let installMasterSuiteDoor = rng.random() < 0.3333;

        let offset = Math.floor(adj0.length / 2);
        /*
        if (adjMirror === adj0) {
            offset = Math.floor(adj0.length / 2);
        } else if (adj0.length > 2) {
            offset = 2 + rng.randomInRange(adj0.length - 3);
        } else {
            offset = 1 + rng.randomInRange(adj0.length - 1);
        }
        */

        for (const a of walls) {
            if (!a.door) {
                continue;
            }

            const p = vec2.clone(a.origin).scaleAndAdd(a.dir, offset);

            let orientNS = (a.dir[0] == 0);

            let roomTypeLeft = a.roomLeft.roomType;
            let roomTypeRight = a.roomRight.roomType;

            if (roomTypeLeft == RoomType.Exterior || roomTypeRight == RoomType.Exterior) {
                map.cells.atVec(p).type = orientNS ? TerrainType.PortcullisNS : TerrainType.PortcullisEW;
                placeItem(map, p, orientNS ? ItemType.PortcullisNS : ItemType.PortcullisEW);
            } else if (roomTypeLeft === RoomType.Vault || roomTypeRight === RoomType.Vault) {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p, orientNS ? ItemType.LockedDoorNS : ItemType.LockedDoorEW);
            } else if (isCourtyardRoomType(roomTypeLeft) && isCourtyardRoomType(roomTypeRight)) {
                map.cells.atVec(p).type = orientNS ? TerrainType.GardenDoorNS : TerrainType.GardenDoorEW;
            } else if (roomTypeLeft != RoomType.PrivateRoom || roomTypeRight != RoomType.PrivateRoom || installMasterSuiteDoor) {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p, orientNS ? ItemType.DoorNS : ItemType.DoorEW);
            } else {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
            }
        }
    }
}

function renderRooms(level: number, rooms: Array<Room>, map: GameMap, rng: RNG) {
    for (let iRoom = 1; iRoom < rooms.length; ++iRoom) {
        const room = rooms[iRoom];

        let cellType;
        switch (room.roomType) {
            case RoomType.Exterior: cellType = TerrainType.GroundNormal; break;
            case RoomType.PublicCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.PublicRoom: cellType = TerrainType.GroundWood; break;
            case RoomType.PrivateCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.PrivateRoom: cellType = TerrainType.GroundMarble; break;
            case RoomType.Vault: cellType = TerrainType.GroundVault; break;
            case RoomType.Bedroom: cellType = TerrainType.GroundMarble; break;
            case RoomType.Dining: cellType = TerrainType.GroundWood; break;
            case RoomType.PublicLibrary: cellType = TerrainType.GroundWood; break;
            case RoomType.PrivateLibrary: cellType = TerrainType.GroundMarble; break;
        }

        setRectTerrainType(map, room.posMin[0], room.posMin[1], room.posMax[0], room.posMax[1], cellType);

        if (isCourtyardRoomType(room.roomType)) {
            renderRoomCourtyard(map, room, level, rng);
        } else if (room.roomType === RoomType.PublicRoom || room.roomType === RoomType.PrivateRoom) {
            renderRoomGeneric(map, room, level, rng);
        } else if (room.roomType === RoomType.Vault) {
            renderRoomVault(map, room);
        } else if (room.roomType === RoomType.Bedroom) {
            renderRoomBedroom(map, room, level, rng);
        } else if (room.roomType === RoomType.Dining) {
            renderRoomDining(map, room, level, rng);
        } else if (room.roomType === RoomType.PublicLibrary || room.roomType === RoomType.PrivateLibrary) {
            renderRoomLibrary(map, room, level, rng);
        }

        // Place creaky floor tiles

        if (cellType == TerrainType.GroundWood && level > 3) {
            placeCreakyFloorTiles(map, room, rng);
        }
    }
}

function renderRoomCourtyard(map: GameMap, room: Room, level: number, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];
    if (dx >= 5 && dy >= 5) {
        setRectTerrainType(map, room.posMin[0] + 1, room.posMin[1] + 1, room.posMax[0] - 1, room.posMax[1] - 1, TerrainType.GroundWater);
    } else if (dx >= 2 && dy >= 2) {
        const itemTypes = [ItemType.Bush, ItemType.Bush, ItemType.Bush, ItemType.Bush];
        if (dx > 2 && dy > 2) {
            itemTypes.push(randomlyLitTorch(level, rng));
        }
        rng.shuffleArray(itemTypes);
        const itemPositions = [
            vec2.fromValues(room.posMin[0], room.posMin[1]),
            vec2.fromValues(room.posMax[0] - 1, room.posMin[1]),
            vec2.fromValues(room.posMin[0], room.posMax[1] - 1),
            vec2.fromValues(room.posMax[0] - 1, room.posMax[1] - 1),
        ];
        for (let i = 0; i < itemPositions.length; ++i) {
            const pos = itemPositions[i];
            if (map.cells.atVec(pos).type != TerrainType.GroundGrass) {
                continue;
            }
        
            tryPlaceItem(map, pos, itemTypes[i]);
        }
    }
}

function renderRoomGeneric(map: GameMap, room: Room, level: number, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];
    if (dx >= 5 && dy >= 5) {
        if (room.roomType == RoomType.PrivateRoom) {
            setRectTerrainType(map, room.posMin[0] + 2, room.posMin[1] + 2, room.posMax[0] - 2, room.posMax[1] - 2, TerrainType.GroundWater);
        }

        map.cells.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;
    } else if (dx == 5 && dy >= 3 && (room.roomType == RoomType.PublicRoom || rng.random() < 0.33333)) {
        const itemTypes = new Array(dy - 2).fill(ItemType.Table);
        itemTypes.push(randomlyLitTorch(level, rng));
        rng.shuffleArray(itemTypes);
        for (let y = 1; y < dy-1; ++y) {
            placeItem(map, vec2.fromValues(room.posMin[0] + 1, room.posMin[1] + y), ItemType.Chair);
            placeItem(map, vec2.fromValues(room.posMin[0] + 2, room.posMin[1] + y), itemTypes[y - 1]);
            placeItem(map, vec2.fromValues(room.posMin[0] + 3, room.posMin[1] + y), ItemType.Chair);
        }
    } else if (dy == 5 && dx >= 3 && (room.roomType == RoomType.PublicRoom || rng.random() < 0.33333)) {
        const itemTypes = new Array(dx - 2).fill(ItemType.Table);
        itemTypes.push(randomlyLitTorch(level, rng));
        rng.shuffleArray(itemTypes);
        for (let x = 1; x < dx-1; ++x) {
            placeItem(map, vec2.fromValues(room.posMin[0] + x, room.posMin[1] + 1), ItemType.Chair);
            placeItem(map, vec2.fromValues(room.posMin[0] + x, room.posMin[1] + 2), itemTypes[x - 1]);
            placeItem(map, vec2.fromValues(room.posMin[0] + x, room.posMin[1] + 3), ItemType.Chair);
        }
    } else if (dx > dy && (dy & 1) == 1 && rng.random() < 0.66667) {
        let y = Math.floor(room.posMin[1] + dy / 2);
        const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
        const torchType = randomlyLitTorch(level, rng);
        const itemTypes = [torchType, furnitureType];
        rng.shuffleArray(itemTypes);
        tryPlaceItem(map, vec2.fromValues(room.posMin[0] + 1, y), itemTypes[0]);
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 2, y), itemTypes[1]);
    } else if (dy > dx && (dx & 1) == 1 && rng.random() < 0.66667) {
        let x = Math.floor(room.posMin[0] + dx / 2);
        const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
        const torchType = randomlyLitTorch(level, rng);
        const itemTypes = [torchType, furnitureType];
        rng.shuffleArray(itemTypes);
        tryPlaceItem(map, vec2.fromValues(x, room.posMin[1] + 1), itemTypes[0]);
        tryPlaceItem(map, vec2.fromValues(x, room.posMax[1] - 2), itemTypes[1]);
    } else if (dx > 3 && dy > 3) {
        const furnitureType = (room.roomType == RoomType.PublicRoom) ? ItemType.Table : ItemType.Chair;
        const torchType = randomlyLitTorch(level, rng);
        const itemTypes = [torchType, furnitureType, furnitureType, furnitureType];
        rng.shuffleArray(itemTypes);
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMin[1]), itemTypes[0]);
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMin[1]), itemTypes[1]);
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMax[1] - 1), itemTypes[2]);
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMax[1] - 1), itemTypes[3]);
    }
}

function renderRoomVault(map: GameMap, room: Room) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];
    if (dx >= 5 && dy >= 5) {
        map.cells.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;
    }
}

function renderRoomBedroom(map: GameMap, room: Room, level: number, rng: RNG) {
    // Look for a place to put the bed that doesn't block any doors and is against a wall

    const potentialPositions = [];
    for (let x = room.posMin[0]; x < room.posMax[0] - 1; ++x) {
        for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
            const pos0 = vec2.fromValues(x, y);
            const pos1 = vec2.fromValues(x + 1, y);

            if (!wallOrWindowAdjacent(map.cells, pos0) && !wallOrWindowAdjacent(map.cells, pos1)) {
                continue;
            }

            if (isItemAtPos(map, pos0) || isItemAtPos(map, pos1)) {
                continue;
            }

            if (doorAdjacent(map.cells, pos0) || doorAdjacent(map.cells, pos1)) {
                continue;
            }

            potentialPositions.push(pos0);
        }
    }

    if (potentialPositions.length > 0) {
        const pos0 = potentialPositions[rng.randomInRange(potentialPositions.length)];
        const pos1 = vec2.fromValues(pos0[0] + 1, pos0[1]);

        placeItem(map, pos0, ItemType.BedL);
        placeItem(map, pos1, ItemType.BedR);
    }

    for (const itemType of [ItemType.DrawersTall, ItemType.DrawersShort, ItemType.Chair, ItemType.Table, ItemType.Bookshelf, randomlyLitTorch(level, rng), ItemType.Chair]) {
        const positions = getOpenWallPositions(map, room);
        if (positions.length === 0) {
            break;
        }

        const pos = positions[rng.randomInRange(positions.length)];

        placeItem(map, pos, itemType);
    }
}

function renderRoomDining(map: GameMap, room: Room, level: number, rng: RNG) {
    const x0 = room.posMin[0];
    const y0 = room.posMin[1];
    const rx = room.posMax[0] - room.posMin[0];
    const ry = room.posMax[1] - room.posMin[1];

    if (rx >= ry) {
        const yCenter = y0 + Math.floor(ry / 2);
        if ((rx & 1) == 0) {
            tryPlaceItem(map, vec2.fromValues(x0 + 1, yCenter), randomlyLitTorch(level, rng));
            tryPlaceItem(map, vec2.fromValues(x0 + rx - 2, yCenter), randomlyLitTorch(level, rng));
            for (let x = x0 + 2; x < x0 + rx - 2; ++x) {
                placeItem(map, vec2.fromValues(x, yCenter - 1), ItemType.Chair);
                placeItem(map, vec2.fromValues(x, yCenter    ), ItemType.Table);
                placeItem(map, vec2.fromValues(x, yCenter + 1), ItemType.Chair);
            }
        } else {
            const xCenter = x0 + (rx - 1) / 2;
            tryPlaceItem(map, vec2.fromValues(xCenter, yCenter), randomlyLitTorch(level, rng));
            for (let x = x0 + 1; x < xCenter; ++x) {
                placeItem(map, vec2.fromValues(x, yCenter - 1), ItemType.Chair);
                placeItem(map, vec2.fromValues(x, yCenter    ), ItemType.Table);
                placeItem(map, vec2.fromValues(x, yCenter + 1), ItemType.Chair);
            }
            for (let x = xCenter + 1; x < x0 + rx - 1; ++x) {
                placeItem(map, vec2.fromValues(x, yCenter - 1), ItemType.Chair);
                placeItem(map, vec2.fromValues(x, yCenter    ), ItemType.Table);
                placeItem(map, vec2.fromValues(x, yCenter + 1), ItemType.Chair);
            }
        }
    } else {
        const xCenter = x0 + Math.floor(rx / 2);
        if ((ry & 1) == 0) {
            tryPlaceItem(map, vec2.fromValues(xCenter, y0 + 1), randomlyLitTorch(level, rng));
            tryPlaceItem(map, vec2.fromValues(xCenter, y0 + ry - 2), randomlyLitTorch(level, rng));
            for (let y = y0 + 2; y < y0 + ry - 2; ++y) {
                placeItem(map, vec2.fromValues(xCenter - 1, y), ItemType.Chair);
                placeItem(map, vec2.fromValues(xCenter, y    ), ItemType.Table);
                placeItem(map, vec2.fromValues(xCenter + 1, y), ItemType.Chair);
            }
        } else {
            const yCenter = y0 + (ry - 1) / 2;
            tryPlaceItem(map, vec2.fromValues(xCenter, yCenter), randomlyLitTorch(level, rng));
            for (let y = y0 + 1; y < yCenter; ++y) {
                placeItem(map, vec2.fromValues(xCenter - 1, y), ItemType.Chair);
                placeItem(map, vec2.fromValues(xCenter,     y), ItemType.Table);
                placeItem(map, vec2.fromValues(xCenter + 1, y), ItemType.Chair);
            }
            for (let y = yCenter + 1; y < y0 + ry - 1; ++y) {
                placeItem(map, vec2.fromValues(xCenter - 1, y), ItemType.Chair);
                placeItem(map, vec2.fromValues(xCenter,     y), ItemType.Table);
                placeItem(map, vec2.fromValues(xCenter + 1, y), ItemType.Chair);
            }
        }
    }
}

function renderRoomLibrary(map: GameMap, room: Room, level: number, rng: RNG) {
    const x0 = room.posMin[0];
    const y0 = room.posMin[1];
    const rx = room.posMax[0] - room.posMin[0];
    const ry = room.posMax[1] - room.posMin[1];

    if (rx >= ry) {
        const cx = Math.floor((rx - 1) / 2);
        for (let x = 1; x < cx; x += 2) {
            for (let y = 1; y < ry - 1; ++y) {
                placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                placeItem(map, vec2.fromValues(x0 + rx - (x + 1), y0 + y), ItemType.Bookshelf);
            }
        }
    } else {
        const cy = Math.floor((ry - 1) / 2);
        for (let y = 1; y < cy; y += 2) {
            for (let x = 1; x < rx - 1; ++x) {
                placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                placeItem(map, vec2.fromValues(x0 + x, y0 + ry - (y + 1)), ItemType.Bookshelf);
            }
        }
    }
}

function getOpenWallPositions(map: GameMap, room: Room): Array<vec2> {
    const positions = [];

    for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
        for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
            const pos = vec2.fromValues(x, y);

            if (!wallAdjacent(map.cells, pos)) {
                continue;
            }

            if (isItemAtPos(map, pos)) {
                continue;
            }

            if (doorAdjacent(map.cells, pos)) {
                continue;
            }

            if (wouldPartitionSpace(map, room, pos)) {
                continue;
            }

            positions.push(pos);
        }
    }

    return positions;
}

function placeCreakyFloorTiles(map: GameMap, room: Room, rng: RNG) {
    for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
        for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
            if (map.cells.at(x, y).type != TerrainType.GroundWood) {
                continue;
            }
            if (doorAdjacent(map.cells, vec2.fromValues(x, y))) {
                continue;
            }
            if (rng.random() >= 0.02) {
                continue;
            }
            const canLeapHorz =
                x > room.posMin[0] &&
                x < room.posMax[0] - 1 &&
                map.cells.at(x - 1, y).type == TerrainType.GroundWood &&
                map.cells.at(x + 1, y).type == TerrainType.GroundWood;
            const canLeapVert =
                y > room.posMin[1] &&
                y < room.posMax[1] - 1 &&
                map.cells.at(x, y - 1).type == TerrainType.GroundWood &&
                map.cells.at(x, y + 1).type == TerrainType.GroundWood;
            if (!(canLeapHorz || canLeapVert)) {
                continue;
            }

            map.cells.at(x, y).type = TerrainType.GroundWoodCreaky;
        }
    }
}

function randomlyLitTorch(level: number, rng: RNG): ItemType {
    if (level === 0) {
        return ItemType.TorchUnlit;
    }

    return (rng.random() < 0.5) ? ItemType.TorchUnlit : ItemType.TorchLit;
}

function tryPlaceItem(map: GameMap, pos:vec2, itemType: ItemType) {
    if (doorAdjacent(map.cells, pos)) {
        return;
    }

    if ((itemType == ItemType.TorchUnlit || itemType == ItemType.TorchLit) &&
        windowAdjacent(map.cells, pos)) {
        return;
    }

    placeItem(map, pos, itemType);
}

function doorAdjacent(map: CellGrid, pos: vec2): boolean {
    let [x, y] = pos;
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

function windowAdjacent(map: CellGrid, pos: vec2): boolean {
    let [x, y] = pos;
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

function wallAdjacent(map: CellGrid, pos: vec2): boolean {
    let [x, y] = pos;
    if (isWallTerrainType(map.at(x - 1, y).type)) {
        return true;
    }

    if (isWallTerrainType(map.at(x + 1, y).type)) {
        return true;
    }

    if (isWallTerrainType(map.at(x, y - 1).type)) {
        return true;
    }

    if (isWallTerrainType(map.at(x, y + 1).type)) {
        return true;
    }

    return false;
}

function wallOrWindowAdjacent(map: CellGrid, pos: vec2): boolean {
    let [x, y] = pos;
    if (isWallOrWindowTerrainType(map.at(x - 1, y).type)) {
        return true;
    }

    if (isWallOrWindowTerrainType(map.at(x + 1, y).type)) {
        return true;
    }

    if (isWallOrWindowTerrainType(map.at(x, y - 1).type)) {
        return true;
    }

    if (isWallOrWindowTerrainType(map.at(x, y + 1).type)) {
        return true;
    }

    return false;
}

function wouldPartitionSpace(map: GameMap, room: Room, pos: vec2): boolean {
    const rx = room.posMax[0] - room.posMin[0];
    const ry = room.posMax[1] - room.posMin[1];

    const visited = new BooleanGrid(rx, ry, false);

    let numToVisit = rx * ry;
    for (let x = 0; x < rx; ++x) {
        for (let y = 0; y < ry; ++y) {
            if (!isWalkableTerrainType(map.cells.at(x + room.posMin[0], y + room.posMin[1]).type)) {
                visited.set(x, y, true);
                --numToVisit;
            }
        }
    }

    for (const item of map.items) {
        const x = item.pos[0] - room.posMin[0];
        const y = item.pos[1] - room.posMin[1];
        if (x < 0 || y < 0 || x >= rx || y >= ry)
            continue;
        visited.set(x, y, true);
        --numToVisit;
    }

    const px = pos[0] - room.posMin[0];
    const py = pos[1] - room.posMin[1];

    console.assert(px >= 0);
    console.assert(py >= 0);
    console.assert(px < rx);
    console.assert(py < ry);
    console.assert(!visited.get(px, py));

    visited.set(px, py, true);
    --numToVisit;

    const toVisit: Array<vec2> = [];
    const posStart = unvisitedPos(visited);
    if (posStart === undefined) {
        return true;
    }

    toVisit.push(posStart);

    while (true) {
        const pos = toVisit.pop();
        if (pos === undefined)
            break;
        const x = pos[0];
        const y = pos[1];
        if (visited.get(x, y))
            continue;
        visited.set(x, y, true);
        --numToVisit;
        if (x > 0 && !visited.get(x - 1, y))
            toVisit.push(vec2.fromValues(x - 1, y));
        if (y > 0 && !visited.get(x, y - 1))
            toVisit.push(vec2.fromValues(x, y - 1));
        if (x + 1 < rx && !visited.get(x + 1, y))
            toVisit.push(vec2.fromValues(x + 1, y));
        if (y + 1 < ry && !visited.get(x, y + 1))
            toVisit.push(vec2.fromValues(x, y + 1));
    }

    /*
    if (numToVisit > 0) {
        console.log('blocking pos for room at %d,%d (numUnvisited=%d)', room.posMin[0], room.posMin[1], numToVisit);
        for (let y = ry - 1; y >= 0; --y) {
            let str = y + ': ';
            for (let x = 0; x < rx; ++x) {
                if (x === px && y === py)
                    str += '*';
                else if (visited.get(x, y))
                    str += '.';
                else
                    str += 'X';
            }
            console.log(str);
        }
    }
    */

    return numToVisit > 0;
}

function unvisitedPos(visited: BooleanGrid): vec2 | undefined {
    for (let x = 0; x < visited.sizeX; ++x) {
        for (let y = 0; y < visited.sizeY; ++y) {
            if (!visited.get(x, y)) {
                return vec2.fromValues(x, y);
            }
        }
    }
    return undefined;
}

function isWalkableTerrainType(terrainType: TerrainType): boolean {
    return terrainType < TerrainType.Wall0000 && terrainType !== TerrainType.GroundWater;
}

function isWallTerrainType(terrainType: TerrainType): boolean {
    return terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.Wall1111;
}

function isWallOrWindowTerrainType(terrainType: TerrainType): boolean {
    return terrainType >= TerrainType.Wall0000 && terrainType <= TerrainType.OneWayWindowS;
}

function placeItem(map: GameMap, pos: vec2, type: ItemType) {
    map.items.push({
        pos: vec2.clone(pos),
        type: type,
    });
}

function placeLoot(totalLootToPlace: number, rooms: Array<Room>, map: GameMap, rng: RNG) {

    let totalLootPlaced = 0;

    // Vault rooms (may) get loot.

    for (const room of rooms) {
        if (room.roomType !== RoomType.Vault) {
            continue;
        }

        for (let i = rng.randomInRange(3) + rng.randomInRange(3); i > 0; --i) {
            if (totalLootPlaced >= totalLootToPlace) {
                break;
            }

            if (tryPlaceLoot(room.posMin, room.posMax, map, rng)) {
                ++totalLootPlaced;
            }
        }
    }

    // Other dead-end rooms automatically get loot.

    for (const room of rooms) {
        if (totalLootPlaced >= totalLootToPlace) {
            break;
        }

        if (room.roomType === RoomType.Exterior || room.roomType === RoomType.Vault) {
            continue;
        }

        if ((room.roomType === RoomType.PublicCourtyard || room.roomType === RoomType.PrivateCourtyard) && rng.random() < 0.75) {
            continue;
        }

        let numExits = 0;
        for (const adj of room.edges) {
            if (adj.door) {
                numExits += 1;
            }
        }

        if (numExits < 2) {
            if (tryPlaceLoot(room.posMin, room.posMax, map, rng)) {
                ++totalLootPlaced;
            }
        }
    }

    // Master-suite rooms get loot.

    for (const room of rooms)  {
        if (totalLootPlaced >= totalLootToPlace) {
            break;
        }

        if (!isMasterSuiteRoomType(room.roomType)) {
            continue;
        }

        if (rng.random() < 0.5) {
            continue;
        }

        if (tryPlaceLoot(room.posMin, room.posMax, map, rng)) {
            ++totalLootPlaced;
        }
    }

    // Place extra loot to reach desired total.

    const candidateRooms = rooms.filter((room) => room.roomType !== RoomType.Exterior && !isCourtyardRoomType(room.roomType));
    rng.shuffleArray(candidateRooms);
    for (let i = 0; i < 1000 && totalLootPlaced < totalLootToPlace; ++i) {
        const room = candidateRooms[i % candidateRooms.length];
        if (tryPlaceLoot(room.posMin, room.posMax, map, rng)) {
            ++totalLootPlaced;
        }
    }

    console.assert(totalLootPlaced === totalLootToPlace);
}

function tryPlaceLoot(posMin: vec2, posMax: vec2, map: GameMap, rng: RNG): boolean
{
    let dx = posMax[0] - posMin[0];
    let dy = posMax[1] - posMin[1];

    for (let i = 1000; i > 0; --i) {
        let pos = vec2.fromValues(posMin[0] + rng.randomInRange(dx), posMin[1] + rng.randomInRange(dy));

        let cellType = map.cells.at(pos[0], pos[1]).type;

        if (cellType === TerrainType.GroundWater || cellType >= TerrainType.Wall0000) {
            continue;
        }

        if (isItemAtPos(map, pos)) {
            continue;
        }

        placeItem(map, pos, ItemType.Coin);
        return true;
    }

    return false;
}

function setRectTerrainType(map: GameMap, xMin: number, yMin: number, xMax: number, yMax: number, terrainType: TerrainType) {
    for (let x = xMin; x < xMax; ++x) {
        for (let y = yMin; y < yMax; ++y) {
            map.cells.at(x, y).type = terrainType;
        }
    }
}

function placeExteriorBushes(map: GameMap, outerPerimeter: Array<vec2>, rng: RNG) {
    const sx = map.cells.sizeX;
    const sy = map.cells.sizeY;

    for (const pos of outerPerimeter) {
        map.cells.atVec(pos).type = TerrainType.GroundNormal;
    }

    setRectTerrainType(map, 0, 0, sx, outerBorder, TerrainType.GroundNormal);

    for (let x = 0; x < sx; ++x) {
        if ((x & 1) == 0 && rng.random() < 0.8) {
            placeItem(map, vec2.fromValues(x, sy - 1), ItemType.Bush);
        }
    }

    for (let y = outerBorder; y < sy - outerBorder + 1; ++y) {
        if (((sy - y) & 1) != 0) {
            if (rng.random() < 0.8) {
                placeItem(map, vec2.fromValues(0, y), ItemType.Bush);
            }
            if (rng.random() < 0.8) {
                placeItem(map, vec2.fromValues(sx - 1, y), ItemType.Bush);
            }
        }
    }
}

function isAdjacentToWall(map: GameMap, pos: vec2): boolean {
    if (map.cells.atVec(pos).type >= TerrainType.Wall0000) {
        return false;
    }

    if (pos[0] >= 0 && map.cells.at(pos[0] - 1, pos[1]).type >= TerrainType.Wall0000) {
        return true;
    }

    if (pos[1] >= 0 && map.cells.at(pos[0], pos[1] - 1).type >= TerrainType.Wall0000) {
        return true;
    }

    if (pos[0] + 1 < map.cells.sizeX && map.cells.at(pos[0] + 1, pos[1]).type >= TerrainType.Wall0000) {
        return true;
    }

    if (pos[1] + 1 < map.cells.sizeY && map.cells.at(pos[0], pos[1] + 1).type >= TerrainType.Wall0000) {
        return true;
    }

    return false;
}

function outerBuildingPerimeter(map: GameMap, posStart: vec2): Array<vec2> {
    const path: Array<vec2> = [];
    const pos = vec2.clone(posStart);
    const dir = vec2.fromValues(1, 0);

    while (true) {
        // Add current position to path

        path.push(vec2.clone(pos));

        // Change movement direction if we are either headed into a wall, or are not adjacent to a wall

        const dirLeft = vec2.fromValues(-dir[1], dir[0]);
        const dirRight = vec2.fromValues(dir[1], -dir[0]);

        if (map.cells.at(pos[0] + dir[0], pos[1] + dir[1]).type >= TerrainType.Wall0000) {
            if (map.cells.at(pos[0] + dirLeft[0], pos[1] + dirLeft[1]).type < TerrainType.Wall0000) {
                vec2.copy(dir, dirLeft);
            } else if (map.cells.at(pos[0] + dirRight[0], pos[1] + dirRight[1]).type < TerrainType.Wall0000) {
                vec2.copy(dir, dirRight);
            } else {
                break;
            }
        } else if (!isAdjacentToWall(map, pos)) {
            if (isAdjacentToWall(map, vec2.fromValues(pos[0] + dirLeft[0], pos[1] + dirLeft[1]))) {
                vec2.copy(dir, dirLeft);
            } else if (isAdjacentToWall(map, vec2.fromValues(pos[0] + dirRight[0], pos[1] + dirRight[1]))) {
                vec2.copy(dir, dirRight);
            } else {
                break;
            }
        }

        // Take a step

        pos.set(pos[0] + dir[0], pos[1] + dir[1]);

        // Stop if we return to the starting point, or move off the map

        if (pos.equals(posStart)) {
            break;
        }

        if (pos[0] < 0 || pos[1] < 0 || pos[0] >= map.cells.sizeX || pos[1] >= map.cells.sizeY) {
            break;
        }
    }

    return path;
}

function placeFrontPillars(map: GameMap) {
    let sx = map.cells.sizeX - 1;
    let cx = Math.floor(map.cells.sizeX / 2);

    for (let x = outerBorder; x < cx; x += 5) {
        map.cells.at(x, 1).type = TerrainType.Wall0000;
        map.cells.at(sx - x, 1).type = TerrainType.Wall0000;
    }
}

function isItemAtPos(map: GameMap, pos: vec2): boolean {
    for (const item of map.items) {
        if (item.pos.equals(pos)) {
            return true;
        }
    }
    for (const guard of map.guards) {
        if (guard.pos.equals(pos)) {
            return true;
        }
    }
    return false;
}

function isCourtyardRoomType(roomType: RoomType): boolean {
    switch (roomType) {
        case RoomType.PublicCourtyard:
        case RoomType.PrivateCourtyard:
            return true;
        case RoomType.Exterior:
        case RoomType.PublicRoom:
        case RoomType.PrivateRoom:
        case RoomType.Vault:
        case RoomType.Bedroom:
        case RoomType.Dining:
        case RoomType.PublicLibrary:
        case RoomType.PrivateLibrary:
            return false;
    }
}

function isMasterSuiteRoomType(roomType: RoomType): boolean {
    return roomType === RoomType.PrivateRoom || roomType === RoomType.Bedroom;
}

function placeGuards(level: number, map: GameMap, patrolRoutes: Array<Array<vec2>>, guardLoot:number, placeVaultKey: boolean, rng: RNG) {
    if (level <= 0) {
        return;
    }

    for (const patrolPath of patrolRoutes) {
        let pathIndexStart = 0;
        const guard = new Guard(patrolPath, pathIndexStart);
        if (level > 1 && rng.randomInRange(5 + level) < level) {
            guard.hasTorch = true;
        }
        if (placeVaultKey) {
            placeVaultKey = false;
            guard.hasVaultKey = true;
        } else if (guardLoot>0) {
            guard.hasPurse = true;
            guardLoot--;
        }
        map.guards.push(guard);
    }

    console.assert(guardLoot===0);
}

function markExteriorAsSeen(map: GameMap) {
    const visited = new BooleanGrid(map.cells.sizeX, map.cells.sizeY, false);

    const toVisit: Array<vec2> = [map.playerStartPos];
    for (let iToVisit = 0; iToVisit < toVisit.length; ++iToVisit) {
        const p = toVisit[iToVisit];
        if (visited.get(p[0], p[1])) {
            continue;
        }
        visited.set(p[0], p[1], true);
        map.cells.atVec(p).seen = true;

        if (map.cells.atVec(p).type >= TerrainType.Wall0000) {
            continue;
        }

        for (let dx = -1; dx <= 1; ++dx) {
            for (let dy = -1; dy <= 1; ++dy) {
                const p2 = vec2.fromValues(p[0] + dx, p[1] + dy);
                if (p2[0] >= 0 && p2[1] >= 0 && p2[0] < map.cells.sizeX && p2[1] < map.cells.sizeY && !visited.get(p2[0], p2[1])) {
                    toVisit.push(p2);
                }
            }
        }
    }
}


function cacheCellInfo(map: GameMap) {
    let sx = map.cells.sizeX;
    let sy = map.cells.sizeY;

    for (let x = 0; x < sx; ++x) {
        for (let y = 0; y < sy; ++y) {
            updateCellInfo(map, x, y);
        }
    }

    for (const item of map.items) {
        let cell = map.cells.atVec(item.pos);
        updateCellItemInfo(map, item.pos[0], item.pos[1], item);
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

function *iterEdgePositions(adjacency: Adjacency) {
    const dir = adjacency.dir;
    let pos = adjacency.origin;
    for(let i=0;i<adjacency.length;i++) {
        yield pos;
        pos = pos.add(dir)
    }
}

function closeInRoom(room:Room, entry:vec2|null, path:vec2[], map:GameMap) {
    let exitRoom:Room|null = null;
    let exit:vec2|null = null;
    for(const e of room.edges) {
        for(const pos of iterEdgePositions(e)) {
            //Ignore the entry door
            if(entry && pos.equals(entry)) continue;
            if(path.find((p:vec2)=>(pos.distance(p)==0))) {
                exitRoom = e.roomLeft!==room? e.roomLeft: e.roomRight;
                exit = pos;
                for(let ePos of iterEdgePositions(e)) {
                    if(map.cells.atVec(ePos).type===TerrainType.GroundGrass) {
                        map.cells.atVec(ePos).type = TerrainType.Wall0000;
                    }
                    map.items = map.items.filter((item)=>(!item.pos.equals(pos)));
                    updateCellInfo(map, pos[0], pos[1], true);
                }
                //TODO: make sure this room is walled in on this edge
                continue;
            }
            const t = map.cells.atVec(pos);
            switch(t.type) {
                case TerrainType.DoorEW:
                case TerrainType.DoorNS:
                    //Seal the doors that are not on the main path
                    if(t.type==TerrainType.DoorEW) {
                        setRectTerrainType(map, pos[0], pos[1], pos[0]+1, pos[1]+1, TerrainType.Wall0011);
                    } else {
                        setRectTerrainType(map, pos[0], pos[1], pos[0]+1, pos[1]+1, TerrainType.Wall1100);
                    }
                    map.items = map.items.filter((item)=>(!item.pos.equals(pos)));
                    updateCellInfo(map, pos[0], pos[1], true);
                    break;
                case TerrainType.OneWayWindowE:
                case TerrainType.OneWayWindowW:
                case TerrainType.PortcullisNS:
                    setRectTerrainType(map, pos[0], pos[1], pos[0]+1, pos[1]+1, TerrainType.Wall1100);
                    map.items = map.items.filter((item)=>(!item.pos.equals(pos)));
                    updateCellInfo(map, pos[0], pos[1]);
                    break;
                case TerrainType.OneWayWindowS:
                case TerrainType.OneWayWindowN:
                case TerrainType.PortcullisEW:
                    setRectTerrainType(map, pos[0], pos[1], pos[0]+1, pos[1]+1, TerrainType.Wall0011);
                    map.items = map.items.filter((item)=>(!item.pos.equals(pos)));
                    updateCellInfo(map, pos[0], pos[1]);
                    break;
            }
        }
    }
    return {exit, exitRoom}
}

function clearRoom(room:Room, map:GameMap, type:TerrainType|null=TerrainType.GroundWood) {
//    setRectTerrainType(map, room.posMin[0], room.posMin[1], room.posMax[0], room.posMax[1], TerrainType.GroundWood);
    if(type===null) {
        type = map.cells.at(room.posMin[0]+1, room.posMin[1]+1).type;
        if(type===TerrainType.GardenDoorEW || type===TerrainType.GardenDoorNS) {
            type = TerrainType.GroundGrass;
        }
        if(type===TerrainType.GroundWater || type >= TerrainType.Wall0000 && type <= TerrainType.Wall1111) {
            type = TerrainType.GroundWood;
        }
    }
    for(let x=room.posMin[0];x<room.posMax[0];x++) {
        for(let y=room.posMin[1];y<room.posMax[1];y++) {
            map.cells.at(x,y).type = type;
            updateCellInfo(map, x, y, false);
        }
    }
    let newItems = []
    for(let item of map.items) {
        if(item.pos[0]>=room.posMin[0] && item.pos[1]>=room.posMin[1] 
        && item.pos[0]<room.posMax[0] && item.pos[1]<room.posMax[1]) {
            updateCellInfo(map, item.pos[0], item.pos[1], false);
        } else {
            newItems.push(item);
        }
    }
    map.items = newItems;

}

function customizeLevelGen(level:number, rooms:Room[], map:GameMap, rng:RNG):undefined|((state:State)=>void) {
    if(level===0) {
        //Light all torches
        for(let item of map.items) {
            if(item.type===ItemType.TorchUnlit) {
                item.type =ItemType.TorchLit;
                updateCellItemInfo(map, item.pos[0], item.pos[1], item); 
            }
        }
        //Determine furthest room
        let dist=0;
        let furthestRoom = rooms[0];
        for(let r of rooms.slice(1)) {
            const distr = r.posMin.subtract(map.playerStartPos).abs().sum();
            if(distr>dist) {
                dist = distr;
                furthestRoom = r;
            }
        }
        //clear out the furthest room
        clearRoom(furthestRoom, map, TerrainType.GroundNormal);
        //Find a central part of the room to start the player in
        let playerStartPos = vec2.fromValues(furthestRoom.posMin[0], furthestRoom.posMax[1]-1);
        //Find the path to the exit
        let exitGate = map.playerStartPos;
        const path = pathBetweenPoints(map, exitGate, playerStartPos);
        //Setup the starting room by closing exits and locking doors
        map.playerStartPos = playerStartPos;

        //The furthest room is the holding room
        const holdingRoomPathing = closeInRoom(furthestRoom, null, path, map);
        if(holdingRoomPathing.exit===null) return;
        if(holdingRoomPathing.exitRoom===null) return;
        const holdingGuard = new Guard([holdingRoomPathing.exit], 0);
        holdingGuard.hasVaultKey = true;
        const holdingExit = holdingRoomPathing.exit;
        if(map.cells.at(holdingExit[0], holdingExit[1]).type==TerrainType.DoorEW) {
            const facing = playerStartPos.subtract(holdingRoomPathing.exit)[1]>0?-1:1;
            holdingGuard.dir = vec2.fromValues(0, facing);
        } else {
            const facing = playerStartPos.subtract(holdingRoomPathing.exit)[0]>0?-1:1;
            holdingGuard.dir = vec2.fromValues(facing, 0);
        }
        map.guards.push(holdingGuard);
        const patrolPathStart = path.findIndex((pos)=>pos.equals(holdingGuard.pos));
        let exit = holdingRoomPathing.exit??vec2.create();
        map.items.filter((item)=>!item.pos.equals(exit));
        if(map.cells.atVec(exit).type===TerrainType.DoorEW) {
            placeItem(map, exit, ItemType.LockedDoorEW);
        } else {
            placeItem(map, exit, ItemType.LockedDoorNS);
        }
        updateCellInfo(map, exit[0], exit[1], true);

        const guardRoom = holdingRoomPathing.exitRoom;
        clearRoom(guardRoom, map, null);
        const guardRoomPathing = closeInRoom(guardRoom, holdingRoomPathing.exit, path, map) 
        if(guardRoomPathing.exit===null) return;
        if(guardRoomPathing.exitRoom===null) return;
        exit = guardRoomPathing.exit??vec2.create();
        map.items.filter((item)=>!item.pos.equals(exit));
        if(map.cells.atVec(exit).type===TerrainType.DoorEW) {
            placeItem(map, exit, ItemType.LockedDoorEW);
        } else {
            placeItem(map, exit, ItemType.LockedDoorNS);
        }
        updateCellInfo(map, exit[0], exit[1], true);
        const holdingGuardEndPatrol = path.find((pos)=>pos.equals(guardRoomPathing.exit!));
        const chaseGuardEndPatrol = path[path.findIndex((pos)=>pos.equals(guardRoomPathing.exit!))-3];
        
        const escapeRoom = guardRoomPathing.exitRoom
        const chasePos = path[path.findIndex((pos)=>pos.equals(holdingGuard.pos))-1];
        if(!chasePos) return;
        const chaseGuard = new Guard([chasePos], 0);
        chaseGuard.dir = holdingGuard.pos.subtract(chaseGuard.pos);
        chaseGuard.hasTorch = true;
        map.guards.push(chaseGuard);
        clearRoom(escapeRoom, map, null);

        //State tracking for the onboarding instructions
        var onboardingState = 0;
        var onboardingStateThief = 0;
        var onboardingStateKO = 0;
        var turnedChaser = false;
        function OnboardingLevelUpdater(state: State) {
            if(state.player.health<=0) return;
            if(chaseGuard.pos.equals(chaseGuardEndPatrol) && !turnedChaser) {
                chaseGuard.dir = chaseGuard.dir.scale(-1);
                turnedChaser = true;
            } 
            if(holdingGuard.mode===GuardMode.Unconscious) {
                if(onboardingStateKO==0) {
                    if(holdingGuardEndPatrol && state.player.pos.equals(holdingGuardEndPatrol)) {
                        onboardingStateKO = 1;     
                    } else if(holdingGuardEndPatrol 
                        && !holdingGuard.pos.equals(holdingGuardEndPatrol)
                        && !holdingGuard.pos.equals(holdingExit)) {
                        onboardingStateKO = 2;
                    }
                }
                if(onboardingStateKO==0) {
                    state.topStatusMessage = 'You knocked the guard out. Push him out of the way and escape.';
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==1) {
                    state.topStatusMessage = 'Push again.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==2) {
                    state.topStatusMessage = 'Now leap over or around the remaing guard.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==2) {
                    state.topStatusMessage = 'You take damage when you move next to or over an alert guard.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==3) {
                    state.topStatusMessage = 'If you take too much damage you die.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==4) {
                    state.topStatusMessage = 'Leaping moves you quickly and helps you escape from chasing guards.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==5) {
                    state.topStatusMessage = 'Unlike you, guards can move diagonally.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==6) {
                    state.topStatusMessage = 'That makes leaping essential when guards are close.'
                    onboardingStateKO++;
                    state.topStatusMessageSticky = true;
                } else if(onboardingStateKO==7) {
                    state.topStatusMessage = 'You can also leap over obstacles like windows and gates.'
                    onboardingStateKO++;
                }
            } else if(chaseGuard.angry || holdingGuard.angry) {
                state.topStatusMessage = '"We\'re going to get you, Scum!"';
                if(holdingGuardEndPatrol) {
                    const path = pathBetweenPoints(map, exitGate, holdingGuardEndPatrol);
                    if(path.length>0) {
                        holdingGuard.patrolPath = path;
                        if(holdingGuard.patrolPathIndex>=path.length) holdingGuard.patrolPathIndex = 0;
                    }
                }
                if(chaseGuardEndPatrol) {
                    const path = pathBetweenPoints(map, state.player.pos, exitGate);
                    if(path.length>0) {
                        chaseGuard.patrolPath = path;
                        if(chaseGuard.patrolPathIndex>=path.length) chaseGuard.patrolPathIndex = 0;
                    }
                }
            } else if(holdingGuardEndPatrol && holdingGuard.pos.equals(holdingGuardEndPatrol)) {
                state.topStatusMessage = 'The guard has stopped. To get past, KO him by leaping into him.';
            } else if(state.player.hasVaultKey) {
                if(holdingGuardEndPatrol) holdingGuard.patrolPath = [holdingGuardEndPatrol];
                if(chaseGuardEndPatrol) chaseGuard.patrolPath = [chaseGuardEndPatrol];
                if(onboardingStateThief==0) {
                    state.topStatusMessage = 'Pew: "Better get back to our posts."';
                    onboardingState++;
                } else if(onboardingStateThief==1) {
                    state.topStatusMessage = 'You got the key! You better get out of here.';
                    onboardingState++;
                } else if(onboardingStateThief==2) {
                    state.topStatusMessage = 'The only way out is to follow the guards.';
                    onboardingState++;
                } else if(onboardingStateThief==3) {
                    state.topStatusMessage = 'Use the key to get through the locked doors.';
                    onboardingState++;
                } else if(onboardingStateThief==4) {
                    state.topStatusMessage = 'Stay behind the guards and they will not notice you.';
                    onboardingState++;
                }
            } else {
                const latchedOn = state.player.pickTarget===holdingGuard;
                if(!latchedOn) {
                    if(onboardingState==0) {
                        state.topStatusMessage = '"Who you got back there, Pew?" [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==1) {
                        state.topStatusMessage = 'Pew: "Some scum I caught spying on us outside" [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==2) {
                        state.topStatusMessage = 'Pew: "Got him good. Should be out for a while." [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==3) {
                        state.topStatusMessage = 'Other guard: "Waiting for Leyton?" [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==4) {
                        state.topStatusMessage = 'Pew: "Yeah, he should be back soon" [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==5) {
                        state.topStatusMessage = 'Other guard: "Leyton will string this scum high" [Press rest]';
                        onboardingState++;
                    } else if(onboardingState==6) {
                        state.topStatusMessage = 'Pew: "Yeah, more than likely, hehe..." [Press rest]';
                        onboardingState++;
                    } else {
                        state.topStatusMessage = 'Steal the guard\'s key by bumping (not leaping) into him';
                        state.topStatusMessageSticky = true;    
                    }
                } else {
                    state.topStatusMessage = 'Good, you have latched on! Now bump again to take the key.';
                    state.topStatusMessageSticky = true;    
                }
            }
        }
        return OnboardingLevelUpdater;
    }
    return;
}

