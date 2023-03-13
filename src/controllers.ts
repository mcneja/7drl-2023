import * as internal from "stream";

export {controlStates, ControlStates, lastController, TouchController, GamepadManager, KeyboardController};

type ControlStates = { [id:string]: boolean};
type ControlTimes = { [id:string]: number};

//Global control states affected by all controllers
const controlStates:ControlStates = {
    'left': false,
    'right': false,
    'up':false,
    'down':false,
    'los':false,
    'wait':false,
    'jump':false,
    'zoomIn':false,
    'zoomOut':false,
    'menu':false,
    'jumpToggle': false,
    'restart': false,
    'heal': false,
    'nextLevel': false,
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
    'prevLevel': false,
};

const controlStates0:ControlStates = {... controlStates};

var lastController:Controller|null = null;

type KeyMap = {[id:string]: string}

const defaultKeyMap:KeyMap = {
    'BracketLeft': 'zoomOut',
    'BracketRight': 'zoomIn',

    'ArrowLeft': 'left',
    'KeyA': 'left',
    'Numpad4': 'left',
//    'KeyH': 'left',

    'ArrowRight': 'right',
    'KeyD': 'right',
    'Numpad6': 'right',
    'KeyL': 'right',

    'ArrowUp': 'up',
    'KeyW': 'up',
    'Numpad8': 'up',
    'KeyK': 'up',

    'ArrowDown': 'down',
    'KeyS': 'down',
    'Numpad2': 'down',
    'KeyJ': 'down',

    'Period': 'wait',
    'Space': 'wait',

    'Shift': 'jump',
    'KeyF': 'jumpToggle',
    'NumpadAdd': 'jumpToggle',

    'Escape' : 'menu',
    'Slash' : 'menu',

    'KeyR': 'restart',
    'KeyH': 'heal',
    'KeyN': 'nextLevel',

    'Digit9' : 'guardMute',
    'Digit0:': 'volumeMute',
    'Minus' : 'volumeDown',
    'Equal' : 'volumeUp',

    'Control+KeyR': 'forceRestart',
    'Control+KeyG': 'resetState',
    'Control+KeyA': 'seeAll',
    'Control+KevC': 'collectLoot',
    'Control+KeyS': 'markSeen',
    'Control+KeyV': 'guardSight',
    'Control+KeyP': 'guardPatrols',
    'Control+Comma': 'prevLevel',
    'Control+Period': 'nextLevel',
}

export class Rect extends Array<number> {
    constructor(x:number=0, y:number=0, w:number=0, h:number=0) {
        super(x,y,w,h);
    }
    collide(x:number, y:number, w:number=0, h:number=0) {
        if(this[0] < x + w &&
            this[0] + this[2] > x &&
            this[1] < y + h &&
            this[1] + this[3] > y)
            return true;
        return false;
    }
}

class Controller {
    controlStates: ControlStates;
    controlTimes : ControlTimes;
    constructor() {
        this.controlStates = {... controlStates0};
        this.controlTimes = {};
        for(const c in this.controlStates) {
            this.controlTimes[c] = Date.now();
        }
    }
    set(action:string, state:boolean=true) {
        this.controlStates[action] = state;        
        controlStates[action] = state;        
        this.controlTimes[action] = Date.now();
        lastController = this; 
    }
    vibrate(intensity1:number, intensity2:number, duration:number) {

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
    keyDownHandler(e:KeyboardEvent){
        const code = this.getCode(e);
        if(code in this.keyMap) {
            e.preventDefault();
            if (!this.controlStates[this.keyMap[code]]) this.set(this.keyMap[code], true);
        }
    }
    keyUpHandler(e:KeyboardEvent){
        const code = this.getCode(e);
        if(code in this.keyMap) {
            e.preventDefault();
            this.set(this.keyMap[code], false);
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
        this.thresh = 0.2;
        this.internalStates = {... this.controlStates};
    }
    set(action:string, state:boolean=true) {
        if(this.internalStates[action]==state)
            return;
        this.internalStates[action] = state;
        super.set(action, state);
    }   
    vibrate(intensity1:number, intensity2:number, duration:number) {
        // if(this.gamepad.hapticActuators.length>0) {
        //     for(let h of this.gamepad.hapticActuators) {
        //         h.pulse(intensity1, duration);
        //     }
        //     this.gamepad.hapticActuators.playEffect('dual-rumble', 
        //         {
        //             startDelay: 0,
        //             duration: duration,
        //             weakMagnitude: intensity1,
        //             strongMagnitude: intensity2 });
        // }
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
            c.set("jump", this.buttonPressed(g.buttons[0]));
            c.set("heal", this.buttonPressed(g.buttons[1]));
            c.set("wait", this.buttonPressed(g.buttons[2]));
            c.set("nextLevel", this.buttonPressed(g.buttons[3]));
            c.set("zoomIn", this.buttonPressed(g.buttons[6]));
            c.set("zoomOut", this.buttonPressed(g.buttons[7]));
            c.set("menu", this.buttonPressed(g.buttons[9]));
            c.set("left", this.buttonPressed(g.buttons[14]) || g.axes[0]<-c.thresh && (g.axes[0]<-0.5*Math.abs(g.axes[1])));
            c.set("right", this.buttonPressed(g.buttons[15]) || g.axes[0]>c.thresh && (g.axes[0]>0.5*Math.abs(g.axes[1])));
            c.set("up", this.buttonPressed(g.buttons[12]) || g.axes[1]<-c.thresh && (g.axes[1]<-0.5*Math.abs(g.axes[0])));
            c.set("down", this.buttonPressed(g.buttons[13]) || g.axes[1]>c.thresh    && (g.axes[1]>-0.5*Math.abs(g.axes[0])));
        }
    }
    buttonPressed(b:GamepadButton) {
        return b.pressed;
    }
}

class TouchController extends Controller {
    canvas: HTMLCanvasElement;
    screenDimensions: [number, number];
    buttonMap: {[id:string]: {id:number, view:Rect, game:Rect, textureIndex:number, touchXY:[number, number]}};
    constructor(canvas: HTMLCanvasElement) {
        super();
        this.canvas = canvas;
        // Register touch event handlers
        let that = this;
        canvas.addEventListener('touchstart', function(ev){that.process_touchstart(ev);}, true);
        canvas.addEventListener('touchmove', function(ev){that.process_touchmove(ev);}, true);
        canvas.addEventListener('touchcancel', function(ev){that.process_touchend(ev);}, true);
        canvas.addEventListener('touchend', function(ev){that.process_touchend(ev);}, true);
        // canvas.addEventListener('touchstart', function(ev){that.process_touchstart(ev);}, false);
        // canvas.addEventListener('touchmove', function(ev){that.process_touchmove(ev);}, false);
        // canvas.addEventListener('touchcancel', function(ev){that.process_touchend(ev);}, false);
        // canvas.addEventListener('touchend', function(ev){that.process_touchend(ev);}, false);
        // document.addEventListener('backbutton', function(ev){that.process_back(ev);}, true);
        const nullRect:[number,number,number,number] = [0,0,0,0];
        this.buttonMap = {
            'up': {id:-1,   view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'down': {id:-1, view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'left': {id:-1, view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'right': {id:-1,view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'wait': {id:-1, view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'jump': {id:-1, view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'zoomIn': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'zoomOut': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'heal': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'nextLevel': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'forceRestart': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
            'menu': {id:-1,  view:new Rect(), game:new Rect(), touchXY:[0,0], textureIndex:0},
        };
        this.screenDimensions = [0,0];
    }
    updateButtonLocations(buttonPositions: {[id:string]:{view:Rect, game:Rect, textureIndex:number}}) {
        for(const bname in buttonPositions) {
            const b = buttonPositions[bname];
            if (bname in this.buttonMap) {
                const b0 = this.buttonMap[bname];
                b0.view = b.view;
                b0.game = b.game;
                b0.textureIndex = b.textureIndex;
            }
        }
    }
    process_touchstart(ev: TouchEvent) {
        // Use the event's data to call out to the appropriate gesture handlers
        lastController = this;
        for(let t of ev.changedTouches) { 
            for(let bname in this.buttonMap) {
                let b = this.buttonMap[bname]
                const touching = b.view.collide(t.clientX, this.canvas.height-t.clientY);
                if(touching) {
                    b.touchXY = [t.clientX, t.clientY];
                    b.id = t.identifier;
                    this.set(bname);    
                }
            }
        }   
        ev.preventDefault();
    }
    // touchmove handler
    process_touchmove(ev:TouchEvent) {
        let state:{[id:string]:boolean} = {};
        for(let t of ev.changedTouches) { 
            for(let bname in this.buttonMap) {
                let b = this.buttonMap[bname]
                if(b.id == t.identifier) {
                    const touching = b.view.collide(t.clientX, this.canvas.height-t.clientY);
                    if(touching) {
                        b.touchXY = [t.clientX, t.clientY];
                    } else {
                        b.id = -1;
                        this.set(bname, false);
                    }
                }
                else if(b.id==-1) {
                    const touching = b.view.collide(t.clientX, this.canvas.height-t.clientY);
                    if(touching) {
                        b.touchXY = [t.clientX, t.clientY];
                        b.id = t.identifier;
                        this.set(bname);
                    }
                }
            }
        }   
        ev.preventDefault();
    }
    // touchend handler
    process_touchend(ev:TouchEvent) {
        for(let t of ev.changedTouches) { 
            for(let bname in this.buttonMap) {
                let b = this.buttonMap[bname]
                if(b.id==t.identifier) {
                    b.id = -1;
                    this.set(bname, false);
                }
            }
        }
        ev.preventDefault();
    }
    vibrate(intensity1:number, intensity2:number, duration:number) {
        window.navigator.vibrate(duration); //default vibration does not support intensity -- could simulate by staggering pulses over the duration
    }
}