import { vec2 } from './my-matrix';
import { TileInfo } from './tilesets';
var tween = require('tween-functions');

export { TileAnimation, tween };

tween.easeInQuad()

type TweenData = {
    pt0:vec2; 
    pt1:vec2; 
    duration:number 
    fn:(time:number, begin:number, end:number, duration:number)=>number;
}

class TileAnimation {
    offset: vec2;
    activeFrame: number;
    frameStep: number;
    time: number;
    tileInfo:Array<TileInfo>;
    activePt: number;
    tweenSeq: Array<TweenData>;
    constructor(tweenSeq: Array<TweenData>, tileInfo:Array<TileInfo>) {
        this.time = 0;
        this.offset = vec2.clone(tweenSeq[0].pt0);
        this.tileInfo = tileInfo;
        this.activeFrame = 0;
        this.frameStep = 1;
        this.activePt = 0;
        this.tweenSeq = tweenSeq;
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
        }
        return this.activePt === this.tweenSeq.length;
    }
    currentTile():TileInfo {
        return this.tileInfo[this.activeFrame];
    }
}
