import * as colorPreset from './color-preset';
import { TerrainType } from './game-map';
import { vec2 } from './my-matrix';

const tileset34 = require('url:./tiles34.png')
const tilesetSinCity = require('url:./tiles-sincity.png')
const tilesetBasic = require('url:./tiles.png')
const tilesetFont = require('url:./font.png')


export type TileInfo = {
    textureIndex: number; //[number,number]|
    color?: number;
    unlitColor?: number
}

export type TileSet = {
    name: string;
    imageSrc: string;
    image: HTMLImageElement;
    tileSize: [number, number];
    cellSize: [number, number];
    offset: [number, number];
    terrainTiles: Array<TileInfo>;
    itemTiles: Array<TileInfo>;
    guardStateTiles: Array<TileInfo>;
    npcTiles: Array<TileInfo>;
    playerTiles: Array<TileInfo>;
    unlitTile: TileInfo;
    flattenTexture: boolean;
}

export type FontTileSet = {
    name: string;
    imageSrc: string;
    image: HTMLImageElement;
    tileSize: [number, number];
    offset: [number, number];
    letterMap: Array<TileInfo>;
}

export function getTileSet(name:'34'|'basic'|'sincity'):TileSet {
    if(name=='34') {
        return canvasTilesetThreeQuarter;
    }
    if(name=='basic') {
        return BasicTileset;
    }
    if(name=='sincity') {
        return sinCityTileSet;
    }
    else {
        throw new Error(`Unsupported tileset ${name}`);
    }
}

export function getFontTileSet(name:'font'):FontTileSet {
    if(name=='font') {
        return basicFontTileset;
    }
    else {
        throw new Error(`Unsupported tileset ${name}`);
    }
}

function r(x:[number,number]) {
    return (x[1])*16+x[0]
}

const basicFontTileset:FontTileSet = {
    name: 'Basic Font',
    imageSrc: tilesetFont,
    image: new Image(),
    tileSize: [16,16],
    offset: [0,0],
    letterMap: [],  
}

const sinCityTileSet:TileSet = {
    name: 'Sin City Tileset',
    imageSrc: tilesetSinCity,
    image: new Image(),
    tileSize: [16,16],
    cellSize: [16,16],
    offset: [0,0],
    flattenTexture: true,
    unlitTile: {textureIndex: r([0, 0])}, //color:colorPreset.lightBlue
    terrainTiles: [ 
        {textureIndex: r([5,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundNormal,
        {textureIndex: r([2,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundGrass,
        {textureIndex: r([4,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundWater,
        {textureIndex: r([0,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundMarble,
        {textureIndex: r([1,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundWood,
        {textureIndex: r([1,  4]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.GroundWoodCreaky,
        {textureIndex: r([0,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0000,
        {textureIndex: r([2,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0001,
        {textureIndex: r([4,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0010,
        {textureIndex: r([6,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0011,
        {textureIndex: r([1,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0100,
        {textureIndex: r([9,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0101,
        {textureIndex: r([8,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0110,
        {textureIndex: r([12, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall0111,
        {textureIndex: r([3,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1000,
        {textureIndex: r([10, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1001,
        {textureIndex: r([7,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1010,
        {textureIndex: r([14, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1011,
        {textureIndex: r([5,  1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1100,
        {textureIndex: r([13, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1101,
        {textureIndex: r([11, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1110,
        {textureIndex: r([15, 1]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.Wall1111,
        {textureIndex: r([0,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.OneWayWindowE,
        {textureIndex: r([2,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.OneWayWindowW,
        {textureIndex: r([3,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.OneWayWindowN,
        {textureIndex: r([1,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.OneWayWindowS,
        {textureIndex: r([10, 2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.PortcullisNS,
        {textureIndex: r([10, 2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.PortcullisEW,
        {textureIndex: r([6,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.DoorNS,
        {textureIndex: r([4,  2]),  color:colorPreset.lightGray, unlitColor:colorPreset.darkGray}, // TerrainType.DoorEW,
    ], 
    itemTiles: [
        {textureIndex: r([3,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.Chair,
        {textureIndex: r([4,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.Table,
        {textureIndex: r([2,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.Bush,
        {textureIndex: r([5,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.Coin,
        {textureIndex: r([6,  2]),  color:colorPreset.lightGray,   unlitColor:colorPreset.darkGray}, // ItemType.DoorNS,
        {textureIndex: r([4,  2]),  color:colorPreset.lightGray,   unlitColor:colorPreset.darkGray}, // ItemType.DoorEW,
        {textureIndex: r([10,  3]), color:colorPreset.lightGray,   unlitColor:colorPreset.darkGray}, // ItemType.PortcullisNS,
        {textureIndex: r([10,  3]), color:colorPreset.lightGray,   unlitColor:colorPreset.darkGray}, // ItemType.PortcullisEW,
        {textureIndex: r([0,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.TorchUnlit,
        {textureIndex: r([1,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.TorchLit,    
        {textureIndex: r([6,  3]),                                 unlitColor:colorPreset.lightGray}, // ItemType.TorchCarry,    
    ],
    npcTiles: [
        {textureIndex: r([3, 5])},//guardE:
        {textureIndex: r([2, 5])},//guardN:
        {textureIndex: r([4, 5])},//guardW:
        {textureIndex: r([1, 5])},//guardS:
        {textureIndex: r([3, 5]), color:colorPreset.darkGray},//guardEnoLoS:
        {textureIndex: r([2, 5]), color:colorPreset.darkGray},//guardNnoLoS:
        {textureIndex: r([4, 5]), color:colorPreset.darkGray},//guardWnoLoS:
        {textureIndex: r([1, 5]), color:colorPreset.darkGray},//guardSnoLoS:
        {textureIndex: r([3, 5]) },//guardE:
        {textureIndex: r([2, 5]) },//guardN:
        {textureIndex: r([4, 5]) },//guardW:
        {textureIndex: r([1, 5]) },//guardS:
    ],
    playerTiles: [
        {textureIndex: r([0,5]), }, //playerNormal
        {textureIndex: r([0,5]), color:colorPreset.darkRed}, //playerWounded
        {textureIndex: r([0,5]), color:colorPreset.darkGray}, //playerHidden: 
        {textureIndex: r([0,5]), color:colorPreset.lightRed}, //playerNoisy: 
        {textureIndex: r([0,5]), color:colorPreset.lightGray}, //playerUnlit: 
    ],
    guardStateTiles: [
        {textureIndex: r([4,0]), }, //Relaxed
        {textureIndex: r([5,5]), }, //Alerted
        {textureIndex: r([6,5]), }, //Chasing
    ]
}

const canvasTilesetThreeQuarter:TileSet = {
    name: '3/4 View Tileset',
    imageSrc: tileset34,
    image: new Image(),
    tileSize: [24,36],
    cellSize: [24,24],
    offset: [0,0],
    flattenTexture: true,
    unlitTile: {textureIndex: r([8, 0])}, //color:colorPreset.lightBlue
    terrainTiles: [ 
        {textureIndex: r([8, 3]),  unlitColor:0xFFa05050}, // TerrainType.GroundNormal,
        {textureIndex: r([6, 3]),  unlitColor:0xFFa05050}, // TerrainType.GroundGrass,
        {textureIndex: r([10, 3]), unlitColor:0xFFa05050}, // TerrainType.GroundWater,
        {textureIndex: r([4, 1]),  unlitColor:0xFFa05050}, // TerrainType.GroundMarble,
        {textureIndex: r([9, 3]),  unlitColor:0xFFa05050}, // TerrainType.GroundWood,
        {textureIndex: r([9, 3]),  unlitColor:0xFFa05050}, // TerrainType.GroundWoodCreaky,
        {textureIndex: r([0, 0]),  unlitColor:0xFFa05050}, // TerrainType.Wall0000,
        {textureIndex: r([8, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0001,
        {textureIndex: r([7, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0010,
        {textureIndex: r([4, 3]),  unlitColor:0xFFa05050}, // TerrainType.Wall0011,
        {textureIndex: r([4, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0100,
        {textureIndex: r([1, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0101,
        {textureIndex: r([0, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0110,
        {textureIndex: r([5, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall0111,
        {textureIndex: r([0, 3]),  unlitColor:0xFFa05050}, // TerrainType.Wall1000,
        {textureIndex: r([2, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall1001,
        {textureIndex: r([3, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall1010,
        {textureIndex: r([4, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall1011,
        {textureIndex: r([5, 3]),  unlitColor:0xFFa05050}, // TerrainType.Wall1100,
        {textureIndex: r([7, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall1101,
        {textureIndex: r([6, 2]),  unlitColor:0xFFa05050}, // TerrainType.Wall1110,
        {textureIndex: r([1, 0]),  unlitColor:0xFFa05050}, // TerrainType.Wall1111,
        {textureIndex: r([4, 0]),  unlitColor:0xFFa05050}, // TerrainType.OneWayWindowE,
        {textureIndex: r([3, 0]),  unlitColor:0xFFa05050}, // TerrainType.OneWayWindowW,
        {textureIndex: r([2, 0]),  unlitColor:0xFFa05050}, // TerrainType.OneWayWindowN,
        {textureIndex: r([2, 1]),  unlitColor:0xFFa05050}, // TerrainType.OneWayWindowS,
        {textureIndex: r([0, 1]),  unlitColor:0xFFa05050}, // TerrainType.PortcullisNS,
        {textureIndex: r([1, 1]),  unlitColor:0xFFa05050}, // TerrainType.PortcullisEW,
        {textureIndex: r([6, 0]),  unlitColor:0xFFa05050}, // TerrainType.DoorNS,
        {textureIndex: r([5, 0]),  unlitColor:0xFFa05050}, // TerrainType.DoorEW,
        {textureIndex: r([6, 3]),  unlitColor:0xFFa05050}, // TerrainType.GardenDoorNS,
        {textureIndex: r([6, 3]),  unlitColor:0xFFa05050}, // TerrainType.GardenDoorEW,
    ], 
    itemTiles: [
        {textureIndex: r([5, 5]),  color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.Chair,
        {textureIndex: r([3, 5]),  color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.Table,
        {textureIndex: r([0, 6]),                                 unlitColor:colorPreset.darkGray}, // ItemType.Bush,
        {textureIndex: r([14, 5]), color:colorPreset.lightYellow, unlitColor:colorPreset.darkGray}, // ItemType.Coin,
        {textureIndex: r([6, 0]),                                 unlitColor:colorPreset.darkGray}, // ItemType.DoorNS,
        {textureIndex: r([5, 0]),                                 unlitColor:colorPreset.darkGray}, // ItemType.DoorEW,
        {textureIndex: r([0, 1]),                                 unlitColor:colorPreset.darkGray}, // ItemType.PortcullisNS,
        {textureIndex: r([1, 1]),                                 unlitColor:colorPreset.darkGray}, // ItemType.PortcullisEW,
        {textureIndex: r([15, 4]),                                unlitColor:colorPreset.lightGray}, // ItemType.TorchUnlit,
        {textureIndex: r([14, 4]),                                unlitColor:colorPreset.lightGray}, // ItemType.TorchLit,    
        {textureIndex: r([13, 4]),                                unlitColor:colorPreset.lightGray}, // ItemType.TorchCarry,    
    ],
    npcTiles: [
        {textureIndex: r([9, 4])},//guardE:
        {textureIndex: r([10, 4])},//guardN:
        {textureIndex: r([11, 4])},//guardW:
        {textureIndex: r([12, 4])},//guardS:
        {textureIndex: r([9, 4]), color:colorPreset.darkGray},//guardEnoLoS:
        {textureIndex: r([10, 4]), color:colorPreset.darkGray},//guardNnoLoS:
        {textureIndex: r([11, 4]), color:colorPreset.darkGray},//guardWnoLoS:
        {textureIndex: r([12, 4]), color:colorPreset.darkGray},//guardSnoLoS:
        {textureIndex: r([9, 4]) },//guardE:
        {textureIndex: r([10, 4]) },//guardN:
        {textureIndex: r([11, 4]) },//guardW:
        {textureIndex: r([12, 4]) },//guardS:
        // {textureIndex: r([1, 4]), color:null},//guardE:
        // {textureIndex: r([2, 4]), color:null},//guardN:
        // {textureIndex: r([3, 4]), color:null},//guardW:
        // {textureIndex: r([4, 4]), color:null},//guardS:
        // {textureIndex: r([1, 4]), color:colorPreset.darkGray},//guardEnoLoS:
        // {textureIndex: r([2, 4]), color:colorPreset.darkGray},//guardNnoLoS:
        // {textureIndex: r([3, 4]), color:colorPreset.darkGray},//guardWnoLoS:
        // {textureIndex: r([4, 4]), color:colorPreset.darkGray},//guardSnoLoS:
        // {textureIndex: r([1, 4]), color:colorPreset.lightMagenta},//guardE:
        // {textureIndex: r([2, 4]), color:colorPreset.lightMagenta},//guardN:
        // {textureIndex: r([3, 4]), color:colorPreset.lightMagenta},//guardW:
        // {textureIndex: r([4, 4]), color:colorPreset.lightMagenta},//guardS:
    ],
    playerTiles: [
        {textureIndex: r([0,4]), color:colorPreset.darkGray}, //playerNormal
        {textureIndex: r([0,4]), color:colorPreset.darkRed}, //playerWounded
        {textureIndex: r([0,4]), color:0xd0101010}, //playerHidden: 
        {textureIndex: r([0,4]), color:colorPreset.lightCyan}, //playerNoisy: 
        {textureIndex: r([0,4]), color:colorPreset.lightBlue}, //playerUnlit: 
    ],
    guardStateTiles: [
        {textureIndex: r([0,4]), color:colorPreset.darkGray}, //Relaxed
        {textureIndex: r([0,4]), color:colorPreset.darkRed}, //Alerted
        {textureIndex: r([0,4]), color:0xd0101010}, //Chasing
    ]
}


var BasicTileset:TileSet = {
    name: 'Basic Tiles',
    imageSrc: tilesetBasic,
    image: new Image(),
    tileSize: [16,16],
    cellSize: [16,16],
    offset: [0,0],
    flattenTexture: true,
    unlitTile: {textureIndex:0, color:colorPreset.lightBlue},
    terrainTiles: [
        {textureIndex:112, color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.GroundNormal,
        {textureIndex:116, color:colorPreset.darkGreen, unlitColor:colorPreset.darkBlue}, // TerrainType.GroundGrass,
        {textureIndex:118, color:colorPreset.lightBlue, unlitColor:colorPreset.darkBlue}, // TerrainType.GroundWater,
        {textureIndex:120, color:colorPreset.darkCyan,  unlitColor:colorPreset.darkBlue}, // TerrainType.GroundMarble,
        {textureIndex:122, color:colorPreset.darkBrown, unlitColor:colorPreset.darkBlue}, // TerrainType.GroundWood,
        {textureIndex:122, color:0xff004070,            unlitColor:colorPreset.darkBlue}, // TerrainType.GroundWoodCreaky,
        {textureIndex:64,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0000,
        {textureIndex:65,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0001,
        {textureIndex:65,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0010,
        {textureIndex:65,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0011,
        {textureIndex:66,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0100,
        {textureIndex:67,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0101,
        {textureIndex:70,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0110,
        {textureIndex:73,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall0111,
        {textureIndex:66,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1000,
        {textureIndex:68,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1001,
        {textureIndex:69,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1010,
        {textureIndex:72,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1011,
        {textureIndex:66,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1100,
        {textureIndex:74,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1101,
        {textureIndex:71,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1110,
        {textureIndex:75,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.Wall1111,
        {textureIndex:52,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.OneWayWindowE,
        {textureIndex:53,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.OneWayWindowW,
        {textureIndex:54,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.OneWayWindowN,
        {textureIndex:55,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.OneWayWindowS,
        {textureIndex:50,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.PortcullisNS,
        {textureIndex:50,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.PortcullisEW,
        {textureIndex:77,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.DoorNS,
        {textureIndex:76,  color:colorPreset.lightGray, unlitColor:colorPreset.darkBlue}, // TerrainType.DoorEW,
        {textureIndex:116, color:colorPreset.darkGreen, unlitColor:colorPreset.darkBlue}, // TerrainType.GardenDoorNS,
        {textureIndex:116, color:colorPreset.darkGreen, unlitColor:colorPreset.darkBlue}, // TerrainType.GardenDoorEW,
    ],    
    itemTiles: [
        {textureIndex:100, color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.Chair,
        {textureIndex:98,  color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.Table,
        {textureIndex:96,  color:colorPreset.darkGreen  , unlitColor:colorPreset.darkGray}, // ItemType.Bush,
        {textureIndex:110, color:colorPreset.lightYellow, unlitColor:colorPreset.darkGray}, // ItemType.Coin,
        {textureIndex:89,  color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.DoorNS,
        {textureIndex:87,  color:colorPreset.darkBrown  , unlitColor:colorPreset.darkGray}, // ItemType.DoorEW,
        {textureIndex:50,  color:colorPreset.lightGray  , unlitColor:colorPreset.darkGray}, // ItemType.PortcullisNS,
        {textureIndex:50,  color:colorPreset.lightGray  , unlitColor:colorPreset.darkGray}, // ItemType.PortcullisEW,
        {textureIndex:80,  color:colorPreset.darkGray   , unlitColor:colorPreset.darkGray}, // ItemType.TorchUnlit,
        {textureIndex:80,  color:colorPreset.lightYellow, unlitColor:colorPreset.darkGray}, // ItemType.TorchLit,    
        {textureIndex:80,  color:colorPreset.lightYellow, unlitColor:colorPreset.darkGray}, // ItemType.TorchCarry,    
    ],
    playerTiles: [
        /*playerNormal:*/ {textureIndex:32, color:colorPreset.darkGray}, 
        /*playerWounded:*/ {textureIndex:32, color:colorPreset.darkRed}, 
        /*playerHidden:*/ {textureIndex:32, color:0xd0101010}, 
        /*playerNoisy:*/ {textureIndex:32, color:colorPreset.lightCyan}, 
        /*playerUnlit:*/ {textureIndex:32, color:colorPreset.lightBlue}, 
    ],
    guardStateTiles: [
        {textureIndex:0 },//Relaxed
        {textureIndex:39 },//Alerted
        {textureIndex:40 },//Chasing
    ],
    npcTiles: [
        {textureIndex:33 },//guardE
        {textureIndex:34 },//guardN
        {textureIndex:35 },//guardW
        {textureIndex:36 },//guardS
        {textureIndex:33, color:colorPreset.darkGray},//guardEnoLoS
        {textureIndex:34, color:colorPreset.darkGray},//guardNnoLoS
        {textureIndex:35, color:colorPreset.darkGray},//guardWnoLoS
        {textureIndex:36, color:colorPreset.darkGray},//guardSnoLoS
        {textureIndex:33, color:colorPreset.lightMagenta},//guardE
        {textureIndex:34, color:colorPreset.lightMagenta},//guardN
        {textureIndex:35, color:colorPreset.lightMagenta},//guardW
        {textureIndex:36, color:colorPreset.lightMagenta},//guardS
    ],
}

