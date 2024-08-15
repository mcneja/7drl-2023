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
    constructor(tileInfo:Array<TileInfo>, frameDuration:number|Array<number>, time:number=0, frame:number=0) {
        super()
        this.time = time;
        this.tileInfo = tileInfo;
        this.activeFrame = frame;
        this.frameDuration = frameDuration;
    }
    update(dt:number):boolean {
        this.time+=dt;
        const fDuration = this.frameDuration instanceof Array? this.frameDuration[this.activeFrame]:this.frameDuration;
        if(this.time>fDuration) {
            this.activeFrame++;
            if(this.activeFrame>=this.tileInfo.length) this.activeFrame=0;
            this.time = 0;
        }
        return false;
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
        super()
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
        if(this.item!==null) {
            if(this.item.type === ItemType.TorchUnlit) this.state = LightState.off;
            if(this.item.type !== ItemType.TorchUnlit && this.state === LightState.off) {
                this.state = LightState.idle;
                this.lightVector[this.lightId] = 0;
            }
        } 
        this.time+=dt;
        if(this.state == LightState.off) return false;
        let lm = this.lightVector[this.lightId];
        if(lm==0 && Math.random()>0.995**(dt*60)) {
            this.state = LightState.dimmed;
            lm = 1.5; //Previously 3 but falloff is too hard;        
        } else if(lm>0) {
            lm = Math.max(lm-3*dt,0); //3 is matched to the maximum dim state of 1.5
        }
        if(lm==0) {
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