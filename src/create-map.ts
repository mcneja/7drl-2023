export { createGameMap, createGameMapRoughPlans, createGameRoughPlansDailyRun, Adjacency };

import { BooleanGrid, CellGrid, Int32Grid, Item, ItemType, Float64Grid, GameMap, GameMapRoughPlan, LevelType, TerrainType, TreasureInfo, guardMoveCostForItemType, isWindowTerrainType, itemLayers } from './game-map';
import { Guard } from './guard';
import { vec2 } from './my-matrix';
import { RNG } from './random';

const roomSizeX = 5;
const roomSizeY = 5;
const outerBorder = 2;
const outerBorderBottom = 3;

const levelShapeInfo:Array<[number,number,number,number,number,number]> = [
    //xmin,xmax,ymin,ymax,areamin,areamax -- params used to constrain the map size
    [3,3,2,2,6,6],
    [3,5,2,5,6,12],
    [3,5,2,6,9,15],
    [3,5,2,6,12,18],
    [3,7,3,6,15,21],
    [3,7,3,6,18,24],
    [3,7,3,6,21,30],
    [5,7,4,6,24,36],
    [5,9,4,6,30,42],
    [7,9,5,9,35,63],
];

enum RoomType {
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
    Kitchen,
    Treasure,
    TreasureCourtyard,
    LockedTreasure,
    LockedTreasureCourtyard,
    ThroneRoom,
}

enum DoorType {
    Standard,
    GateFront,
    GateBack,
    Locked,
}

type Room = {
    roomType: RoomType,
    group: number,
    depth: number,
    betweenness: number,
    privateRoom: boolean,
    posMin: vec2,
    posMax: vec2,
    edges: Array<Adjacency>,
    gridX: number,
    gridY: number,
}

type Adjacency = {
    origin: vec2,
    dir: vec2,
    length: number,
    roomLeft: Room,
    roomRight: Room,
    nextMatching: Adjacency | null,
    door: boolean,
    doorType: DoorType,
}

type PatrolRoute = {
    path: Array<vec2>,
    minRoomDepth: number,
    maxRoomDepth: number,
}

function createGameRoughPlansDailyRun(rng: RNG): Array<GameMapRoughPlan> {
    const gameMapRoughPlans: Array<GameMapRoughPlan> = createGameMapRoughPlans(10, 100, rng, undefined);

    const i0 = 3 + rng.randomInRange(2);
    const i1 = 5 + rng.randomInRange(2);
    const i2 = 7 + rng.randomInRange(3);

    return [gameMapRoughPlans[i0], gameMapRoughPlans[i1], gameMapRoughPlans[i2]];
}

function createGameMapRoughPlans(numMaps: number, totalLoot: number, rng: RNG, forceLevelType: LevelType | undefined): Array<GameMapRoughPlan> {
    const gameMapRoughPlans: Array<GameMapRoughPlan> = [];

    // Establish the level types and sizes
    // Only two Mansion levels, and not consecutive
    // Additionally sometimes an extra fortress

    const iLevelMansion0 = 4 + rng.randomInRange(3);
    const iLevelMansion1 = iLevelMansion0 + 2 + rng.randomInRange(7 - iLevelMansion0);

    let iLevelFortressExtra = (rng.random() < 0.2) ? 5 : numMaps;
    if (iLevelFortressExtra >= iLevelMansion0) {
        ++iLevelFortressExtra;
    }
    if (iLevelFortressExtra >= iLevelMansion1) {
        ++iLevelFortressExtra;
    }

    // Don't generate warrens levels yet; they aren't ready for prime time
    let iLevelWarrens = numMaps;
    // let iLevelWarrens = 4 + rng.randomInRange(2);
    if (iLevelWarrens >= iLevelMansion0) {
        ++iLevelWarrens;
    }
    if (iLevelWarrens >= iLevelMansion1) {
        ++iLevelWarrens;
    }
    if (iLevelWarrens >= iLevelFortressExtra) {
        ++iLevelWarrens;
    }

    let levelTypeManor: LevelType.Manor | LevelType.ManorRed = (rng.random() < 0.5) ? LevelType.Manor : LevelType.ManorRed;

    for (let level = 0; level < numMaps; ++level) {
        const levelRNG = new RNG('lvl'+level+rng.random());

        let levelType: LevelType;
        if (forceLevelType !== undefined) {
            levelType = forceLevelType;
        } else if (level === 9 || level === iLevelFortressExtra) {
            levelType = LevelType.Fortress;
        } else if (level === iLevelMansion0 || level === iLevelMansion1) {
            levelType = LevelType.Mansion;
        } else if (level === iLevelWarrens) {
            levelType = LevelType.Warrens;
        } else {
            levelType = levelTypeManor;
        }

        if (levelType === LevelType.Manor || levelType === LevelType.ManorRed) {
            levelTypeManor = (levelTypeManor === LevelType.Manor) ? LevelType.ManorRed : LevelType.Manor;
        } else {
            levelTypeManor = (rng.random() < 0.5) ? LevelType.Manor : LevelType.ManorRed;
        }

        const [numRoomsX, numRoomsY] = makeLevelSize(level, levelType, levelRNG);

        gameMapRoughPlans.push({
            levelType: levelType,
            level: level,
            numRoomsX: numRoomsX,
            numRoomsY: numRoomsY,
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
    console.log('Level Rough Plans:');
    for (let i = 0; i < gameMapRoughPlans.length; ++i) {
        const plan = gameMapRoughPlans[i];
        console.log('Level %d: %dx%d rooms, %d gold, %s', i, plan.numRoomsX, plan.numRoomsY, plan.totalLoot, levelTypeName(plan.levelType));
    }
    */

    return gameMapRoughPlans;
}

function makeLevelSize(level: number, levelType: LevelType, rng: RNG) : [number, number] {
    let xmin: number, xmax: number, ymin: number, ymax: number, Amin: number, Amax: number;
    [xmin, xmax, ymin, ymax, Amin, Amax] = levelShapeInfo[level];

    // Establish base dimensions by flipping a bunch of coins (trying to approximate a normal distribution)

    let x = xmin;
    for (let i = xmin; i < xmax; ++i) {
        if (rng.random() < 0.5) {
            ++x;
        }
    }

    let y = ymin;
    for (let i = ymin; i < ymax; ++i) {
        if (rng.random() < 0.5) {
            ++y;
        }
    }

    // Enforce odd width

    if ((x & 1) === 0) {
        if (x > xmin && rng.random() < 0.5) {
            --x;
        } else {
            ++x;
        }
    }

    // Enforce minimum and maximum area by adjusting vertical dimension

    y = Math.min(Math.floor(Amax/x), y);
    y = Math.max(y, Math.ceil(Amin/x));

    // Quantize mansion dimensions to work with its style

    if (levelType === LevelType.Mansion) {
        x = Math.floor((x + 1) / 3 + 0.5);
        y = Math.floor((y + 1) / 3 + 0.5);
        x = Math.max(2, x);
        y = Math.max(2, y);
        x = Math.min(4, x);
        y = Math.min(4, y);
        x *= 3;
        y *= 3;
        x -= 1;
        y -= 1;
    }

    return [x,y];
}

function createGameMap(plan: GameMapRoughPlan): GameMap {
    const rng = plan.rng;
    rng.reset();

    const level = plan.level;
    const levelType = plan.levelType;

    if (levelType === LevelType.Warrens) {
        return makeWarrens(level, plan.numRoomsX, plan.numRoomsY, plan.totalLoot, rng);
    }

    // Designate rooms as interior or courtyard

    const inside = new BooleanGrid(plan.numRoomsX, plan.numRoomsY, true);

    switch (levelType) {
    case LevelType.Manor:
    case LevelType.ManorRed:
        makeManorRoomGrid(inside, rng);
        break;

    case LevelType.Mansion:
        makeMansionRoomGrid(inside, rng);
        break;

    case LevelType.Fortress:
        makeFortressRoomGrid(inside, rng);
        break;
    }

    /*
    console.log('Finished grid:');
    for (let y = inside.sizeY - 1; y >= 0; --y) {
        let s: string = y.toString() + ': ';
        for (let x = 0; x < inside.sizeX; ++x) {
            s += inside.get(x, y) ? 'X' : '.';
        }
        console.log(s);
    }
    */

    // Randomly offset walls, and establish mirror relationships between them

    const forceTJunctionProbability = 0.75;
    const randomJunctionOrientationProbability = 0.5;
    const straightOutsideWalls = rng.random() < 0.25;
    const straightWallMinX = straightOutsideWalls;
    const straightWallMaxX = straightOutsideWalls;
    const straightWallMinY = straightOutsideWalls;
    const straightWallMaxY = straightOutsideWalls;

    const roomVarianceX = 3;
    const roomVarianceY = 3;

    const [offsetX, offsetY] = offsetWalls(
        plan.numRoomsX,
        plan.numRoomsY,
        roomSizeX,
        roomSizeY,
        roomVarianceX,
        roomVarianceY,
        forceTJunctionProbability,
        randomJunctionOrientationProbability,
        straightWallMinX,
        straightWallMinY,
        straightWallMaxX,
        straightWallMaxY,
        rng);

    // Enforce symmetry by mirroring wall offsets from one side to the other

    const mirrorRoomsX = (plan.numRoomsX & 1) === 1 && insideIsHorizontallySymmetric(inside);
    if (mirrorRoomsX) {
        mirrorOffsetsLeftToRight(offsetX, offsetY);
    }

    const mirrorRoomsY = (plan.numRoomsY & 1) === 1 && insideIsVerticallySymmetric(inside) && (!mirrorRoomsX || rng.random() < 0.5);
    if (mirrorRoomsY) {
        mirrorOffsetsBottomToTop(offsetX, offsetY);
    }

    // Translate the building so it abuts the X and Y axes with outerBorder/outerBorderBottom padding

    offsetBuilding(offsetX, offsetY, outerBorder, outerBorderBottom);

    // Make a set of rooms.

    const [rooms, roomIndex] = createRooms(inside, offsetX, offsetY, levelType);

    // Compute a list of room adjacencies.

    const mirrorAdjacencies = rng.randomInRange(24) >= level;
    const mirrorAdjacenciesX = mirrorRoomsX && mirrorAdjacencies;
    const mirrorAdjacenciesY = mirrorRoomsY && mirrorAdjacencies;

    const adjacencies = computeAdjacencies(mirrorAdjacenciesX, mirrorAdjacenciesY, offsetX, offsetY, rooms, roomIndex);
    storeAdjacenciesInRooms(adjacencies);

    // Join rooms to make bigger rooms.

//    joinRoomsWarren(rooms, adjacencies, rng);

    // Connect rooms together.

    rng.shuffleArray(adjacencies);
    connectRooms(rooms, adjacencies, level, levelType, rng);

    // Join a pair of rooms together.

    makeDoubleRooms(rooms, adjacencies, rng);

    // In fortresses, connectRooms added only the bare minimum of doors necessary to connect the level.
    //  Add additional doors now, but lock them.

    if (levelType === LevelType.Fortress) {
        computeRoomDepths(rooms);
        assignVaultRoom(rooms, level, levelType, rng);
        addAdditionalFortressDoors(adjacencies, rng);
    }

    // Compute room distances from entrance.

    computeRoomDepths(rooms);

    // Compute a measure of how much each room is on paths between other rooms.

    computeRoomBetweenness(rooms);

    // Assign types to the rooms.

    assignRoomTypes(rooms, level, levelType, rng);

    // Create the actual map

    const map = createBlankGameMap(levelType, rooms);

    // Render doors and windows.

    renderWalls(levelType, adjacencies, map);

    //verifyRoomsHaveDoors(rooms, map, rng.seed);

    // Render floors.

    renderRooms(level, levelType, rooms, map, rng);

    // Estimate how much backtracking is required to visit all rooms.

    map.backtrackingCoefficient = estimateBacktracking(rooms);
    //console.log('backtrack coefficient:', map.backtrackingCoefficient);

    // Set player start position

    map.playerStartPos = playerStartPosition(level, levelType, adjacencies, map);

    // Additional decorations

    const outsidePatrolRoute: PatrolRoute = {
        path: outerBuildingPerimeter(adjacencies, map),
        minRoomDepth: rooms[0].depth,
        maxRoomDepth: rooms[0].depth,
    };

    placeExteriorBushes(map, outsidePatrolRoute.path, rng);
    placeFrontPillars(map);

    // Convert walls to proper straight, corner, T-junction, cross tiles

    fixupWalls(map.cells);

    // Cache info about how the cells in the map affect sound, lighting, and movement

    cacheCellInfo(map);

    // Place patrol routes

    let patrolRoutes: Array<PatrolRoute>;
    if (level < 1) {
        patrolRoutes = [];
    } else if (level < 2) {
        patrolRoutes = placePatrolRouteSingle(map, rooms, rng);
    } else {
        patrolRoutes = placePatrolRoutesDense(levelType, level, map, rooms, adjacencies, rng);
//        patrolRoutes = placePatrolRoutes(level, map, rooms, adjacencies, rng);
//        patrolRoutes = placePatrolRouteSingle(map, rooms, rng);
//        patrolRoutes = placePatrolRouteSingleDense(levelType, map, rooms, rng);
//        patrolRoutes = placePatrolRoutesLong(map, rooms, rng);
//        patrolRoutes = placePatrolRouteLargeLoop(map, rooms, rng);

        // Past level 5, include patrols around the outside of the mansion.
        // Keep these ones at the end so they won't get keys or purses.

        if (level > 5) {
            appendOutsidePatrolRoutes(outsidePatrolRoute, patrolRoutes);
        }
    }

    const needKey = map.items.find((item) => item.type === ItemType.LockedDoorNS || item.type === ItemType.LockedDoorEW) !== undefined;
    addStationaryPatrols(level, map, rooms, needKey, patrolRoutes, rng);

    // Place loot

    const guardsAvailableForLoot = patrolRoutes.length - (needKey ? 1 : 0);
    const guardLoot = Math.min(Math.floor(level/3), Math.min(guardsAvailableForLoot, plan.totalLoot));

    placeLoot(plan.totalLoot - guardLoot, rooms, map, patrolRoutes, levelType, rng);
    giveBooksTitles(map.bookTitle, rooms, map.items.filter(item=>item.type === ItemType.Bookshelf), rng);
    placeTreasure(map, rooms, rng);

    placeHealth(level, map, rooms, rng);

    // Put guards on the patrol routes

    placeGuards(level, map, patrolRoutes, guardLoot, needKey, rng);

    // Final setup

    markExteriorAsSeen(map);
    map.computeLighting(null);
    map.recomputeVisibility(map.playerStartPos);

    map.rooms = rooms.map(room => ({ posMin: room.posMin, posMax: room.posMax }));
    map.adjacencies = adjacencies;

    return map;
}

function insideIsHorizontallySymmetric(inside: BooleanGrid): boolean {
    const sizeHalfX = Math.floor(inside.sizeX / 2);
    for (let y = 0; y < inside.sizeY; ++y) {
        for (let x = 0; x < sizeHalfX; ++x) {
            if (inside.get(x, y) !== inside.get(inside.sizeX - 1 - x, y)) {
                return false;
            }
        }
    }
    return true;
}

function insideIsVerticallySymmetric(inside: BooleanGrid): boolean {
    const sizeHalfY = Math.floor(inside.sizeY / 2);
    for (let x = 0; x < inside.sizeX; ++x) {
        for (let y = 0; y < sizeHalfY; ++y) {
            if (inside.get(x, y) !== inside.get(x, inside.sizeY - 1 - y)) {
                return false;
            }
        }
    }
    return true;
}

function makeManorRoomGrid(inside: BooleanGrid, rng: RNG) {
    const sizeX = inside.sizeX;
    const sizeY = inside.sizeY;

    const numCourtyardRoomsMax = Math.floor((sizeX * sizeY) / 4);
    for (let i = 0; i < numCourtyardRoomsMax; ++i) {
        const x = rng.randomInRange(sizeX);
        const y = rng.randomInRange(sizeY);
        inside.set(x, y, false);
    }

    if ((sizeX & 1) === 1) {
        mirrorInteriorLeftToRight(inside);
    }

    if ((sizeY & 1) === 1 && rng.random() < 0.125) {
        mirrorInteriorBottomToTop(inside);
    }

    return inside;
}

function makeMansionRoomGrid(inside: BooleanGrid, rng: RNG) {
    const numCellsX = Math.floor((inside.sizeX + 1) / 3);
    const numCellsY = Math.floor((inside.sizeY + 1) / 3);

    inside.fill(false);
    for (let cellX = 0; cellX < numCellsX; ++cellX) {
        for (let cellY = 0; cellY < numCellsY; ++cellY) {
            for (let x = 0; x < 2; ++x) {
                for (let y = 0; y < 2; ++y) {
                    inside.set(3*cellX + x, 3 * cellY + y, true);
                }
            }
        }
    }

    const cellGroup: Array<number> = [];
    for (let cellX = 0; cellX < numCellsX; ++cellX) {
        for (let cellY = 0; cellY < numCellsY; ++cellY) {
            cellGroup.push(cellX * numCellsY + cellY);
        }
    }

    const cellAdjacencies: Array<[number, number]> = [];
    for (let cellX = 1; cellX < numCellsX; ++cellX) {
        for (let cellY = 0; cellY < numCellsY; ++cellY) {
            const cellIndex0 = (cellX - 1) * numCellsY + cellY;
            const cellIndex1 = cellX * numCellsY + cellY;
            cellAdjacencies.push([cellIndex0, cellIndex1]);
        }
    }

    for (let cellX = 0; cellX < numCellsX; ++cellX) {
        for (let cellY = 1; cellY < numCellsY; ++cellY) {
            const cellIndex0 = cellX * numCellsY + (cellY - 1);
            const cellIndex1 = cellX * numCellsY + cellY;
            cellAdjacencies.push([cellIndex0, cellIndex1]);
        }
    }

    rng.shuffleArray(cellAdjacencies);

    for (const cellAdjacency of cellAdjacencies) {
        const cellIndex0 = cellAdjacency[0];
        const cellIndex1 = cellAdjacency[1];
        const cellGroup0 = cellGroup[cellIndex0];
        const cellGroup1 = cellGroup[cellIndex1];

        const cell0Y = cellIndex0 % numCellsY;
        const cell0X = Math.floor(cellIndex0 / numCellsY);
        const cell1Y = cellIndex1 % numCellsY;
        const cell1X = Math.floor(cellIndex1 / numCellsY);

        if (cellGroup0 === cellGroup1) {
            continue;
        }

        for (let i = 0; i < cellGroup.length; ++i) {
            if (cellGroup[i] === cellGroup1) {
                cellGroup[i] = cellGroup0;
            }
        }

        const xMin = 3 * Math.min(cell0X, cell1X);
        const xMax = 3 * Math.max(cell0X, cell1X) + 2;
        const yMin = 3 * Math.min(cell0Y, cell1Y);
        const yMax = 3 * Math.max(cell0Y, cell1Y) + 2;

        for (let x = xMin; x < xMax; ++x) {
            for (let y = yMin; y < yMax; ++y) {
                inside.set(x, y, true);
            }
        }
    }
}

function makeFortressRoomGrid(inside: BooleanGrid, rng: RNG) {
    const ringCourtyard = rng.random() < 0.25;
    for (let x = 0; x < inside.sizeX; ++x) {
        for (let y = 0; y < inside.sizeY; ++y) {
            const dx = Math.min(x, (inside.sizeX - 1) - x);
            const dy = Math.min(y, (inside.sizeY - 1) - y);
            const d = Math.min(dx, dy);
            inside.set(x, y, d !== 1 || (!ringCourtyard && y > 1 && dx !== 1));
        }
    }
}

function makeWarrens(level: number, numRoomsX: number, numRoomsY: number, totalLoot: number, rng: RNG): GameMap {
    const roomsX = numRoomsX;
    const roomsY = numRoomsY;

    const connectedX = new BooleanGrid(roomsX - 1, roomsY, false);
    const connectedY = new BooleanGrid(roomsX, roomsY - 1, false);

    const connected = new BooleanGrid(roomsX, roomsY, false);
    const insideStage1 = new BooleanGrid(roomsX, roomsY, true);
    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY - 1; ++y) {
            if (rng.random() < 0.125) {
                connected.set(x, y, true);
            }
        }
    }

    for (let i = Math.floor(roomsX * roomsY / 8); i > 0; --i) {
        const x = rng.randomInRange(roomsX);
        const y = rng.randomInRange(roomsY - 1);
        if (x > 0 && x < roomsX - 1 && rng.random() < 0.5) {
            connected.set(x, y, true);
            insideStage1.set(x, y, false);
        }
    }

    for (let x = 0; x < roomsX - 1; ++x) {
        connectedX.set(x, roomsY - 1, true);
    }

    const toConnect: Array<[number, number]> = [];
    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY - 1; ++y) {
            if (!connected.get(x, y)) {
                toConnect.push([x, y]);
            }
        }
    }

    rng.shuffleArray(toConnect);

    for (const pos of toConnect) {
        if (connected.get(pos[0], pos[1])) {
            continue;
        }
        const neighbors: Array<[number, number]> = [];
        for (const [dx, dy] of [[1, 0], [0, 1], [0, -1]]) {
            const x = pos[0] + dx;
            const y = pos[1] + dy;
            if (x < 0 || y < 0 || x >= roomsX || y >= roomsY) {
                continue;
            }
            if (!insideStage1.get(x, y)) {
                continue;
            }
            neighbors.push([dx, dy]);
        }
        if (neighbors.length === 0) {
            continue;
        }
        const [dx, dy] = neighbors[rng.randomInRange(neighbors.length)];
        connected.set(pos[0], pos[1], true);
        if (dx < 0) {
            connectedX.set(pos[0] - 1, pos[1], true);
            connected.set(pos[0] - 1, pos[1], true);
        } else if (dx > 0) {
            connectedX.set(pos[0], pos[1], true);
            connected.set(pos[0] + 1, pos[1], true);
        } else if (dy < 0) {
            connectedY.set(pos[0], pos[1] - 1, true);
            connected.set(pos[0], pos[1] - 1, true);
        } else if (dy > 0) {
            connectedY.set(pos[0], pos[1], true);
            connected.set(pos[0], pos[1] + 1, true);
        }
    }

    // Create wall offsets

    const [inside, offsetX, offsetY] = generateWarrenOffsets(insideStage1, connectedX, connectedY, rng);

    // Translate the building so it abuts the X and Y axes with outerBorder/outerBorderBottom padding

    offsetBuilding(offsetX, offsetY, 1, outerBorderBottom);

    const levelType = LevelType.Warrens;
    const [rooms, roomIndex] = createRooms(inside, offsetX, offsetY, levelType);

    // Compute a list of room adjacencies.

    const mirrorAdjacenciesX = false;
    const mirrorAdjacenciesY = false;

    const adjacencies = computeAdjacencies(mirrorAdjacenciesX, mirrorAdjacenciesY, offsetX, offsetY, rooms, roomIndex);
    storeAdjacenciesInRooms(adjacencies);
    rng.shuffleArray(adjacencies);

    // Join same-type rooms together to make bigger rooms

    joinRoomsWarren(rooms, adjacencies, rng);

    // Connect rooms together.

    connectRoomsWarren(rooms, adjacencies, rng);

    // Compute room distances from entrance.

    computeRoomDepths(rooms);

    // Compute a measure of how much each room is on paths between other rooms.

    computeRoomBetweenness(rooms);

    // Assign types to the rooms.

    assignRoomTypes(rooms, level, levelType, rng);

    // Create the actual map

    const map = createBlankGameMap(levelType, rooms);

    for (const cell of map.cells.values) {
        cell.type = TerrainType.GroundNormal;
    }

    // Render doors and windows.

    renderWalls(levelType, adjacencies, map);

    //verifyRoomsHaveDoors(rooms, map, rng.seed);

    // Render floors.

    renderRooms(level, levelType, rooms, map, rng);

    // Estimate how much backtracking is required to visit all rooms.

    map.backtrackingCoefficient = estimateBacktracking(rooms);

    // Set player start position

    map.playerStartPos = playerStartPosition(level, levelType, adjacencies, map);

    // Convert walls to proper straight, corner, T-junction, cross tiles

    fixupWalls(map.cells);

    // Cache info about how the cells in the map affect sound, lighting, and movement

    cacheCellInfo(map);

    // Place patrol routes

    let patrolRoutes: Array<PatrolRoute>;
    if (level < 1) {
        patrolRoutes = [];
    } else if (level < 2) {
        patrolRoutes = placePatrolRouteSingle(map, rooms, rng);
    } else {
        patrolRoutes = placePatrolRoutesDense(levelType, level, map, rooms, adjacencies, rng);
//        patrolRoutes = placePatrolRoutes(level, map, rooms, adjacencies, rng);
//        patrolRoutes = placePatrolRouteSingle(map, rooms, rng);
//        patrolRoutes = placePatrolRouteSingleDense(levelType, map, rooms, rng);
//        patrolRoutes = placePatrolRoutesLong(map, rooms, rng);
//        patrolRoutes = placePatrolRouteLargeLoop(map, rooms, rng);
    }

    const needKey = map.items.find((item) => item.type === ItemType.LockedDoorNS || item.type === ItemType.LockedDoorEW) !== undefined;
    addStationaryPatrols(level, map, rooms, needKey, patrolRoutes, rng);

    // Place loot

    const guardsAvailableForLoot = patrolRoutes.length - (needKey ? 1 : 0);
    const guardLoot = Math.min(Math.floor(level/3), Math.min(guardsAvailableForLoot, totalLoot));

    placeLoot(totalLoot - guardLoot, rooms, map, patrolRoutes, levelType, rng);
    giveBooksTitles(map.bookTitle, rooms, map.items.filter(item=>item.type === ItemType.Bookshelf), rng);
    placeTreasure(map, rooms, rng);

    placeHealth(level, map, rooms, rng);

    // Put guards on the patrol routes

    placeGuards(level, map, patrolRoutes, guardLoot, needKey, rng);

    // Final setup

    //markExteriorAsSeen(map);
    map.computeLighting(null);
    map.recomputeVisibility(map.playerStartPos);

    map.rooms = rooms.map(room => ({ posMin: room.posMin, posMax: room.posMax }));
    map.adjacencies = adjacencies;

    return map;
}

function generateWarrenOffsets(insideStage1: BooleanGrid, connectedX: BooleanGrid, connectedY: BooleanGrid, rng: RNG): [BooleanGrid, Int32Grid, Int32Grid] {
    const numBlocksX = insideStage1.sizeX;
    const numBlocksY = insideStage1.sizeY;
    const forceTJunctionProbability = 0.8;
    const randomJunctionOrientationProbability = 0;
    const straightWallMinX = true;
    const straightWallMinY = false;
    const straightWallMaxX = true;
    const straightWallMaxY = true;
    const blockSize = 6;
    const blockSizeMin = 4;
    const blockVarianceEndX = 2 + rng.randomInRange(2);
    const blockVarianceEndY = 3 + rng.randomInRange(2);

    // Establish base widths for each column
    const baseOffsetX = Array<number>(numBlocksX + 1).fill(blockSize);
    for (let i = Math.floor(baseOffsetX.length / 2); i > 0; --i) {
        const x = rng.randomInRange(baseOffsetX.length);
        baseOffsetX[x] += 1;
    }
    // Convert widths to base offsets for each column
    {
        let x = -1;
        for (let i = 0; i < baseOffsetX.length; ++i) {
            const xNext = x + baseOffsetX[i];
            baseOffsetX[i] = x;
            x = xNext;
        }
    }

    // Establish base heights for each row
    const baseOffsetY = Array<number>(numBlocksY + 1).fill(blockSize);
    for (let i = Math.floor(baseOffsetY.length / 2); i > 0; --i) {
        const y = rng.randomInRange(baseOffsetY.length);
        baseOffsetY[y] += 1;
    }
    baseOffsetY[0] += 1;
    baseOffsetY[baseOffsetY.length - 1] += 1;
    // Convert heights to base offsets for each row
    {
        let y = -1;
        for (let i = 0; i < baseOffsetY.length; ++i) {
            const yNext = y + baseOffsetY[i];
            baseOffsetY[i] = y;
            y = yNext;
        }
    }

    const blockOffsetX = new Int32Grid(numBlocksX + 1, numBlocksY, 0);
    const blockOffsetY = new Int32Grid(numBlocksX, numBlocksY + 1, 0);

    const junctionOrientationOffset = rng.randomInRange(2);

    for (let x = 0; x <= numBlocksX; ++x) {
        for (let y = 0; y <= numBlocksY; ++y) {
            const needsAlignVertical = (y > 0 && y < numBlocksY && ((x > 0 && connectedY.get(x - 1, y - 1)) || (x < numBlocksX && connectedY.get(x, y - 1))));
            const needsAlignHorizontal = (x > 0 && x < numBlocksX && ((y > 0 && connectedX.get(x - 1, y - 1)) || (y < numBlocksY && connectedX.get(x - 1, y))));

            const blockVarianceX = (x >= numBlocksX) ? blockVarianceEndX : ((baseOffsetX[x + 1] - baseOffsetX[x]) - blockSizeMin);
            const blockVarianceY = (y >= numBlocksY) ? blockVarianceEndY : ((baseOffsetY[y + 1] - baseOffsetY[y]) - blockSizeMin);

            if (needsAlignVertical && needsAlignHorizontal) {
                blockOffsetX.set(x, y, blockOffsetX.get(x, y - 1));
                blockOffsetY.set(x, y, blockOffsetY.get(x - 1, y));
                continue;
            }

            const alignVertical = needsAlignVertical || (!needsAlignHorizontal &&
                ((rng.random() < randomJunctionOrientationProbability) ?
                 rng.randomInRange(2) === 0 :
                 ((x + y + junctionOrientationOffset) & 1) === 0));

            if (alignVertical) {
                // Align walls vertically through this intersection
                if (y < numBlocksY) {
                    blockOffsetX.set(x, y, (y > 0) ? blockOffsetX.get(x, y - 1) : rng.randomInRange(blockVarianceX) + baseOffsetX[x]);
                }
                if (x < numBlocksX) {
                    let wallY = baseOffsetY[y];
                    if (x <= 0) {
                        wallY += rng.randomInRange(blockVarianceY);
                    } else if ((straightWallMinY && y === 0) || (straightWallMaxY && y === numBlocksY)) {
                        wallY = blockOffsetY.get(x - 1, y);
                    } else if (rng.random() >= forceTJunctionProbability) {
                        wallY += rng.randomInRange(blockVarianceY);
                    } else {
                        wallY += rng.randomInRange(blockVarianceY - 1);
                        if (wallY >= blockOffsetY.get(x - 1, y)) {
                            ++wallY;
                        }
                    }
                    blockOffsetY.set(x, y, wallY);
                }
            } else {
                // Align walls horizontally through this intersection
                if (y < numBlocksY) {
                    let wallX = baseOffsetX[x];
                    if (y <= 0) {
                        wallX += rng.randomInRange(blockVarianceX);
                    } else if ((straightWallMinX && x === 0) || (straightWallMaxX && x === numBlocksX)) {
                        wallX = blockOffsetX.get(x, y - 1);
                    } else if (rng.random() >= forceTJunctionProbability) {
                        wallX += rng.randomInRange(blockVarianceX);
                    } else {
                        wallX += rng.randomInRange(blockVarianceX - 1);
                        if (wallX >= blockOffsetX.get(x, y - 1)) {
                            ++wallX;
                        }
                    }
                    blockOffsetX.set(x, y, wallX);
                }
                if (x < numBlocksX) {
                    blockOffsetY.set(x, y, (x > 0) ? blockOffsetY.get(x - 1, y) : rng.randomInRange(blockVarianceY) + baseOffsetY[y]);
                }
            }
        }
    }

    const roomsX = numBlocksX * 2 - 1;
    const roomsY = numBlocksY * 2 - 1;

    const inside = new BooleanGrid(roomsX, roomsY, false);
    const offsetX = new Int32Grid(roomsX + 1, roomsY, 0);
    const offsetY = new Int32Grid(roomsX, roomsY + 1, 0);

    const alleyWidth = 2;

    for (let x = 0; x < numBlocksX; ++x) {
        for (let y = 0; y < numBlocksY; ++y) {
            const wallX0 = blockOffsetX.get(x, y);
            const wallX1 = blockOffsetX.get(x + 1, y) - alleyWidth;
            offsetX.set(2*x, 2*y, wallX0);
            offsetX.set(2*x + 1, 2*y, wallX1);
            if (y + 1 < numBlocksY) {
                offsetX.set(2*x, 2*y + 1, wallX0);
                offsetX.set(2*x + 1, 2*y + 1, wallX1);
            }

            const wallY0 = blockOffsetY.get(x, y);
            const wallY1 = blockOffsetY.get(x, y + 1) - alleyWidth;
            offsetY.set(2*x, 2*y, wallY0);
            offsetY.set(2*x, 2*y + 1, wallY1);
            if (x + 1 < numBlocksX) {
                offsetY.set(2*x + 1, 2*y, wallY0);
                offsetY.set(2*x + 1, 2*y + 1, wallY1);
            }
        }
    }

    for (let x = 0; x < numBlocksX; ++x) {
        for (let y = 0; y < numBlocksY; ++y) {
            inside.set(2*x, 2*y, insideStage1.get(x, y));
        }
    }
    for (let x = 1; x < roomsX; x += 2) {
        for (let y = 0; y < roomsY; ++y) {
            inside.set(x, y, (y & 1) ? false : connectedX.get(Math.floor(x / 2), Math.floor(y / 2)));
        }
    }
    for (let x = 0; x < roomsX; ++x) {
        for (let y = 1; y < roomsY; y += 2) {
            inside.set(x, y, (x & 1) ? false : connectedY.get(Math.floor(x / 2), Math.floor(y / 2)));
        }
    }

    return [inside, offsetX, offsetY];
}

function addStationaryPatrols(level:number, map:GameMap, rooms:Array<Room>, needKey: boolean, patrolRoutes:Array<PatrolRoute>, rng:RNG):void {
    if (level < 2) {
        return;
    }

    if (level < 8) {
        addSeatedGuard(level, map, rooms, needKey, patrolRoutes, rng);
        return;
    }

    const room = rooms.find((r)=>r.roomType===RoomType.Vault);
    if (room===undefined) {
        addSeatedGuard(level, map, rooms, needKey, patrolRoutes, rng);
        return;
    }

    const ttypes = [TerrainType.GroundGrass, TerrainType.GroundMarble, TerrainType.GroundWood];

    for(let adj of room.edges) {
        if (adj.doorType===DoorType.Locked) {
            let pos = adj.origin;
            const outsideVault = adj.roomLeft.roomType===RoomType.Vault?adj.roomRight:adj.roomLeft;
            for(let i=0; i<adj.length; i++) {
                if (map.cells.atVec(pos).type===TerrainType.DoorEW||map.cells.atVec(pos).type===TerrainType.DoorNS) {
                    if(adj.dir[0]===0) {
                        for(let dx of [-1,1]) {
                            const pos0 = pos.add(new vec2(dx,0));
                            if(ttypes.includes(map.cells.atVec(pos0).type)) {
                                patrolRoutes.push({path:[pos0], minRoomDepth: outsideVault.depth, maxRoomDepth: outsideVault.depth});
                                return;
                            }    
                        }
                    }
                    if(adj.dir[1]===0) {
                        for(let dy of [-1,1]) {
                            const pos0 = pos.add(new vec2(0,dy));
                            if(ttypes.includes(map.cells.atVec(pos0).type)) {
                                patrolRoutes.push({path:[pos0], minRoomDepth: outsideVault.depth, maxRoomDepth: outsideVault.depth});
                                return;
                            }    
                        }
                    }
                }
                pos = pos.add(adj.dir);
            }
        }
    }
}

function addSeatedGuard(level: number, gameMap: GameMap, rooms: Array<Room>, needKey: boolean, patrolRoutes: Array<PatrolRoute>, rng: RNG) {

    // Avoid any activity stations already used by a patrol route

    const patrolled: BooleanGrid = new BooleanGrid(gameMap.cells.sizeX, gameMap.cells.sizeY, false);
    for (const patrolRoute of patrolRoutes) {
        for (const pos of patrolRoute.path) {
            patrolled.set(pos[0], pos[1], true);
        }
    }

    // Avoid any activity stations that have loot on them

    for (const item of gameMap.items) {
        if (item.type === ItemType.Coin ||
            item.type === ItemType.Health ||
            item.type >= ItemType.TreasureA ||
            item.type === ItemType.Note) {
            patrolled.set(item.pos[0], item.pos[1], true);
        }
    }

    // Look for a chair facing a table

    const positions: Array<vec2> = [];

    if (level >= 4) {
        for (const item of gameMap.items) {
            if (item.type !== ItemType.Chair) {
                continue;
            }
            if (patrolled.get(item.pos[0], item.pos[1])) {
                continue;
            }

            let tableAdjacent = false;
            for (const itemOther of gameMap.items) {
                if (itemOther.type !== ItemType.Table) {
                    continue;
                }
                const dx = itemOther.pos[0] - item.pos[0];
                const dy = itemOther.pos[1] - item.pos[1];
                if (Math.abs(dx) + Math.abs(dy) !== 1) {
                    continue;
                }
                tableAdjacent = true;
                break;
            }
            if (!tableAdjacent) {
                continue;
            }
            positions.push(item.pos);
        }
    }

    // Look for a window to stand in front of

    for (const room of rooms) {
        for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
            if (room.posMin[1] > 0) {
                const terrainType = gameMap.cells.at(x, room.posMin[1] - 1).type;
                if (terrainType == TerrainType.OneWayWindowS &&
                    gameMap.cells.at(x, room.posMin[1]).moveCost === 0 &&
                    gameMap.cells.at(x, room.posMin[1] + 1).moveCost !== Infinity &&
                    !patrolled.get(x, room.posMin[1])) {
                    positions.push(vec2.fromValues(x, room.posMin[1]));
                }
            }
            if (room.posMax[1] < gameMap.cells.sizeY) {
                const terrainType = gameMap.cells.at(x, room.posMax[1]).type;
                if (terrainType == TerrainType.OneWayWindowN &&
                    gameMap.cells.at(x, room.posMax[1] - 1).moveCost === 0 &&
                    gameMap.cells.at(x, room.posMax[1] - 2).moveCost !== Infinity &&
                    !patrolled.get(x, room.posMax[1] - 1)) {
                    positions.push(vec2.fromValues(x, room.posMax[1] - 1));
                }
            }
        }
        for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
            if (room.posMin[0] > 0) {
                const terrainType = gameMap.cells.at(room.posMin[0] - 1, y).type;
                if (terrainType == TerrainType.OneWayWindowW &&
                    gameMap.cells.at(room.posMin[0], y).moveCost === 0 &&
                    gameMap.cells.at(room.posMin[0] + 1, y).moveCost !== Infinity &&
                    !patrolled.get(room.posMin[0], y)) {
                    positions.push(vec2.fromValues(room.posMin[0], y));
                }
            }
            if (room.posMax[0] < gameMap.cells.sizeX) {
                const terrainType = gameMap.cells.at(room.posMax[0], y).type;
                if (terrainType == TerrainType.OneWayWindowE &&
                    gameMap.cells.at(room.posMax[0] - 1, y).moveCost === 0 &&
                    gameMap.cells.at(room.posMax[0] - 2, y).moveCost !== Infinity &&
                    !patrolled.get(room.posMax[0] - 1, y)) {
                    positions.push(vec2.fromValues(room.posMax[0] - 1, y));
                }
            }
        }
    }

    // Pick a random position and generate a patrol route there

    if (positions.length > 0) {
        const pos = positions[rng.randomInRange(positions.length)];
        for (const room of rooms) {
            if (pos[0] >= room.posMin[0] &&
                pos[1] >= room.posMin[1] &&
                pos[0] < room.posMax[0] &&
                pos[1] < room.posMax[1]) {
                const i = rng.randomInRange(patrolRoutes.length + 1);
                patrolRoutes.splice(i, 0, {path: [vec2.clone(pos)], minRoomDepth: room.depth, maxRoomDepth: room.depth});
                return;
            }
        }
    }
}

function offsetWalls(
    roomsX: number,
    roomsY: number,
    roomSizeX: number,
    roomSizeY: number,
    roomVarianceX: number,
    roomVarianceY: number,
    forceTJunctionProbability: number,
    randomJunctionOrientationProbability: number,
    straightWallMinX: boolean,
    straightWallMinY: boolean,
    straightWallMaxX: boolean,
    straightWallMaxY: boolean,
    rng: RNG): [offsetX: Int32Grid, offsetY: Int32Grid]
{
    const offsetX = new Int32Grid(roomsX + 1, roomsY, 0);
    const offsetY = new Int32Grid(roomsX, roomsY + 1, 0);

    const junctionOrientationOffset = rng.randomInRange(2);

    for (let x = 0; x <= roomsX; ++x) {
        for (let y = 0; y <= roomsY; ++y) {
            const alignVertical =
                (rng.random() < randomJunctionOrientationProbability) ?
                rng.randomInRange(2) === 0 :
                ((x + y + junctionOrientationOffset) & 1) === 0;

            if (alignVertical) {
                // Align walls vertically through this intersection
                if (y < roomsY) {
                    offsetX.set(x, y, (y > 0) ? offsetX.get(x, y - 1) : rng.randomInRange(roomVarianceX) + roomSizeX * x - 1);
                }
                if (x < roomsX) {
                    let wallY = roomSizeY * y - 1;
                    if (x <= 0) {
                        wallY += rng.randomInRange(roomVarianceY);
                    } else if ((straightWallMinY && y === 0) || (straightWallMaxY && y === roomsY)) {
                        wallY = offsetY.get(x - 1, y);
                    } else if (rng.random() >= forceTJunctionProbability) {
                        wallY += rng.randomInRange(roomVarianceY);
                    } else {
                        wallY += rng.randomInRange(roomVarianceY - 1);
                        if (wallY >= offsetY.get(x - 1, y)) {
                            ++wallY;
                        }
                    }
                    offsetY.set(x, y, wallY);
                }
            } else {
                // Align walls horizontally through this intersection
                if (y < roomsY) {
                    let wallX = roomSizeX * x - 1;
                    if (y <= 0) {
                        wallX += rng.randomInRange(roomVarianceX);
                    } else if ((straightWallMinX && x === 0) || (straightWallMaxX && x === roomsX)) {
                        wallX = offsetX.get(x, y - 1);
                    } else if (rng.random() >= forceTJunctionProbability) {
                        wallX += rng.randomInRange(roomVarianceX);
                    } else {
                        wallX += rng.randomInRange(roomVarianceX - 1);
                        if (wallX >= offsetX.get(x, y - 1)) {
                            ++wallX;
                        }
                    }
                    offsetX.set(x, y, wallX);
                }
                if (x < roomsX) {
                    offsetY.set(x, y, (x > 0) ? offsetY.get(x - 1, y) : rng.randomInRange(roomVarianceY) + roomSizeY * y - 1);
                }
            }
        }
    }

    return [offsetX, offsetY];
}

function mirrorInteriorLeftToRight(inside: BooleanGrid) {
    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    console.assert((roomsX & 1) === 1);

    const roomCenter = (roomsX - 1) / 2;

    for (let x = roomCenter + 1; x < roomsX; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            inside.set(x, y, inside.get(roomsX - 1 - x, y));
        }
    }
}

function mirrorInteriorBottomToTop(inside: BooleanGrid) {
    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    console.assert((roomsY & 1) === 1);

    const roomCenter = (roomsY - 1) / 2;

    for (let x = 0; x < roomsX; ++x) {
        for (let y = roomCenter + 1; y < roomsY; ++y) {
            inside.set(x, y, inside.get(x, roomsY - 1 - y));
        }
    }
}

function mirrorOffsetsLeftToRight(offsetX: Int32Grid, offsetY: Int32Grid) {
    const roomsX = offsetY.sizeX;
    const roomsY = offsetX.sizeY;

    console.assert(offsetX.sizeX = roomsX + 1);
    console.assert(offsetY.sizeY = roomsY + 1);
    console.assert((roomsX & 1) === 1);

    const roomCenter = (roomsX - 1) / 2;
    const centerX = Math.floor((roomCenter + 0.5) * roomSizeX + 1);

    // Mirror X wall offsets

    for (let x = roomCenter + 1; x < roomsX + 1; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            offsetX.set(x, y, 2*centerX - offsetX.get(roomsX - x, y));
        }
    }

    // Mirror Y wall offsets

    for (let x = roomCenter + 1; x < roomsX; ++x) {
        for (let y = 0; y < roomsY + 1; ++y) {
            offsetY.set(x, y, offsetY.get(roomsX - 1 - x, y));
        }
    }
}

function mirrorOffsetsBottomToTop(offsetX: Int32Grid, offsetY: Int32Grid) {
    const roomsX = offsetY.sizeX;
    const roomsY = offsetX.sizeY;

    console.assert(offsetX.sizeX = roomsX + 1);
    console.assert(offsetY.sizeY = roomsY + 1);
    console.assert((roomsY & 1) === 1);

    const roomCenter = (roomsY - 1) / 2;
    const centerY = Math.floor((roomCenter + 0.5) * roomSizeY + 1);

    // Mirror X wall offsets

    for (let x = 0; x < roomsX + 1; ++x) {
        for (let y = roomCenter + 1; y < roomsY; ++y) {
            offsetX.set(x, y, offsetX.get(x, roomsY - 1 - y));
        }
    }

    // Mirror Y wall offsets

    for (let x = 0; x < roomsX; ++x) {
        for (let y = roomCenter + 1; y < roomsY + 1; ++y) {
            offsetY.set(x, y, 2*centerY - offsetY.get(x, roomsY - y));
        }
    }
}

function offsetBuilding(offsetX: Int32Grid, offsetY: Int32Grid, borderSizeLeft: number, borderSizeBottom: number) {
    const roomsX = offsetY.sizeX;
    const roomsY = offsetX.sizeY;

    let roomOffsetX = Number.MIN_SAFE_INTEGER;
    for (let y = 0; y < roomsY; ++y) {
        roomOffsetX = Math.max(roomOffsetX, -offsetX.get(0, y));
    }
    roomOffsetX += borderSizeLeft;

    for (let x = 0; x < roomsX + 1; ++x) {
        for (let y = 0; y < roomsY; ++y) {
            offsetX.set(x, y, offsetX.get(x, y) + roomOffsetX);
        }
    }

    let roomOffsetY = Number.MIN_SAFE_INTEGER;
    for (let x = 0; x < roomsX; ++x) {
        roomOffsetY = Math.max(roomOffsetY, -offsetY.get(x, 0));
    }
    roomOffsetY += borderSizeBottom;

    for (let x = 0; x < roomsX; ++x) {
        for (let y = 0; y < roomsY + 1; ++y) {
            offsetY.set(x, y, offsetY.get(x, y) + roomOffsetY);
        }
    }
}

function createBlankGameMap(levelType: LevelType, rooms: Array<Room>): GameMap {
    let mapSizeX = 0;
    let mapSizeY = 0;

    for (const room of rooms) {
        mapSizeX = Math.max(mapSizeX, room.posMax[0]);
        mapSizeY = Math.max(mapSizeY, room.posMax[1]);
    }

    mapSizeX += 1;
    mapSizeY += 1;

    if (levelType !== LevelType.Warrens) {
        mapSizeX += outerBorder;
        mapSizeY += outerBorder;
    } else {
        mapSizeX += 1;
        mapSizeY += 1;
    }

    const cells = new CellGrid(mapSizeX, mapSizeY);

    return new GameMap(cells);
}

function createRooms(
    inside: BooleanGrid,
    offsetX: Int32Grid,
    offsetY: Int32Grid,
    levelType: LevelType): [Array<Room>, Int32Grid] {
    const roomsX = inside.sizeX;
    const roomsY = inside.sizeY;

    const roomIndex = new Int32Grid(roomsX, roomsY, 0);
    const rooms: Array<Room> = [];

    // This room represents the area surrounding the map.

    rooms.push({
        roomType: RoomType.Exterior,
        group: 0,
        depth: 0,
        betweenness: 0,
        privateRoom: false,
        posMin: vec2.fromValues(0, 0), // not meaningful for this room
        posMax: vec2.fromValues(0, 0), // not meaningful for this room
        edges: [],
        gridX: -1,
        gridY: -1,
    });

    const roomTypeCourtyard = (levelType === LevelType.Mansion || levelType === LevelType.Warrens) ? RoomType.Exterior : RoomType.PublicCourtyard;

    for (let rx = 0; rx < roomsX; ++rx) {
        for (let ry = 0; ry < roomsY; ++ry) {
            let group_index = rooms.length;

            roomIndex.set(rx, ry, group_index);

            rooms.push({
                roomType: inside.get(rx, ry) ?  RoomType.PublicRoom : roomTypeCourtyard,
                group: group_index,
                depth: 0,
                betweenness: 0,
                privateRoom: false,
                posMin: vec2.fromValues(offsetX.get(rx, ry) + 1, offsetY.get(rx, ry) + 1),
                posMax: vec2.fromValues(offsetX.get(rx + 1, ry), offsetY.get(rx, ry + 1)),
                edges: [],
                gridX: rx,
                gridY: ry,
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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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

                    groupAdjacencies(adj0, adj1);

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
                    groupAdjacencies(adj0, adj1);
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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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
                    doorType: DoorType.Standard,
                };

                adj.nextMatching = adj;

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

                    groupAdjacencies(adj0, adj1);
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
                    groupAdjacencies(adj0, adj1);
                }

                ry0 += 1;
                ry1 -= 1;
            }
        }
    }

    return adjacencies;
}

function groupAdjacencies(adj0: Adjacency, adj1: Adjacency) {
    tailAdjacency(adj0).nextMatching = adj1;
    tailAdjacency(adj1).nextMatching = adj0;
}

function tailAdjacency(adj: Adjacency): Adjacency {
    let adjTail = adj;
    while (adjTail.nextMatching !== null && adjTail.nextMatching !== adj) {
        adjTail = adjTail.nextMatching;
    }
    return adjTail;
}

function removeFromAdjacencyGroup(adj: Adjacency) {
    tailAdjacency(adj).nextMatching = adj.nextMatching;
    adj.nextMatching = adj;
}

function adjacencyGroup(adjStart: Adjacency): Array<Adjacency> {
    const adjs: Array<Adjacency> = [];
    let adj = adjStart;
    while (true) {
        const adjNext = adj.nextMatching;
        adjs.push(adj);
        if (adjNext === null || adjNext === adjStart) {
            break;
        }
        adj = adjNext;
    }
    return adjs;
}

function storeAdjacenciesInRooms(adjacencies: Array<Adjacency>) {
    for (const adj of adjacencies) {
        adj.roomLeft.edges.push(adj);
        adj.roomRight.edges.push(adj);
    }
}

function connectRooms(rooms: Array<Room>, adjacencies: Array<Adjacency>, level: number, levelType: LevelType, rng: RNG) {

    // Connect all adjacent exterior rooms together.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.roomType === RoomType.Exterior &&
        adj.roomRight.roomType === RoomType.Exterior);

    // Connect all adjacent courtyard rooms together.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.roomType === RoomType.PublicCourtyard &&
        adj.roomRight.roomType === RoomType.PublicCourtyard);

    // Collect sets of edges that are mirrors of each other

    if (levelType === LevelType.Fortress) {
        connectRoomsMatching(rooms, adjacencies, (adj) =>
            adj.roomLeft.roomType !== RoomType.Exterior &&
            adj.roomRight.roomType !== RoomType.Exterior &&
            adj.roomLeft.group !== adj.roomRight.group);
    } else {
        // Connect all the interior rooms with doors.

        connectRoomsMatching(rooms, adjacencies, (adj) =>
            adj.roomLeft.roomType === RoomType.PublicRoom &&
            adj.roomRight.roomType === RoomType.PublicRoom &&
            (adj.roomLeft.group !== adj.roomRight.group || rng.random() < 0.4));

        // Create doors between the interiors and the courtyard areas.

        connectRoomsMatching(rooms, adjacencies, (adj) =>
            adj.roomLeft.roomType !== RoomType.Exterior &&
            adj.roomRight.roomType !== RoomType.Exterior &&
            adj.roomLeft.roomType !== adj.roomRight.roomType &&
            (adj.roomLeft.group !== adj.roomRight.group || rng.random() < 0.4));
    }

    // Compute the outside perimeter length

    const outsideWallLength = perimeterLength(adjacencies);

    // Create a door to the surrounding exterior.

    const adjDoor = frontDoorAdjacency(adjacencies);
    if (adjDoor !== undefined) {
        adjDoor.door = true;
        adjDoor.doorType = DoorType.GateFront;

        // Remove door wall from symmetry group

        removeFromAdjacencyGroup(adjDoor);
    }

    // Occasionally create a back door to the exterior.

    if (outsideWallLength > 80 || rng.random() < 0.2) {
        const adjDoor = backDoorAdjacency(adjacencies);
        if (adjDoor !== undefined) {
            adjDoor.door = true;
            adjDoor.doorType = (levelType !== LevelType.Fortress && (level < 3 || rng.random() < 0.5)) ? DoorType.GateBack : DoorType.Locked;

            // Remove door wall from symmetry group

            removeFromAdjacencyGroup(adjDoor);
        }
    }

    // Also create side doors sometimes.

    if (outsideWallLength > 120 || rng.random() < 0.2) {
        const doorType = (levelType !== LevelType.Fortress && level < 3) ? DoorType.GateBack : DoorType.Locked;

        const adjDoorLeft = sideDoorAdjacencyLeft(adjacencies);
        if (adjDoorLeft !== undefined) {
            for (const adj of adjacencyGroup(adjDoorLeft)) {
                adj.door = true;
                adj.doorType = doorType;
            }
        }

        const adjDoorRight = sideDoorAdjacencyRight(adjacencies);
        if (adjDoorRight !== undefined) {
            for (const adj of adjacencyGroup(adjDoorRight)) {
                adj.door = true;
                adj.doorType = doorType;
            }
        }
    }
}

function connectRoomsMatching(rooms: Array<Room>, adjacencies: Array<Adjacency>, acceptAdj: (adj: Adjacency) => boolean) {
    const adjHandled: Set<Adjacency> = new Set();
    for (const adjTest of adjacencies) {
        if (adjHandled.has(adjTest)) {
            continue;
        }

        const adjs = adjacencyGroup(adjTest);

        for (const adj of adjs) {
            adjHandled.add(adj);
        }

        console.assert(adjs.every(adj => adj.length === adjTest.length));

        if (adjTest.length < 2) {
            continue;
        }

        if (!acceptAdj(adjTest)) {
            continue;
        }

        for (const adj of adjs) {
            if (!adj.door) {
                adj.door = true;
                adj.doorType = DoorType.Standard;
                joinGroups(rooms, adj.roomLeft.group, adj.roomRight.group);
            }
        }
    }
}

function joinGroups(rooms: Array<Room>, groupFrom: number, groupTo: number) {
    if (groupFrom === groupTo) {
        return;
    }

    for (const room of rooms) {
        if (room.group === groupFrom) {
            room.group = groupTo;
        }
    }
}

function perimeterLength(adjacencies: Array<Adjacency>): number {
    let p = 0;
    for (const adj of adjacencies) {
        if ((adj.roomLeft.roomType === RoomType.Exterior) === (adj.roomRight.roomType === RoomType.Exterior)) {
            continue;
        }

        p += adj.length;
    }
    return p;
}

function frontDoorAdjacency(adjacencies: Array<Adjacency>): Adjacency | undefined {
    let xMin = Infinity;
    let xMax = -Infinity;

    for (const adj of adjacencies) {
        if ((adj.roomLeft.roomType === RoomType.Exterior) === (adj.roomRight.roomType === RoomType.Exterior)) {
            continue;
        }

        xMin = Math.min(xMin, adj.origin[0]);
        xMax = Math.max(xMax, adj.origin[0] + adj.dir[0] * (adj.length + 1));
    }

    const xMid = (xMin + xMax) / 2;

    let adjClosest: Adjacency | undefined = undefined;

    for (const adj of adjacencies) {
        if (adj.dir[0] === 0) {
            continue;
        }

        if (adj.length < 3) {
            continue;
        }

        if (adj.roomLeft.roomType === RoomType.Exterior) {
            continue;
        }

        if (adj.roomRight.roomType !== RoomType.Exterior) {
            continue;
        }

        if (adj.origin[0] > xMid) {
            continue;
        }

        if (adj.origin[0] + adj.dir[0] * adj.length <= xMid) {
            continue;
        }

        if (adjClosest !== undefined && adj.origin[1] > adjClosest.origin[1]) {
            continue;
        }

        adjClosest = adj;
    }

    return adjClosest;
}

function backDoorAdjacency(adjacencies: Array<Adjacency>): Adjacency | undefined {
    let xMin = Infinity;
    let xMax = -Infinity;

    for (const adj of adjacencies) {
        if ((adj.roomLeft.roomType === RoomType.Exterior) === (adj.roomRight.roomType === RoomType.Exterior)) {
            continue;
        }

        xMin = Math.min(xMin, adj.origin[0]);
        xMax = Math.max(xMax, adj.origin[0] + adj.dir[0] * (adj.length + 1));
    }

    const xMid = (xMin + xMax) / 2;

    let adjClosest: Adjacency | undefined = undefined;
    let distClosest = Infinity;

    for (const adj of adjacencies) {
        if (adj.dir[0] === 0) {
            continue;
        }

        if (adj.length < 3) {
            continue;
        }

        if (adj.roomLeft.roomType !== RoomType.Exterior) {
            continue;
        }

        if (adj.roomRight.roomType === RoomType.Exterior) {
            continue;
        }

        const dist = Math.max(0, Math.max(xMid - (adj.origin[0] + adj.dir[0] * adj.length), adj.origin[0] - xMid));
        if (dist < distClosest || (adjClosest !== undefined && dist === distClosest && adj.origin[1] > adjClosest.origin[1])) {
            distClosest = dist;
            adjClosest = adj;
        }
    }

    return adjClosest;
}

function sideDoorAdjacencyLeft(adjacencies: Array<Adjacency>): Adjacency | undefined {
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const adj of adjacencies) {
        if ((adj.roomLeft.roomType === RoomType.Exterior) === (adj.roomRight.roomType === RoomType.Exterior)) {
            continue;
        }

        yMin = Math.min(yMin, adj.origin[1]);
        yMax = Math.max(yMax, adj.origin[1] + adj.dir[1] * (adj.length + 1));
    }

    const yMid = (yMin + yMax) / 2;

    let adjClosest: Adjacency | undefined = undefined;
    let distClosest = Infinity;

    for (const adj of adjacencies) {
        if (adj.dir[1] === 0) {
            continue;
        }

        if (adj.length < 3) {
            continue;
        }

        if (adj.roomLeft.roomType !== RoomType.Exterior) {
            continue;
        }

        if (adj.roomRight.roomType === RoomType.Exterior) {
            continue;
        }

        const dist = Math.max(0, Math.max(yMid - (adj.origin[1] + adj.dir[1] * (adj.length + 1)), adj.origin[1] - yMid));

        if (dist < distClosest ||
            (adjClosest !== undefined &&
             dist === distClosest &&
             (adj.origin[0] < adjClosest.origin[0] ||
              (adj.origin[0] === adjClosest.origin[0] && adj.origin[1] < adjClosest.origin[1])))) {
            distClosest = dist;
            adjClosest = adj;
        }
    }

    return adjClosest;
}

function sideDoorAdjacencyRight(adjacencies: Array<Adjacency>): Adjacency | undefined {
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const adj of adjacencies) {
        if ((adj.roomLeft.roomType === RoomType.Exterior) === (adj.roomRight.roomType === RoomType.Exterior)) {
            continue;
        }

        yMin = Math.min(yMin, adj.origin[1]);
        yMax = Math.max(yMax, adj.origin[1] + adj.dir[1] * (adj.length + 1));
    }

    const yMid = (yMin + yMax) / 2;

    let adjClosest: Adjacency | undefined = undefined;
    let distClosest = Infinity;

    for (const adj of adjacencies) {
        if (adj.dir[1] === 0) {
            continue;
        }

        if (adj.length < 3) {
            continue;
        }

        if (adj.roomLeft.roomType === RoomType.Exterior) {
            continue;
        }

        if (adj.roomRight.roomType !== RoomType.Exterior) {
            continue;
        }

        const dist = Math.max(0, Math.max(yMid - (adj.origin[1] + adj.dir[1] * (adj.length + 1)), adj.origin[1] - yMid));

        if (dist < distClosest ||
            (adjClosest !== undefined &&
             dist === distClosest &&
             (adj.origin[0] > adjClosest.origin[0] ||
              (adj.origin[0] === adjClosest.origin[0] && adj.origin[1] < adjClosest.origin[1])))) {
            distClosest = dist;
            adjClosest = adj;
        }
    }

    return adjClosest;
}

function numDoorsForRoom(room: Room): number {
    return room.edges.reduce((c, adj) => c + (adj.door ? 1 : 0), 0);
}

function addAdditionalFortressDoors(adjacencies: Array<Adjacency>, rng: RNG) {
    // Note: should be honoring edge sets here to preserve symmetry.
    // Currently the additional fortress doors are not symmetric.

    for (const adj of adjacencies) {
        if (adj.door) {
            continue;
        }

        if (adj.length < 2) {
            continue;
        }

        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        if (room0.roomType === RoomType.Exterior || room0.roomType === RoomType.Vault) {
            continue;
        }
        if (room1.roomType === RoomType.Exterior || room1.roomType === RoomType.Vault) {
            continue;
        }

        if (numDoorsForRoom(room0) > 1 && numDoorsForRoom(room1) > 1) {
            continue;
        }

        if (rng.random() >= 0.4) {
            continue;
        }

        const depthDifference = Math.abs(room0.depth - room1.depth);

        adj.door = true;

        if (isCourtyardRoomType(room0.roomType) && isCourtyardRoomType(room1.roomType)) {
            adj.doorType = DoorType.Standard;
        } else if (depthDifference < 2) {
            adj.doorType = DoorType.Standard;
        } else {
            adj.doorType = DoorType.Locked;
        }
    }
}

function connectRoomsWarren(rooms: Array<Room>, adjacencies: Array<Adjacency>, rng: RNG) {

    // Connect all adjacent exterior rooms together.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.roomType === RoomType.Exterior &&
        adj.roomRight.roomType === RoomType.Exterior);

    // Connect all adjacent courtyard rooms together.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.roomType === RoomType.PublicCourtyard &&
        adj.roomRight.roomType === RoomType.PublicCourtyard);

    // Add interior doors.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.roomType === RoomType.PublicRoom &&
        adj.roomRight.roomType === RoomType.PublicRoom &&
        rng.random() < 0.8);

    // Ensure about half the interior rooms have doors to the exterior.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adjacencyConnectsInteriorToExterior(adj) &&
        (roomIsInteriorWithoutExteriorDoor(adj.roomLeft) || roomIsInteriorWithoutExteriorDoor(adj.roomRight)) &&
        rng.random() < 0.5);

    // Add doors to ensure everything is connected.

    connectRoomsMatching(rooms, adjacencies, (adj) =>
        adj.roomLeft.group !== adj.roomRight.group);
}

function adjacencyConnectsInteriorToExterior(adj: Adjacency): boolean {
    return (adj.roomLeft.roomType === RoomType.PublicRoom) !== (adj.roomRight.roomType === RoomType.PublicRoom);
}

function roomIsInteriorWithoutExteriorDoor(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom) {
        return false;
    }
    if (adjacentToRoomType(room, RoomType.Exterior)) {
        return false;
    }
    return true;
}

function roomMinDimension(room: Room): number {
    return Math.min(room.posMax[0] - room.posMin[0], room.posMax[1] - room.posMin[1]);
}

function adjacentToRoomType(room: Room, roomType: RoomType): boolean {
    return room.edges.some(adj =>
        adj.door &&
        ((adj.roomLeft === room) ? adj.roomRight.roomType : adj.roomLeft.roomType) === roomType);
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

function computeRoomBetweenness(rooms: Array<Room>) {
    // Start from rooms with exterior doors

//    const sourceRooms = [];
    for (const room of rooms) {
        room.betweenness = 0;
//        if (room.roomType === RoomType.Exterior) {
//            sourceRooms.push(room);
//        }
    }

    for (const roomSource of rooms) {
        const roomNumPaths: Map<Room, number> = new Map();
        const roomDependency: Map<Room, number> = new Map();
        const roomDepth: Map<Room, number> = new Map();

        for (const room of rooms) {
            roomDepth.set(room, Infinity);
            roomDependency.set(room, 0);
            roomNumPaths.set(room, 0);
        }

        roomDepth.set(roomSource, 0);
        roomNumPaths.set(roomSource, 1);

        const roomsToVisit: Array<Room> = [];
        roomsToVisit.push(roomSource);
        const roomStack: Array<Room> = [];

        while (true) {
            const room = roomsToVisit.shift();
            if (room === undefined) {
                break;
            }

            roomStack.push(room);

            const depthNext = (roomDepth.get(room) ?? 0) + 1;

            for (const adj of room.edges) {
                if (!adj.door) {
                    continue;
                }

                const roomNext: Room = (adj.roomLeft === room) ? adj.roomRight : adj.roomLeft;
                if (roomNext.roomType === RoomType.Exterior) {
                    continue;
                }

                if (roomNext.depth === Infinity) {
                    roomNext.depth = depthNext;
                    roomsToVisit.push(roomNext);
                }
                if (roomNext.depth === depthNext) {
                    roomNumPaths.set(roomNext, (roomNumPaths.get(roomNext) ?? 0) + (roomNumPaths.get(room) ?? 0));
                }
            }
        }

        const weight = (roomSource.roomType === RoomType.Exterior) ? 10 : 1;

        while (true) {
            const room = roomStack.pop();
            if (room === undefined) {
                break;
            }

            const depthRoomPrev = (roomDepth.get(room) ?? 0) - 1;
            const numPathsRoom = roomNumPaths.get(room) ?? 1;
            const depRoom = roomDependency.get(room) ?? 0;

            for (const adj of room.edges) {
                if (!adj.door) {
                    continue;
                }

                const roomPrev: Room = (adj.roomLeft === room) ? adj.roomRight : adj.roomLeft;
                if (roomDepth.get(roomPrev) !== depthRoomPrev) {
                    continue;
                }

                const numPathsRoomPrev = roomNumPaths.get(roomPrev) ?? 0;
                const depRoomPrev = (numPathsRoomPrev / numPathsRoom) * (1 + depRoom);

                roomDependency.set(roomPrev, depRoomPrev);

                if (room !== roomSource) {
                    room.betweenness += depRoom * weight;
                }
            }
        }
    }
}

function estimateBacktracking(rooms: Array<Room>): number {
    // Compute shortest paths from every room to every other room

    const dist: Map<Room, Map<Room, number>> = new Map();

    for (const room0 of rooms) {
        dist.set(room0, new Map());
        for (const room1 of rooms) {
            dist.get(room0)!.set(room1, Infinity);
        }
    }

    for (const room0 of rooms) {
        dist.get(room0)!.set(room0, 0);

        for (const edge of room0.edges) {
            if (!edge.door) {
                continue;
            }
            const room1 = (edge.roomLeft === room0) ? edge.roomRight : edge.roomLeft;
            dist.get(room0)!.set(room1, 1);
        }
    }

    for (const room0 of rooms) {
        for (const room1 of rooms) {
            for (const room2 of rooms) {
                const dist12 = dist.get(room1)!.get(room2)!;
                const dist10 = dist.get(room1)!.get(room0)!;
                const dist02 = dist.get(room0)!.get(room2)!;
                if (dist12 > dist10 + dist02) {
                    dist.get(room1)!.set(room2, dist10 + dist02);
                }
            }
        }
    }

    // Explore the graph using nearest-neighbor algorithm

    const visited: Set<Room> = new Set();

    let roomCur = rooms[0];
    let distTotal = 0;

    while (visited.size < rooms.length) {
        visited.add(roomCur);
        let roomNearest = roomCur;
        let distNearest = Infinity;
        for (const room of rooms) {
            if (room !== roomCur && !visited.has(room)) {
                const d = dist.get(roomCur)!.get(room)!;
                if (d < distNearest) {
                    roomNearest = room;
                    distNearest = d;
                }
            }
        }
        if (distNearest === Infinity) {
            break;
        }

        roomCur = roomNearest;
        distTotal += distNearest;
    }

    return distTotal / (rooms.length - 1);
}

function hasExteriorDoor(room: Room): boolean {
    for (const adj of room.edges) {
        if (!adj.door) {
            continue;
        }
        if (adj.doorType === DoorType.Locked) {
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

function assignVaultRoom(rooms: Array<Room>, level: number, levelType: LevelType, rng: RNG) {
    const deadEndRooms: Array<Room> = [];

    for (const room of rooms) {
        if (room.roomType === RoomType.Exterior) {
            continue;
        }

        if (level >= 8 && room.depth < 3) {
            continue;
        }

        if (levelType === LevelType.Fortress && isCourtyardRoomType(room.roomType)) {
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
        rng.shuffleArray(deadEndRooms);
        deadEndRooms.sort((a, b) => roomArea(a) - roomArea(b));
        const vaultRoom = deadEndRooms[0];

        vaultRoom.roomType = RoomType.Vault;

        for (const adj of vaultRoom.edges) {
            if (adj.door) {
                adj.doorType = DoorType.Locked;
            }
        }
    }
}

function assignRoomTypes(rooms: Array<Room>, level: number, levelType: LevelType, rng: RNG) {

    // Assign master-suite room type to the inner rooms.

    let maxDepth = 0;
    for (const room of rooms) {
        maxDepth = Math.max(maxDepth, room.depth);
    }

    const numRooms = rooms.length - 1; // subtract off the RoomType.Exterior room

    const targetNumMasterRooms = Math.floor((numRooms) / 4);

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
            room.privateRoom = true;
            if (room.roomType == RoomType.PrivateRoom) {
                numMasterRooms += 1;
            }
        }

        if (numMasterRooms >= targetNumMasterRooms) {
            break;
        }

        depth -= 1;
    }

    // Change any private courtyards that are adjacent to public courtyards into public courtyards

    while (true) {
        let changed = false;

        for (const room of rooms) {
            if (room.roomType != RoomType.PrivateCourtyard) {
                continue;
            }

            for (const adj of room.edges) {
                let roomOther = (adj.roomLeft != room) ? adj.roomLeft : adj.roomRight;

                if (roomOther.roomType == RoomType.PublicCourtyard) {
                    room.roomType = RoomType.PublicCourtyard;
                    room.privateRoom = true;
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
    // Note: On Fortress levels we did this in a previous step

    if (level > 4 && levelType !== LevelType.Fortress) {
        assignVaultRoom(rooms, level, levelType, rng);
    }

    // Assign private rooms with only one or two entrances to be bedrooms, if they are large enough
    // TODO: Ideally bedrooms need to be on a dead-end branch of the house (low betweenness)

    for (const room of rooms) {
        if (room.roomType !== RoomType.PrivateRoom) {
            continue;
        }

        const sizeX = room.posMax[0] - room.posMin[0];
        const sizeY = room.posMax[1] - room.posMin[1];

        if (sizeX < 3 && sizeY < 3) {
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

        if (numDoors > 2) {
            continue;
        }

        room.roomType = RoomType.Bedroom;
    }

    // TODO: All these rooms should be chosen in round-robin fashion, where we ensure we've got
    // at least one of everything important for a given mansion size, before then allocating any
    // remaining rooms.

    // Pick a throne room

    if (levelType === LevelType.Fortress) {
        for (const room of chooseRooms(rooms, roomCanBeThroneRoom, 1, rng)) {
            room.roomType = RoomType.ThroneRoom;
        }
    }

    // Pick rooms to be kitchens

    if (numRooms >= 8) {
        for (const room of chooseRooms(rooms, roomCanBeKitchen, 1, rng)) {
            room.roomType = RoomType.Kitchen;
        }
    }

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

    // Pick rooms to be treasure rooms

    let libraryArea = 0;
    for (const room of rooms) {
        if (room.roomType === RoomType.PublicLibrary || room.roomType === RoomType.PrivateLibrary) {
            libraryArea += (room.posMax[0] - room.posMin[0]) * (room.posMax[1] - room.posMin[1]);
        }
    }

    if (libraryArea >= 30 || level === 9) {
        // Mansions with big libraries will have locked treasure(s)
        // Unlocked treasures don't use the library but we use as a proxy of wealth :)
        const lockedTreasures = libraryArea >= 60;

        const maxTreasureRooms = (level === 9) ? 2 : 1;
        for (const room of chooseRooms(rooms, roomCanBeTreasure, maxTreasureRooms, rng)) {
            if (isCourtyardRoomType(room.roomType)) {
                room.roomType = lockedTreasures ? RoomType.LockedTreasureCourtyard : RoomType.TreasureCourtyard;
            } else {
                room.roomType = lockedTreasures ? RoomType.LockedTreasure : RoomType.Treasure;
            }
        }
    }
}

function roomArea(room: Room): number {
    return (room.posMax[0] - room.posMin[0]) * (room.posMax[1] - room.posMin[1]);
}

function chooseRooms(rooms: Array<Room>, acceptRoom: (room: Room) => boolean, maxRooms: number, rng: RNG): Array<Room> {
    const acceptableRooms = rooms.filter(acceptRoom);
    rng.shuffleArray(acceptableRooms);
    return acceptableRooms.slice(0, maxRooms);
}

function roomCanBeKitchen(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom && room.roomType !== RoomType.PrivateRoom) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];

    if (Math.min(sizeX, sizeY) < 3) {
        return false;
    }

    if (Math.max(sizeX, sizeY) > 7) {
        return false;
    }

    if (roomHasExteriorDoor(room)) {
        return false;
    }

    return true;
}

function roomHasExteriorDoor(room: Room): boolean {
    for (const adj of room.edges) {
        if (!adj.door) {
            continue;
        }
        if (adj.roomLeft === room && adj.roomRight.roomType === RoomType.Exterior) {
            return true;
        } else if (adj.roomRight === room && adj.roomLeft.roomType === RoomType.Exterior) {
            return true;
        }
    }
    return false;
}

function roomCanBeTreasure(room: Room): boolean {
    if (room.depth  < 2) {
        return false;
    }

    if (room.roomType !== RoomType.PublicRoom &&
        room.roomType !== RoomType.PrivateRoom &&
        room.roomType !== RoomType.PublicCourtyard &&
        room.roomType !== RoomType.PrivateCourtyard &&
        room.roomType !== RoomType.Bedroom) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    if ((sizeX & 1) === 0) {
        return false;
    }
    if (sizeX < 3) {
        return false;
    }
    if (sizeX > 7) {
        return false;
    }

    const sizeY = room.posMax[1] - room.posMin[1];
    if ((sizeY & 1) === 0) {
        return false;
    }
    if (sizeY < 3) {
        return false;
    }
    if (sizeY > 7) {
        return false;
    }

    return true;
}

function roomCanBeThroneRoom(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom && room.roomType !== RoomType.PrivateRoom) {
        return false;
    }

    if (room.depth < 2) {
        return false;
    }

    if (roomHasExteriorDoor(room)) {
        return false;
    }

    const sizeX = room.posMax[0] - room.posMin[0];
    if (sizeX < 3) {
        return false;
    }

    const sizeY = room.posMax[1] - room.posMin[1];
    if (sizeY < 3) {
        return false;
    }

    if (sizeX < 4 && sizeY < 5) {
        return false;
    }

    if (sizeX < 5 && sizeY < 4) {
        return false;
    }

    // The room should have at least one shorter wall with no door

    if (sizeX < sizeY) {
        if (numDoorsInWall(room, 0, -1) > 0 && numDoorsInWall(room, 0, 1) > 0) {
            return false;
        }
    } else if (sizeY < sizeX) {
        if (numDoorsInWall(room, -1, 0) > 0 && numDoorsInWall(room, 1, 0) > 0) {
            return false;
        }
    } else {
        if (numDoorsInWall(room, 0, -1) > 0 && numDoorsInWall(room, 0, 1) > 0 &&
            numDoorsInWall(room, -1, 0) > 0 && numDoorsInWall(room, 1, 0) > 0) {
            return false;
        }
    }

    return true;
}

function roomCanBeDining(room: Room): boolean {
    if (room.roomType !== RoomType.PublicRoom && room.roomType !== RoomType.PrivateRoom) {
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

function removableAdjacency(adjacencies: Array<Adjacency>, roomExterior: Room, rng: RNG): Adjacency | undefined {
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

        if (room0 === roomExterior) {
            continue;
        }

        if (room1 === roomExterior) {
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

        // Don't let rooms get too long and skinny
        if (room0.roomType !== RoomType.Exterior && aspect > 2) {
            continue;
        }

        removableAdjs.push([adj, aspect]);
    }

    if (removableAdjs.length <= 0) {
        return undefined;
    }

    rng.shuffleArray(removableAdjs);
    removableAdjs.sort((a, b) => a[1] - b[1]);

    return removableAdjs[0][0];
}

function removableAdjacencyWarren(adjacencies: Array<Adjacency>, roomExterior: Room, rng: RNG): Adjacency | undefined {
    const removableAdjs: Array<[Adjacency, number]> = [];

    for (const adj of adjacencies) {
        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        if (room0.roomType !== room1.roomType) {
            continue;
        }

        if (room0 === roomExterior) {
            continue;
        }

        if (room1 === roomExterior) {
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

        // Don't let rooms get too long and skinny
        if (room0.roomType !== RoomType.Exterior &&
            room0.roomType !== RoomType.PublicCourtyard &&
            aspect > ((Math.min(rx, ry) > 2) ? 2.0 : 3.0)) {
            continue;
        }

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
    // Need to remove all mirrored adjacencies here, and then preserve mirroring groups
    // for the edges that are joined on either side.
    
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

    // Remove adj from symmetry group

    removeFromAdjacencyGroup(adj);

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

            if (!adjacenciesAreMergeable(adj0, adj1)) {
                continue;
            }

            // Compute the new origin and length for the combined edge

            const x0 = (adj0.dir[0] >= 0) ? Math.min(adj0.origin[0], adj1.origin[0]) : Math.max(adj0.origin[0], adj1.origin[0]);
            const y0 = (adj0.dir[1] >= 0) ? Math.min(adj0.origin[1], adj1.origin[1]) : Math.max(adj0.origin[1], adj1.origin[1]);
            const length = adj0.length + adj1.length;

            // Store combined origin and length on adj0, the edge we're keeping

            adj0.origin[0] = x0;
            adj0.origin[1] = y0;
            adj0.length = length;

            // Remove joined edges from symmetry groups

            removeFromAdjacencyGroup(adj0);
            removeFromAdjacencyGroup(adj1);

            // If either edge had a door, the combined edge must have a door, since we already established connectivity.

            adj0.door = adj0.door || adj1.door;
            adj0.doorType = Math.max(adj0.doorType, adj1.doorType);

            // Remove edge adj1 from the rooms and the overall list of adjacencies

            const room1 = (adj0.roomLeft === room0) ? adj0.roomRight : adj0.roomLeft;

            removeByValue(room0.edges, adj1);
            removeByValue(room1.edges, adj1);
            removeByValue(adjacencies, adj1);

            return true;
        }
    }

    return false;
}

function adjacenciesAreMergeable(adj0: Adjacency, adj1: Adjacency): boolean {
    // Edges have to be parallel to each other to be merged
    if (Math.abs(adj0.dir.dot(adj1.dir)) !== 1) {
        return false;
    }

    const posAdj0End = vec2.create();
    vec2.scaleAndAdd(posAdj0End, adj0.origin, adj0.dir, adj0.length);
    const posAdj1End = vec2.create();
    vec2.scaleAndAdd(posAdj1End, adj1.origin, adj1.dir, adj1.length);

    if (adj1.roomLeft === adj0.roomLeft && adj1.roomRight === adj0.roomRight) {
        if (posAdj0End.equals(adj1.origin)) {
            return true;
        } else if (posAdj1End.equals(adj0.origin)) {
            return true;
        }
    } else if (adj1.roomLeft === adj0.roomRight && adj1.roomRight === adj0.roomLeft) {
        if (posAdj0End.equals(posAdj1End)) {
            return true;
        } else if (adj0.origin.equals(adj1.origin)) {
            return true;
        }
    }

    return false;
}

function removeByValue<T>(array: Array<T>, value: T) {
    const i = array.indexOf(value);
    array.splice(i, 1);
}

function joinRoomsWarren(rooms: Array<Room>, adjacencies: Array<Adjacency>, rng: RNG) {
    rng.shuffleArray(adjacencies);

    for (let numMergeAttempts = adjacencies.length; numMergeAttempts > 0; --numMergeAttempts) {
        const adj = removableAdjacencyWarren(adjacencies, rooms[0], rng);
        if (adj === undefined) {
            break;
        }

        removeAdjacency(rooms, adjacencies, adj);
    }
}

function makeDoubleRooms(rooms: Array<Room>, adjacencies: Array<Adjacency>, rng: RNG) {
    rng.shuffleArray(adjacencies);

    for (let numMergeAttempts = 2 * Math.floor(rooms.length / 12); numMergeAttempts > 0; --numMergeAttempts) {
        const adj = removableAdjacency(adjacencies, rooms[0], rng);
        if (adj === undefined) {
            break;
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

function placePatrolRoutesLong(gameMap: GameMap, rooms: Array<Room>, rng: RNG): Array<PatrolRoute> {
    let numGuards = Math.floor(rooms.length / 2);

    let patrolRoutes: Array<PatrolRoute> = [];

    for (let i = 0; i < numGuards; ++i) {
        patrolRoutes = patrolRoutes.concat(placePatrolRouteSingle(gameMap, rooms, rng));
    }

    return patrolRoutes;
}

function generatePatrolRouteSingle(rooms: Array<Room>, rng: RNG): Array<PatrolNode> {
    const roomsValid: Set<Room> = new Set();
    for (const room of rooms) {
        if (room.roomType !== RoomType.Exterior && room.roomType !== RoomType.Vault) {
            roomsValid.add(room);
        }
    }

    const roomVisited: Set<Room> = new Set();
    const roomSequence: Array<Room> = [];

    function visitRoom(room: Room) {
        roomSequence.push(room);
        roomVisited.add(room);

        const adjShuffled = [...room.edges];
        rng.shuffleArray(adjShuffled);
        for (const adj of adjShuffled) {
            if (!adj.door) {
                continue;
            }
            const roomNext = (adj.roomLeft === room) ? adj.roomRight : adj.roomLeft;
            if (roomVisited.has(roomNext)) {
                continue;
            }
            if (!roomsValid.has(roomNext)) {
                continue;
            }

            visitRoom(roomNext);
            roomSequence.push(room);
        }
    }

    const roomsToVisit = Array.from(roomsValid);
    const roomStart = roomsToVisit[rng.randomInRange(roomsToVisit.length)];
    visitRoom(roomStart);
    --roomSequence.length;

    const nodes = generatePatrolNodesFromRoomSequence(roomSequence);

    return nodes;
}

function placePatrolRouteSingle(gameMap: GameMap, rooms: Array<Room>, rng: RNG): Array<PatrolRoute> {
    const nodes = generatePatrolRouteSingle(rooms, rng);

    const patrolRoutes = generatePatrolPathsFromNodes(nodes, gameMap, rng);
    console.assert(patrolRoutes.length === 1);

    return patrolRoutes;
}

function placePatrolRouteSingleDense(levelType: LevelType, gameMap: GameMap, rooms: Array<Room>, rng: RNG): Array<PatrolRoute> {
    const roomsValid: Set<Room> = new Set();
    for (const room of rooms) {
        if (isPatrolledRoom(levelType, room)) {
            roomsValid.add(room);
        }
    }

    const adjUsed: Set<Adjacency> = new Set();
    const roomSequence: Array<Room> = [];

    function visitRoom(room: Room) {
        roomSequence.push(room);

        const adjShuffled = [...room.edges];
        rng.shuffleArray(adjShuffled);
        for (const adj of adjShuffled) {
            if (!adj.door) {
                continue;
            }
            if (adjUsed.has(adj)) {
                continue;
            }
            adjUsed.add(adj);
            const roomNext = (adj.roomLeft === room) ? adj.roomRight : adj.roomLeft;
            if (!roomsValid.has(roomNext)) {
                continue;
            }

            visitRoom(roomNext);
            roomSequence.push(room);
        }
    }

    const roomsToVisit = Array.from(roomsValid);
    const roomStart = roomsToVisit[rng.randomInRange(roomsToVisit.length)];
    visitRoom(roomStart);
    --roomSequence.length;

    const nodes = generatePatrolNodesFromRoomSequence(roomSequence);
    const patrolRoutes = generatePatrolPathsFromNodes(nodes, gameMap, rng);

    console.assert(patrolRoutes.length === 1);

    return patrolRoutes;
}

type Visit = {
    stackLen: number;
    room: Room;
}

function placePatrolRouteLargeLoop(gameMap: GameMap, rooms: Array<Room>, rng: RNG): Array<PatrolRoute> {
    const roomsValid: Set<Room> = new Set();
    for (const room of rooms) {
        if (room.roomType !== RoomType.Exterior && room.roomType !== RoomType.Vault) {
            roomsValid.add(room);
        }
    }

    let roomStart = randomSetMember(roomsValid, rng);
    if (roomStart === undefined) {
        return [];
    }

    let roomLoopLongest: Array<Room> = [];
    const roomsVisited: Array<Room> = [];
    const roomsToVisit: Array<Visit> = [];
    roomsToVisit.push({stackLen: 0, room: roomStart});

    while (true) {
        const visit = roomsToVisit.pop();
        if (visit === undefined) {
            break;
        }

        roomsVisited.length = visit.stackLen;

        const i = roomsVisited.indexOf(visit.room);
        if (i >= 0) {
            if (roomsVisited.length - i > roomLoopLongest.length) {
                roomLoopLongest = roomsVisited.slice(i);
            }
            continue;
        }

        roomsVisited.push(visit.room);
        const stackLen = roomsVisited.length;

        const adjShuffled: Array<Adjacency> = [...visit.room.edges];
        rng.shuffleArray(adjShuffled);
        for (const adj of adjShuffled) {
            if (!adj.door) {
                continue;
            }
            const roomNext = (adj.roomLeft === visit.room) ? adj.roomRight : adj.roomLeft;
            if (!roomsValid.has(roomNext)) {
                continue;
            }
            roomsToVisit.push({stackLen: stackLen, room: roomNext});
        }
    }

    const nodes = generatePatrolNodesFromRoomSequence(roomLoopLongest);
    const patrolRoutes = generatePatrolPathsFromNodes(nodes, gameMap, rng);

    console.assert(patrolRoutes.length === 1);

    return patrolRoutes;
}

function randomSetMember<T>(items: Set<T>, rng: RNG): T | undefined {
    const itemsAsList = Array.from(items);
    if (itemsAsList.length === 0) {
        return undefined;
    }

    return itemsAsList[rng.randomInRange(itemsAsList.length)];
}

function generatePatrolNodesFromRoomSequence(roomSequence: Array<Room>): Array<PatrolNode> {
    const nodes: Array<PatrolNode> = [];
    for (const room of roomSequence) {
        nodes.push({
            room: room,
            nodeNext: null,
            nodePrev: null,
            visited: false
        });
    }

    for (let i = 0; i < roomSequence.length; ++i) {
        nodes[i].nodeNext = nodes[(i + 1) % nodes.length];
        nodes[i].nodePrev = nodes[(i + nodes.length - 1) % nodes.length];
    }

    return nodes;
}

function deadEndPatrolNode(nodes: Array<PatrolNode>): PatrolNode | undefined {
    for (const node of nodes) {
        if (node.nodeNext !== null && node.nodePrev !== null && node.nodeNext.room === node.nodePrev.room) {
            return node;
        }
    }
    return undefined;
}

function placePatrolRoutesDense(
    levelType: LevelType,
    level: number,
    gameMap: GameMap,
    rooms: Array<Room>, 
    adjacencies: Array<Adjacency>,
    rng: RNG): Array<PatrolRoute> {

    // Keep adjacencies that connect interior rooms via a door; shuffle them

    const adjacenciesShuffled = adjacencies.filter((adj) =>
        adj.door &&
        isPatrolledRoom(levelType, adj.roomLeft) &&
        isPatrolledRoom(levelType, adj.roomRight));

    rng.shuffleArray(adjacenciesShuffled);

    // Track nodes for each room. Each node represents a visit to that room by a patrol route.

    let nodes: Array<PatrolNode> = [];
    const roomNodes: Map<Room, Array<PatrolNode>> = new Map();

    // Add edges one at a time.

    // If the room at an edge end has a single node, that means it's a dead-end on a route.
    // Extend that route using this edge, so long as doing so does not make the route too
    // long.
    
    // If there is not a dead-end in the room, then the new edge will dead-end in the room.

    // If the new edge joins two ends of a route to form a loop, remove one path around the
    // loop, transferring all side-loops from the removed path to the remaining path around
    // the loop.

    //console.log('Start with %d rooms and %d adjacencies', rooms.length, adjacenciesShuffled.length);

    const maxRouteLength = 26 - 2*level;

    for (const adj of adjacenciesShuffled) {
        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        let nodes0 = roomNodes.get(room0);
        if (nodes0 === undefined) {
            nodes0 = [];
            roomNodes.set(room0, nodes0);
        }

        let nodes1 = roomNodes.get(room1);
        if (nodes1 === undefined) {
            nodes1 = [];
            roomNodes.set(room1, nodes1);
        }

        const deadEnd0 = deadEndPatrolNode(nodes0);
        const deadEnd1 = deadEndPatrolNode(nodes1);

        // TODO:
        //  Reserve activity stations in rooms so multiple people can stop in them

        if (deadEnd0) {
            if (deadEnd1) {
                if (!canJoinNodes(deadEnd0, deadEnd1, maxRouteLength)) {
                    continue;
                }

                // Join deadEnd0 and deadEnd1 together.
                // Before: ... -> deadEnd0 -> nodeNext0 -> ...
                //         ... -> deadEnd1 -> nodeNext1 -> ...
                // After:  ... -> deadEnd0 -> node1 -> nodeNext1 -> ... -> deadEnd1 -> node0 -> nodeNext0 -> ...
                const node0: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
                const node1: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
                const nodeNext0 = deadEnd0.nodeNext;
                const nodeNext1 = deadEnd1.nodeNext;
                deadEnd0.nodeNext = node1;
                node1.nodePrev = deadEnd0;
                node1.nodeNext = nodeNext1;
                if (nodeNext1 !== null) {
                    nodeNext1.nodePrev = node1;
                }
                deadEnd1.nodeNext = node0;
                node0.nodePrev = deadEnd1;
                node0.nodeNext = nodeNext0;
                if (nodeNext0 !== null) {
                    nodeNext0.nodePrev = node0;
                }
                nodes0.push(node0);
                nodes1.push(node1);
                nodes.push(node0);
                nodes.push(node1);
                if (!nodesAreConnected(deadEnd0, deadEnd1)) {
                    if (rng.random() < 0.5) {
                        deletePatrolRoute(deadEnd0, nodes, roomNodes);
                        //console.log('Join %d,%d and %d,%d into a loop; new route length = %d', room0.gridX, room0.gridY, room1.gridX, room1.gridY, loopingPatrolRouteLength(deadEnd1));
                    } else {
                        deletePatrolRoute(deadEnd1, nodes, roomNodes);
                        //console.log('Join %d,%d and %d,%d into a loop; new route length = %d', room0.gridX, room0.gridY, room1.gridX, room1.gridY, loopingPatrolRouteLength(deadEnd0));
                    }
                } else {
                    //console.log('Join %d,%d and %d,%d; combined route length = %d', room0.gridX, room0.gridY, room1.gridX, room1.gridY, loopingPatrolRouteLength(node0));
                }
            } else {
                const length0 = loopingPatrolRouteLength(deadEnd0);
                if (length0 + 2 > maxRouteLength) {
                    //console.log('Skip extend %d,%d to %d,%d because it would create length %d+2 = %d > %d', room0.gridX, room0.gridY, room1.gridX, room1.gridY, length0, length0 + 2, maxRouteLength);
                    continue;
                }

                // Create a new dead end in room1, extending from the dead end in room0.
                //console.log('Extend %d,%d to %d,%d', room0.gridX, room0.gridY, room1.gridX, room1.gridY);
                const node0: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
                const node1: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
                const nodeNext = deadEnd0.nodeNext;
                deadEnd0.nodeNext = node1;
                node1.nodePrev = deadEnd0;
                node1.nodeNext = node0;
                node0.nodePrev = node1;
                node0.nodeNext = nodeNext;
                if (nodeNext !== null) {
                    nodeNext.nodePrev = node0;
                }
                nodes0.push(node0);
                nodes1.push(node1);
                nodes.push(node0);
                nodes.push(node1);
            }
        } else {
            if (deadEnd1) {
                const length1 = loopingPatrolRouteLength(deadEnd1);
                if (length1 + 2 > maxRouteLength) {
                    //console.log('Skip extend %d,%d to %d,%d because it would create length %d+2 = %d > %d', room1.gridX, room1.gridY, room0.gridX, room0.gridY, length1, length1 + 2, maxRouteLength);
                    continue;
                }

                // Create a new dead end in room0, extending from the dead end in room1.
                //console.log('Extend %d,%d to %d,%d', room1.gridX, room1.gridY, room0.gridX, room0.gridY);
                const node0: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
                const node1: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
                const nodeNext = deadEnd1.nodeNext;
                deadEnd1.nodeNext = node0;
                node0.nodePrev = deadEnd1;
                node0.nodeNext = node1;
                node1.nodePrev = node0;
                node1.nodeNext = nodeNext;
                if (nodeNext !== null) {
                    nodeNext.nodePrev = node1;
                }
                nodes0.push(node0);
                nodes1.push(node1);
                nodes.push(node0);
                nodes.push(node1);
            } else {
                // Neither end is a dead end, so add this as its own standalone segment.
                //console.log('Create %d,%d to %d,%d', room0.gridX, room0.gridY, room1.gridX, room1.gridY);
                const node0: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
                const node1: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
                node0.nodeNext = node1;
                node0.nodePrev = node1;
                node1.nodeNext = node0;
                node1.nodePrev = node0;
                nodes0.push(node0);
                nodes1.push(node1);
                nodes.push(node0);
                nodes.push(node1);
            }
        }
    }

    // Find unvisited rooms and generate segments from them

    for (const room of rooms) {
        if (!isPatrolledRoom(levelType, room)) {
            continue;
        }

        {
            const nodes = roomNodes.get(room);
            if (nodes !== undefined && nodes.length > 0) {
                continue;
            }
        }

        const adjPotential = room.edges.filter((adj)=>adj.door && isPatrolledRoom(levelType, adj.roomLeft) && isPatrolledRoom(levelType, adj.roomRight));
        if (adjPotential.length === 0) {
            continue;
        }

        const adj = adjPotential[rng.randomInRange(adjPotential.length)];

        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        let nodes0 = roomNodes.get(room0);
        if (nodes0 === undefined) {
            nodes0 = [];
            roomNodes.set(room0, nodes0);
        }

        let nodes1 = roomNodes.get(room1);
        if (nodes1 === undefined) {
            nodes1 = [];
            roomNodes.set(room1, nodes1);
        }

        //console.log('Connect unvisited %d,%d to %d,%d', room.gridX, room.gridY, (adj.roomLeft === room) ? adj.roomRight.gridX : adj.roomLeft.gridX, (adj.roomLeft === room) ? adj.roomRight.gridY : adj.roomLeft.gridY);
        const node0: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
        const node1: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
        node0.nodeNext = node1;
        node0.nodePrev = node1;
        node1.nodeNext = node0;
        node1.nodePrev = node0;
        nodes0.push(node0);
        nodes1.push(node1);
        nodes.push(node0);
        nodes.push(node1);
    }

    // Find single-segment routes and stitch them into routes passing through their endpoints, where possible

    for (const node of nodes) {
        node.visited = false;
    }

    for (const node of nodes) {
        if (node.visited) {
            continue;
        }

        const routeLength = loopingPatrolRouteLength(node);
        if (routeLength > 2) {
            markLoopingPatrolRouteVisited(node);
            continue;
        }

        // Find the shortest patrol route we can join

        let minLength = Number.MAX_SAFE_INTEGER;
        const potentialJoins: Array<[PatrolNode, PatrolNode]> = [];
        const node0 = node;
        const node1: PatrolNode = node.nodeNext!;
        const room0 = node0.room;
        const room1 = node1.room;
        const room0Nodes: Array<PatrolNode> = roomNodes.get(room0)!;
        const room1Nodes: Array<PatrolNode> = roomNodes.get(room1)!;
        for (const nodeOther of room0Nodes) {
            if (nodeOther === node0) {
                continue;
            }
            const length = loopingPatrolRouteLength(nodeOther);
            if (length > minLength) {
                continue;
            }
            if (length < minLength) {
                minLength = length;
                potentialJoins.length = 0;
            }
            potentialJoins.push([node0, nodeOther]);
        }
        for (const nodeOther of room1Nodes) {
            if (nodeOther === node1) {
                continue;
            }
            const length = loopingPatrolRouteLength(nodeOther);
            if (length > minLength) {
                continue;
            }
            if (length < minLength) {
                minLength = length;
                potentialJoins.length = 0;
            }
            potentialJoins.push([node1, nodeOther]);
        }
        if (potentialJoins.length === 0) {
            markLoopingPatrolRouteVisited(node);
            continue;
        }

        const [nodeJoin0, nodeJoin1] = potentialJoins[rng.randomInRange(potentialJoins.length)];
        const nodeJoin0Prev: PatrolNode = nodeJoin0.nodePrev!;
        const nodeJoin1Prev: PatrolNode = nodeJoin1.nodePrev!;
        //console.log('Join single-segment patrol route ending in %d,%d with patrol route passing through %d,%d', nodeJoin0Prev.room.gridX, nodeJoin0Prev.room.gridY, nodeJoin1.room.gridX, nodeJoin1.room.gridY);
        nodeJoin0Prev.nodeNext = nodeJoin1;
        nodeJoin1.nodePrev = nodeJoin0Prev;
        nodeJoin1Prev.nodeNext = nodeJoin0;
        nodeJoin0.nodePrev = nodeJoin1Prev;

        markLoopingPatrolRouteVisited(node);
    }

    // Search for adjacencies that will stitch in single-segment patrol routes

    for (const adj of adjacenciesShuffled) {
        const room0 = adj.roomLeft;
        const room1 = adj.roomRight;

        let nodes0 = roomNodes.get(room0);
        if (nodes0 === undefined) {
            nodes0 = [];
            roomNodes.set(room0, nodes0);
        }
        let nodes1 = roomNodes.get(room1);
        if (nodes1 === undefined) {
            nodes1 = [];
            roomNodes.set(room1, nodes1);
        }

        const node0 = shortestPatrolRoute(nodes0);
        const node1 = shortestPatrolRoute(nodes1);
        if (node0 === undefined || node1 === undefined) {
            continue;
        }

        if (nodesAreConnected(node0, node1)) {
            continue;
        }

        const length0 = loopingPatrolRouteLength(node0);
        const length1 = loopingPatrolRouteLength(node1);
        if (length0 > 2 && length1 > 2) {
            continue;
        }

        // Before: ... -> node0 -> nodeNext0 -> ...
        //         ... -> nodePrev1 -> node1 -> ...
        // After:  ... -> node0 -> node1 -> ...
        //         ... -> nodePrev1 -> node3 -> node2 -> nodeNext0 -> ...
        //console.log('Join %d-segment route through %d,%d with %d-segment route through %d,%d', length0, room0.gridX, room0.gridY, length1, room1.gridX, room1.gridY);
        const node2: PatrolNode = { room: room0, nodeNext: null, nodePrev: null, visited: false };
        const node3: PatrolNode = { room: room1, nodeNext: null, nodePrev: null, visited: false };
        const nodeNext0 = node0.nodeNext!;
        const nodePrev1 = node1.nodePrev!;
        node0.nodeNext = node1;
        node1.nodePrev = node0;
        nodePrev1.nodeNext = node3;
        node3.nodePrev = nodePrev1;
        node3.nodeNext = node2;
        node2.nodePrev = node3;
        node2.nodeNext = nodeNext0;
        nodeNext0.nodePrev = node2;
        nodes0.push(node2);
        nodes1.push(node3);
        nodes.push(node2);
        nodes.push(node3);
    }

    // On the last couple of levels, add an additional guard who patrols all rooms.
    // TODO: Avoid picking the same activity stations for guards who stop in the same room.

    if (level >= 8) {
        nodes = nodes.concat(generatePatrolRouteSingle(rooms, rng));
    }

    // Convert the node-based patrol routes to actual patrol routes

    const patrolRoutes = generatePatrolPathsFromNodes(nodes, gameMap, rng);

    //console.log('End with %d patrol routes for %d rooms', patrolRoutes.length, rooms.length);

    return patrolRoutes;
}

function shortestPatrolRoute(nodes: Array<PatrolNode> | undefined): PatrolNode | undefined {
    if (nodes === undefined) {
        return undefined;
    }

    let nodeShortest: PatrolNode | undefined = undefined;
    let lengthShortest = Number.MAX_SAFE_INTEGER;

    for (const node of nodes) {
        const length = loopingPatrolRouteLength(node);
        if (length < lengthShortest) {
            lengthShortest = length;
            nodeShortest = node;
        }
    }

    return nodeShortest;
}

function isPatrolledRoom(levelType: LevelType, room: Room): boolean {
    if (room.roomType === RoomType.Vault) {
        return false;
    }
    if (room.roomType === RoomType.Exterior && (levelType !== LevelType.Warrens || room.gridX < 0)) {
        return false;
    }
    return true;
}

function canJoinNodes(node0: PatrolNode, node1: PatrolNode, maxRouteLength: number): boolean {
    if (nodesAreConnected(node0, node1)) {
        if (!isSimpleChain(node0, node1)) {
//            console.log('Skip join %d,%d to %d,%d because it would form a complex loop', node0.room.gridX, node0.room.gridY, node1.room.gridX, node1.room.gridY);
            return false;
        }

        const length = loopingPatrolRouteLength(node0);
        if (length <= 4) {
//            console.log('Skip join %d,%d to %d,%d because it would form a short loop', node0.room.gridX, node0.room.gridY, node1.room.gridX, node1.room.gridY);
            return false;
        }
    } else {
        const length0 = loopingPatrolRouteLength(node0);
        const length1 = loopingPatrolRouteLength(node1);
        if (length0 + length1 + 2 > maxRouteLength) {
//            console.log('Skip join %d,%d to %d,%d because length %d+%d+2 = %d > %d', node0.room.gridX, node0.room.gridY, node1.room.gridX, node1.room.gridY, length0, length1, length0 + length1 + 2, maxRouteLength);
            return false;
        }
    }

    return true;
}

function isSimpleChain(node0: PatrolNode, node1: PatrolNode): boolean {
    let nodePrev = node0.nodePrev;
    let nodeNext = node0.nodeNext;
    while (true) {
        if (nodePrev === nodeNext) {
            return nodePrev === node1;
        }
        if (nodePrev === null || nodeNext === null) {
            return false;
        }
        if (nodePrev === node0 || nodeNext === node0) {
            return false;
        }
        if (nodePrev.room !== nodeNext.room) {
            return false;
        }

        nodePrev = nodePrev.nodePrev;
        nodeNext = nodeNext.nodeNext;
    }
}

function deletePatrolRoute(node: PatrolNode, nodes: Array<PatrolNode>, roomNodes: Map<Room, Array<PatrolNode>>) {
    if (node.nodePrev === null) {
        return;
    }

    node.nodePrev.nodeNext = null;

    while (true) {
        const nodeNext: PatrolNode | null = node.nodeNext;
        node.nodePrev = null;
        node.nodeNext = null;
        removeByValue(nodes, node);
        const nodesInRoom = roomNodes.get(node.room);
        if (nodesInRoom !== undefined) {
            removeByValue(nodesInRoom, node);
        }
        if (nodeNext === null) {
            break;
        }
        node = nodeNext;
    }
}

function placePatrolRoutes(
    level: number,
    gameMap: GameMap,
    rooms: Array<Room>, 
    adjacencies: Array<Adjacency>,
    rng: RNG):
    Array<PatrolRoute> {

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

    return generatePatrolPathsFromNodes(nodes, gameMap, rng);
}

function willNeedToRotate(lookDir: vec2, patrolPositions: Array<vec2>): boolean {
    const moveDir = vec2.create();
    for (let i = patrolPositions.length - 1; i > 0; --i) {
        vec2.subtract(moveDir, patrolPositions[i], patrolPositions[i-1]);
        if (moveDir.equals(lookDir)) {
            return false;
        }
        if (vec2.dot(moveDir, lookDir) <= 0) {
            return true;
        }
    }
    return false;
}

function generatePatrolPathsFromNodes(nodes: Array<PatrolNode>, gameMap: GameMap, rng: RNG): Array<PatrolRoute> {
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

    const patrolRoutes: Array<PatrolRoute> = [];

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
        const rooms: Set<Room> = new Set();
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

            rooms.add(room);

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

                for (const pos of pathBetweenPointsInRoom(gameMap, room, posStart, posMid)) {
                    patrolPositions.push(pos);
                }

                patrolPositions.push(vec2.clone(posMid));

                // If the approaching guard will need to rotate to face the activity station when they
                // arrive, insert an extra turn at the activity station.
                // Note: This is only looking back as far as the door into this room so it may be
                // incorrect sometimes.

                const includeDoors = false;
                const lookPos = gameMap.tryGetPosLookAt(posMid, includeDoors);
                if (lookPos !== undefined) {
                    const lookDir = vec2.create();
                    vec2.subtract(lookDir, lookPos, posMid);
                    if (willNeedToRotate(lookDir, patrolPositions)) {
                        patrolPositions.push(vec2.clone(posMid));
                    }
                }

                patrolPositions.push(vec2.clone(posMid));
                patrolPositions.push(vec2.clone(posMid));

                vec2.copy(posStart, posMid);
            }

            const posEnd = vec2.create();
            posInDoor(posEnd, room, roomNext, gameMap);

            const path = pathBetweenPointsInRoom(gameMap, room, posStart, posEnd);
            for (const pos of path) {
                patrolPositions.push(pos);
            }
        }

        const path = shiftedPathCopy(patrolPositions, rng.randomInRange(patrolPositions.length));

        const roomsArray = Array.from(rooms);
        const minRoomDepth = roomsArray.reduce((minDepth, room) => Math.min(minDepth, room.depth), Infinity);
        const maxRoomDepth = roomsArray.reduce((maxDepth, room) => Math.max(maxDepth, room.depth), 0);
        patrolRoutes.push({path: path, minRoomDepth: minRoomDepth, maxRoomDepth: maxRoomDepth});
    }

    // Shuffle the patrol routes generated so far, since they were created by iterating over the rooms in order.

    rng.shuffleArray(patrolRoutes);

    return patrolRoutes;
}

function appendOutsidePatrolRoutes(outsidePatrolRoute: PatrolRoute, patrolRoutes: Array<PatrolRoute>) {
    const patrolLength = outsidePatrolRoute.path.length;
    patrolRoutes.push({
        path: shiftedPathCopy(outsidePatrolRoute.path, Math.floor(patrolLength * 0.25)),
        minRoomDepth: outsidePatrolRoute.minRoomDepth,
        maxRoomDepth: outsidePatrolRoute.maxRoomDepth
    });
    patrolRoutes.push({
        path: shiftedPathCopy(outsidePatrolRoute.path, Math.floor(patrolLength * 0.75)),
        minRoomDepth: outsidePatrolRoute.minRoomDepth,
        maxRoomDepth: outsidePatrolRoute.maxRoomDepth
    });
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
    const patrolPathNew: Array<vec2> = [];
    for (let i = offset; i < patrolPath.length; ++i) {
        patrolPathNew.push(patrolPath[i]);
    }
    for (let i = 0; i < offset; ++i) {
        patrolPathNew.push(patrolPath[i]);
    }
    return patrolPathNew;
}

function flipReverse(node: PatrolNode | null) {
    let nodeVisited: PatrolNode | null = null;
    while (node != null) {
        const nodeToVisit = node.nodePrev;
        node.nodeNext = nodeToVisit;
        node.nodePrev = nodeVisited;
        nodeVisited = node;
        node = nodeToVisit;
    }
}

function flipForward(node: PatrolNode | null) {
    let nodeVisited: PatrolNode | null = null;
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

function nodesAreConnected(node0: PatrolNode, node1: PatrolNode): boolean {
    let node = node0;
    while (true) {
        if (node === node1) {
            return true;
        }
        if (node.nodeNext === null) {
            break;
        }
        node = node.nodeNext;
        if (node === node0) {
            break;
        }
    }
    return false;
}

function loopingPatrolRouteLength(nodeStart: PatrolNode): number {
    let c = 0;
    let node = nodeStart;
    while (true) {
        ++c;
        if (node.nodeNext === null) {
            break;
        }
        node = node.nodeNext;
        if (node === nodeStart) {
            break;
        }
    }
    return c;
}

function markLoopingPatrolRouteVisited(nodeStart: PatrolNode) {
    let node = nodeStart;
    while (true) {
        node.visited = true;
        if (node.nodeNext === null) {
            break;
        }
        node = node.nodeNext;
        if (node === nodeStart) {
            break;
        }
    }
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
        if ((adj.roomLeft !== room0 || adj.roomRight !== room1) &&
            (adj.roomLeft !== room1 || adj.roomRight !== room0)) {
            continue;
        }

        // Search for a square along the adjacency with a doorway type

        for (let i = 1; i < adj.length; ++i) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, i);
            const terrainType = gameMap.cells.atVec(pos).type;
            if (terrainType >= TerrainType.PortcullisNS && terrainType <= TerrainType.GardenDoorEW) {
                return;
            }
        }

        // If that fails, search along the adjacencty for an open terrain square

        for (let i = 1; i < adj.length; ++i) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, i);
            const terrainType = gameMap.cells.atVec(pos).type;
            if (terrainType <= TerrainType.GroundTreasure) {
                return;
            }
        }

        // If that fails, return a position in the middle of the adjacency

        vec2.scaleAndAdd(pos, adj.origin, adj.dir, Math.floor(adj.length / 2));
        return;
    }

    // Should never hit this; we did not find an adjacency between room0 and room1

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

function playerStartPosition(level: number, levelType: LevelType, adjacencies: Array<Adjacency>, gameMap: GameMap): vec2 {
    let pos: vec2;
    if (levelType === LevelType.Warrens) {
        pos = vec2.fromValues(Math.floor(gameMap.cells.sizeX / 2), 1);
    } else {
        pos = playerStartPositionFrontDoor(adjacencies, gameMap);
        // Setup for initial movement trainer
        if(level === 0) {
            pos[0] -= Math.max(0, 4 - pos[1]);
            pos[1] = Math.max(0, pos[1] - 4);
        }
    }
    return pos;
}

function playerStartPositionFrontDoor(adjacencies: Array<Adjacency>, gameMap: GameMap): vec2 {
    // Find lowest door to exterior

    let adjFrontDoor: Adjacency | undefined = undefined;

    for (const adj of adjacencies) {
        if (!adj.door) {
            continue;
        }

        if (adj.dir[0] === 0) {
            continue;
        }

        if (adj.roomLeft.roomType === RoomType.Exterior) {
            continue;
        }

        if (adj.roomRight.roomType !== RoomType.Exterior) {
            continue;
        }

        if (adjFrontDoor !== undefined && adj.origin[1] > adjFrontDoor.origin[1]) {
            continue;
        }

        adjFrontDoor = adj;
    }

    if (adjFrontDoor === undefined) {
        return vec2.fromValues(0, 0);
    }

    let roomFrom: Room, roomTo: Room;
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

function pathBetweenPointsInRoom(gameMap: GameMap, room: Room, pos0: vec2, pos1: vec2): Array<vec2> {
    const distanceFieldMinX = Math.max(0, room.posMin[0] - 1);
    const distanceFieldMinY = Math.max(0, room.posMin[1] - 1);
    const distanceFieldMaxX = Math.min(gameMap.cells.sizeX, room.posMax[0] + 1);
    const distanceFieldMaxY = Math.min(gameMap.cells.sizeY, room.posMax[1] + 1);
    const distanceFieldRoom = gameMap.computeDistancesToPositionSubrect(pos1, distanceFieldMinX, distanceFieldMinY, distanceFieldMaxX, distanceFieldMaxY);
    const pos = vec2.clone(pos0);
    const path: Array<vec2> = [];
    while (!pos.equals(pos1)) {
        path.push(vec2.clone(pos));
        const posNext = posNextBestInRoom(gameMap, room, distanceFieldRoom, pos);
        if (posNext.equals(pos)) {
            break;
        }
        vec2.copy(pos, posNext);
    }
    return path;
}

function posNextBestInRoom(gameMap: GameMap, room: Room, distanceFieldRoom: Float64Grid, posFrom: vec2): vec2 {
    let costBest = Infinity;
    let posBest = vec2.clone(posFrom);

    const distanceFieldMinX = Math.max(0, room.posMin[0] - 1);
    const distanceFieldMinY = Math.max(0, room.posMin[1] - 1);
    const distanceFieldMaxX = Math.min(gameMap.cells.sizeX, room.posMax[0] + 1);
    const distanceFieldMaxY = Math.min(gameMap.cells.sizeY, room.posMax[1] + 1);

    const posMin = vec2.fromValues(Math.max(distanceFieldMinX, posFrom[0] - 1), Math.max(distanceFieldMinY, posFrom[1] - 1));
    const posMax = vec2.fromValues(Math.min(distanceFieldMaxX, posFrom[0] + 2), Math.min(distanceFieldMaxY, posFrom[1] + 2));

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            const cost = distanceFieldRoom.get(x - distanceFieldMinX, y - distanceFieldMinY);
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
                const cost = distanceFieldRoom.get(x - distanceFieldMinX, y - distanceFieldMinY);
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

function renderWalls(levelType: LevelType, adjacencies: Array<Adjacency>, map: GameMap) {

    // Plot walls around all the rooms, except between courtyard or exterior rooms.

    for (const adj of adjacencies) {
        const type0 = adj.roomLeft.roomType;
        const type1 = adj.roomRight.roomType;

        if (isCourtyardRoomType(type0) && isCourtyardRoomType(type1)) {
            continue;
        }

        if (type0 === RoomType.Exterior && type1 === RoomType.Exterior) {
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

        const walls = adjacencyGroup(adj0);

        for (const adj of walls) {
            adjHandled.add(adj);
        }

        for (const a of walls) {
            if (a.door) {
                continue;
            }

            const roomTypeL = a.roomLeft.roomType;
            const roomTypeR = a.roomRight.roomType;

            if (roomTypeL === RoomType.Vault || roomTypeR === RoomType.Vault) {
                continue;
            }

            /*
            if (roomTypeL === RoomType.ThroneRoom || roomTypeR === RoomType.ThroneRoom) {
                continue;
            }
            */

            if (roomTypeL === RoomType.Exterior && roomTypeR === RoomType.Exterior) {
                continue;
            }

            const dir = vec2.clone(a.dir);

            if ((roomTypeL === RoomType.Exterior) !== (roomTypeR === RoomType.Exterior)) {
                if (roomTypeR == RoomType.Exterior) {
                    vec2.negate(dir, dir);
                }
            } else if (isCourtyardRoomType(roomTypeL) !== isCourtyardRoomType(roomTypeR)) {
                if (isCourtyardRoomType(roomTypeR)) {
                    if (levelType === LevelType.Fortress && a.roomLeft.depth + 1 < a.roomRight.depth) {
                        continue;
                    }
                    vec2.negate(dir, dir);
                } else {
                    if (levelType === LevelType.Fortress && a.roomRight.depth + 1 < a.roomLeft.depth) {
                        continue;
                    }
                }
            } else {
                continue;
            }

            const windowType = oneWayWindowTerrainTypeFromDir(dir);

            if (levelType === LevelType.Fortress && (roomTypeL === RoomType.Exterior || roomTypeR === RoomType.Exterior)) {
                if (a.length > 2 && (a.length & 1) === 0) {
                    const p = vec2.clone(a.origin).scaleAndAdd(a.dir, a.length / 2);
                    map.cells.atVec(p).type = windowType;
                }
            } else if (a.length === 5) {
                const p = vec2.clone(a.origin).scaleAndAdd(a.dir, 2 + ((a.origin[0] + a.origin[1]) & 1));
                map.cells.atVec(p).type = windowType;
            } else {
                const k_end = 1 + Math.floor(a.length / 2) - (a.length & 1);
                for (let k = 2; k < k_end; k += 2) {
                    const p = vec2.clone(a.origin).scaleAndAdd(a.dir, k);
                    const q = vec2.clone(a.origin).scaleAndAdd(a.dir, a.length - k);

                    map.cells.atVec(p).type = windowType;
                    map.cells.atVec(q).type = windowType;
                }
            }
        }

        for (const a of walls) {
            if (!a.door) {
                continue;
            }

            const offset = Math.floor(a.length / 2);

            const p = vec2.clone(a.origin).scaleAndAdd(a.dir, offset);

            let orientNS = (a.dir[0] == 0);

            let roomTypeLeft = a.roomLeft.roomType;
            let roomTypeRight = a.roomRight.roomType;

            if (roomTypeLeft === RoomType.Exterior && roomTypeRight === RoomType.Exterior) {
                continue;
            }

            if (a.doorType === DoorType.GateFront || a.doorType === DoorType.GateBack) {
                map.cells.atVec(p).type = orientNS ? TerrainType.PortcullisNS : TerrainType.PortcullisEW;
                placeItem(map, p, orientNS ? ItemType.PortcullisNS : ItemType.PortcullisEW);
            } else if (a.doorType === DoorType.Locked) {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p, orientNS ? ItemType.LockedDoorNS : ItemType.LockedDoorEW);
            } else if (isCourtyardRoomType(roomTypeLeft) && isCourtyardRoomType(roomTypeRight)) {
                map.cells.atVec(p).type = orientNS ? TerrainType.GardenDoorNS : TerrainType.GardenDoorEW;
            } else if (isCourtyardRoomType(roomTypeLeft) ||
                       isCourtyardRoomType(roomTypeRight) ||
                       !a.roomLeft.privateRoom ||
                       !a.roomRight.privateRoom ||
                       (roomTypeLeft === RoomType.Bedroom) !== (roomTypeRight === RoomType.Bedroom)) {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
                placeItem(map, p, orientNS ? ItemType.DoorNS : ItemType.DoorEW);
            } else {
                map.cells.atVec(p).type = orientNS ? TerrainType.DoorNS : TerrainType.DoorEW;
            }
        }
    }
}

/*
function verifyRoomsHaveDoors(rooms: Array<Room>, map: GameMap, rngSeed: string) {
    for (const room of rooms) {
        if (room.roomType === RoomType.Exterior) {
            continue;
        }
        if (!roomHasDoor(room, map)) {
            console.log('RNG "%s" Room at %d,%d-%d,%d missing door', rngSeed, room.posMin[0], room.posMin[1], room.posMax[0], room.posMax[1]);
            console.assert(false);
        }
    }
}

function roomHasDoor(room: Room, map: GameMap): boolean {
    for (let x = room.posMin[0]; x < room.posMax[0]; ++x) {
        if (map.cells.at(x, room.posMin[1] - 1).type >= TerrainType.PortcullisNS) {
            return true;
        }
        if (map.cells.at(x, room.posMax[1]).type >= TerrainType.PortcullisNS) {
            return true;
        }
    }
    for (let y = room.posMin[1]; y < room.posMax[1]; ++y) {
        if (map.cells.at(room.posMin[0] - 1, y).type >= TerrainType.PortcullisNS) {
            return true;
        }
        if (map.cells.at(room.posMax[0], y).type >= TerrainType.PortcullisNS) {
            return true;
        }
    }

    return false;
}
*/

function renderRooms(level: number, levelType: LevelType, rooms: Array<Room>, map: GameMap, rng: RNG) {
    for (let iRoom = 1; iRoom < rooms.length; ++iRoom) {
        const room = rooms[iRoom];

        let cellType: TerrainType;
        switch (room.roomType) {
            case RoomType.Exterior: cellType = (levelType === LevelType.Warrens) ? TerrainType.GroundNormal : TerrainType.GroundGrass; break;
            case RoomType.PublicCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.PublicRoom: cellType = TerrainType.GroundWood; break;
            case RoomType.PrivateCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.PrivateRoom: cellType = TerrainType.GroundMarble; break;
            case RoomType.Vault: cellType = TerrainType.GroundVault; break;
            case RoomType.Bedroom: cellType = TerrainType.GroundMarble; break;
            case RoomType.Dining: cellType = room.privateRoom ? TerrainType.GroundMarble : TerrainType.GroundWood; break;
            case RoomType.PublicLibrary: cellType = TerrainType.GroundWood; break;
            case RoomType.PrivateLibrary: cellType = TerrainType.GroundMarble; break;
            case RoomType.Kitchen: cellType = TerrainType.GroundWood; break;
            case RoomType.Treasure: cellType = room.privateRoom ? TerrainType.GroundMarble : TerrainType.GroundWood; break;
            case RoomType.TreasureCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.LockedTreasure: cellType = room.privateRoom ? TerrainType.GroundMarble : TerrainType.GroundWood; break;
            case RoomType.LockedTreasureCourtyard: cellType = TerrainType.GroundGrass; break;
            case RoomType.ThroneRoom: cellType = TerrainType.GroundWood; break;
        }

        setRectTerrainType(map, room.posMin[0], room.posMin[1], room.posMax[0], room.posMax[1], cellType);

        if (room.roomType === RoomType.PublicCourtyard || room.roomType === RoomType.PrivateCourtyard) {
            renderRoomCourtyard(map, room, level, rng);
        } else if (room.roomType === RoomType.PublicRoom || room.roomType === RoomType.PrivateRoom) {
            renderRoomGeneric(map, room, level, rng);
        } else if (room.roomType === RoomType.Vault) {
            renderRoomVault(map, room, rng);
        } else if (room.roomType === RoomType.Bedroom) {
            renderRoomBedroom(map, room, level, rng);
        } else if (room.roomType === RoomType.Dining) {
            renderRoomDining(map, room, level, rng);
        } else if (room.roomType === RoomType.Kitchen) {
            renderRoomKitchen(map, room, level, rng);
        } else if (room.roomType === RoomType.Treasure) {
            renderRoomTreasure(map, room, level, rng);
        } else if (room.roomType === RoomType.TreasureCourtyard) {
            renderRoomTreasureCourtyard(map, room, level, rng);
        } else if (room.roomType === RoomType.LockedTreasure) {
            renderRoomTreasure(map, room, level, rng);
        } else if (room.roomType === RoomType.LockedTreasureCourtyard) {
            renderRoomTreasureCourtyard(map, room, level, rng);
        } else if (room.roomType === RoomType.PublicLibrary || room.roomType === RoomType.PrivateLibrary) {
            renderRoomLibrary(map, room, level, rng);
        } else if (room.roomType === RoomType.ThroneRoom) {
            renderRoomThroneRoom(map, room, level, rng);
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
            const cellType = map.cells.atVec(pos).type;
            if (cellType !== TerrainType.GroundGrass) {
                continue;
            }
        
            tryPlaceItem(map, pos, itemTypes[i]);
        }
    }
}

function pillarRoomEndFurniture(level: number, rng: RNG): ItemType {
    const u = rng.random();
    if (u < 0.25) {
        return ItemType.Table;
    } else {
        return randomlyLitTorch(level, rng);
    }
}

function renderRoomGeneric(map: GameMap, room: Room, level: number, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];
    if (dx >= 5 && dy >= 5) {
        if (room.roomType === RoomType.PrivateRoom) {
            if (dx > dy) {
                if (dx > 7) {
                    setRectTerrainType(map, room.posMin[0] + 3, room.posMin[1] + 1, room.posMax[0] - 3, room.posMax[1] - 1, TerrainType.GroundWater);
                }
            } else if (dy > dx) {
                if (dy > 7) {
                    setRectTerrainType(map, room.posMin[0] + 1, room.posMin[1] + 3, room.posMax[0] - 1, room.posMax[1] - 3, TerrainType.GroundWater);
                }
            } else if (dx >= 7) {
                setRectTerrainType(map, room.posMin[0] + 3, room.posMin[1] + 1, room.posMax[0] - 3, room.posMax[1] - 1, TerrainType.GroundWater);
                setRectTerrainType(map, room.posMin[0] + 1, room.posMin[1] + 3, room.posMax[0] - 1, room.posMax[1] - 3, TerrainType.GroundWater);
            } else {
                setRectTerrainType(map, room.posMin[0] + 1, room.posMin[1] + 1, room.posMax[0] - 1, room.posMax[1] - 1, TerrainType.GroundWater);
            }
        } else {
            if (dx > dy) {
                for (let x = room.posMin[0] + 3; x < room.posMax[0] - 3; ++x) {
                    placeItem(map, vec2.fromValues(x, room.posMin[1] + 1), ItemType.Chair);
                    placeItem(map, vec2.fromValues(x, room.posMax[1] - 2), ItemType.Chair);
                }
            } else if (dy > dx) {
                for (let y = room.posMin[1] + 3; y < room.posMax[1] - 3; ++y) {
                    placeItem(map, vec2.fromValues(room.posMin[0] + 1, y), ItemType.Chair);
                    placeItem(map, vec2.fromValues(room.posMax[0] - 2, y), ItemType.Chair);
                }
            } else if (dx === 5 && dy === 5) {
                placeItem(map, vec2.fromValues(room.posMin[0] + 1, room.posMin[1] + 1), ItemType.Table);
                placeItem(map, vec2.fromValues(room.posMin[0] + 2, room.posMin[1] + 1), ItemType.Chair);
                placeItem(map, vec2.fromValues(room.posMin[0] + 1, room.posMin[1] + 2), ItemType.Chair);
                placeItem(map, vec2.fromValues(room.posMax[0] - 2, room.posMax[1] - 2), randomlyLitTorch(level, rng));
            }
        }

        if (dx > 5 || dy > 5) {
            map.cells.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
            map.cells.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
            map.cells.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
            map.cells.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;

            if (dx > dy) {
                const dyLamp = Math.floor(dy / 2);
                placeItem(map, vec2.fromValues(room.posMin[0] + 1, room.posMin[1] + dyLamp), pillarRoomEndFurniture(level, rng));
                placeItem(map, vec2.fromValues(room.posMax[0] - 2, room.posMax[1] - (dyLamp + 1)), pillarRoomEndFurniture(level, rng));
            } else if (dy > dx) {
                const dxLamp = Math.floor(dx / 2);
                placeItem(map, vec2.fromValues(room.posMin[0] + dxLamp, room.posMin[1] + 1), pillarRoomEndFurniture(level, rng));
                placeItem(map, vec2.fromValues(room.posMax[0] - (dxLamp + 1), room.posMax[1] - 2), pillarRoomEndFurniture(level, rng));
            }
        }
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
    } else if (dx >= 5 && dy === 3) {
        let y = Math.floor(room.posMin[1] + dy / 2);
        tryPlaceItem(map, vec2.fromValues(room.posMin[0] + 1, y), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 2, y), randomlyLitTorch(level, rng));
    } else if (dy >= 5 && dx === 3) {
        let x = Math.floor(room.posMin[0] + dx / 2);
        tryPlaceItem(map, vec2.fromValues(x, room.posMin[1] + 1), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(x, room.posMax[1] - 2), randomlyLitTorch(level, rng));
    } else if (dx >= 3 && dy >= 3) {
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

function renderRoomVault(map: GameMap, room: Room, rng: RNG) {
    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];

    const usable = new BooleanGrid(sizeX, sizeY, true);
    const unusable = new BooleanGrid(sizeX, sizeY, false);
    const occupied = new BooleanGrid(sizeX, sizeY, false);

    // Mark two spaces in from the door as unusable, to leave room to push a body

    const pos = vec2.create();
    const dir = vec2.create();

    for (const adj of room.edges) {
        for (let i = 0; i < adj.length; ++i) {
            vec2.scaleAndAdd(pos, adj.origin, adj.dir, i);
            if (map.cells.atVec(pos).type < TerrainType.PortcullisNS) {
                continue;
            }
            vec2.set(dir, -adj.dir[1], adj.dir[0]);
            for (let j = -2; j < 3; ++j) {
                vec2.scaleAndAdd(pos, adj.origin, adj.dir, i);
                vec2.scaleAndAdd(pos, pos, dir, j);
                if (pos[0] >= room.posMin[0] &&
                    pos[1] >= room.posMin[1] &&
                    pos[0] < room.posMax[0] &&
                    pos[1] < room.posMax[1]) {
                    unusable.set(pos[0] - room.posMin[0], pos[1] - room.posMin[1], true);
                }
            }
        }
    }

    // If the room is large enough and the positions are usable, add pillars

    if (sizeX >= 5 && sizeY >= 5) {
        const pillarPositions = [
            vec2.fromValues(room.posMin[0] + 1, room.posMin[1] + 1),
            vec2.fromValues(room.posMax[0] - 2, room.posMin[1] + 1),
            vec2.fromValues(room.posMin[0] + 1, room.posMax[1] - 2),
            vec2.fromValues(room.posMax[0] - 2, room.posMax[1] - 2),
        ];

        if (!pillarPositions.some(pos => unusable.get(pos[0] - room.posMin[0], pos[1] - room.posMin[1]))) {
            for (const pos of pillarPositions) {
                map.cells.atVec(pos).type = TerrainType.Wall0000;
            }
        }
    }

    // TODO: This is all largely a copy of renderRoomBedroom. Need to commonize

    let rootFound = false;
    let rootX = 0;
    let rootY = 0;

    for (let x = 0; x < sizeX; ++x) {
        for (let y = 0; y < sizeY; ++y) {
            if (!isWalkableTerrainType(map.cells.at(x + room.posMin[0], y + room.posMin[1]).type)) {
                occupied.set(x, y, true);
                unusable.set(x, y, true);
                continue;
            }

            if (doorAdjacent(map.cells, vec2.fromValues(x + room.posMin[0], y + room.posMin[1]))) {
                rootFound = true;
                rootX = x;
                rootY = y;
            }
        }
    }

    if (!rootFound) {
        return;
    }

    const candidateItems = [ItemType.VaultTreasureBox, ItemType.VaultTreasureBox, ItemType.DrawersTall, ItemType.DrawersShort, ItemType.Chair, ItemType.Table, ItemType.Bookshelf, ItemType.Shelf, ItemType.TorchUnlit];
    rng.shuffleArray(candidateItems);

    const itemsInRoom: Array<Item> = [];

    for (let iItemType = 0; ; iItemType = (iItemType + 1) % candidateItems.length) {
        for (let j = 0; j < usable.values.length; ++j) {
            usable.values[j] = unusable.values[j] ? 0 : 1;
        }
        updateUsable(usable, occupied, rootX, rootY);
        updateUsableForReachability(usable, occupied, itemsInRoom, room);
        const positions = getUsablePositions(usable);
        if (positions.length === 0) {
            break;
        }

        const pos = positions[rng.randomInRange(positions.length)];

        console.assert(usable.get(pos[0], pos[1]));
        console.assert(!occupied.get(pos[0], pos[1]));

        const iType = candidateItems[iItemType];
        const item = { pos: vec2.fromValues(pos[0] + room.posMin[0], pos[1] + room.posMin[1]), type: iType, topLayer:itemLayers[iType] };
        map.items.push(item);
        itemsInRoom.push(item);

        occupied.set(pos[0], pos[1], true);
        unusable.set(pos[0], pos[1], true);

        // Vault treasure boxes don't repeat

        if (iType === ItemType.VaultTreasureBox) {
            candidateItems.splice(iItemType, 1);
            --iItemType;
        }
    }
}

function renderRoomBedroom(map: GameMap, room: Room, level: number, rng: RNG) {
    // Look for a place to put the bed that doesn't block any doors and is against a wall

    // Should I use indices for the graph positions, and convert to coordinates via a lookup table or something?

    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];
    const usable = new BooleanGrid(sizeX, sizeY, true);
    const unusableShort = new BooleanGrid(sizeX, sizeY, false);
    const unusableTall = new BooleanGrid(sizeX, sizeY, false);
    const occupied = new BooleanGrid(sizeX, sizeY, false);

    let rootX, rootY;

    const pos = vec2.create();
    for (let x = 0; x < sizeX; ++x) {
        for (let y = 0; y < sizeY; ++y) {
            pos.set(x + room.posMin[0], y + room.posMin[1]);
            if (!isWalkableTerrainType(map.cells.atVec(pos).type)) {
                occupied.set(x, y, true);
                unusableShort.set(x, y, true);
                unusableTall.set(x, y, true);
            } else if (doorAdjacent(map.cells, pos)) {
                unusableShort.set(x, y, true);
                unusableTall.set(x, y, true);
                rootX = x;
                rootY = y;
            }
            if (windowAdjacent(map.cells, pos) || !isAdjacentToWall(map, pos)) {
                unusableTall.set(x, y, true);
            }
        }
    }

    if (rootX === undefined || rootY === undefined) {
        return;
    }

    const potentialPositions: Array<vec2> = [];
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

            // If the room is only as wide as the bed, the bed must be at the top or bottom
            // or it will split the room.

            if (sizeX === 2 && y !== room.posMin[1] && y !== room.posMax[1] - 1) {
                continue;
            }

            potentialPositions.push(pos0);
        }
    }

    const itemsInRoom: Array<Item> = [];

    if (potentialPositions.length > 0) {
        const pos0 = potentialPositions[rng.randomInRange(potentialPositions.length)];
        const pos1 = vec2.fromValues(pos0[0] + 1, pos0[1]);

        const itemBedL = { pos: vec2.clone(pos0), type: ItemType.BedL, topLayer:itemLayers[ItemType.BedL] };
        const itemBedR = { pos: vec2.clone(pos1), type: ItemType.BedR, topLayer:itemLayers[ItemType.BedR] };
        map.items.push(itemBedL);
        map.items.push(itemBedR);
        itemsInRoom.push(itemBedL); // will check adjacency for the right side of the bed with this too
    
        const x = pos0[0] - room.posMin[0];
        const y = pos0[1] - room.posMin[1];
        occupied.set(x, y, true);
        occupied.set(x + 1, y, true);

        unusableShort.set(x, y, true);
        unusableShort.set(x + 1, y, true);

        unusableTall.set(x, y, true);
        unusableTall.set(x + 1, y, true);
    }

    const candidateItems = [ItemType.DrawersTall, ItemType.DrawersShort, ItemType.Chair, ItemType.Chair, ItemType.Table, ItemType.Bookshelf, randomlyLitTorch(level, rng)];
    rng.shuffleArray(candidateItems);

    for (const itemType of candidateItems) {
        const unusable = isTallItemType(itemType) ? unusableTall : unusableShort;
        for (let j = 0; j < usable.values.length; ++j) {
            usable.values[j] = unusable.values[j] ? 0 : 1;
        }
        updateUsable(usable, occupied, rootX, rootY);
        updateUsableForReachability(usable, occupied, itemsInRoom, room);
        const positions = getUsablePositions(usable);
        if (positions.length === 0) {
            break;
        }

        const pos = positions[rng.randomInRange(positions.length)];

        console.assert(usable.get(pos[0], pos[1]));
        console.assert(!occupied.get(pos[0], pos[1]));

        const item = { pos: vec2.fromValues(pos[0] + room.posMin[0], pos[1] + room.posMin[1]), type: itemType, topLayer:itemLayers[itemType] };
        map.items.push(item);
        itemsInRoom.push(item);

        occupied.set(pos[0], pos[1], true);
        unusableShort.set(pos[0], pos[1], true);
        unusableTall.set(pos[0], pos[1], true);
    }
}

function isTallItemType(itemType: ItemType): boolean {
    switch (itemType) {
        case ItemType.Bookshelf:
        case ItemType.DrawersShort:
        case ItemType.VaultTreasureBox:
        case ItemType.EmptyVaultTreasureBox:
        case ItemType.LootedVaultTreasureBox:
        case ItemType.DrawersTall:
        case ItemType.Shelf:
        case ItemType.TorchUnlit:
        case ItemType.TorchLit:
        case ItemType.Stove:
            return true;
        default:
            return false;
    }
}

function updateUsableForReachability(usable: BooleanGrid, occupied: BooleanGrid, items: Array<Item>, room: Room) {
    const sizeX = usable.sizeX;
    const sizeY = usable.sizeY;

    for (const item of items) {
        const x = item.pos[0] - room.posMin[0];
        const y = item.pos[1] - room.posMin[1];

        const unoccupiedNeighbors: Array<[number, number]> = [];
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= sizeX || ny >= sizeY) {
                continue;
            }
            if (!occupied.get(nx, ny)) {
                unoccupiedNeighbors.push([nx, ny]);
            }
        }

        // For beds, also consider positions around the right side of the bed

        if (item.type === ItemType.BedL) {
            for (const [dx, dy] of [[1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx + 1;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= sizeX || ny >= sizeY) {
                    continue;
                }
                if (!occupied.get(nx, ny)) {
                    unoccupiedNeighbors.push([nx, ny]);
                }
            }
        }

        if (unoccupiedNeighbors.length === 1) {
            const [nx, ny] = unoccupiedNeighbors[0];
            usable.set(nx, ny, false);
        }
    }
}

// Find "biconnected components" in the graph formed by occupied and mark them not usable.
// These are squares that, if they were to become occupied, would split the graph into disjoint pieces.
// Algorithm from Hopcroft/Tarjan via wikipedia.

function updateUsable(usable: BooleanGrid, occupied: BooleanGrid, rootX: number, rootY: number) {
    const sizeX = occupied.sizeX;
    const sizeY = occupied.sizeY;
    console.assert(usable.sizeX === sizeX);
    console.assert(usable.sizeY === sizeY);
    console.assert(rootX >= 0);
    console.assert(rootY >= 0);
    console.assert(rootX < sizeX);
    console.assert(rootY < sizeY);
    console.assert(!occupied.get(rootX, rootY));
    const visited = new BooleanGrid(sizeX, sizeY, false);
    const depth = new Int32Grid(sizeX, sizeY, 0);
    const low = new Int32Grid(sizeX, sizeY, 0);

    function dfs(x: number, y: number, depthCur: number, parentX: number, parentY: number) {
        visited.set(x, y, true);
        depth.set(x, y, depthCur);
        low.set(x, y, depthCur);

        let numChildren = 0;
        let isArticulation = false;

        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= sizeX || ny < 0 || ny >= sizeY) {
                continue;
            }

            if (occupied.get(nx, ny)) {
                continue;
            }

            if (!visited.get(nx, ny)) {
                dfs(nx, ny, depthCur + 1, x, y);
                ++numChildren;
                if (low.get(nx, ny) >= depthCur) {
                    isArticulation = true;
                }
                low.set(x, y, Math.min(low.get(x, y), low.get(nx, ny)));
            } else if (nx !== parentX || ny !== parentY) {
                low.set(x, y, Math.min(low.get(x, y), depth.get(nx, ny)));
            }
        }

        const hasParent = parentX >= 0;
        if (hasParent) {
            if (isArticulation) {
                usable.set(x, y, false);
            }
        } else {
            if (numChildren > 1) {
                usable.set(x, y, false);
            }
        }
    }

    dfs(rootX, rootY, 0, -1, -1);

    /*
    for (let y = sizeY - 1; y >= 0; --y) {
        let s = '';
        for (let x = 0; x < sizeX; ++x) {
            s += occupied.get(x, y) ? 'O' : usable.get(x, y) ? '.' : 'X';
        }
        console.log('%d: %s', y, s);
    }
    */
}

function renderRoomKitchen(map: GameMap, room: Room, level: number, rng: RNG) {
    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];

    // Work out a major axis for the kitchen, based on dimensions first, and exits second

    let positions: Array<vec2> = [];

    const axisEW = sizeX > sizeY || (sizeX === sizeY && numExitsNS(room) <= numExitsEW(room));

    if (axisEW) {
        for (let x = 0; x < sizeX; ++x) {
            positions.push(vec2.fromValues(x + room.posMin[0], room.posMin[1]));
            positions.push(vec2.fromValues(x + room.posMin[0], room.posMax[1] - 1));
        }
        const centerX = (room.posMin[0] + room.posMax[0]) / 2;
        positions.sort((pos0, pos1)=>Math.abs(pos0[0] - centerX) - Math.abs(pos1[0] - centerX));
    } else {
        for (let y = 0; y < sizeY; ++y) {
            positions.push(vec2.fromValues(room.posMin[0], y + room.posMin[1]));
            positions.push(vec2.fromValues(room.posMax[0] - 1, y + room.posMin[1]));
        }
        const centerY = (room.posMin[1] + room.posMax[1]) / 2;
        positions.sort((pos0, pos1)=>Math.abs(pos0[1] - centerY) - Math.abs(pos1[1] - centerY));
    }

    positions = positions.filter((pos)=>!doorAdjacent(map.cells, pos) && wallOrWindowAdjacent(map.cells, pos));

    let numStoves = numberToIntegral(sizeX * sizeY / 10, rng);
    let numShelves = numberToIntegral(positions.length / 3, rng);
    let numTables = numberToIntegral(positions.length / 2, rng);

    for (const pos of positions) {
        if (windowAdjacent(map.cells, pos)) {
            if (numTables > 0) {
                placeItem(map, pos, ItemType.Table);
                --numTables;
            }
        } else {
            if (numStoves > 0) {
                placeItem(map, pos, ItemType.Stove);
                --numStoves;
            } else if (numTables > 0) {
                placeItem(map, pos, ItemType.Table);
                --numTables;
            } else if (numShelves > 0) {
                placeItem(map, pos, ItemType.Shelf);
                --numShelves;
            }
        }
    }

    // Put tables in the middle if the room is big enough

    if (axisEW) {
        if (sizeY >= 5) {
            for (let x = room.posMin[0] + 1; x < room.posMax[0] - 1; x += 2) {
                for (let y = room.posMin[1] + 2; y < room.posMax[1] - 2; ++y) {
                    placeItem(map, vec2.fromValues(x, y), ItemType.Table);
                }
            }
        }
    } else {
        if (sizeX >= 5) {
            for (let y = room.posMin[1] + 1; y < room.posMax[1] - 1; y += 2) {
                for (let x = room.posMin[0] + 2; x < room.posMax[0] - 2; ++x) {
                    placeItem(map, vec2.fromValues(x, y), ItemType.Table);
                }
            }
        }
    }
}

function renderRoomTreasure(map: GameMap, room: Room, level: number, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];

    const x = room.posMin[0] + Math.floor((dx - 1) / 2);
    const y = room.posMin[1] + Math.floor((dy - 1) / 2);

    setRectTerrainType(map, x, y, x + 1, y + 1, TerrainType.GroundTreasure);

    placeItem(map, vec2.fromValues(x, y), ItemType.TreasurePlinth);
    if (room.roomType===RoomType.LockedTreasure) {
        placeItem(map, vec2.fromValues(x, y), ItemType.TreasureLock);
    }

    if (dx >= 5 || dy >= 5) {
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMin[1]), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMin[1]), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMax[1] - 1), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMax[1] - 1), randomlyLitTorch(level, rng));
    }
}

function renderRoomTreasureCourtyard(map: GameMap, room: Room, level: number, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];

    const x = room.posMin[0] + Math.floor((dx - 1) / 2);
    const y = room.posMin[1] + Math.floor((dy - 1) / 2);

    if (dx > 3 && dy > 3) {
        setRectTerrainType(
            map,
            Math.max(room.posMin[0] + 1, x - 1),
            Math.max(room.posMin[1] + 1, y - 1),
            Math.min(room.posMax[0] - 1, x + 2),
            Math.min(room.posMax[1] - 1, y + 2),
            TerrainType.GroundVault);
    } else {
        setRectTerrainType(map, x, y, x + 1, y + 1, TerrainType.GroundTreasure);
    }

    placeItem(map, vec2.fromValues(x, y), ItemType.TreasurePlinth);
    if (room.roomType===RoomType.LockedTreasureCourtyard) {
        placeItem(map, vec2.fromValues(x, y), ItemType.TreasureLock);
    }

    if (dx >= 5 || dy >= 5) {
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMin[1]), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMin[1]), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMin[0], room.posMax[1] - 1), randomlyLitTorch(level, rng));
        tryPlaceItem(map, vec2.fromValues(room.posMax[0] - 1, room.posMax[1] - 1), randomlyLitTorch(level, rng));
    }
}

function numberToIntegral(n: number, rng: RNG): number {
    const fraction = n - Math.floor(n);
    n = Math.floor(n);
    if (rng.random() < fraction) {
        ++n;
    }
    return n;
}

function numExitsEW(room: Room): number {
    let numExits = 0;
    for (const adj of room.edges) {
        if (adj.dir[0] !== 0) {
            continue;
        }
        if (adj.door) {
            ++numExits;
        }
    }
    return numExits;
}

function numExitsNS(room: Room): number {
    let numExits = 0;
    for (const adj of room.edges) {
        if (adj.dir[1] !== 0) {
            continue;
        }
        if (adj.door) {
            ++numExits;
        }
    }
    return numExits;
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

function numDoorsInWall(room: Room, dx: number, dy: number): number {
    let n = 0;
    for (const adj of room.edges) {
        if (!adj.door) {
            continue;
        }
        let dxWall = -adj.dir[1];
        let dyWall = adj.dir[0];
        if (adj.roomLeft === room) {
            dxWall = -dxWall;
            dyWall = -dyWall;
        }
        if (dxWall === dx && dyWall === dy) {
            ++n;
        }
    }
    return n;
}

function wallDistanceFromDoor(room: Room, dx: number, dy: number): number {
    // [dx, dy] is unit vector pointing outward from room perpendicular to the wall being measured against
    // Point inward instead
    dx = -dx;
    dy = -dy;
    const dir = vec2.fromValues(dx, dy);
    const posDoor = vec2.create();
    const posOffset = vec2.create();
    if (dx > 0) {
        vec2.set(posOffset, room.posMin[0] - 1, 0);
    } else if (dx < 0) {
        vec2.set(posOffset, room.posMax[0], 0);
    } else if (dy > 0) {
        vec2.set(posOffset, 0, room.posMin[1] - 1);
    } else {
        vec2.set(posOffset, 0, room.posMax[1]);
    }

    let minDist = Infinity;
    for (const adj of room.edges) {
        if (!adj.door) {
            continue;
        }

        vec2.scaleAndAdd(posDoor, adj.origin, adj.dir, Math.floor(adj.length / 2));
        vec2.subtract(posDoor, posDoor, posOffset);

        const dist = vec2.dot(dir, posDoor);
        minDist = Math.min(minDist, dist);
    }

    console.assert(minDist >= 0);

    return minDist;
}

function renderRoomThroneRoom(map: GameMap, room: Room, level: number, rng: RNG) {

    // Build a coordinate system for constructing the throne room

    let x0: number;
    let y0: number;
    let dx: number;
    let dy: number;
    let throneWallLen: number;
    let crossWallLen: number;

    if (room.posMax[1] - room.posMin[1] < room.posMax[0] - room.posMin[0] ||
        (numDoorsInWall(room, 0, -1) !== 0 && numDoorsInWall(room, 0, 1) !== 0)) {
        throneWallLen = room.posMax[1] - room.posMin[1];
        crossWallLen = room.posMax[0] - room.posMin[0];
        dx = 0;
        if (wallDistanceFromDoor(room, -1, 0) > wallDistanceFromDoor(room, 1, 0)) {
            // Throne on left wall
            x0 = room.posMin[0];
            y0 = room.posMin[1];
            dy = 1;
        } else {
            // Throne on right wall
            x0 = room.posMax[0] - 1;
            y0 = room.posMax[1] - 1;
            dy = -1;
        }
    } else {
        throneWallLen = room.posMax[0] - room.posMin[0];
        crossWallLen = room.posMax[1] - room.posMin[1];
        dy = 0;
        if (wallDistanceFromDoor(room, 0, -1) > wallDistanceFromDoor(room, 0, 1)) {
            // Throne on bottom wall
            x0 = room.posMax[0] - 1;
            y0 = room.posMin[1];
            dx = -1;
        } else {
            // Throne on top wall
            x0 = room.posMin[0];
            y0 = room.posMax[1] - 1;
            dx = 1;
        }
    }

    const dirWall = vec2.fromValues(dx, dy);
    const dirCross = vec2.fromValues(dy, -dx);
    const origin = vec2.fromValues(x0, y0);
    const pos = vec2.create();

    const numThrones = ((throneWallLen & 1) !== 0) ? 1 : 2;
    const offset = Math.floor((throneWallLen - numThrones) / 2);

    // Lay down a rug

    for (let i = 0; i < crossWallLen - 1; ++i) {
        for (let j = 0; j < numThrones; ++j) {
            vec2.scaleAndAdd(pos, origin, dirWall, offset + j);
            vec2.scaleAndAdd(pos, pos, dirCross, i);
            map.cells.atVec(pos).type = TerrainType.GroundMarble;
        }
    }

    // Put the throne(s) and lamps on the throne wall

    for (let i = 0; i < numThrones; ++i) {
        vec2.scaleAndAdd(pos, origin, dirWall, offset + i);
        placeItem(map, pos, ItemType.Chair);
    }

    vec2.scaleAndAdd(pos, origin, dirWall, offset - 1);
    tryPlaceItem(map, pos, ItemType.DrawersShort);

    vec2.scaleAndAdd(pos, origin, dirWall, offset + numThrones);
    tryPlaceItem(map, pos, ItemType.DrawersShort);

    if (throneWallLen > 4) {
        vec2.scaleAndAdd(pos, origin, dirWall, 0);
        tryPlaceItem(map, pos, ItemType.TorchLit);

        vec2.scaleAndAdd(pos, origin, dirWall, throneWallLen - 1);
        tryPlaceItem(map, pos, ItemType.TorchLit);
    }

    if (crossWallLen > 6) {
        if (throneWallLen >= 5) {
            for (let i = 2; i < crossWallLen - 2; ++i) {
                vec2.scaleAndAdd(pos, origin, dirWall, 1);
                vec2.scaleAndAdd(pos, pos, dirCross, i);
                tryPlaceItem(map, pos, ItemType.Chair);

                vec2.scaleAndAdd(pos, origin, dirWall, throneWallLen - 2);
                vec2.scaleAndAdd(pos, pos, dirCross, i);
                tryPlaceItem(map, pos, ItemType.Chair);
            }
        } else {
            if (numDoorsInWall(room, -dirWall[0], -dirWall[1]) === 0) {
                for (let i = 2; i < crossWallLen - 2; ++i) {
                    vec2.scaleAndAdd(pos, origin, dirWall, 0);
                    vec2.scaleAndAdd(pos, pos, dirCross, i);
                    tryPlaceItem(map, pos, ItemType.Chair);
                }
            }

            if (numDoorsInWall(room, dirWall[0], dirWall[1]) === 0) {
                for (let i = 2; i < crossWallLen - 2; ++i) {
                    vec2.scaleAndAdd(pos, origin, dirWall, throneWallLen - 1);
                    vec2.scaleAndAdd(pos, pos, dirCross, i);
                    tryPlaceItem(map, pos, ItemType.Chair);
                }
            }
        }
    }

    vec2.scaleAndAdd(pos, origin, dirWall, 0);
    vec2.scaleAndAdd(pos, pos, dirCross, crossWallLen - 1);
    tryPlaceItem(map, pos, ItemType.TorchLit);

    vec2.scaleAndAdd(pos, origin, dirWall, throneWallLen - 1);
    vec2.scaleAndAdd(pos, pos, dirCross, crossWallLen - 1);
    tryPlaceItem(map, pos, ItemType.TorchLit);
}

function renderRoomLibrary(map: GameMap, room: Room, level: number, rng: RNG) {
    const x0 = room.posMin[0];
    const y0 = room.posMin[1];
    const rx = room.posMax[0] - room.posMin[0];
    const ry = room.posMax[1] - room.posMin[1];

    if (rx >= ry) {
        if ((rx & 1) === 1) {
            for (let x = 1; x < rx; x += 2) {
                for (let y = 1; y < ry - 1; ++y) {
                    placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                }
            }
        } else {
            const cx = rx / 2 - 1;
            for (let x = 1; x < cx; x += 2) {
                for (let y = 1; y < ry - 1; ++y) {
                    placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                    placeItem(map, vec2.fromValues(x0 + rx - (x + 1), y0 + y), ItemType.Bookshelf);
                }
            }

            if ((cx & 1) === 1) {
                for (let y = y0 + 1; y < y0 + ry - 1; ++y) {
                    let items: [ItemType | undefined, ItemType | undefined] = [undefined, undefined];
                    if (y > y0 + 1 && (y < y0 + ry - 2 || ry === 4)) {
                        items = [ItemType.Table, ItemType.Chair];
                    } else {
                        items = [randomlyLitTorch(level, rng), undefined];
                    }
                    rng.shuffleArray(items);
                    if (items[0] !== undefined) {
                        placeItem(map, vec2.fromValues(x0 + cx, y), items[0]);
                    }
                    if (items[1] !== undefined) {
                        placeItem(map, vec2.fromValues(x0 + cx + 1, y), items[1]);
                    }
                }
            }
        }
    } else {
        if ((ry & 1) === 1) {
            for (let y = 1; y < ry; y += 2) {
                for (let x = 1; x < rx - 1; ++x) {
                    placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                }
            }
        } else {
            const cy = ry / 2 - 1;
            for (let y = 1; y < cy; y += 2) {
                for (let x = 1; x < rx - 1; ++x) {
                    placeItem(map, vec2.fromValues(x0 + x, y0 + y), ItemType.Bookshelf);
                    placeItem(map, vec2.fromValues(x0 + x, y0 + ry - (y + 1)), ItemType.Bookshelf);
                }
            }

            if ((cy & 1) === 1) {
                for (let x = x0 + 1; x < x0 + rx - 1; ++x) {
                    let items: [ItemType | undefined, ItemType | undefined] = [undefined, undefined];
                    if (x > x0 + 1 && (x < x0 + rx - 2 || rx === 4)) {
                        items = [ItemType.Table, ItemType.Chair];
                    } else {
                        items = [randomlyLitTorch(level, rng), undefined];
                    }
                    rng.shuffleArray(items);
                    if (items[0] !== undefined) {
                        placeItem(map, vec2.fromValues(x, y0 + cy), items[0]);
                    }
                    if (items[1] !== undefined) {
                        placeItem(map, vec2.fromValues(x, y0 + cy + 1), items[1]);
                    }
                }
            }
        }
    }
}

function getUsablePositions(usable: BooleanGrid): Array<vec2> {
    const positions: Array<vec2> = [];

    for (let x = 0; x < usable.sizeX; ++x) {
        for (let y = 0; y < usable.sizeY; ++y) {
            if (usable.get(x, y)) {
                positions.push(vec2.fromValues(x, y));
            }
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
            if (map.items.some(item => item.pos[0] === x && item.pos[1] === y && item.type !== ItemType.Coin)) {
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
                map.cells.at(x - 1, y).type === TerrainType.GroundWood &&
                map.cells.at(x + 1, y).type === TerrainType.GroundWood &&
                !map.items.some(item => item.pos[0] === x - 1 && item.pos[1] === y && blocksPlayerMovement(item.type)) &&
                !map.items.some(item => item.pos[0] === x + 1 && item.pos[1] === y && blocksPlayerMovement(item.type));
            const canLeapVert =
                y > room.posMin[1] &&
                y < room.posMax[1] - 1 &&
                map.cells.at(x, y - 1).type === TerrainType.GroundWood &&
                map.cells.at(x, y + 1).type === TerrainType.GroundWood &&
                !map.items.some(item => item.pos[0] === x && item.pos[1] === y - 1 && blocksPlayerMovement(item.type)) &&
                !map.items.some(item => item.pos[0] === x && item.pos[1] === y + 1 && blocksPlayerMovement(item.type));
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

    return (rng.random() < 0.05) ? ItemType.TorchUnlit : ItemType.TorchLit;
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
        topLayer: itemLayers[type],
    });
}

function placeLoot(totalLootToPlace: number, rooms: Array<Room>, map: GameMap, patrolRoutes: Array<PatrolRoute>, levelType: LevelType, rng: RNG) {

    // Build maps of preferred and prohibited positions on the map

    const posPreferred = buildPosPreferred(map);
    const posProhibited = buildPosProhibited(map, patrolRoutes);

    let totalLootPlaced = 0;

    // Throne rooms may get loot.

    for (const room of rooms) {
        if (room.roomType !== RoomType.ThroneRoom) {
            continue;
        }

        if (totalLootPlaced >= totalLootToPlace) {
            break;
        }

        if (tryPlaceLoot(posProhibited, posPreferred, room.posMin, room.posMax, map, rng)) {
            ++totalLootPlaced;
        }
    }

    // Vault rooms (may) get loot.

    for (const room of rooms) {
        if (room.roomType !== RoomType.Vault) {
            continue;
        }

        let i = rng.randomInRange(3) + rng.randomInRange(3);
        if (levelType === LevelType.Fortress) {
            i += 2;
        }

        while (i > 0) {
            --i;

            if (totalLootPlaced >= totalLootToPlace) {
                break;
            }

            if (tryPlaceLoot(posProhibited, posPreferred, room.posMin, room.posMax, map, rng)) {
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
            if (tryPlaceLoot(posProhibited, posPreferred, room.posMin, room.posMax, map, rng)) {
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

        if (tryPlaceLoot(posProhibited, posPreferred, room.posMin, room.posMax, map, rng)) {
            ++totalLootPlaced;
        }
    }

    // Place extra loot to reach desired total.

    const candidateRooms = rooms.filter((room) => room.roomType !== RoomType.Exterior && !isCourtyardRoomType(room.roomType));
    rng.shuffleArray(candidateRooms);
    for (let i = 0; i < 1000 && totalLootPlaced < totalLootToPlace; ++i) {
        const room = candidateRooms[i % candidateRooms.length];
        if (tryPlaceLoot(posProhibited, posPreferred, room.posMin, room.posMax, map, rng)) {
            ++totalLootPlaced;
        }
    }

    console.assert(totalLootPlaced === totalLootToPlace);
}

function canHoldLoot(itemType: ItemType): boolean {
    switch (itemType) {
        case ItemType.Chair:
        case ItemType.Table:
        case ItemType.DrawersShort:
        case ItemType.DrawersTall:
        case ItemType.Bookshelf:
        case ItemType.Shelf:
        case ItemType.Bush:
            return true;
        default:
            return false;
    }
}

function canHoldHealth(itemType: ItemType): boolean {
    return itemType === ItemType.Table;
}

function buildPosPreferred(map: GameMap): BooleanGrid {
    const posPreferred = new BooleanGrid(map.cells.sizeX, map.cells.sizeY, false);

    // Try to put loot on loot-holding furniture

    for (const item of map.items) {
        if (canHoldLoot(item.type)) {
            posPreferred.set(item.pos[0], item.pos[1], true);
        }
    }

    return posPreferred;
}

function buildPosProhibited(map: GameMap, patrolRoutes: Array<PatrolRoute>): BooleanGrid {
    const posProhibited = new BooleanGrid(map.cells.sizeX, map.cells.sizeY, false);

    // Reject places in water or walls

    for (let x = 0; x < map.cells.sizeX; ++x) {
        for (let y = 0; y < map.cells.sizeY; ++y) {
            const cellType = map.cells.at(x, y).type;
            if (cellType === TerrainType.GroundWater || cellType >= TerrainType.Wall0000) {
                posProhibited.set(x, y, true);
            }
        }
    }

    // Reject places where stationary guards are standing/sitting

    for (const patrolRoute of patrolRoutes) {
        if (patrolRoute.path.length === 1) {
            for (const pos of patrolRoute.path) {
                posProhibited.set(pos[0], pos[1], true);
            }
        }
    }

    // Reject places with items that can't hold loot

    for (const item of map.items) {
        if (!canHoldLoot(item.type)) {
            posProhibited.set(item.pos[0], item.pos[1], true);
        }
    }

    return posProhibited;
}

function tryPlaceLoot(posProhibited: BooleanGrid, posPreferred: BooleanGrid, posMin: vec2, posMax: vec2, map: GameMap, rng: RNG): boolean
{
    const positions: Array<vec2> = [];

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            if (!posProhibited.get(x, y) && posPreferred.get(x, y)) {
                positions.push(vec2.fromValues(x, y));
            }
        }
    }

    if (positions.length === 0) {
        for (let x = posMin[0]; x < posMax[0]; ++x) {
            for (let y = posMin[1]; y < posMax[1]; ++y) {
                if (!posProhibited.get(x, y)) {
                    positions.push(vec2.fromValues(x, y));
                }
            }
        }

        if (positions.length === 0) {
            return false;
        }
    }

    const pos = positions[rng.randomInRange(positions.length)];
    placeItem(map, pos, ItemType.Coin);
    posProhibited.set(pos[0], pos[1], true);
    return true;
}

function placeTreasure(map: GameMap, rooms: Array<Room>, rng: RNG) {

    const allBooks = map.items.filter(item=>item.type === ItemType.Bookshelf);
    rng.shuffleArray(allBooks);

    // Divide books into sets by room
    const booksInRoom: Map<Room, Array<Item>> = new Map();
    for (const room of rooms) {
        const books: Array<Item> = [];
        for (const item of allBooks) {
            if (item.pos[0] >= room.posMin[0] &&
                item.pos[1] >= room.posMin[1] &&
                item.pos[0] < room.posMax[0] &&
                item.pos[1] < room.posMax[1]) {
                books.push(item);
            }
        }
        if (books.length > 0) {
            booksInRoom.set(room, books);
        }
    }

    for (const plinth of map.items.filter(item => item.type === ItemType.TreasurePlinth)) {

        // Place treasure on the plinth.
        const treasureType = rng.randomInRange(5); 
        placeItem(map, plinth.pos, ItemType.TreasureA + treasureType);

        const treasure: TreasureInfo = {
            switches: [],
            numSwitchesUsed: 0,
            posTreasure: vec2.clone(plinth.pos),
            stolen: false
        };

        map.treasures.push(treasure);

        // If the treasure is supposed to be locked, generate switches for opening it.

        if (!map.items.some(item => item.type === ItemType.TreasureLock && item.pos.equals(plinth.pos))) {
            continue;
        }

        // Pick a room with books remaining in it to use

        const availableBookSets: Array<Array<Item>> = [];
        for (let numBooks = 3; numBooks > 0 && availableBookSets.length === 0; --numBooks) {
            for (const room of rooms) {
                const roomBooks = booksInRoom.get(room);
                if (roomBooks !== undefined && roomBooks.length >= numBooks) {
                    availableBookSets.push(roomBooks);
                }
            }
        }

        // If the treasure is supposed to be locked but we couldn't find any books to use for switches, remove the lock.

        if (availableBookSets.length === 0) {
            map.items = map.items.filter(item => !(item.type === ItemType.TreasureLock && item.pos.equals(plinth.pos)));
            map.cells.atVec(plinth.pos).blocksPlayerMove = false;
            continue;
        }

        const bookSet = availableBookSets[rng.randomInRange(availableBookSets.length)];

        let clue = '';
        for (let numBooks = Math.min(bookSet.length, 3); numBooks > 0; --numBooks) {
            const book = bookSet.pop()!;
            if (clue.length > 0) {
                clue += '\n';
            }
            const title = map.bookTitle.get(book)!;
            let titleFirstWord = title.split(' ')[0];
            if (titleFirstWord.endsWith(',')) {
                titleFirstWord = titleFirstWord.substring(0, titleFirstWord.length - 1);
            }
            clue += titleFirstWord;
            treasure.switches.push(vec2.clone(book.pos));
        }

        // Find a piece of furniture to put a clue note on

        const unusablePositions = new Set();
        for (const item of map.items) {
            if (item.type === ItemType.Coin || item.type === ItemType.Health || item.type === ItemType.Note) {
                unusablePositions.add(item.pos[0] * map.cells.sizeY + item.pos[1]);
            }
        }

        let furniture = map.items.filter(item =>
            (item.type === ItemType.DrawersShort || item.type === ItemType.DrawersTall || item.type === ItemType.Shelf) &&
            !unusablePositions.has(item.pos[0] * map.cells.sizeY + item.pos[1])
        );

        if (furniture.length > 0) {
            const pos = furniture[rng.randomInRange(furniture.length)].pos;
            const note = {
                pos: vec2.clone(pos),
                type: ItemType.Note,
                topLayer: itemLayers[ItemType.Note],
            };
            map.items.push(note);
            map.bookTitle.set(note, clue);
        }   
    }

    // Sort the treasure locks to the end of the item list so they will render after the treasures

    map.items.sort((item0, item1) => {
        if (item0.type === ItemType.TreasureLock && item1.type !== ItemType.TreasureLock) {
            return 1;
        }
        if (item0.type !== ItemType.TreasureLock && item1.type === ItemType.TreasureLock) {
            return -1;
        }
        return 0;
    });
}

function placeHealth(level: number, map: GameMap, rooms: Array<Room>, rng: RNG) {
    if (level < 1) {
        return;
    }

    let numHealthToPlace = 1 + Math.floor((9 - level) / 4);

    if (tryPlaceHealthInRoomTypes([RoomType.Kitchen], map, rooms, rng)) {
        --numHealthToPlace;
    }

    if (numHealthToPlace > 0 && tryPlaceHealthInRoomTypes([RoomType.Kitchen, RoomType.Dining], map, rooms, rng)) {
        --numHealthToPlace;
    }

    for (let iTry = 10; iTry > 0 && numHealthToPlace > 0; --iTry) {
        if (tryPlaceHealthInRoomTypes([RoomType.Kitchen, RoomType.Dining, RoomType.Bedroom], map, rooms, rng)) {
            --numHealthToPlace;
        }
    }
}

function tryPlaceHealthInRoomTypes(roomTypes: Array<RoomType>, map: GameMap, rooms: Array<Room>, rng: RNG): boolean {
    const healthRooms = rooms.filter((room)=>roomTypes.includes(room.roomType));
    if (healthRooms.length === 0) {
        return false;
    }
    for (let iTry = 0; iTry < 10; ++iTry) {
        const room = healthRooms[rng.randomInRange(healthRooms.length)];
        if (tryPlaceHealth(room.posMin, room.posMax, map, rng)) {
            return true;
        }
    }
    return false;
}

function tryPlaceHealth(posMin: vec2, posMax: vec2, map: GameMap, rng: RNG): boolean
{
    const positions: Array<vec2> = [];

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            const pos = vec2.fromValues(x, y);

            if (isHealthAllowedAtPos(pos, map)) {
                positions.push(pos);
            }
        }
    }

    if (positions.length === 0) {
        return false;
    }

    placeItem(map, positions[rng.randomInRange(positions.length)], ItemType.Health);
    return true;
}

function isHealthAllowedAtPos(pos: vec2, map: GameMap): boolean {
    let cellType = map.cells.atVec(pos).type;

    if (cellType === TerrainType.GroundWater || cellType >= TerrainType.Wall0000) {
        return false;
    }

    let foundHealthHoldingItem = false;

    for (const item of map.items) {
        if (item.pos.equals(pos)) {
            if (!canHoldHealth(item.type)) {
                return false;
            }
            foundHealthHoldingItem = true;
        }
    }

    return foundHealthHoldingItem;
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

    setRectTerrainType(map, 0, 0, sx, outerBorderBottom, TerrainType.GroundNormal);

    // Collect all grass terrain outside the mansion

    const visited = new BooleanGrid(map.cells.sizeX, map.cells.sizeY, false);
    const grass: Array<vec2> = [];

    const toVisit: Array<vec2> = [vec2.clone(map.playerStartPos)];
    for (let iToVisit = 0; iToVisit < toVisit.length; ++iToVisit) {
        const p = toVisit[iToVisit];
        if (visited.get(p[0], p[1])) {
            continue;
        }
        visited.set(p[0], p[1], true);

        if (map.cells.atVec(p).type >= TerrainType.Wall0000) {
            continue;
        }

        if (map.cells.atVec(p).type === TerrainType.GroundGrass) {
            grass.push(p);
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

    rng.shuffleArray(grass);

    grass.length = Math.floor(grass.length / 3);

    visited.fill(false);

    for (const pos of grass) {
        if (visited.get(pos[0], pos[1])) {
            continue;
        }

        placeItem(map, pos, ItemType.Bush);

        for (let x = Math.max(0, pos[0] - 1); x < Math.min(sx, pos[0] + 2); ++x) {
            for (let y = Math.max(0, pos[1] - 1); y < Math.min(sy, pos[1] + 2); ++y) {
                visited.set(x, y, true);
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

function outerBuildingPerimeter(adjacencies: Array<Adjacency>, map: GameMap): Array<vec2> {
    const path: Array<vec2> = [];
    const posStart = playerStartPositionFrontDoor(adjacencies, map);
    const pos = vec2.clone(posStart);
    const dir = vec2.fromValues(1, 0);

    for (let i = map.cells.sizeX * map.cells.sizeY; i > 0; --i) {
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
    let cx = Math.floor(sx / 2);

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
        case RoomType.TreasureCourtyard:
        case RoomType.LockedTreasureCourtyard:
            return true;
        case RoomType.Exterior:
        case RoomType.PublicRoom:
        case RoomType.PrivateRoom:
        case RoomType.Vault:
        case RoomType.Bedroom:
        case RoomType.Dining:
        case RoomType.PublicLibrary:
        case RoomType.PrivateLibrary:
        case RoomType.Kitchen:
        case RoomType.Treasure:
        case RoomType.LockedTreasure:
        case RoomType.ThroneRoom:
            return false;
    }
}

function isMasterSuiteRoomType(roomType: RoomType): boolean {
    return roomType === RoomType.PrivateRoom || roomType === RoomType.Bedroom;
}

function placeGuards(
    level: number,
    map: GameMap,
    patrolRoutes: Array<PatrolRoute>,
    guardLoot:number,
    placeKey: boolean,
    rng: RNG) {

    if (level <= 0) {
        return;
    }

    // If we need to place a key guard, choose the median patrol route in terms of minimum room depth

    if (placeKey && patrolRoutes.length > 0) {
        let patrolRoutesSorted = patrolRoutes.filter(p => p.path.length > 1 && p.minRoomDepth > 0);
        if (patrolRoutesSorted.length === 0) {
            patrolRoutesSorted = [...patrolRoutes];
        }
        patrolRoutesSorted.sort((a, b) => a.minRoomDepth - b.minRoomDepth);

        const i = Math.floor(patrolRoutesSorted.length / 2);
        const patrolRoute = patrolRoutesSorted[i];
        patrolRoutes = patrolRoutes.filter(p => p !== patrolRoute);

        const pathIndexStart = 0;
        const guard = new Guard(patrolRoute.path, pathIndexStart);
        if (level > 1 && rng.randomInRange(5 + level) < level) {
            guard.hasTorch = true;
        }
        guard.hasVaultKey = true;
        map.guards.push(guard);
    }

    // If we need to place loot on a guard, and we're on level 3 (the pickpocket training level), try to find a stationary guard

    if (guardLoot > 0 && level < 4) {
        const i = patrolRoutes.findIndex(p => p.path.length <= 1);
        if (i >= 0) {
            const patrolRoute = patrolRoutes[i];
            patrolRoutes.splice(i, 1);

            const pathIndexStart = 0;
            const guard = new Guard(patrolRoute.path, pathIndexStart);
            if (level > 1 && rng.randomInRange(5 + level) < level) {
                guard.hasTorch = true;
            }
            guard.hasPurse = true;
            guardLoot--;
            map.guards.push(guard);
        }
    }

    // Create guards for remaining patrol routes

    for (const patrolRoute of patrolRoutes) {
        const pathIndexStart = 0;
        const guard = new Guard(patrolRoute.path, pathIndexStart);
        if (level > 1 &&
            rng.randomInRange(5 + level) < level &&
            (patrolRoute.path.length > 1 || !map.items.some(item => item.pos.equals(patrolRoute.path[0])))) {
            guard.hasTorch = true;
        }
        if (guardLoot>0) {
            guard.hasPurse = true;
            guardLoot--;
        }
        map.guards.push(guard);
    }

    // On first level with a guard, place the guard just inside the front gate, to teach waiting

    if(level===1) {
        const gates = map.items.filter((item)=>item.type===ItemType.PortcullisEW).sort((a,b)=>a.pos[1]-b.pos[1]);
        if (gates.length >= 1) {
            const posGate = gates[0].pos;
            const guard = map.guards[0];
            vec2.set(guard.pos, posGate[0], posGate[1]+1);
            vec2.set(guard.dir, 0, -1);
            guard.enterPatrolMode(map);
        }
    }

    console.assert(guardLoot===0);
}

const bookTitleFirstWord: Array<string> = [
    "Alien", "Aliens",
    "Amulet", "Amulets",
    "Arm", "Arms",
    "Armor", "Armor",
    "Arrow", "Arrows",
    "Attack", "Attacks",
    "Aura", "Aurae",
    "Awakening", "Awakenings",
    "Axe", "Axes",
    "Bane", "Banes",
    "Battle-Axe", "Battle-Axes",
    "Blood", "Bloods",
    "Breath", "Breaths",
    "Captive", "Captives",
    "Castle", "Castles",
    "Catacomb", "Catacombs",
    "Cave", "Caves",
    "Chamber", "Chambers",
    "Champion", "Champions",
    "Child", "Children",
    "Citadel", "Citadels",
    "City", "Cities",
    "Claw", "Claws",
    "Cow", "Cows",
    "Crown", "Crowns",
    "Crusade", "Crusades",
    "Crystal", "Crystals",
    "Curse", "Curses",
    "Dagger", "Daggers",
    "Daughter", "Daughters",
    "Dawn", "Dawn",
    "Day", "Days",
    "Dungeon", "Dungeons",
    "Dragon", "Dragons",
    "Eye", "Eyes",
    "Field", "Fields",
    "Fire", "Fires",
    "Fist", "Fists",
    "Forest", "Forests",
    "Fortress", "Fortresses",
    "Fugitive", "Fugitives",
    "Game", "Games",
    "Gem", "Gems",
    "Guardian", "Guardians",
    "Hand", "Hands",
    "Helm", "Helms",
    "Horde", "Hordes",
    "Hour", "Hours",
    "Keep", "Keeps",
    "Key", "Keys",
    "Knight", "Knights",
    "Land", "Lands",
    "Legend", "Legends",
    "Lord", "Lords",
    "Master", "Masters",
    "Mercenary", "Mercenaries",
    "Mind", "Minds",
    "Mine", "Mines",
    "Minion", "Minions",
    "Mirror", "Mirrors",
    "Night", "Nights",
    "Moon", "Moons",
    "Omen", "Omens",
    "Orb", "Orbs",
    "Path", "Paths",
    "Pit", "Pits",
    "Plague", "Plagues",
    "Pool", "Pools",
    "Potion", "Potions",
    "Prince", "Princes",
    "Princess", "Princesses",
    "Prison", "Prisons",
    "Prisoner", "Prisoners",
    "Prophecy", "Prophecies",
    "Quest", "Quests",
    "Rampage", "Rampages",
    "Realm", "Realms",
    "Reaper", "Reapers",
    "Rebirth", "Rebirths",
    "Return", "Returns",
    "Revenge", "Revenges",
    "Ring", "Rings",
    "Rise", "Rise",
    "River", "Rivers",
    "Scroll", "Scrolls",
    "Serpent", "Serpents",
    "Servant", "Servants",
    "Shadow", "Shadows",
    "Shield", "Shields",
    "Sign", "Signs",
    "Siren", "Sirens",
    "Slave", "Slaves",
    "Son", "Sons",
    "Spawn", "Spawn",
    "Spear", "Spears",
    "Spell", "Spells",
    "Sphere", "Spheres",
    "Staff", "Staves",
    "Stronghold", "Strongholds",
    "Sword", "Swords",
    "Thief", "Thieves",
    "Threat", "Threats",
    "Throne", "Thrones",
    "Tower", "Towers",
    "Trail", "Trails",
    "Trial", "Trials",
    "Valley", "Valleys",
    "Wand", "Wands",
    "Warrior", "Warriors",
    "Weapon", "Weapons",
    "Wind", "Winds",
    "Witch", "Witches",
    "Wizard", "Wizards",
];

const bookTitleSecondWord: Array<string> = [
    "Adventure",
    "Agony",
    "the Ancients",
    "Anger",
    "Avenging",
    "Battle",
    "Beholding",
    "Brilliance",
    "Danger",
    "Darkness",
    "Death",
    "Deception",
    "Despair",
    "Destiny",
    "Destruction",
    "Disease",
    "Ecstacy",
    "Enchantment",
    "Enlightenment",
    "Eternity",
    "Evil",
    "Falsehood",
    "Famine",
    "Fantasy",
    "Fate",
    "Fear",
    "Flame",
    "Foretelling",
    "Forewarning",
    "Fortune",
    "Fury",
    "Gallantry",
    "Gingivitis",
    "the Gods",
    "Intrigue",
    "Keeping",
    "Legend",
    "the Living Dead",
    "Lore",
    "Madness",
    "Magic",
    "Menace",
    "Midnight",
    "Might",
    "Murder",
    "Mystery",
    "Power",
    "Prophecy",
    "Radiance",
    "Rebellion",
    "Reckoning",
    "Remembrance",
    "Shadow",
    "Sickness",
    "Strength",
    "Suffering",
    "Terror",
    "Time",
    "Truth",
    "the Undead",
    "the Universe",
    "Unraveling",
    "Valor",
    "Vengeance",
    "Venom",
    "War",
];

const lawBookTitles: Array<string> = [
    'Administrative Law',
    'Arbitrage',
    'Attorney-Client Privilege',
    'Attractive Nuisances',
    'Bankruptcy',
    'Civil Procedure',
    'Community Property',
    'Comparative Legal Traditions',
    'Contract Law',
    'Consideration',
    'Corporate Finance',
    'Corporate Taxation',
    'Criminal Law',
    'Cross-Examination',
    'Damages',
    'Discovery',
    'Economics',
    'Embezzlement',
    'Estate Planning',
    'Estoppel',
    'Homicide',
    'Income Taxation',
    'Intangible Property',
    'International Transactions',
    'Intestate Succession',
    'Probate',
    'Promissory Estoppel',
    'Property',
    'Quid Pro Quo',
    'Reckless Disregard',
    'Regulatory Policy',
    'Securities Regulation',
    'Security Interests',
    'Statutory Law',
    'Torts',
    'Trial Procedure',
    'Wills, Trusts, and Estates',
];

function giveBooksTitles(bookTitle: Map<Item, string>, rooms: Array<Room>, bookItems: Array<Item>, rng: RNG) {
    const lawBookTitlesShuffled = [...lawBookTitles];
    rng.shuffleArray(lawBookTitlesShuffled);
    let lawBookTitleIndex = 0;

    const bookTitleFirstWordShuffled = [...bookTitleFirstWord];
    rng.shuffleArray(bookTitleFirstWordShuffled);
    let fantasyTitleFirstWordIndex = 0;

    // Divide books into sets by room
    const booksInRoom: Map<Room, Array<Item>> = new Map();

    for (const room of rooms) {
        const books: Array<Item> = [];
        for (const item of bookItems) {
            if (item.pos[0] >= room.posMin[0] &&
                item.pos[1] >= room.posMin[1] &&
                item.pos[0] < room.posMax[0] &&
                item.pos[1] < room.posMax[1]) {
                books.push(item);
            }
        }
        if (books.length > 0) {
            booksInRoom.set(room, books);
        }
    }

    for (const i of booksInRoom) {
        const room = i[0];
        const books = i[1];
        const sortAxisPrimary = vec2.create();
        const sortAxisSecondary = vec2.create();
        if (room.posMax[0] - room.posMin[0] >= room.posMax[1] - room.posMin[1]) {
            vec2.set(sortAxisPrimary, 1, 0);
            vec2.set(sortAxisSecondary, 0, -1);
        } else {
            vec2.set(sortAxisPrimary, 0, -1);
            vec2.set(sortAxisSecondary, 1, 0);
        }

        books.sort((book0, book1) => {
            let n0 = vec2.dot(sortAxisPrimary, book0.pos);
            let n1 = vec2.dot(sortAxisPrimary, book1.pos);
            if (n0 < n1) return -1;
            if (n0 > n1) return 1;
            n0 = vec2.dot(sortAxisSecondary, book0.pos);
            n1 = vec2.dot(sortAxisSecondary, book1.pos);
            if (n0 < n1) return -1;
            if (n0 > n1) return 1;
            return 0;
        });

        const bookTitles: Array<string> = [];
        for (let i = 0; i < books.length; ++i) {
            let bookTitle: string;
            if (room.privateRoom) {
                const firstWord = bookTitleFirstWordShuffled[fantasyTitleFirstWordIndex];
                fantasyTitleFirstWordIndex = (fantasyTitleFirstWordIndex + 1) % bookTitleFirstWordShuffled.length;
                const secondWord = bookTitleSecondWord[rng.randomInRange(bookTitleSecondWord.length)];
                bookTitle = firstWord + ' of ' + secondWord;
            } else {
                bookTitle = lawBookTitlesShuffled[lawBookTitleIndex];
                lawBookTitleIndex = (lawBookTitleIndex + 1) % lawBookTitlesShuffled.length;
            }

            bookTitles.push(bookTitle);
        }

        bookTitles.sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));

        for (let i = 0; i < books.length; ++i) {
            bookTitle.set(books[i], bookTitles[i]);
        }
    }
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
        ++map.numPreRevealedCells;

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

function blocksPlayerMovement(itemType: ItemType): boolean {
    return itemType === ItemType.DrawersTall ||
           itemType === ItemType.Bookshelf ||
           itemType === ItemType.Shelf ||
           itemType === ItemType.Stove ||
           itemType === ItemType.TreasureLock;
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
            cell.moveCost = (isWall || isWindow) ? Infinity : (isWater ? 64 : 0);
            cell.blocksPlayerMove = isWall;
            cell.blocksPlayerSight = isWall && cellType !== TerrainType.Wall0000;
            cell.blocksSight = isWall;
            cell.blocksSound = isWall;
            cell.hidesPlayer = false;
            cell.isWindow = isWindow;
        }
    }

    for (const item of map.items) {
        let cell = map.cells.atVec(item.pos);
        let itemType = item.type;
        cell.moveCost = Math.max(cell.moveCost, guardMoveCostForItemType(itemType));
        if (itemType === ItemType.DoorNS ||
            itemType === ItemType.DoorEW ||
            itemType === ItemType.LockedDoorNS ||
            itemType === ItemType.LockedDoorEW) {
            cell.blocksPlayerSight = true;
        }
        if (itemType === ItemType.DoorNS ||
            itemType === ItemType.DoorEW ||
            itemType === ItemType.LockedDoorNS ||
            itemType === ItemType.LockedDoorEW ||
            itemType === ItemType.PortcullisNS ||
            itemType === ItemType.PortcullisEW ||
            itemType === ItemType.Bush ||
            itemType === ItemType.DrawersTall ||
            itemType === ItemType.Bookshelf ||
            itemType === ItemType.Shelf ||
            itemType === ItemType.Stove) {
            cell.blocksSight = true;
        }
        if (itemType === ItemType.Table ||
            itemType === ItemType.Bush ||
            itemType === ItemType.BedL ||
            itemType === ItemType.BedR) {
            cell.hidesPlayer = true;
        }
        if (blocksPlayerMovement(itemType)) {
            cell.blocksPlayerMove = true;
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
