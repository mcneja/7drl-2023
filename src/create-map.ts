export { createGameMap, createGameMapRoughPlans, Adjacency };

    import { clear } from 'console';
import { BooleanGrid, CellGrid, Int32Grid, Item, ItemType, Float64Grid, GameMap, GameMapRoughPlan, TerrainType, guardMoveCostForItemType, isWindowTerrainType } from './game-map';
import { Guard } from './guard';
import { vec2 } from './my-matrix';
import { RNG } from './random';

const roomSizeX = 5;
const roomSizeY = 5;
const outerBorder = 3;

/*
const levelLeapTrainer = 2;
*/

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
    [6,9,5,9,50,80],
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
    Kitchen,
}

type Room = {
    roomType: RoomType,
    group: number,
    depth: number,
    betweenness: number,
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


class Rect extends Array<number> {
    constructor(x:number=0, y:number=0, w:number=0, h:number=0) {
        super(x,y,w,h);
    }
    collide(r:Rect) {
        if(this[0] < r[0] + r[2] &&
            this[0] + this[2] > r[0] &&
            this[1] < r[1] + r[3] &&
            this[1] + this[3] > r[1])
            return true;
        return false;
    }
    grow(amount:number) {
        return new Rect(this[0]-amount,this[1]-amount,this[2]+2*amount, this[3]+2*amount);
    }
    get center() {
        return vec2.fromValues(this[0]+this[2]/2, this[1]+this[3]/2);
    }
    get flCenter() {
        return vec2.fromValues(Math.floor(this[0]+this[2]/2), Math.floor(this[1]+this[3]/2));
    }
}

function patchWall(map:GameMap, pos:vec2) {
    let value = 0;
    for(let c of map.cells.iterOrtho(pos)) {
        value = 2*value+(c.type>=TerrainType.Wall0000?1:0);
    }
    map.cells.atVec(pos).type = TerrainType.Wall0000 + value;
}

function placeWallBetween(map:GameMap, p1:vec2, p2:vec2) {
    const maxDist = Math.max(...p2.subtract(p1).abs());
    const dir = p2.subtract(p1).scale(1/maxDist);
    const grad = Math.abs(dir[0])>=Math.abs(dir[1]);
    let p = p1;
    let dist = 0;
    let oldfp:vec2 = p1;
    map.cells.atVec(p1).type = TerrainType.Wall0000;
    const walls:vec2[] = [];
    while(dist<=maxDist) {
        p = p.add(dir);
        const fp = vec2.fromValues(Math.floor(p[0]), Math.floor(p[1]));
        const c = map.cells.atVec(fp);
        c.type = TerrainType.Wall0000;
        walls.push(fp);
        const diff=fp.subtract(oldfp);
        if(diff.abs().sum()===2) {
            const deltaP = diff.abs()[0]>=diff.abs()[1]? vec2.fromValues(diff[0],0) :
                vec2.fromValues(0,diff[1]);
            const adjP = fp.add(deltaP)
            map.cells.atVec(adjP).type = TerrainType.Wall0000;
            walls.push(adjP);
        }
        oldfp = fp;
        dist++;
    }
    // for(let wp of walls) {
    //     patchWall(map, wp);
    // }

    return true;
}

function floodFill(map:GameMap, pos:vec2, fillType:TerrainType, blocker:TerrainType=TerrainType.Wall0000) {
    for(let d of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const posD = pos.add(vec2.fromValues(d[0],d[1]))
        if( posD[0]>=0 && posD[0]<map.cells.sizeX &&
            posD[1]>=0 && posD[1]<map.cells.sizeY) {
            const c = map.cells.atVec(posD)
            if(c.type!==blocker) {
                c.type = fillType;
                floodFill(map, posD, fillType, blocker);
            }
        }
    }
}

function placeWalledRect(map:GameMap, rect:Rect) {
    for(let k=1; k<rect[2];k++) {
        map.cells.at(rect[0]+k, rect[1]).type = TerrainType.Wall0011;
        map.cells.at(rect[0]+k, rect[1]+rect[3]).type = TerrainType.Wall0011;
    }
    for(let k=1; k<rect[3];k++) {
        map.cells.at(rect[0], rect[1]+k).type = TerrainType.Wall1100;
        map.cells.at(rect[0]+rect[2], rect[1]+k).type = TerrainType.Wall1100;
    }
    map.cells.at(rect[0],rect[1]).type = TerrainType.Wall1010;
    map.cells.at(rect[0],rect[1]+rect[3]).type = TerrainType.Wall0110;
    map.cells.at(rect[0]+rect[2],rect[1]).type = TerrainType.Wall1001;
    map.cells.at(rect[0]+rect[2],rect[1]+rect[3]).type = TerrainType.Wall0101;
    return true;
}

function addDoorwayToWall(map:GameMap, pos:vec2, addDoor:boolean=true) {
    const type = map.cells.atVec(pos).type;
    if(type===TerrainType.Wall0011) {
        map.cells.atVec(pos).type = TerrainType.DoorEW;
        if(addDoor) placeItem(map, pos, ItemType.DoorEW);
        return true
    }
    if(type===TerrainType.Wall1100) {
        map.cells.atVec(pos).type = TerrainType.DoorNS;
        if(addDoor) placeItem(map, pos, ItemType.DoorNS);
        return true
    }
    return false;
}

function placeBanditBuilding(map:GameMap, building:Rect, rng:RNG) {
    for(let t of map.cells.iter(building[0]+1, building[1]+1, building[0]+building[2], building[1]+building[3])) {
        t.type = TerrainType.GroundWood;
    }
    placeWalledRect(map, building)

    const doorPosX = building[0]+1+rng.randomInRange(building[2]-1);
    const doorPosY = building[1]+1+rng.randomInRange(building[3]-1);
    addDoorwayToWall(map, vec2.fromValues(doorPosX, building[1]+(rng.random()>0.5?building[3]:0)))
    addDoorwayToWall(map, vec2.fromValues(building[0]+(rng.random()>0.5?building[2]:0), doorPosY));

}

function traceBanditPath(map:GameMap, r1:Rect, r2:Rect, spaces:Rect[], type:TerrainType, clearType:TerrainType=TerrainType.GroundWater) {
    const p1 = r1.flCenter;
    const p2 = r2.flCenter;
    const maxDist = Math.max(...p2.subtract(p1).abs());
    const dir = p2.subtract(p1).scale(1/maxDist);
    let p = p1;
    let dist = 0;
    while(dist<maxDist) {
        const rp = vec2.fromValues(Math.floor(p[0]), Math.floor(p[1]));
        for(let adj of [[0,0],[1,0],[0,1]]) {
            const rpAdj = vec2.fromValues(rp[0]+adj[0], rp[1]+adj[1]);
            const c = map.cells.atVec(rpAdj);
            if(c.type===clearType) {
                c.type = type;
            }
        }
        dist++;
        p = p.add(dir);
    }
}

function createDocksMap(level: number, plan:GameMapRoughPlan) {
    const rng = plan.rng;
    const X = Math.max(plan.numRoomsX*12, plan.numRoomsY*12);
    const Y = Math.min(plan.numRoomsX*12, plan.numRoomsY*12);
    const cells = new CellGrid(X, Y);
    const map = new GameMap(cells);

    const landHeight = Math.floor( Math.max(cells.sizeY - cells.sizeX/2, cells.sizeY/4) );

    setRectTerrainType(map, 0, 0, cells.sizeX, cells.sizeY, TerrainType.GroundWater);    
    setRectTerrainType(map, 0, 0, cells.sizeX, landHeight, TerrainType.GroundGrass);

    let dock = 0;
    let dockPosX = 0;
    while(dockPosX+12<X) {
        dockPosX += 12 + Math.floor(rng.randomInRange(5) );
        const dockLen = Math.min(6 + rng.randomInRange(5), cells.sizeY-landHeight-10);
        setRectTerrainType(map, dockPosX, landHeight, dockPosX+3, landHeight+dockLen, TerrainType.GroundWood);
        for(let y=landHeight+dockLen-1;y>=landHeight;y-=3) {
            cells.at(dockPosX-1, y).type = TerrainType.Wall0000;
            cells.at(dockPosX+3, y).type = TerrainType.Wall0000;
        }
        dock++;
    }

    fixupWalls(map.cells);

    //Set the tile hints on the tiles
    cacheCellInfo(map);

    //    markExteriorAsSeen(map);
    map.playerStartPos = vec2.fromValues(map.cells.sizeX/2, 0);
    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    return map;
}


function createCastleMap(level: number, plan:GameMapRoughPlan) {
    const rng = plan.rng;
    const cells = new CellGrid(plan.numRoomsX*8, plan.numRoomsY*8);
    const map = new GameMap(cells);

    setRectTerrainType(map, 0, 0, cells.sizeX, cells.sizeY, TerrainType.GroundWater);    
    
    fixupWalls(map.cells);

    //Set the tile hints on the tiles
    cacheCellInfo(map);

    //    markExteriorAsSeen(map);
    map.playerStartPos = vec2.fromValues(map.cells.sizeX/2, 0);
    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    return map;
}

function createDungeonMap(level: number, plan:GameMapRoughPlan) {
    const rng = plan.rng;
    const cells = new CellGrid(plan.numRoomsX*8, plan.numRoomsY*8);
    const map = new GameMap(cells);

    setRectTerrainType(map, 0, 0, cells.sizeX, cells.sizeY, TerrainType.GroundWater);    

    fixupWalls(map.cells);

    //Set the tile hints on the tiles
    cacheCellInfo(map);
    
    //    markExteriorAsSeen(map);
    map.playerStartPos = vec2.fromValues(map.cells.sizeX/2, 0);
    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    return map;

}



function createBanditMap(level: number, plan:GameMapRoughPlan) {
    const rng = plan.rng;
    const cells = new CellGrid(plan.numRoomsX*8, plan.numRoomsY*8);
    const map = new GameMap(cells);

    setRectTerrainType(map, 0, 0, cells.sizeX, cells.sizeY, TerrainType.GroundWater);    

    //Place buildings
    let numBuildings = 4+rng.randomInRange(4);
    const buildings:Rect[] = [];
    let b = 0;
    let i = 0;
    while(b<numBuildings && i<10000) {
        const w = 4 + rng.randomInRange(i<100?5:3);
        const h = 4 + rng.randomInRange(i<100?5:3);
        const x = 2 + rng.randomInRange(cells.sizeX - w - 4);
        const y = 2 + rng.randomInRange(cells.sizeY - h - 4);
        const building = new Rect(x, y, w, h);
        if(!buildings.find((bld)=>(building.grow(2).collide(bld)))) {
            buildings.push(building);
            b++;
        }
        i++;
    }

    if(b<numBuildings) {
        numBuildings = b;
    }

    //Place clearings
    let numClearings = 10 - numBuildings;
    const clearings:Rect[] = [];
    let c=0;
    i=0;
    while(c<numClearings && i<10000) {
        const w = 4 + rng.randomInRange(i<100?5:2);
        const h = 4 + rng.randomInRange(i<100?5:2);
        const x = 2 + rng.randomInRange(cells.sizeX - w - 4);
        const y = 2 + rng.randomInRange(cells.sizeY - h - 4);

        const clearing = new Rect(x, y, w, h);
        if(!buildings.find((bld)=>(clearing.grow(2).collide(bld))) &&
           !clearings.find((clr)=>(clearing.grow(2).collide(clr)))) {
            clearings.push(clearing);
            c++;
        }
        i++;
    }

    //Render buildings into map
    for(let b of buildings) {
        placeBanditBuilding(map, b, rng);
    }

    //Render clearings into map
    for(let c of clearings) {
        for(let t of cells.iterRadius(c.flCenter, Math.floor(Math.min(c[2], c[3])/2))) {
            t.type = TerrainType.GroundNormal;
        }
    }

    //Connect a path to each building and clearing to at least two other buildings/clearings
    const spaces = [...buildings, ...clearings];
    const patrolRoutes:vec2[][] = [];
    while(spaces.length>0) {
        const s = spaces.pop()!;
        const closestBuilding = spaces.filter(sp=>sp!==s)
            .reduce((p, c)=>
                s.flCenter.distance(c.flCenter)<s.flCenter.distance(p.flCenter)?c:p
            );
        if(closestBuilding) {
            traceBanditPath(map, s, closestBuilding, spaces, TerrainType.GroundNormal);
            patrolRoutes.push([s.flCenter, s.flCenter, s.flCenter, s.flCenter, closestBuilding.flCenter, closestBuilding.flCenter, closestBuilding.flCenter, closestBuilding.flCenter]);
        }
        if(spaces.length===1) break;
        const nClosestBuilding = spaces.filter(sp=>sp!==closestBuilding && sp!==s)
            .reduce((p, c)=>
                s.flCenter.distance(c.flCenter)<s.flCenter.distance(p.flCenter)?c:p
            );
        if(nClosestBuilding) {
            traceBanditPath(map, s, nClosestBuilding, spaces, TerrainType.GroundNormal);
            // patrolRoutes.push([s.flCenter, nClosestBuilding.flCenter]);
        }
    }

    //For all spaces that are GroundWater we'll now fill them with grass, trees and pillars
    for(let p of cells.iterPos()) {
        let wallAdj = false;
        for(let t of cells.iterOrtho(p)) {
             if(t.type>=TerrainType.Wall0000) wallAdj = true;
        }
        const t = map.cells.atVec(p);
        if(t.type===TerrainType.GroundWater) {
            const r = rng.random();
            t.type = r>0.02 || wallAdj?TerrainType.GroundGrass:TerrainType.Wall0000;
            if(r>0.5) map.items.push({pos: p, type:ItemType.Bush})
        }
    }

    fixupWalls(map.cells);

    //Set the tile hints on the tiles
    cacheCellInfo(map);

    //Place loot
    let lootPlaced = 0;
    for(let s of buildings) {
        map.items.push({
            type:ItemType.Coin,
            pos: vec2.fromValues(
                s[0]+1+rng.randomInRange(s[2]-2),
                s[1]+1+rng.randomInRange(s[3]-2),
            )
        });
        lootPlaced++;
        if(lootPlaced>=plan.totalLoot) break;
    }

    // Put guards on the patrol routes
    rng.shuffleArray(patrolRoutes);
    for(let pr of patrolRoutes) {
        const guard = new Guard(pr, 0);
        if(lootPlaced<plan.totalLoot) {
            guard.hasPurse = true;
            guard.hasTorch = true;
            lootPlaced++;    
        }
        map.guards.push(guard);
    }

    // Final setup
//    markExteriorAsSeen(map);
    map.playerStartPos = vec2.fromValues(map.cells.sizeX/2, 0);
    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    return map;
}


function createGameMap(level: number, plan: GameMapRoughPlan): GameMap {
    const rng = plan.rng;
    rng.reset();

    if(level===4) {
        return createBanditMap(level, plan);
    }
    if(level===5) {
        return createDocksMap(level, plan);
    }

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

    makeDoubleRooms(rooms, adjacencies, rng);

    // Compute room distances from entrance.

    computeRoomBetweenness(rooms);
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

    map.playerStartPos = playerStartPosition(level, adjacencies, map);

    // Additional decorations

    const outerPerimeter = outerBuildingPerimeter(adjacencies, map);

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

    placeHealth(level, map, rooms, rng);

    // Put guards on the patrol routes

    placeGuards(level, map, patrolRoutes, guardLoot, needKey, rng);

    // Final setup

    markExteriorAsSeen(map);
    map.computeLighting();
    map.recomputeVisibility(map.playerStartPos);

    map.adjacencies = adjacencies;

    return map;
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
        betweenness: 0,
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
                betweenness: 0,
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

        const roomsToVisit = [];
        roomsToVisit.push(roomSource);
        const roomStack = [];

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
            deadEndRooms[0].roomType = RoomType.Vault;
        }
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

    // Pick rooms to be kitchens

    if (numRooms >= 8) {
        const kitchenRooms = rooms.filter((room)=>roomCanBeKitchen(room));
        if (kitchenRooms.length > 0) {
            rng.shuffleArray(kitchenRooms);
            kitchenRooms[0].roomType = RoomType.Kitchen;
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

    // On the leap-training level, and past level 5, include patrols around the outside of
    // the mansion. Keep these ones at the end so they won't get keys or purses.

    const patrolLength = outerPerimeter.length;
    /*
    if (level === levelLeapTrainer) {
        // Find the top-rightmost point in the patrol path and shift the patrol path to start there
        const posTopRight = vec2.fromValues(gameMap.cells.sizeX - 1, gameMap.cells.sizeY - 1);
        let i = 0;
        let distI = outerPerimeter[i].squaredDistance(posTopRight);
        for (let j = 1; j < patrolLength; ++j) {
            let distJ = outerPerimeter[j].squaredDistance(posTopRight);
            if (distJ < distI) {
                distI = distJ;
                i = j;
            }
        }

        patrolRoutes.push(shiftedPathCopy(outerPerimeter, (i + patrolLength - 1) % patrolLength));
    } else
    */
    if (level > 5) {
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

function playerStartPosition(level: number, adjacencies: Array<Adjacency>, gameMap: GameMap): vec2 {
    /*
    if (level === levelLeapTrainer) {
        return playerStartPositionLeapTrainer(adjacencies, gameMap);
    } else
    */
    {
        return playerStartPositionFrontDoor(adjacencies, gameMap);
    }
}

function playerStartPositionLeapTrainer(adjacencies: Array<Adjacency>, gameMap: GameMap) {
    // Find top-rightmost horizontal adjacency

    const posTopRight = vec2.fromValues(gameMap.cells.sizeX - 1, gameMap.cells.sizeY - 1);
    let posBest = playerStartPositionFrontDoor(adjacencies, gameMap);
    let distBest = Infinity;
    for (const adj of adjacencies) {
        if (adj.dir[1] !== 0) {
            continue;
        }

        const posAdjTopRight = vec2.create();
        vec2.scaleAndAdd(posAdjTopRight, adj.origin, vec2.fromValues(Math.max(0, adj.dir[0]), 0), adj.length + 1);
        const dist = vec2.squaredDistance(posTopRight, posAdjTopRight);
        if (dist < distBest) {
            distBest = dist;
            posBest.set(posAdjTopRight[0], posAdjTopRight[1] + 1);
        }
    }

    return posBest;
}

function playerStartPositionFrontDoor(adjacencies: Array<Adjacency>, gameMap: GameMap): vec2 {
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
            case RoomType.Kitchen: cellType = TerrainType.GroundWood; break;
        }

        setRectTerrainType(map, room.posMin[0], room.posMin[1], room.posMax[0], room.posMax[1], cellType);

        if (isCourtyardRoomType(room.roomType)) {
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

function renderRoomVault(map: GameMap, room: Room, rng: RNG) {
    const dx = room.posMax[0] - room.posMin[0];
    const dy = room.posMax[1] - room.posMin[1];
    if (dx >= 5 && dy >= 5) {
        map.cells.at(room.posMin[0] + 1, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMin[1] + 1).type = TerrainType.Wall0000;
        map.cells.at(room.posMin[0] + 1, room.posMax[1] - 2).type = TerrainType.Wall0000;
        map.cells.at(room.posMax[0] - 2, room.posMax[1] - 2).type = TerrainType.Wall0000;
    }

    // TODO: This is all largely a copy of renderRoomBedroom. Need to commonize

    const candidateItems = [ItemType.DrawersTall, ItemType.DrawersShort, ItemType.Chair, ItemType.Table, ItemType.Bookshelf, ItemType.Shelf, ItemType.TorchUnlit];
    rng.shuffleArray(candidateItems);

    const sizeX = room.posMax[0] - room.posMin[0];
    const sizeY = room.posMax[1] - room.posMin[1];
    const usable = new BooleanGrid(sizeX, sizeY, true);
    const unusable = new BooleanGrid(sizeX, sizeY, false);
    const occupied = new BooleanGrid(sizeX, sizeY, false);

    let rootX, rootY;

    for (let x = 0; x < sizeX; ++x) {
        for (let y = 0; y < sizeY; ++y) {
            if (!isWalkableTerrainType(map.cells.at(x + room.posMin[0], y + room.posMin[1]).type)) {
                occupied.set(x, y, true);
                unusable.set(x, y, true);
            } else if (doorAdjacent(map.cells, vec2.fromValues(x + room.posMin[0], y + room.posMin[1]))) {
                unusable.set(x, y, true);
                rootX = x;
                rootY = y;
            }
        }
    }

    if (rootX === undefined || rootY === undefined) {
        return;
    }

    const itemsInRoom = [];

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

        const item = { pos: vec2.fromValues(pos[0] + room.posMin[0], pos[1] + room.posMin[1]), type: candidateItems[iItemType] };
        map.items.push(item);
        itemsInRoom.push(item);

        occupied.set(pos[0], pos[1], true);
        unusable.set(pos[0], pos[1], true);
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

            // If the room is only as wide as the bed, the bed must be at the top or bottom
            // or it will split the room.

            if (sizeX === 2 && y !== room.posMin[1] && y !== room.posMax[1] - 1) {
                continue;
            }

            potentialPositions.push(pos0);
        }
    }

    const itemsInRoom = [];

    if (potentialPositions.length > 0) {
        const pos0 = potentialPositions[rng.randomInRange(potentialPositions.length)];
        const pos1 = vec2.fromValues(pos0[0] + 1, pos0[1]);

        const itemBedL = { pos: vec2.clone(pos0), type: ItemType.BedL };
        const itemBedR = { pos: vec2.clone(pos1), type: ItemType.BedR };
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

        const item = { pos: vec2.fromValues(pos[0] + room.posMin[0], pos[1] + room.posMin[1]), type: itemType };
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

        const unoccupiedNeighbors = [];
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

function getUsablePositions(usable: BooleanGrid): Array<vec2> {
    const positions = [];

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

function isValidGroundLootPos(pos: vec2, map: GameMap): boolean {
    let cellType = map.cells.atVec(pos).type;

    if (cellType === TerrainType.GroundWater || cellType >= TerrainType.Wall0000) {
        return false;
    }

    if (isItemAtPos(map, pos)) {
        return false;
    }

    return true;
}

function isLootPreferredAtPos(pos: vec2, map: GameMap): boolean {
    let cellType = map.cells.atVec(pos).type;

    if (cellType === TerrainType.GroundWater || cellType >= TerrainType.Wall0000) {
        return false;
    }

    let foundLootHoldingItem = false;

    for (const item of map.items) {
        if (item.pos.equals(pos)) {
            if (!canHoldLoot(item.type)) {
                return false;
            }
            foundLootHoldingItem = true;
        }
    }

    return foundLootHoldingItem;
}

function tryPlaceLoot(posMin: vec2, posMax: vec2, map: GameMap, rng: RNG): boolean
{
    const positions: Array<vec2> = [];

    for (let x = posMin[0]; x < posMax[0]; ++x) {
        for (let y = posMin[1]; y < posMax[1]; ++y) {
            const pos = vec2.fromValues(x, y);

            if (isLootPreferredAtPos(pos, map)) {
                positions.push(pos);
            }
        }
    }

    if (positions.length === 0) {
        for (let x = posMin[0]; x < posMax[0]; ++x) {
            for (let y = posMin[1]; y < posMax[1]; ++y) {
                const pos = vec2.fromValues(x, y);
    
                if (isValidGroundLootPos(pos, map)) {
                    positions.push(pos);
                }
            }
        }

        if (positions.length === 0) {
            return false;
        }
    }

    placeItem(map, positions[rng.randomInRange(positions.length)], ItemType.Coin);
    return true;
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

function outerBuildingPerimeter(adjacencies: Array<Adjacency>, map: GameMap): Array<vec2> {
    const path: Array<vec2> = [];
    const posStart = playerStartPositionFrontDoor(adjacencies, map);
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
        case RoomType.Kitchen:
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
            cell.blocksPlayerSight = isWall;
            cell.blocksSight = isWall;
            cell.blocksSound = isWall;
            cell.hidesPlayer = false;
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
        if (itemType === ItemType.DrawersTall ||
            itemType === ItemType.Bookshelf ||
            itemType === ItemType.Shelf ||
            itemType === ItemType.Stove) {
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
