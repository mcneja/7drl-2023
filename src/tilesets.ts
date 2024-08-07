import * as colorPreset from './color-preset';

const imageTileset31Color = require('url:./tiles31color.png')
const imageTilesetFont = require('url:./font.png')


export type TileInfo = {
    textureIndex?: number; //[number,number]|
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
    touchButtons: {[id:string]:TileInfo};
    namedTiles: {[id:string]:TileInfo};
    terrainTiles: Array<TileInfo>;
    itemTiles: Array<TileInfo>;
    guardStateTiles: Array<TileInfo>;
    npcTiles: Array<TileInfo>;
    playerTiles: {
        normal:  TileInfo;
        hidden:  TileInfo;
        right:   TileInfo;
        left:    TileInfo;
        down:    TileInfo;
        up:      TileInfo;
        dead:    TileInfo;
    };
    ledgeTiles: Array<TileInfo>;
    unlitTile: TileInfo;
    flattenTexture: boolean;
    waterAnimation: Array<TileInfo>;
    stoveAnimation: Array<TileInfo>;
    candleAnimation: Array<TileInfo>;
    torchAnimation: Array<TileInfo>;
}

export type FontTileSet = {
    name: string;
    imageSrc: string;
    image: HTMLImageElement;
    tileSize: [number, number];
    offset: [number, number];
    letterMap: Array<TileInfo>;
    background: TileInfo;
    heart: TileInfo;
    air: TileInfo;
}

export function getTileSet():TileSet {
    return tileSet31Color;
}

export function getFontTileSet():FontTileSet {
    return basicFontTileset;
}

function r(x:[number,number]) {
    return (x[1])*16+x[0]
}

const basicFontTileset:FontTileSet = {
    name: 'Basic Font',
    imageSrc: imageTilesetFont,
    image: new Image(),
    tileSize: [16,16],
    offset: [0,0],
    letterMap: [],  
    background: {textureIndex:219, color: 0xff101010},
    heart: {textureIndex: 3},
    air: {textureIndex: 9},
}

const colorWallUnlit    = 0xffc0aaaa;
const colorWallLit      = 0xffd0ffff;
const colorGroundUnlit  = 0xff956a6a;
const colorGroundLit    = 0xffd0f3ff;
const colorWoodFloorLit = 0xffc2e3ee;
const colorItemUnlit    = 0xffb49090;

const tileSet31Color:TileSet = {
    name: '31 Color Tileset',
    imageSrc: imageTileset31Color,
    image: new Image(),
    tileSize: [16,16],
    cellSize: [16,16],
    offset: [0,0],
    flattenTexture: true,
    unlitTile: {textureIndex: r([0, 0])}, //color:colorPreset.lightBlue
    namedTiles: {
        litPlayer: {textureIndex:0xbc, color:0xffffffff},
        pickTarget: {textureIndex:0xbc, color:0xffffffff},
        noise: {textureIndex: 0xbb, color: 0x80ffffff},
        crossHatch: {textureIndex:3, color:0xffffffff},
        patrolRoute: {textureIndex:0x1f, color:0xff80ff80},
        speechBubbleR: {textureIndex:0xb7, color:0xffffffff},
        speechBubbleL: {textureIndex:0xb8, color:0xffffffff},
    },
    touchButtons: {
        'menu':             {textureIndex: r([11, 1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'up':               {textureIndex: r([2,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'down':             {textureIndex: r([3,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'left':             {textureIndex: r([0,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'right':            {textureIndex: r([1,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'wait':             {textureIndex: r([4,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'jump':             {textureIndex: r([5,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'menuAccept':       {textureIndex: r([4,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'zoomOut':          {textureIndex: r([6,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'zoomIn':           {textureIndex: r([7,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'heal':             {textureIndex: r([8,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'startLevel':       {textureIndex: r([9,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'nextLevel':        {textureIndex: r([9,  1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'forceRestart':     {textureIndex: r([10, 1]), color:0xa0ffffff, unlitColor:0x30ffffff},
        'fullscreen':       {textureIndex: r([14, 1]), color:0xa0ffffff, unlitColor:0x30ffffff},
    },
    terrainTiles: [ 
        {textureIndex: r([5,  4]),   color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GroundNormal,
        {textureIndex: r([8,   4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GroundGrass,
        {textureIndex: r([10,  4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GroundWater,
        {textureIndex: r([0,   4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GroundMarble,
        {textureIndex: r([7,   4]),  color:colorWoodFloorLit, unlitColor:colorGroundUnlit}, // TerrainType.GroundWood,
        {textureIndex: r([7,   5]),  color:colorWoodFloorLit, unlitColor:colorGroundUnlit}, // TerrainType.GroundWoodCreaky,
        {textureIndex: r([5,   4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GroundVault,
        {textureIndex: r([0,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0000,
        {textureIndex: r([2,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0001,
        {textureIndex: r([4,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0010,
        {textureIndex: r([6,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0011,
        {textureIndex: r([1,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0100,
        {textureIndex: r([9,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0101,
        {textureIndex: r([8,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0110,
        {textureIndex: r([12,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall0111,
        {textureIndex: r([3,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1000,
        {textureIndex: r([10,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1001,
        {textureIndex: r([7,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1010,
        {textureIndex: r([14,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1011,
        {textureIndex: r([5,   2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1100,
        {textureIndex: r([13,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1101,
        {textureIndex: r([11,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1110,
        {textureIndex: r([15,  2]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.Wall1111,
        {textureIndex: r([0,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.OneWayWindowE,
        {textureIndex: r([2,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.OneWayWindowW,
        {textureIndex: r([3,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.OneWayWindowN,
        {textureIndex: r([1,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.OneWayWindowS,
        {textureIndex: r([11,  3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.PortcullisNS,
        {textureIndex: r([11,  3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.PortcullisEW,
        {textureIndex: r([8,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.DoorNS,
        {textureIndex: r([5,   3]),  color:colorWallLit,      unlitColor:colorWallUnlit},   // TerrainType.DoorEW,
        {textureIndex: r([8,   4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GardenDoorNS,
        {textureIndex: r([8,   4]),  color:colorGroundLit,    unlitColor:colorGroundUnlit}, // TerrainType.GardenDoorEW,
    ], 
    itemTiles: [
        {textureIndex: r([3,  13]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Chair,
        {textureIndex: r([4,  13]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Table,
        {textureIndex: r([7,  14]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.BedL,
        {textureIndex: r([8,  14]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.BedR,
        {textureIndex: r([10, 14]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.DrawersShort,
        {textureIndex: r([9,  14]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.DrawersTall,
        {textureIndex: r([7,  12]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Bookshelf,
        {textureIndex: r([5,  12]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Shelf,
        {textureIndex: r([14, 14]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Stove,
        {textureIndex: r([2,  13]),  color:colorPreset.white,      unlitColor:colorItemUnlit}, // ItemType.Bush,
        {textureIndex: r([5,  13]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.Coin,
        {textureIndex: r([15, 11]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.Health,
        {textureIndex: r([7,   3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.DoorNS,
        {textureIndex: r([4,   3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.DoorEW,
        {textureIndex: r([9,   3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.LockedDoorNS,
        {textureIndex: r([6,   3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.LockedDoorEW,
        {textureIndex: r([11,  3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.PortcullisNS,
        {textureIndex: r([11,  3]),  color:colorWallLit,           unlitColor:colorWallUnlit}, // ItemType.PortcullisEW,
        {textureIndex: r([0,  13]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.TorchUnlit,
        {textureIndex: r([1,  13]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.TorchLit,    
        {textureIndex: r([12, 13]),  color:colorPreset.yellowTint, unlitColor:colorPreset.yellowTint}, // ItemType.TorchCarry,    
        {textureIndex: r([0,  15]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.PurseCarry,    
        {textureIndex: r([6,  13]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.Key,    
        {textureIndex: r([1,  15]),  color:colorPreset.white,      unlitColor:colorPreset.white}, // ItemType.KeyCarry,    
    ],
    npcTiles: [
        {textureIndex: r([3, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardE
        {textureIndex: r([2, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardN
        {textureIndex: r([4, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardW
        {textureIndex: r([1, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardS

        {textureIndex: r([3, 8]),    color:colorPreset.darkGray},//guardEnoLoS
        {textureIndex: r([2, 8]),    color:colorPreset.darkGray},//guardNnoLoS
        {textureIndex: r([4, 8]),    color:colorPreset.darkGray},//guardWnoLoS
        {textureIndex: r([1, 8]),    color:colorPreset.darkGray},//guardSnoLoS

        {textureIndex: r([3, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardE
        {textureIndex: r([2, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardN
        {textureIndex: r([4, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardW
        {textureIndex: r([1, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardS
        //KO'd
        {textureIndex: r([0, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardE
        {textureIndex: r([0, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardN
        {textureIndex: r([0, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardW
        {textureIndex: r([0, 8]),    color:colorPreset.white,     unlitColor:colorPreset.darkGray},//guardS
    ],
    playerTiles: {
        normal:  {textureIndex: r([1, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        hidden:  {textureIndex: r([0, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        right:   {textureIndex: r([2, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        left:    {textureIndex: r([3, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        down:    {textureIndex: r([1, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        up:      {textureIndex: r([4, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
        dead:    {textureIndex: r([5, 9]), color:colorPreset.white, unlitColor:colorPreset.lightGray},
    },
    guardStateTiles: [
        {textureIndex: r([0,11])}, //Relaxed
        {textureIndex: r([1,11])}, //Angry
        {textureIndex: r([2,11])}, //Alerted
        {textureIndex: r([3,11])}, //Chasing
        {textureIndex: r([4,11])}, //Unconscious
    ],
    ledgeTiles: [
        {textureIndex: r([12,0]),    color: 0xFF736847,           unlitColor: 0xFF483428}, //top
        {textureIndex: r([13,0]),    color: 0xFF736847,           unlitColor: 0xFF483428}, //bottom
        {textureIndex: r([14,0]),    color: 0xFF736847,           unlitColor: 0xFF483428}, //left
        {textureIndex: r([15,0]),    color: 0xFF736847,           unlitColor: 0xFF483428}, //right
    ],
    waterAnimation: [
        {textureIndex: 0x60, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray}, 
        {textureIndex: 0x61, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray}, 
        {textureIndex: 0x62, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray}, 
        {textureIndex: 0x63, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
    ],
    stoveAnimation: [
        {textureIndex: 0xee, color: colorPreset.white, unlitColor: colorPreset.midGray}, // stove cycle
        {textureIndex: 0xef, color: colorPreset.white, unlitColor: colorPreset.midGray},
    ],
    candleAnimation: [
        {textureIndex: 0xe0, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
        {textureIndex: 0xe1, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
        {textureIndex: 0xe2, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
        {textureIndex: 0xe3, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
        {textureIndex: 0xd0, color: colorPreset.yellowTint, unlitColor: colorPreset.midGray},
    ],
    torchAnimation: [
        {textureIndex: 0xdc}, //torch cycle
        {textureIndex: 0xdd},
        {textureIndex: 0xde},
        {textureIndex: 0xdf}, //torch low
        {textureIndex: 0xdf}, //torch off
    ],
}


