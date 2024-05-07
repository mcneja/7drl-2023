import { TileInfo } from "./tilesets";

export {lastController, Controller, TouchTargets, TouchController, GamepadManager, KeyboardController};

type ControlStates = { [id:string]: boolean};
type ControlTimes = { [id:string]: number};

//Global control states affected by all controllers
const controlStates:ControlStates = {
    'left': false,
    'right': false,
    'up':false,
    'down':false,
    'jumpLeft': false,
    'jumpRight': false,
    'jumpUp':false,
    'jumpDown':false,
    'los':false,
    'wait':false,
    'jump':false,
    'zoomIn':false,
    'zoomOut':false,
    'snapToPlayer':false,
    'menuAccept':false,
    'panUp':false,
    'panDown':false,
    'panLeft':false,
    'panRight':false,
    'menu':false,
    'menuNext':false,
    'menuPrev':false,
    'menuClose':false,
    'home':false,
    'homePlay':false,
    'homeDaily':false,
    'homeStats':false,
    'homeOptions':false,
    'jumpToggle': false,
    'restart': false,
    'startLevel': false,
    'exitLevel': false,
    'guardMute': false,
    'volumeMute': false,
    'volumeDown': false,
    'volumeUp': false,
    'forceRestart': false,
    'resetState': false,
    'seeAll': false,
    'collectLoot': false,
    'markSeen': false,
    'guardSight': false,
    'guardPatrols': false,
    'nextLevel': false,
    'prevLevel': false,
    'gamepadStyleTouch': false,
    'fullscreen': false,
    'serverConfig': false,
    'today':false,
    'priorDay':false,
    'nextDay':false,
    'scrollUp':false,
    'scrollDown':false,
};

const controlStates0:ControlStates = {... controlStates};

var lastController:Controller|null = null;

type KeyMap = {[id:string]: Array<string>}

const defaultKeyMap:KeyMap = {
    'BracketLeft': ['zoomOut'],
    'BracketRight': ['zoomIn'],
    'ArrowLeft': ['left','menuPrev'],
    'KeyA': ['left','menuPrev'],
    'Numpad4': ['left','menuPrev'],
    'ArrowRight': ['right','menuNext'],
    'KeyX': ['home'],
    'KeyP': ['homePlay'],
    'KeyO': ['homeOptions'],
    'KeyD': ['right','homeDaily','menuNext','keyRepeatDelay'],
    'Numpad6': ['right','menuNext'],
    'KeyL': ['right','menuNext'],
    'ArrowUp': ['up'],
    'KeyW': ['up'],
    'Numpad8': ['up'],
    'KeyK': ['up', 'keyRepeatRate'],
    'ArrowDown': ['down'],
    'KeyS': ['down','homeStats'],
    'Numpad2': ['down'],
    'KeyJ': ['down'],
    'Period': ['wait', 'menuAccept'],
    'Space': ['wait', 'menuAccept'],
    'KeyZ': ['wait', 'menuAccept'],
    'Enter': ['wait', 'menuAccept'],
    'NumpadEnter': ['menuAccept'],
    'Shift': ['jump'],
    'KeyF': ['jumpToggle', 'fullscreen'],
    'NumpadAdd': ['jumpToggle', 'nextDay'],
    'NumpadSubtract': ['priorDay'],
    'KeyT': ['gamepadStyleTouch'],
    'Escape' : ['menu', 'menuClose'],
    'Slash' : ['menu', 'menuClose'],
    'KeyR': ['restart'],
    'KeyC': ['copyScore'],
    'Control+KeyC': ['copyScore'],
    'KeyN': ['startLevel'],
    'Digit9' : ['guardMute'],
    'Digit0': ['volumeMute', 'today'],
    'Minus' : ['volumeDown', 'priorDay'],
    'Equal' : ['volumeUp', 'nextDay'],
    'PageUp': ['scrollUp'],
    'PageDown': ['scrollDown'],
    'Control+Space': ['snapToPlayer'],
    'Control+Period': ['snapToPlayer'],
    'Control+ArrowUp': ['panUp'],
    'Control+KeyW': ['panUp'],
    'Control+KeyJ': ['panUp'],
    'Control+Numpad8': ['panUp'],
    'Control+ArrowDown': ['panDown'],
    'Control+KeyS': ['panDown'],
    'Control+KeyK': ['panDown'],
    'Control+Numpad2': ['panDown'],
    'Control+ArrowLeft': ['panLeft'],
    'Control+KeyA': ['panLeft'],
    'Control+KeyH': ['panLeft'],
    'Control+Numpad4': ['panLeft'],
    'Control+ArrowRight': ['panRight'],
    'Control+KeyD': ['panRight'],
    'Control+KeyL': ['panRight'],
    'Control+Numpad6': ['panRight'],
    'Control+KeyR': ['forceRestart'],
    'Alt+KeyR': ['resetState'],
    'Alt+KeyA': ['seeAll'],
    'Alt+KeyC': ['collectLoot'],
    'Alt+KeyS': ['markSeen'],
    'Alt+KeyV': ['guardSight'],
    'Alt+KeyP': ['guardPatrols'],
    'Alt+Comma': ['prevLevel'],
    'Alt+Period': ['nextLevel'],
}

export class Rect extends Array<number> {
    constructor(x:number=0, y:number=0, w:number=0, h:number=0) {
        super(x,y,w,h);
    }
    collide(x:number, y:number, w:number=0, h:number=0) {
        if (x + w < this[0])
            return false;
        if (y + h < this[1])
            return false;
        if (x >= this[0] + this[2])
            return false;
        if (y >= this[1] + this[3])
            return false;
        return true;
    }
}

class Controller {
    controlStates: ControlStates;
    controlTimes: ControlTimes;
    currentFramePresses: Set<string> = new Set();
    currentFrameReleases: Set<string> = new Set();
    constructor() {
        this.controlStates = {... controlStates0};
        this.controlTimes = {};
        for(const c in this.controlStates) {
            this.controlTimes[c] = Date.now();
        }
    }
    set(action:string, state:boolean=true, updateFrame:boolean=true) {
        this.controlStates[action] = state;
        controlStates[action] = state;
        this.controlTimes[action] = Date.now();
        if(updateFrame) {
            if(state) {
                this.currentFramePresses.add(action);
            } else { 
                this.currentFrameReleases.add(action);
            }    
        }
        lastController = this; 
    }
    endFrame () {
        this.currentFramePresses.clear();
        this.currentFrameReleases.clear();
    }
}

class KeyboardController extends Controller {
    keyMap: KeyMap;
    constructor(keyMap:KeyMap|null=null) {
        super();
        if(keyMap==null)
            keyMap = defaultKeyMap;
        this.keyMap = keyMap;
        let that = this;
        const html = document.querySelector("html");
        if(html) {
            html.onkeydown = function(e) {that.keyDownHandler(e)};
            html.onkeyup = function(e) {that.keyUpHandler(e)};
        }
    }
    getCode(e:KeyboardEvent, modifyShift:boolean=false):string {
        let code = e.code;
        if(e.altKey) {
            if(e.code!=='AltLeft' && e.code!=='AltRight') {
                code = 'Alt+'+code;
            } 
        }
        if(e.shiftKey && modifyShift) {
            if(e.code!=='ShiftLeft' && e.code!=='ShiftRight') {
                code = 'Shift+'+code;
            }
        }
        if(e.ctrlKey) {
            if (e.code!=='ControlLeft' && e.code!=='ControlRight') {
                code = 'Control+'+code;
            }
        }
        if(e.code=='AltLeft' || e.code=='AltRight') {
            code = 'Alt';
        }
        if(e.code=='ShiftLeft' || e.code=='ShiftRight') {
            code = 'Shift';
        }
        if(e.code=='ControlLeft' || e.code=='ControlRight') {
            code = 'Control';
        }
        return code;
    }
    updateModifierDown(mod:string) {
        for(let key in this.keyMap) {
            const actions = this.keyMap[key]
            for(let a of actions) {
                // if(key.includes(mod) && !this.controlStates[a]) {
                //     this.controlStates[a] = true;
                // }
                if(!key.includes(mod) && this.controlStates[a]) {
                    this.controlStates[a] = false;
                }    
            }
        }
    }
    updateModifierUp(mod:string) {
        for(let key in this.keyMap) {
            const actions = this.keyMap[key]
            for(let a of actions) {
                if(key.includes(mod) && this.controlStates[a]) {
                    this.controlStates[a] = false;
                }
            }
        }
    }
    keyDownHandler(e:KeyboardEvent){
        lastController = this;
        const code = this.getCode(e);
        if(['Alt','Control'].includes(code)) {
            this.updateModifierDown(code);
        }
        if(code in this.keyMap) {
            e.preventDefault();
            const keys = this.keyMap[code];
            for (let key of keys) {
                if (!this.controlStates[key]) this.set(key, true);
            }
        }
    }
    keyUpHandler(e:KeyboardEvent){
        const code = this.getCode(e);
        if(['Alt','Control'].includes(code)) {
            this.updateModifierUp(code);
        }
        if(code in this.keyMap) {
            e.preventDefault();
            const keys = this.keyMap[code];
            for (let key of keys) {
                this.set(key, false);
            }
        }
    }
}

class GamepadController extends Controller {
    gamepad:Gamepad;
    thresh: number;
    internalStates: ControlStates;
    constructor(gamepad:Gamepad) {
        super();
        this.gamepad = gamepad;
        this.thresh = 0.4;
        this.internalStates = {... this.controlStates};
    }
    set(action:string, state:boolean=true) {
        if(this.internalStates[action]==state)
            return;
        this.internalStates[action] = state;
        super.set(action, state);
    }   
}

class GamepadManager {
    gamepads: {[id:number]:GamepadController};
    constructor() {
        let that = this;
        window.addEventListener("gamepadconnected", function(e){that.connected(e)});
        window.addEventListener("gamepaddisconnected", function(e){that.disconnected(e)});
        this.gamepads = {};
    }
    connected(e:GamepadEvent) {
        this.gamepads[e.gamepad.index] = new GamepadController(e.gamepad);
    }
    disconnected(e:GamepadEvent) {
        let g = this.gamepads[e.gamepad.index];
        delete this.gamepads[e.gamepad.index];
    }
    updateGamepadStates() {
        let gps = navigator.getGamepads(); 
        if(gps==null)
            return;
        for(let g of gps) {
            if(g==null)
                continue;
            let c = this.gamepads[g.index];
            c.gamepad = g; //put the latest state in the gamepad object
            c.set("jump", buttonPressed(g, 0));
            c.set("wait", buttonPressed(g, 2));
            c.set("menuAccept", buttonPressed(g, 2)||buttonPressed(g, 0));
//            c.set("startLevel", buttonPressed(g, 3));
            c.set("zoomIn", buttonPressed(g, 6));
            c.set("zoomOut", buttonPressed(g, 7));
//            c.set("fullscreen", buttonPressed(g, 8));
//            c.set("restart", buttonPressed(g, 5));
            c.set("menu", buttonPressed(g, 9));
            c.set("left", buttonPressed(g, 14) || g.axes[0]<-c.thresh && (g.axes[0]<-0.5*Math.abs(g.axes[1])));
            c.set("right", buttonPressed(g, 15) || g.axes[0]>c.thresh && (g.axes[0]>0.5*Math.abs(g.axes[1])));
            c.set("up", buttonPressed(g, 12) || g.axes[1]<-c.thresh && (g.axes[1]<-0.5*Math.abs(g.axes[0])));
            c.set("down", buttonPressed(g, 13) || g.axes[1]>c.thresh    && (g.axes[1]>-0.5*Math.abs(g.axes[0])));
            c.set("panLeft", g.axes[2]<-c.thresh && (g.axes[2]<-0.5*Math.abs(g.axes[3])));
            c.set("panRight", g.axes[2]>c.thresh && (g.axes[2]>0.5*Math.abs(g.axes[3])));
            c.set("panUp", g.axes[3]<-c.thresh && (g.axes[3]<-0.5*Math.abs(g.axes[2])));
            c.set("panDown", g.axes[3]>c.thresh    && (g.axes[3]>-0.5*Math.abs(g.axes[2])));
        }
    }
}

function buttonPressed(g: Gamepad, b: number): boolean {
    return b < g.buttons.length && g.buttons[b].pressed;
}

type TouchTargets = {
    [id:string]:
    {
        id:number,
        active:boolean,
        view:Rect,
        game:Rect,
        tileInfo:TileInfo|null,
        trigger:'press'|'release',
        show:'always'|'press',
        touchXY:[number, number]
    }
};

class TouchController extends Controller {
    canvas: HTMLCanvasElement;
    lastMotion: {id:number, active: boolean, x0:number, y0:number, x:number, y:number};
    coreTouchTargets: TouchTargets;
    touchTargets: TouchTargets;
    mouseActive: boolean = false;
    targetOnTouchDown: string|null = null;
    constructor(canvas: HTMLCanvasElement, asGamepad:boolean) {
        super();
        this.canvas = canvas;
        // Register touch event handlers
        let that = this;
        canvas.addEventListener('touchstart', function(ev){that.process_touchstart(ev);}, true);
        canvas.addEventListener('touchmove', function(ev){that.process_touchmove(ev);}, true);
        canvas.addEventListener('touchcancel', function(ev){that.process_touchend(ev);}, true);
        canvas.addEventListener('touchend', function(ev){that.process_touchend(ev);}, true);
        canvas.addEventListener('mousedown', function(ev){that.process_mousedown(ev);}, true);
        canvas.addEventListener('mouseup', function(ev){that.process_mouseup(ev);}, true);
        canvas.addEventListener('mousemove', function(ev){that.process_mousemove(ev);}, true);
        this.lastMotion = {id:-1,active:false,x0:0,y0:0,x:0,y:0};

        this.coreTouchTargets = {
            'up':           {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'down':         {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'left':         {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'right':        {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'jumpUp':       {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'jumpDown':     {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'jumpLeft':     {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'jumpRight':    {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'wait':         {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'exitLevel':    {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',  tileInfo:null},
            'jump':         {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',   tileInfo:null},
            'menuAccept':   {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',   tileInfo:null},
            'pan':          {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'press',   tileInfo:null},
            'zoomIn':       {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
            'zoomOut':      {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
            'restart':      {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
            'forceRestart': {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
            'menu':         {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
            'fullscreen':   {id:-1, active:true, view:new Rect(), game:new Rect(), touchXY:[0,0], trigger:'release', show:'always',   tileInfo:null},
        };
        this.touchTargets = this.coreTouchTargets;
        this.setTouchConfig(asGamepad);
    }
    setTouchConfig(asGamepad:boolean) {
        if(asGamepad) {
            for (let c of ['up','down','left','right','wait','jump','pan','menuAccept']) {
                this.coreTouchTargets[c].trigger = 'press';
                this.coreTouchTargets[c].show = 'always';
            }
            for(let c of ['jumpUp','jumpDown','jumpLeft','jumpRight']) {
                this.coreTouchTargets[c].trigger = 'press';
                this.coreTouchTargets[c].show = 'press';
            }
        } else {
            for (let c of ['exitLevel']) {
                this.coreTouchTargets[c].trigger = 'press';
                this.coreTouchTargets[c].show = 'always';
            }
            for (let c of ['up','down','left','right','pan','jumpUp','jumpDown',
                'jumpLeft','jumpRight','wait','jump','menuAccept']) {
                this.coreTouchTargets[c].trigger = 'release';
                this.coreTouchTargets[c].show = 'press';
            }
        }
    }
    clearMotion() {
        this.lastMotion.active = false;
        this.lastMotion.id = -1;
        this.lastMotion.x0 = 0;
        this.lastMotion.y0 = 0;
        this.lastMotion.x = 0;
        this.lastMotion.y = 0;
        this.targetOnTouchDown = null;
    }
    updateCoreTouchTarget(id:string, game:Rect, view:Rect, tileInfo:TileInfo) {
        const b0 = this.coreTouchTargets[id];
        b0.view = view;
        b0.game = game;
        b0.tileInfo = tileInfo;
        const x = b0.touchXY[0];
        const y = this.canvas.clientHeight - (b0.touchXY[1] + 1);
        if(!b0.view.collide(x, y)) {
            if(this.controlStates[id] && b0.id!=-1) {
                this.set(id, false, false);
                b0.id = -1;
            }
        }
    }
    activateTouchTargets(extraTouchTargets: TouchTargets|undefined) {
        if(extraTouchTargets === undefined) {
            this.touchTargets = this.coreTouchTargets;
        } else {
            this.touchTargets = {...this.coreTouchTargets, ...extraTouchTargets};        
        }
    }
    //touchstart handler
    process_mousedown(ev: MouseEvent) {
        lastController = this;
        const x = ev.clientX;
        const y = this.canvas.clientHeight - (ev.clientY + 1);
        this.mouseActive = true;
        this.lastMotion.id=-2;
        this.lastMotion.active = false;
        this.lastMotion.x0 = x;
        this.lastMotion.y0 = y;
        this.lastMotion.x = x;
        this.lastMotion.y = y;
        this.targetOnTouchDown = null;
        for(let bname in this.touchTargets) {
            let b = this.touchTargets[bname]
            const touching = b.view.collide(x, y);
            if(touching) {
                b.touchXY = [ev.clientX, ev.clientY];
                b.id = -2;
                this.set(bname, true);
                this.targetOnTouchDown = bname;
            }
        }
        ev.preventDefault();
    }
    // touchmove handler
    process_mousemove(ev:MouseEvent) {
        lastController = this;
        this.mouseActive = true;
        const x = ev.clientX;
        const y = this.canvas.clientHeight - (ev.clientY + 1);
        if(this.lastMotion.id == -2) {
            this.lastMotion.active = true;
            this.lastMotion.x = x;
            this.lastMotion.y = y;
        }        
        for(let bname in this.touchTargets) {
            let b = this.touchTargets[bname]
            if(b.id == -2) { //already pressing this button down
                const touching = b.view.collide(x, y);
                if(touching) {
                    b.touchXY = [ev.clientX, ev.clientY]; //update touch info but don't trigger another activation
                } else {
                    this.set(bname, false, false);
                    b.id = -1;
                }    
            } else if(b.trigger=='release' && (this.targetOnTouchDown==null||this.targetOnTouchDown==bname)) {
                const touching = b.view.collide(x, y);
                if(touching) {
                    b.touchXY = [ev.clientX, ev.clientY];
                    this.set(bname, true);
                    b.id = -2;
                }        
            }
        }   
        ev.preventDefault();
    }
    // mouseup handler
    process_mouseup(ev:MouseEvent) {
        for(const bname in this.touchTargets) {
            const b = this.touchTargets[bname];
            if(this.controlStates[bname]) {
                b.id = -1;
                this.set(bname, false, b.trigger==='press'||bname===this.targetOnTouchDown);
                this.controlTimes[bname] = 0;
            }
        }
        this.clearMotion();
        ev.preventDefault();
    }
    //touchstart handler
    process_touchstart(ev: TouchEvent) {
        lastController = this;
        this.mouseActive = false;
        this.targetOnTouchDown = null;
        for(let t of ev.changedTouches) {
            const x = t.clientX;
            const y = this.canvas.clientHeight - (t.clientY + 1);
            this.lastMotion.id = t.identifier;
            this.lastMotion.active = false;
            this.lastMotion.x0 = x; 
            this.lastMotion.y0 = y;
            this.lastMotion.x = x;
            this.lastMotion.y = y;
            for(let bname in this.touchTargets) {
                let b = this.touchTargets[bname]
                const touching = b.view.collide(x, y);
                if(touching) {
                    b.touchXY = [t.clientX, t.clientY];
                    b.id = t.identifier;
                    this.targetOnTouchDown = bname;
                    this.set(bname, true);
                }
            }
        }   
        ev.preventDefault();
    }
    // touchmove handler
    process_touchmove(ev:TouchEvent) {
        this.mouseActive = false;
        for(let t of ev.changedTouches) {
            const x = t.clientX;
            const y = this.canvas.clientHeight - (t.clientY + 1);
            if(this.lastMotion.id == t.identifier) {
                this.lastMotion.active = true;
                this.lastMotion.x = x;
                this.lastMotion.y = y;
            }
            for(let bname in this.touchTargets) {
                let b = this.touchTargets[bname]
                if(b.id == t.identifier) {
                    const touching = b.view.collide(x, y);
                    if(touching) {
                        b.touchXY = [t.clientX, t.clientY];
                    } else {
                        b.id = -1;
                        this.set(bname, false, false);
                    }
                }
                else if(b.id==-1 && b.trigger=='release'  && (this.targetOnTouchDown==null||this.targetOnTouchDown==bname)) {
                    const touching = b.view.collide(x, y);
                    if(touching) {
                        b.touchXY = [t.clientX, t.clientY];
                        b.id = t.identifier;
                        this.set(bname, true);
                    }
                }
            }
        }   
        ev.preventDefault();
    }
    // touchend handler
    process_touchend(ev:TouchEvent) {
        this.mouseActive = false;
        for(let t of ev.changedTouches) { 
            for(const bname in this.touchTargets) {
                const b = this.touchTargets[bname];
                if(b.id==t.identifier) {
                    b.id = -1;
                    this.set(bname, false, b.trigger==='press'||bname===this.targetOnTouchDown);
                    this.controlTimes[bname] = 0;
                }
            }
            if(this.lastMotion.id == t.identifier) {
                this.clearMotion();
            }
        }
        ev.preventDefault();
    }
}

