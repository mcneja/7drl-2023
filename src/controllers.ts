import { TileInfo } from "./tilesets";

export {lastController, Controller, TouchTargets, TouchController, GamepadManager, KeyboardController};

type ControlStates = { [id:string]: boolean};
type ControlTimes = { [id:string]: number};

const controlStates0: ControlStates = {
    'left': false,
    'right': false,
    'up': false,
    'down': false,
    'wait': false,
    'jump': false,
    'zoomIn': false,
    'zoomOut': false,
    'snapToPlayer': false,
    'menuAccept': false,
    'panUp': false,
    'panDown': false,
    'panLeft': false,
    'panRight': false,
    'menu': false,
    'homePlay': false,
    'homeDaily': false,
    'homeStats': false,
    'homeAchievements': false,
    'homeOptions': false,
    'jumpToggle': false,
    'startLevel': false,
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
    'fullscreen': false,
    'showSpeech': false,
    'idleCursorToggle': false,
    'showFPS':false,
    'devMenu':false,
};

var lastController:Controller|null = null;

type KeyMap = {[id:string]: Array<string>}

const defaultKeyMap:KeyMap = {
    'Alt+Comma': ['prevLevel'],
    'Alt+KeyA': ['seeAll'],
    'Alt+KeyC': ['collectLoot'],
    'Alt+KeyP': ['guardPatrols'],
    'Alt+KeyR': ['resetState'],
    'Alt+KeyS': ['markSeen'],
    'Alt+KeyV': ['guardSight'],
    'Alt+Period': ['nextLevel'],
    'Alt+KeyF': ['showFPS'],
    'ArrowDown': ['down'],
    'ArrowLeft': ['left'],
    'ArrowRight': ['right'],
    'ArrowUp': ['up'],
    'BracketLeft': ['zoomOut'],
    'BracketRight': ['zoomIn'],
    'Digit0': ['volumeMute'],
    'Digit9' : ['guardMute'],
    'Enter': ['wait', 'menuAccept'],
    'Equal': ['volumeUp'],
    'Escape' : ['menu'],
    'KeyA': ['left', 'homeAchievements'],
    'KeyC': ['copyScore', 'credits'],
    'KeyD': ['right','homeDaily','keyRepeatDelay'],
    'KeyF': ['jumpToggle', 'fullscreen'],
    'KeyG': ['guardMute'],
    'KeyI': ['idleCursorToggle'],
    'KeyJ': ['down', 'screenShakeEnabled'],
    'KeyK': ['up', 'keyRepeatRate'],
    'KeyH': ['left', 'helpControls'],
    'KeyL': ['right'],
    'KeyM': ['helpKey'],
    'KeyN': ['homeRestart', 'startLevel'],
    'KeyO': ['homeOptions'],
    'KeyP': ['homePlay'],
    'KeyR': ['homePlay'],
    'KeyS': ['down','homeStats'],
    'KeyW': ['up'],
    'KeyX': ['devMenu'],
    'KeyZ': ['wait', 'menuAccept'],
    'Period': ['wait', 'menuAccept'],
    'Shift': ['jump'],
    'Slash' : ['menu'],
    'Space': ['wait', 'menuAccept'],
    'Minus' : ['volumeDown'],
    'Numpad2': ['down'],
    'Numpad4': ['left','menu'],
    'Numpad6': ['right','menuAccept'],
    'Numpad8': ['up'],
    'Numpad5': ['wait'],
    'NumpadAdd': ['jumpToggle'],
    'NumpadEnter': ['menuAccept'],
    'Tab': ['showSpeech'],
    'Control+ArrowDown': ['panDown'],
    'Control+ArrowLeft': ['panLeft'],
    'Control+ArrowRight': ['panRight'],
    'Control+ArrowUp': ['panUp'],
    'Control+KeyA': ['panLeft'],
    'Control+KeyC': ['copyScore'],
    'Control+KeyD': ['panRight'],
    'Control+KeyH': ['panLeft'],
    'Control+KeyJ': ['panUp'],
    'Control+KeyK': ['panDown'],
    'Control+KeyL': ['panRight'],
    'Control+KeyR': ['forceRestart'],
    'Control+KeyS': ['panDown'],
    'Control+KeyW': ['panUp'],
    'Control+Numpad2': ['panDown'],
    'Control+Numpad4': ['panLeft'],
    'Control+Numpad6': ['panRight'],
    'Control+Numpad8': ['panUp'],
    'Control+Z': ['snapToPlayer'],
    'Control+Numpad5': ['snapToPlayer'],
    'Control+Period': ['snapToPlayer'],
    'Control+Space': ['snapToPlayer'],
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
    constructor() {
        this.controlStates = {... controlStates0};
        this.controlTimes = {};
        for(const c in this.controlStates) {
            this.controlTimes[c] = Date.now();
        }
    }
    setPressed(action:string, state:boolean, updateFrame:boolean=true) {
        this.controlStates[action] = state;
        this.controlTimes[action] = Date.now();
        if(updateFrame) {
            if(state) {
                this.currentFramePresses.add(action);
            }    
        }
        lastController = this; 
    }
    endFrame () {
        this.currentFramePresses.clear();
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
                if (!this.controlStates[key]) this.setPressed(key, true);
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
                this.setPressed(key, false);
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
    setPressed(action:string, state:boolean) {
        if(this.internalStates[action]==state)
            return;
        this.internalStates[action] = state;
        super.setPressed(action, state);
    }   
}

class GamepadManager {
    gamepads: {[id:number]:GamepadController};
    constructor() {
        window.addEventListener("gamepadconnected", e=>this.connected(e));
        window.addEventListener("gamepaddisconnected", e=>this.disconnected(e));
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
        for(const g of gps) {
            if(g==null)
                continue;
            let c = this.gamepads[g.index];
            c.gamepad = g; //put the latest state in the gamepad object
            c.setPressed("jump", buttonPressed(g, 0));
            c.setPressed("wait", buttonPressed(g, 2));
            c.setPressed("menuAccept", buttonPressed(g, 0)||buttonPressed(g, 2));
//            c.setPressed("startLevel", buttonPressed(g, 3));
            c.setPressed("zoomOut", buttonPressed(g, 6) && !buttonPressed(g, 7));
            c.setPressed("zoomIn", buttonPressed(g, 7) && !buttonPressed(g, 6));
//            c.setPressed("fullscreen", buttonPressed(g, 8));
            c.setPressed("menu", buttonPressed(g, 9));
            c.setPressed("left",
                (buttonPressed(g, 14) && !buttonPressed(g, 12) && !buttonPressed(g, 13)) ||
                (g.axes[0]<-c.thresh && Math.abs(g.axes[1]) < 0.5 * Math.abs(g.axes[0])));
            c.setPressed("right",
                (buttonPressed(g, 15) && !buttonPressed(g, 12) && !buttonPressed(g, 13)) ||
                (g.axes[0]>c.thresh && Math.abs(g.axes[1]) < 0.5 * Math.abs(g.axes[0])));
            c.setPressed("up",
                (buttonPressed(g, 12) && !buttonPressed(g, 14) && !buttonPressed(g, 15)) ||
                (g.axes[1]<-c.thresh && Math.abs(g.axes[0]) < 0.5 * Math.abs(g.axes[1])));
            c.setPressed("down",
                (buttonPressed(g, 13) && !buttonPressed(g, 14) && !buttonPressed(g, 15)) ||
                (g.axes[1]>c.thresh && Math.abs(g.axes[0]) < 0.5 * Math.abs(g.axes[1])));
            c.setPressed("panLeft", g.axes[2]<-c.thresh);
            c.setPressed("panRight", g.axes[2]>c.thresh);
            c.setPressed("panUp", g.axes[3]<-c.thresh);
            c.setPressed("panDown", g.axes[3]>c.thresh);
            c.setPressed("snapToPlayer", buttonPressed(g,5));
            c.setPressed("showSpeech", buttonPressed(g,4));
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
        rect:Rect,
        tileInfo:TileInfo|null,
        touchXY:[number, number],
    }
};

class TouchController extends Controller {
    canvas: HTMLCanvasElement;
    lastMotion: {id:number, active: boolean, x0:number, y0:number, x:number, y:number};
    coreTouchTargets: TouchTargets;
    touchTargets: TouchTargets;
    mouseActive: boolean = false;
    targetOnTouchDown: string|null = null;
    constructor(canvas: HTMLCanvasElement) {
        super();
        this.canvas = canvas;
        // Register touch event handlers
        canvas.addEventListener('touchstart', ev=>this.process_touchstart(ev), true);
        canvas.addEventListener('touchmove', ev=>this.process_touchmove(ev), true);
        canvas.addEventListener('touchcancel', ev=>this.process_touchend(ev), true);
        canvas.addEventListener('touchend', ev=>this.process_touchend(ev), true);
        canvas.addEventListener('mousedown', ev=>this.process_mousedown(ev), true);
        canvas.addEventListener('mouseup', ev=>this.process_mouseup(ev), true);
        canvas.addEventListener('mousemove', ev=>this.process_mousemove(ev), true);
        this.lastMotion = {id:-1,active:false,x0:0,y0:0,x:0,y:0};

        this.coreTouchTargets = {
            'up':           {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'down':         {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'left':         {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'right':        {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'wait':         {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'jump':         {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'menuAccept':   {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'pan':          {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'zoomIn':       {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'zoomOut':      {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'forceRestart': {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'menu':         {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
            'fullscreen':   {id:-1, rect:new Rect(), touchXY:[0,0], tileInfo:null},
        };
        this.touchTargets = this.coreTouchTargets;
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
    updateCoreTouchTarget(id:string, rect:Rect, tileInfo:TileInfo) {
        const b0 = this.coreTouchTargets[id];
        b0.rect = rect;
        b0.tileInfo = tileInfo;
        const x = b0.touchXY[0];
        const y = this.canvas.clientHeight - (b0.touchXY[1] + 1);
        if (!b0.rect.collide(x, y)) {
            if(this.controlStates[id] && b0.id!=-1) {
                this.setPressed(id, false, false);
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
        for (const [bname, b] of Object.entries(this.touchTargets)) {
            const touching = b.rect.collide(x, y);
            if(touching) {
                b.touchXY = [ev.clientX, ev.clientY];
                b.id = -2;
                this.setPressed(bname, true);
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
        for (const [bname, b] of Object.entries(this.touchTargets)) {
            if(b.id === -2) { //already pressing this button down
                const touching = b.rect.collide(x, y);
                if(touching) {
                    b.touchXY = [ev.clientX, ev.clientY]; //update touch info but don't trigger another activation
                } else {
                    this.setPressed(bname, false, false);
                    b.id = -1;
                }    
            }
        }   
        ev.preventDefault();
    }
    // mouseup handler
    process_mouseup(ev:MouseEvent) {
        for (const [bname, b] of Object.entries(this.touchTargets)) {
            if(this.controlStates[bname]) {
                b.id = -1;
                this.setPressed(bname, false, true);
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
            for (const [bname, b] of Object.entries(this.touchTargets)) {
                const touching = b.rect.collide(x, y);
                if(touching) {
                    b.touchXY = [t.clientX, t.clientY];
                    b.id = t.identifier;
                    this.targetOnTouchDown = bname;
                    this.setPressed(bname, true);
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
            for (const [bname, b] of Object.entries(this.touchTargets)) {
                if(b.id == t.identifier) {
                    const touching = b.rect.collide(x, y);
                    if(touching) {
                        b.touchXY = [t.clientX, t.clientY];
                    } else {
                        b.id = -1;
                        this.setPressed(bname, false, false);
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
            for (const [bname, b] of Object.entries(this.touchTargets)) {
                if(b.id==t.identifier) {
                    b.id = -1;
                    this.setPressed(bname, false, true);
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

