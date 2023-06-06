import { vec2 } from './my-matrix';
import { TileInfo } from './tilesets';

export { TileAnimation };

class TileAnimation {
    offset: vec2;
    activeFrame: number;
    frameStep: number;
    elapsed: number;
    tileInfo:Array<TileInfo>;
    activeWaypoint: number;
    waypoints: Array<{pt:vec2, time:number}>;
    constructor(waypoints: Array<{pt:vec2, time:number}>, tileInfo:Array<TileInfo>) {
        this.elapsed = 0;
        this.offset = vec2.clone(waypoints[0].pt);
        this.tileInfo = tileInfo;
        this.activeFrame = 0;
        this.frameStep = 1;
        this.activeWaypoint = 0;
        this.waypoints = waypoints;
    }
    update(dt:number):boolean {
        const start = this.waypoints[this.activeWaypoint].pt;
        const ptime = this.waypoints[this.activeWaypoint].time;
        const end = this.waypoints[this.activeWaypoint+1].pt;
        const time = this.waypoints[this.activeWaypoint+1].time;
        if(start===undefined || end==undefined) {
            return true;
        }
        this.elapsed=Math.min(this.elapsed+dt, time);
        const wt = (this.elapsed-ptime)/(time-ptime);
        this.offset[0] = (1-wt)*start[0] + wt*end[0];
        this.offset[1] = (1-wt)*start[1] + wt*end[1];
        this.activeFrame = Math.floor(wt*this.tileInfo.length*this.frameStep)%this.frameStep;
        if(this.elapsed == time) this.activeWaypoint++;
        return this.activeWaypoint === this.waypoints.length-1;
    }
    currentTile():TileInfo {
        return this.tileInfo[this.activeFrame];
    }
}
