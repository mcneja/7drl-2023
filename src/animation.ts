import { vec2 } from './my-matrix';
import { TileInfo } from './tilesets';
import { Item, ItemType } from './game-map';
var tween = require('tween-functions');

export { Animator, SpriteAnimation, FrameAnimator, LightSourceAnimation, tween, LightState, TweenData };

type TweenData = {
    pt0:vec2; 
    pt1:vec2; 
    duration:number 
    fn:(time:number, begin:number, end:number, duration:number)=>number;
}

class Animator {
    update(dt:number):boolean {
        return false;
    }
    currentTile():TileInfo {
        return {};
    }
}

class FrameAnimator extends Animator {
    activeFrame: number;
    frameDuration: number|Array<number>;
    time: number;
    tileInfo:Array<TileInfo>;
    removeOnFinish:boolean;
    loops: number;
    constructor(tileInfo:Array<TileInfo>, frameDuration:number|Array<number>, startingFrame:number=0, loops:number=-1) {
        super();
        this.time = 0;
        this.tileInfo = tileInfo;
        this.activeFrame = startingFrame;
        this.frameDuration = frameDuration;
        this.removeOnFinish = false;
        this.loops = loops;
    }
    update(dt:number):boolean {
        this.time+=dt;
        const fDuration = this.frameDuration instanceof Array? this.frameDuration[this.activeFrame]:this.frameDuration;
        if(this.time>fDuration) {
            this.activeFrame++;
            if(this.activeFrame>=this.tileInfo.length) {
                this.activeFrame=0;
                if (this.loops>0) {
                    this.loops--;
                }
            }
            this.time = 0;
        }
        return this.loops===0;
    }
    currentTile():TileInfo {
        return this.tileInfo[this.activeFrame];
    }
}

class SpriteAnimation extends Animator {
    offset: vec2;
    activeFrame: number;
    frameStep: number;
    time: number;
    tileInfo:Array<TileInfo>;
    activePt: number;
    tweenSeq: Array<TweenData>;
    removeOnFinish: boolean;
    constructor(tweenSeq: Array<TweenData>, tileInfo:Array<TileInfo>) {
        super();
        this.time = 0;
        this.offset = vec2.clone(tweenSeq[0].pt0);
        this.tileInfo = tileInfo;
        this.activeFrame = 0;
        this.frameStep = 1;
        this.activePt = 0;
        this.tweenSeq = tweenSeq;
        this.removeOnFinish = false;
    }
    update(dt:number):boolean {
        const start = this.tweenSeq[this.activePt].pt0;
        const end = this.tweenSeq[this.activePt].pt1;
        const duration = this.tweenSeq[this.activePt].duration;
        const fn = this.tweenSeq[this.activePt].fn;
        if(start===undefined || end==undefined) {
            return true;
        }
        this.time=Math.min(this.time+dt, duration);
        this.offset[0] = fn(this.time, start[0], end[0], duration);
        this.offset[1] = fn(this.time, start[1], end[1], duration);
        if(this.time == duration) {
            this.activePt++;
            this.time = 0;
            this.activeFrame++;
        }
        if(this.activeFrame>=this.tileInfo.length) {
            this.activeFrame = 0;
        }
        return this.activePt === this.tweenSeq.length;
    }
    currentTile():TileInfo {
        return this.tileInfo[this.activeFrame];
    }
}

export class PulsingColorAnimation extends Animator {
    tile: TileInfo;
    offset: vec2 = new vec2();
    duration: number = 0;
    period: number = 1;
    time: number = 0;

    /**
     * 
     * @param tile Tile index and optional color tint values for lit and unlit states
     * @param duration Lenght of time the animation will run for
     * @param period 
     */
    constructor(tile:TileInfo, duration:number, period:number) {
        super();
        this.tile = tile;
        this.duration = duration;
        this.period = period;
    }

    update(dt:number):boolean {
        if (this.duration > 0) {
            this.time = Math.min(this.time + dt, this.duration);
        } else {
            this.time += dt;
        }
        return this.duration > 0 && this.time === this.duration;
    }
    get intensity() {
        return Math.sin(this.time/this.period);
    }
    agbr_color_to_tuple(color:number):[number, number, number, number] {
        // Extract the alpha, blue, green, and red components from the first color
        const a1 = (color >> 24) & 0xFF;
        const b1 = (color >> 16) & 0xFF;
        const g1 = (color >> 8) & 0xFF;
        const r1 = color & 0xFF;
        return [a1,b1,g1,r1];
    }
    abgr_tuple_to_color(a:number, b:number, g:number, r:number) {
        return ((Math.floor(a%256) << 24) | (Math.floor(b%256) << 16) | (Math.floor(g%256) << 8) | Math.floor(r%256)) >>> 0;
    }
    blend(color1:number, color2:number, weight:number) {
        const c1 = this.agbr_color_to_tuple(color1);
        const c2 = this.agbr_color_to_tuple(color2);
        const blended = c1.map((v,ind) =>  v*weight + c2[ind]*(1-weight));
        return this.abgr_tuple_to_color(blended[0], blended[1], blended[2], blended[3]);
    }
    currentTile():TileInfo {
        const intensity = this.intensity;
        const weight = (1+intensity)/2
        return {
            textureIndex: this.tile.textureIndex,
            color: this.tile.color!==undefined&&this.tile.unlitColor!==undefined?
                    this.blend(this.tile.color, this.tile.unlitColor, weight):
                    0xffffffff,
        }
    }    
}

export class RadialAnimation extends Animator {
    offset: vec2;
    centerPos: vec2;
    time: number;
    tileInfo: TileInfo;
    removeOnFinish: boolean;
    radius:number;
    speed: number;
    startingPos: number;
    posRadians: number;
    duration: number;

    /**
     * 
     * @param tile tile texture index and color tint values
     * @param radius 
     * @param speed 
     * @param startingPos 
     * @param duration 
     * @param centerPos
     * @param oscillationRadius
     * @param oscillationPeriod
     * 
     */
    constructor(tile:TileInfo, radius:number, speed:number, startingPos:number, duration:number, 
        centerPos:vec2=new vec2(0,0), oscillationRadius:number=0, oscillationPeriod:number=0) {
        super();
        this.time = 0;
        this.tileInfo = tile;
        this.offset = new vec2();
        this.centerPos = centerPos;
        this.radius = radius;
        this.speed = speed;
        this.startingPos = startingPos;
        this.duration = duration;
        this.posRadians = startingPos;
        this.removeOnFinish = false;
    }
    update(dt:number):boolean {
        if(this.duration > 0) {
            this.time=Math.min(this.time+dt, this.duration);
        } else {
            this.time += dt;
        }
        this.posRadians += this.speed*dt;
        this.offset[0] = this.centerPos[0] + Math.cos(this.posRadians)*this.radius;
        this.offset[1] = this.centerPos[1] + Math.sin(this.posRadians)*this.radius;
        //console.log(this.posRadians, this.radius, this.speed, Math.cos(this.posRadians)*this.radius);
        return this.time===this.duration;
    }
    currentTile():TileInfo {
        return this.tileInfo;
    }    
}


enum LightState {
    idle,
    dimmed,
    off
}

class LightSourceAnimation extends Animator {
    activeFrame: number = 0;
    time: number = 0;
    dimDuration: number = 300;
    idleTiles: Array<[TileInfo, number]>;
    dimTile: TileInfo;
    offTile: TileInfo;
    state:LightState;
    lightId: number;
    lightVector: Array<number>;
    item: Item|null;
    constructor(state:LightState, lightId:number, lightVector:Array<number>, item:Item|null, idleTiles:Array<[TileInfo, number]>, dimTile:TileInfo, offTile:TileInfo) {
        super();
        this.idleTiles = idleTiles;
        this.dimTile = dimTile;
        this.offTile = offTile;
        this.lightId = lightId;
        this.lightVector = lightVector;
        this.state = state;
        this.item = item;
    }
    update(dt:number):boolean {
        if (this.item!==null) {
            if(this.item.type === ItemType.TorchUnlit) this.state = LightState.off;
            if(this.item.type !== ItemType.TorchUnlit && this.state === LightState.off) {
                this.state = LightState.idle;
                this.lightVector[this.lightId] = 0;
            }
        } 
        this.time+=dt;
        if( this.state == LightState.off) return false;
        let lm = this.lightVector[this.lightId];
        if (lm==0 && Math.random()>0.995**(dt*60)) {
            this.state = LightState.dimmed;
            lm = 1.5; //Previously 3 but falloff is too hard;        
        } else if(lm>0) {
            lm = Math.max(lm-3*dt,0); //3 is matched to the maximum dim state of 1.5
        }
        if (lm==0) {
            this.state = LightState.idle;
            const duration = this.idleTiles[this.activeFrame][1];
            if(this.time>=duration) {
                this.time = 0;
                this.activeFrame++;
                if(this.activeFrame>=this.idleTiles.length) {
                    this.activeFrame = 0;
                }
            }
        }
        this.lightVector[this.lightId] = lm;
        return false;
    }
    currentTile():TileInfo {
        if(this.state==LightState.idle) return this.idleTiles[this.activeFrame][0];
        if(this.state==LightState.dimmed) return this.dimTile;
        return this.offTile;
    }
}