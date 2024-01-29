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
    playerTiles: {[id:string]:TileInfo};
    ledgeTiles: Array<TileInfo>;
    unlitTile: TileInfo;
    flattenTexture: boolean;
    waterAnimation: Array<TileInfo>;
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
    background: {textureIndex:219, color: 0xf0101010},
    heart: {textureIndex: 3},
    air: {textureIndex: 9},
}

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
        'menu':             {textureIndex: r([11,  1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'up':               {textureIndex: r([2,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'down':             {textureIndex: r([3,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'left':             {textureIndex: r([0,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'right':            {textureIndex: r([1,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'wait':             {textureIndex: r([4,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'exitLevel':        {textureIndex: r([9,   1]), color:0xff00ffff, unlitColor:0xff00ffff},
        'jump':             {textureIndex: r([5,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'zoomIn':           {textureIndex: r([6,   1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'zoomOut':          {textureIndex: r([7,  1]),  color:0xa0ffffff, unlitColor:0x80ffffff},
        'heal':             {textureIndex: r([8,  1]),  color:0xa0ffffff, unlitColor:0x80ffffff},
        'startLevel':       {textureIndex: r([9,  1]),  color:0xa0ffffff, unlitColor:0x80ffffff},
        'nextLevel':        {textureIndex: r([9,  1]),  color:0xa0ffffff, unlitColor:0x80ffffff},
        'restart':          {textureIndex: r([10,  1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'forceRestart':     {textureIndex: r([10,  1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'gamepadTouchOn':   {textureIndex: r([12,  1]), color:0xa0ffffff, unlitColor:0xffffffff},
        'gamepadTouchOff':  {textureIndex: r([12,  1]), color:0xa0ffffff, unlitColor:0x80ffffff},
        'picker':           {textureIndex: r([13,  1]), color:0xff00ffff, unlitColor:0xff00ffff},
        'fullscreen':       {textureIndex: r([14,  1]), color:0xa0ffffff, unlitColor:0x80ffffff},

    },
    terrainTiles: [ 
        {textureIndex: r([5,  4]),   color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundNormal,
        {textureIndex: r([8,   4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundGrass,
        {textureIndex: r([10,  4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundWater,
        {textureIndex: r([0,   4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundMarble,
        {textureIndex: r([7,   4]),  color:colorPreset.darkerYellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundWood,
        {textureIndex: r([7,   5]),  color:colorPreset.darkerYellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundWoodCreaky,
        {textureIndex: r([5,   4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GroundVault,
        {textureIndex: r([0,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0000,
        {textureIndex: r([2,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0001,
        {textureIndex: r([4,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0010,
        {textureIndex: r([6,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0011,
        {textureIndex: r([1,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0100,
        {textureIndex: r([9,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0101,
        {textureIndex: r([8,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0110,
        {textureIndex: r([12,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall0111,
        {textureIndex: r([3,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1000,
        {textureIndex: r([10,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1001,
        {textureIndex: r([7,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1010,
        {textureIndex: r([14,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1011,
        {textureIndex: r([5,   2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1100,
        {textureIndex: r([13,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1101,
        {textureIndex: r([11,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1110,
        {textureIndex: r([15,  2]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.Wall1111,
        {textureIndex: r([0,   3]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.OneWayWindowE,
        {textureIndex: r([2,   3]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.OneWayWindowW,
        {textureIndex: r([3,   3]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.OneWayWindowN,
        {textureIndex: r([1,   3]),  color:colorPreset.white,       unlitColor:colorPreset.midGray}, // TerrainType.OneWayWindowS,
        {textureIndex: r([12,  3]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.midGray}, // TerrainType.PortcullisNS,
        {textureIndex: r([11,  3]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.midGray}, // TerrainType.PortcullisEW,
        {textureIndex: r([8,   3]),  color:colorPreset.lighterGray, unlitColor:colorPreset.midGray}, // TerrainType.DoorNS,
        {textureIndex: r([5,   3]),  color:colorPreset.lighterGray, unlitColor:colorPreset.midGray}, // TerrainType.DoorEW,
        {textureIndex: r([8,   4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GardenDoorNS,
        {textureIndex: r([8,   4]),  color:colorPreset.yellowTint,  unlitColor:colorPreset.darkGray}, // TerrainType.GardenDoorEW,
    ], 
    itemTiles: [
        {textureIndex: r([3,  13]),  color:colorPreset.yellowTint, unlitColor:colorPreset.midGray}, // ItemType.Chair,
        {textureIndex: r([4,  13]),  color:colorPreset.yellowTint, unlitColor:colorPreset.midGray}, // ItemType.Table,
        {textureIndex: r([7,  14]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.BedL,
        {textureIndex: r([8,  14]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.BedR,
        {textureIndex: r([10, 14]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.DrawersShort,
        {textureIndex: r([9,  14]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.DrawersTall,
        {textureIndex: r([7,  12]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.Bookshelf,
        {textureIndex: r([2,  13]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.Bush,
        {textureIndex: r([5,  13]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.Coin,
        {textureIndex: r([7,   3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.DoorNS,
        {textureIndex: r([4,   3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.DoorEW,
        {textureIndex: r([9,   3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.LockedDoorNS,
        {textureIndex: r([6,   3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.LockedDoorEW,
        {textureIndex: r([12,  3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.PortcullisNS,
        {textureIndex: r([11,  3]),  color:colorPreset.white,      unlitColor:colorPreset.midGray}, // ItemType.PortcullisEW,
        {textureIndex: r([0,  13]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.TorchUnlit,
        {textureIndex: r([1,  13]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.TorchLit,    
        {textureIndex: r([12, 13]),  color:colorPreset.yellowTint, unlitColor:0xffa07070}, // ItemType.TorchCarry,    
        {textureIndex: r([0,  15]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.PurseCarry,    
        {textureIndex: r([6,  13]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.Key,    
        {textureIndex: r([1,  15]),  color:colorPreset.white,      unlitColor:0xffffffff}, // ItemType.KeyCarry,    
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
        normal:  {textureIndex: r([1, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        wounded: {textureIndex: r([1, 9]), color:colorPreset.lightRed,  unlitColor:colorPreset.darkRed},
        hidden:  {textureIndex: r([0, 9]), color:colorPreset.darkGray,  unlitColor:colorPreset.darkerGray}, 
        noisy:   {textureIndex: r([1, 9]), color:colorPreset.lightGray, unlitColor:colorPreset.darkGray},
        unlit:   {textureIndex: r([1, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        right:   {textureIndex: r([2, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        left:    {textureIndex: r([3, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        down:    {textureIndex: r([1, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        up:      {textureIndex: r([4, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
        dead:    {textureIndex: r([5, 9]), color:colorPreset.white,     unlitColor:colorPreset.lightGray},
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


