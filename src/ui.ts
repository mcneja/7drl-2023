import { Renderer } from './render';
import { vec2, mat4 } from './my-matrix';
//import { TileInfo} from './tilesets';
import { Rect, TouchTargets, lastController, Controller, TouchController } from './controllers';
import {State, GameMode} from './types';
import * as colorPreset from './color-preset';
import * as game from './game';
import { RNG } from './random';
import { getFontTileSet } from './tilesets';

export { TextWindow, HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, BetweenMansionsScreen, HelpScreen, DailyHubScreen };

class TextWindow {
    pages: Array<string> = [];

    activePage: number = 0;
    activePageData: Array<string> = [];
    highlightedAction:number = -1;
    actionSequence: Array<string> = [];
    cachedPageText:string = '';

    touchTargetsDirty: boolean = false;
    touchTargets: TouchTargets;

    state: {[id:string]: any} = {};
    glyphs: [spriteNum:number, r:Rect][] = [];
    screenSize: vec2;
    mat: mat4;
    maxLineLength: number = 0;
    scaleLargestX: number = 0;
    scaleLargestY: number = 0;
    scaleFactor: number = 0;
    pixelsPerCharX: number = 0;
    pixelsPerCharY: number = 0;
    linesPixelSizeX: number = 0;
    linesPixelSizeY: number = 0;
    numCharsX: number = 0;
    numCharsY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    textW: number = 8; //width of character in pixels
    textH: number =16; //height of character in pixels

    constructor() {
        this.mat = mat4.create();
        this.screenSize = vec2.create();
        this.touchTargets = {};
    }
    initAction(action:string) {
        this.touchTargets[action] = {
            id: -1,
            active: true,
            game: new Rect(0, 0, 0, 0),
            view: new Rect(0, 0, 0, 0),
            trigger: 'release',
            tileInfo: {},
            show: 'always',
            touchXY: [-1, -1],        
        };
    }
    nextPage() {
        this.activePage = Math.min(this.pages.length - 1, this.activePage + 1);
        this.touchTargetsDirty = true;
        // this.parseUI(state);
    }
    prevPage() {
        this.activePage = Math.max(0, this.activePage - 1);
        this.touchTargetsDirty = true;
        // this.parseUI(state);
    }
    parseImage(line:string, base:number, row:number, rows:number): [string, number] {
        const end = line.slice(base+2).indexOf('#');
        if(end<0) return [line, base];
        const spriteNum = Number(line.slice(base+1, base+2+end));
        if(Number.isNaN(spriteNum)) return [line, base];
        this.glyphs.push([
            spriteNum,
            new Rect(base, rows-row-0.875, 2, 1)
        ]);
        line = line.slice(0,base)+'  '+line.slice(base+3+end); //trim out the sprite tag and replace with two spaces
        return [line, base+1];
    }
    parseButton(line:string, base:number, row:number, rows:number): [string, number] {
        const origin = base;
        let pipe, end;
        while(true) {
            pipe = line.slice(base).indexOf('|');
            if(pipe<0) return [line, base];
            pipe += base;
            end = line.slice(pipe+1).indexOf(']');
            if(end<0) return [line, base];
            end += pipe+1;
            if(base===pipe) break;
            if(line[base] === '#') { //Buttons may contain images
                [line, base] = this.parseImage(line, base, row, rows);
            }
            base+=1;
        }
        const action = line.slice(pipe+1, end);
        if(action!==undefined && action!=='') {
            if(!(action in this.touchTargets)) {
                this.initAction(action);
            }
            const posData = [origin, base+1, row];
            const [x0,y0] = [posData[0],posData[2]-1/8];
            const [x1,y1] = [posData[1],posData[2]+1];
            const tt = this.touchTargets[action];
            tt.game = new Rect(x0, rows-y1, x1-x0, y1-y0);
            this.actionSequence.push(action);
        }
        line = line.slice(0, pipe)+line.slice(end);
        base = pipe;
        return [line, base];
    }
    parseUI() {
        //TODO: Parse Glyphs and convert to double spaces
        let pageText = this.pages[this.activePage];
        const stateData = this.state;
        for(const t in stateData) {
            pageText = pageText.replace('$'+t+'$', String(stateData[t]))
        }
        if(pageText === this.cachedPageText) return;
        this.cachedPageText = pageText;
        this.activePageData = pageText.split('\n');
        const lines = this.activePageData;
        this.glyphs.length = 0;
        this.actionSequence = [];
        this.touchTargets = {};
        // if(this.touchTargetsDirty) {
        //     this.touchTargetsDirty = false;
        // }
        for (let row=0; row<lines.length; ++row) {
            let line = lines[row];
            let base = 0;
            while(base<line.length) {
                switch(line[base]) {
                    case '#':
                        [line, base] = this.parseImage(line, base, row, lines.length);
                        break;
                    case '[':
                        [line, base] = this.parseButton(line, base, row, lines.length);
                        break;
                }
                base += 1;
            }
            lines[row] = line;
        }
    }
    updateScreenSize(screenSize: vec2) {
        this.screenSize = screenSize;
        this.maxLineLength = 0;
        for (const line of this.activePageData) {
            this.maxLineLength = Math.max(this.maxLineLength, line.length);
        }    
        const minCharsX = 65;
        const minCharsY = 22;
        this.scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (this.textW * minCharsX)));
        this.scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (this.textH * minCharsY)));
        this.scaleFactor = Math.min(this.scaleLargestX, this.scaleLargestY);
        this.pixelsPerCharX = 8 * this.scaleFactor;
        this.pixelsPerCharY = 16 * this.scaleFactor;
        this.linesPixelSizeX = this.maxLineLength * this.pixelsPerCharX;
        this.linesPixelSizeY = this.activePageData.length * this.pixelsPerCharY;
        this.numCharsX = screenSize[0] / this.pixelsPerCharX;
        this.numCharsY = screenSize[1] / this.pixelsPerCharY;
        this.offsetX = Math.floor((screenSize[0] - this.linesPixelSizeX) / -2) / this.pixelsPerCharX;
        this.offsetY = Math.floor((screenSize[1] - this.linesPixelSizeY) / -2) / this.pixelsPerCharY;
    
        this.mat = mat4.create();
        mat4.ortho(
            this.mat,
            this.offsetX,
            this.offsetX + this.numCharsX,
            this.offsetY,
            this.offsetY + this.numCharsY,
            1,
            -1);    
    }
    pixelCoords(textCoords: [number, number]): [number, number] {
        return [
            (textCoords[0] - this.offsetX) * this.pixelsPerCharX,
            (textCoords[1] - this.offsetY) * this.pixelsPerCharY
        ];
    }
    textCoords(pixelCoords: [number, number]): [number, number] {
        return [
            pixelCoords[0] / this.pixelsPerCharX + this.offsetX,
            pixelCoords[1] / this.pixelsPerCharY + this.offsetY
        ];
        }
    getTouchData(): TouchTargets  {
        for(let a in this.touchTargets) {
            const tt = this.touchTargets[a];
            const r = tt.game;
            const [vx0,vy0] = this.pixelCoords([r[0], r[1]]);
            const [vx1,vy1] = this.pixelCoords([r[2]+r[0], r[3]+r[1]]);
            tt.view = new Rect(vx0, vy0, vx1-vx0, vy1-vy0);
        }
        return this.touchTargets;
    }
    render(renderer: Renderer) {
        const lines = this.activePageData;
        const matScreenFromTextArea = this.mat;
        const maxLineLength = this.maxLineLength;

        const colorText = 0xffeef0ff;
        const colorBackground = 0xf0101010;
        const buttonColor = 0xff802060;
        const uiSelectColor = 0xffd020b0;
        const buttonDisabled = 0xff707070;
    
        const bg = getFontTileSet().background;
        // Draw a stretched box to make a darkened background for the text.
        renderer.start(matScreenFromTextArea, 0);
        renderer.addGlyph(
            -2, -1, maxLineLength + 2, lines.length + 1,
            bg
        );
        renderer.flush();

        // Draw background areas for touchTargets
        renderer.start(matScreenFromTextArea, 0);
        for (let a in this.touchTargets) {
            const r = this.touchTargets[a].game;
            if(lastController?.controlStates[a]) this.highlightedAction = this.actionSequence.indexOf(a);
            if(this.touchTargets[a].active) {
                const color = this.actionSequence[this.highlightedAction]===a? uiSelectColor : buttonColor;
                renderer.addGlyph(
                    r[0], r[1], r[0]+r[2], r[1]+r[3],
                    {textureIndex: bg.textureIndex, color:color}
                );    
            } else {
                if(this.actionSequence[this.highlightedAction]===a) {
                        renderer.addGlyph(
                            r[0], r[1], r[0]+r[2], r[1]+r[3],
                            {textureIndex: bg.textureIndex, color:buttonDisabled}
                        );            
                }
            }
        }
        renderer.flush();

        // Draw glyphs
        renderer.start(matScreenFromTextArea, 1);
        for(const g of this.glyphs) {
            const r = g[1];
            renderer.addGlyph(r[0], r[1], r[2]+r[0], r[3]+r[1], {textureIndex: g[0], color: colorPreset.white});
        }
        renderer.flush();

        // Draw text
        renderer.start(matScreenFromTextArea, 0);
        for (let i = 0; i < lines.length; ++i) {
            const row = lines.length - (1 + i);
            for (let j = 0; j < lines[i].length; ++j) {
                const col = j;
                const ch = lines[i];
                if (ch === ' ') {
                    continue;
                }
                const glyphIndex = lines[i].charCodeAt(j);
                renderer.addGlyph(
                    col, row, col + 1, row + 1,
                    {textureIndex:glyphIndex, color:colorText}
                );
            }
        }
        renderer.flush();    
    }
    updateData(properties: object) {
    }
    update(state:State) {
    }
    navigateUI(activated:(action:string)=>boolean):string {
        let action = ''
        if(activated('up')) {
            this.highlightedAction--;
            if(this.highlightedAction<0) {
                this.highlightedAction = this.actionSequence.length-1;
            }
        } else if(activated('down')) {
            this.highlightedAction++;
            if(this.highlightedAction>=this.actionSequence.length) {
                this.highlightedAction = 0;
            }
        } else if(this.highlightedAction>=0 
                    && this.touchTargets[this.actionSequence[this.highlightedAction]]?.active 
                    && (activated('wait')) || (activated('jump'))) {
            action = this.actionSequence[this.highlightedAction];
        }
        return action;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
    }
}

class HomeScreen extends TextWindow {
    pages = [
`             Lurk Leap Loot
     James McNeill and Damien Moore       

            [P|homePlay]:        Play game
            [D|homeDaily]:  Daily challenge
            [S|homeStats]:       Statistics
            [O|homeOptions]:          Options`
    ]; 
    constructor() {
        super();
    }
    update(state: State) {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const actionSelected = this.navigateUI(activated);
        if (activated('homePlay') || actionSelected=='homePlay') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        }  if((activated('homeDaily') || actionSelected=='homeDaily')) {
            state.gameMode = GameMode.DailyHub;
        } else if(activated('homeStats') || actionSelected=='homeStats') {
            state.gameMode = GameMode.StatsScreen;
        } else if(activated('homeOptions') || actionSelected=='homeOptions') {
            state.gameMode = GameMode.OptionsScreen;
        }
    }
}


class InGameMenuScreen extends TextWindow {
    pages = [
`             Lurk Leap Loot
     James McNeill and Damien Moore

            [Esc|menu]: Close menu
            [?|help]:   Help
            [X|home]:   Exit to main menu`
    ];
    constructor() {
        super();
    }
    onControls(state:State, activated:(action:string)=>boolean) {
    }
}

class OptionsScreen extends TextWindow {
    pages = [
`                  Options

[T|gamepadStyleTouch]      Touch controls as $touchMode$
[Ctrl+R|forceRestart] Reset data

[Esc|menu]    Back to menu`,
    ];
    update(state: State): void {
        let touchMode = window.localStorage.getItem('touchMode');
        if(touchMode === null) {
            touchMode = state.touchAsGamepad? 'Gamepad': 'Mouse';
            window.localStorage.setItem(touchMode, touchMode);
        }
        this.state['touchMode'] = touchMode;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        } else if(activated('gamepadStyleTouch') || action=='gamepadStyleTouch') {
            let touchMode = window.localStorage.getItem('touchMode');
            if(touchMode=='Gamepad') {
                state.touchAsGamepad = false;
                state.touchController.setTouchConfig(false);
                window.localStorage.setItem('touchMode','Mouse');
            } else {
                state.touchAsGamepad = true;
                state.touchController.setTouchConfig(true);
                window.localStorage.setItem('touchMode','Gamepad');
            }
        } else if(activated('forceRestart') || action=='forceRestart') {
            //TODO: Prompt??
            window.localStorage.clear();
            state.stats = game.loadStats();
            state.gameMode = GameMode.HomeScreen;
        }
    }
};

class DailyHubScreen extends TextWindow {
    pages = [
//Daily runs
`                       Daily Challenge

            $dailyStatus$

            $dailyServerStatus$

            Last played:        $lastPlayed$
            Last score:         $lastScore$
            Best winning score: $bestScore$

            Total daily runs:   $dailyPlays$
            Total daily wins:   $dailyWins$
            Perfect runs:       $dailyPerfect$
            Win streak:         $dailyWinStreak$


1/2    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Back to menu`,
//Daily rankings
`                  Daily Challenge Results

    Challenge ending $tableHeading$
    Your rank: $dayRanking$
    $playMode$

$scoreTable$

    [PgUp|scrollUp] Scroll up  [PgDn|scrollDown] Scroll down
    [-|priorDay] Prior day     [+|nextDay] Next day   [0|today]  Current day

2/2 [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Back to menu`,
    ];
    scoreTablePos:number = 0;
    scoreTableCount: number = 8;
    scoreTableDate: Date|null = null;
    endTimeForDate(d:Date):Date {
        const dm = new Date(d);
        dm.setUTCHours(24,0,0,0);
        return dm //utc?dm.toUTCString():dm.toDateString();
    }
    prevDay(d:Date):Date {
        const pd = new Date(d);
        pd.setDate(pd.getDate()-1);
        return pd;
    }
    nextDay(d:Date):Date {
        const pd = new Date(d);
        pd.setDate(pd.getDate()+1);
        const dnow = new Date();
        dnow.setUTCHours(24,0,0,0);
        if(pd>dnow) return d;
        return pd;
    }
    timeToMidnightUTC():string {
        const d = new Date();
        const dm = new Date(d);
        dm.setUTCHours(24,0,0,0);
        const duration = dm.getTime() - d.getTime();
        var milliseconds = Math.floor((duration % 1000) / 100),
          seconds = Math.floor((duration / 1000) % 60),
          minutes = Math.floor((duration / (1000 * 60)) % 60),
          hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        
        return hours.toString().padStart(2,'0') + ":" 
            + minutes.toString().padStart(2,'0') + ":" 
            + seconds.toString().padStart(2,'0');
      }    
    update(state:State) {
        const store = window.localStorage;
        const lastDaily = store.getItem("lastDaily");
        if(lastDaily !== null && lastDaily === game.getCurrentDateFormatted()) {        
            this.state['dailyStatus'] = "Today's game completed\n            Time to next game: "+this.timeToMidnightUTC();
            this.state['playMode'] = state.scoreServer.user? '[P|homePlay] Replay this game seed in non-challenge mode':'';
        } else {
            this.state['dailyStatus'] = '[P|homePlay] Play daily game now\n            Time left to submit: '+this.timeToMidnightUTC();
            this.state['playMode'] ='[P|homePlay] Play daily game now';
        }


        if(this.activePage==0) {
            if(state.scoreServer.user!==null) {
                this.state['dailyServerStatus'] = `Signed in as ${state.scoreServer.user.displayName?.slice(0,20).replace(']',')').replace('[','(')}\n            [X|home] Signout [C|serverConfig] Configure`;
            } else {
                this.state['dailyServerStatus'] = `[R|restart] register or sign in\n            to track your scores online`;
            }
            this.state['lastPlayed'] = state.stats.lastDaily.date;
            this.state['lastScore'] = state.stats.lastDaily.score;
            this.state['bestScore'] = state.stats.bestDailyScore;
            this.state['dailyPlays'] = state.stats.dailyPlays;
            this.state['dailyWins'] = state.stats.dailyWins;
            this.state['dailyPerfect'] = state.stats.dailyPerfect;
            this.state['dailyWinStreak'] = state.stats.dailyWinStreak;
        }
        if(this.activePage==1) {
            if(state.scoreServer.user===null) {
                this.state['scoreTable'] = '    No score data available.';
                this.state['tableHeading'] = '';
                this.state['dayRanking'] = 'N/A';
            } else if(state.scoreServer.scoreData===null) {
                this.state['scoreTable'] = '    Loading...';
                this.state['tableHeading'] = '';
                this.state['dayRanking'] = 'Loading...';
            } else {
                const [table, date, start, count] = state.scoreServer.getFormattedScoreData(this.scoreTablePos,this.scoreTableCount,'');
                this.state['scoreTable'] = table;
                this.state['tableHeading'] = this.scoreTableDate?.toLocaleString();
                this.state['dayRanking'] = state.scoreServer.userScoreRanking +' of '+state.scoreServer.scoreData.length;
            }

        }


    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu' || activated('menuClose') || action=='menuClose') {
            state.gameMode = GameMode.HomeScreen;
        } else if ((activated('homePlay') || action=='homePlay')) {
            let date;
            if(this.activePage==0) {
                date = game.getCurrentDateFormatted();
            } else {
                if(state.scoreServer.scoreDate===null) {
                    return;
                }
                date = game.getCurrentDateFormatted(state.scoreServer.scoreDate, false);
            }
            state.rng = new RNG('Daily '+date);
            if(this.state['dailyStatus'][0]!=='T') { //This is a challenge run
                const store = window.localStorage;
                store.setItem("lastDaily", date);
                state.dailyRun = date;    
            } else {
                state.dailyRun = null;
            }
            game.restartGame(state);
        } else if (activated('left') || action=='left' || activated('menuPrev') || action=='menuPrev') {
            this.prevPage();
        } else if (activated('right') || action=='right' || activated('menuNext') || action=='menuNext') {
            const op = this.activePage;
            this.nextPage();
            if(this.activePage===1 && op===0) {
                this.scoreTableDate = this.endTimeForDate(new Date());
                state.scoreServer.getScoresForDate(this.scoreTableDate);
            }
        } else if(activated('today') || action=='today') {
            if(!this.scoreTableDate) return;
            this.scoreTablePos = 0;
            this.scoreTableDate = this.endTimeForDate(new Date());
            state.scoreServer.getScoresForDate(this.scoreTableDate);
        } else if(activated('nextDay') || action=='nextDay') {
            if(!this.scoreTableDate) return;
            this.scoreTablePos = 0;
            this.scoreTableDate = this.nextDay(this.scoreTableDate);
            state.scoreServer.getScoresForDate(this.scoreTableDate);
        } else if(activated('priorDay') || action=='priorDay') {
            if(!this.scoreTableDate) return;
            this.scoreTablePos = 0;
            this.scoreTableDate = this.prevDay(this.scoreTableDate);
            state.scoreServer.getScoresForDate(this.scoreTableDate);
        } else if(activated('scrollUp') || action=='scrollUp') {
            if(state.scoreServer.scoreData===null) return;
            this.scoreTablePos = Math.max(this.scoreTablePos-this.scoreTableCount,0)
        } else if(activated('scrollDown') || action=='scrollDown') {
            if(state.scoreServer.scoreData===null) return;
            this.scoreTablePos = Math.min(this.scoreTablePos+this.scoreTableCount,state.scoreServer.scoreData.length-this.scoreTableCount)
        } else if(activated('home') || action=='home') {
            state.scoreServer.signOut();
        } else if(activated('restart') || action=='restart') {
            state.keyboardController.preventDefault = false;
            state.touchController.preventDefault = false;
            state.gameMode = GameMode.ServerConfig;
            state.scoreServer.openSignInPopup(()=>{
                state.gameMode=GameMode.DailyHub;
                state.keyboardController.preventDefault = true;
                state.touchController.preventDefault = true;
            });
        } else if(activated('serverConfig') || action=='serverConfig') {
            console.log('Server config', action);
            state.keyboardController.preventDefault = false;
            state.touchController.preventDefault = false;
            state.gameMode = GameMode.ServerConfig;
            state.scoreServer.openConfigPopup(()=>{
                state.gameMode=GameMode.DailyHub;
                state.keyboardController.preventDefault = true;
                state.touchController.preventDefault = true;
            });
        }
    };        
}

class StatsScreen extends TextWindow {
    pages = [
//Play stats
`                   Play Statistics

            Total plays:             $totalPlays$
            Total wins:              $totalWins$
            Total loot:              $totalGold$
            Total mansions ghosted:  $totalGhosts$
            Total mansions looted:   $totalLootSweeps$
            Best winning score:      $bestScore$

1/2    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Back to menu`,
//Achievements
`                     Achievements

$achievements$

2/2    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Back to menu`,
    ];
    update(state:State) {
        if(this.activePage==0) {
            this.state['totalPlays'] = state.stats.totalPlays;
            this.state['totalWins'] = state.stats.totalWins;
            this.state['totalGold'] = state.stats.totalGold;
            this.state['totalGhosts'] = state.stats.totalGhosts;
            this.state['totalLootSweeps'] = state.stats.totalLootSweeps;
            this.state['bestScore'] = state.stats.bestScore;    
        }
        else if(this.activePage==1) {
            this.state['achievements'] = '';            
        }

    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu' || activated('menuClose') || action=='menuClose') {
            state.gameMode = GameMode.HomeScreen;
        } else if (activated('left') || action=='left' || activated('menuPrev') || action=='menuPrev') {
            this.prevPage();
        } else if (activated('right') || action=='right' || activated('menuNext') || action=='menuNext') {
            this.nextPage();
        };
    }
}

class BetweenMansionsScreen extends TextWindow {
    pages = [
`   Mansion $level$ Complete!

Mansion Statistics
Loot stolen:     $lootStolen$ / $lootAvailable$
Ghost bonus:     $ghostBonus$
Timely delivery: $timeBonus$
Mansion total:   $totalScore$

Current loot:    $loot$
[H|heal]: Heal one heart for $$healCost$
[N|startLevel]: Next mansion`
    ];
    update(state:State) {
        this.state['level'] = state.level+1;
        this.state['lootStolen'] = state.lootStolen;
        this.state['lootAvailable'] = state.lootAvailable;
        this.state['ghostBonus'] = state.ghostBonus;
        this.state['timeBonus'] = game.calculateTimeBonus(state);
        this.state['totalScore'] = this.state['lootStolen'] + this.state['timeBonus'] + this.state['ghostBonus'];
        this.state['loot'] = state.player.loot;
        this.state['healCost'] = state.healCost;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('zoomIn') || action=='zoomIn') {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut') || action=='zoomOut') {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('restart') || action=='restart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('heal') || action=='heal') {
            game.tryHealPlayer(state);
        } else if (activated('startLevel') || action=='startLevel') {
            game.advanceToNextLevel(state);
        } else if (activated('menu') || action == 'menu') {
            state.helpActive = true;
        }
    };
}

class DeadScreen extends TextWindow{
    pages = [
`         You are dead!

Statistics
Loot stolen:   $lootStolen$ / $maxLootStolen$
Ghost bonuses: $ghostBonuses$ / $maxGhostBonuses$
Time bonuses:  $timeBonuses$ / $maxTimeBonuses$
Loot spent:    $lootSpent$

Final loot:    $loot$

[R|restartGame]: Start new game
[Esc|menu]: Exit to home screen`
    ];
    update(state:State) {
        this.state['lootStolen'] = state.gameStats.lootStolen;
        this.state['maxLootStolen'] = state.gameStats.maxLootStolen;
        this.state['ghostBonuses'] = state.gameStats.ghostBonuses;
        this.state['maxGhostBonuses'] = state.gameStats.maxGhostBonuses;
        this.state['timeBonuses'] = state.gameStats.timeBonuses;
        this.state['maxTimeBonuses'] = state.gameStats.maxTimeBonuses;
        this.state['lootSpent'] = state.gameStats.lootSpent;
        this.state['loot'] = state.player.loot;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('zoomIn') || action=='zoomIn') {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut') || action=='zoomOut') {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('restart') || action=='restart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
            // state.helpActive = true;
        }
    }   
};

class WinScreen extends TextWindow {
    pages = [
`   Mission Complete!

Statistics
Loot stolen:   $lootStolen$ / $maxLootStolen$
Ghost bonuses: $ghostBonuses$ / $maxGhostBonuses$
Time bonuses:  $timeBonuses$ / $maxTimeBonuses$
Loot spent:    $lootSpent$

Score:         $loot$

[R|restartGame]: Start new game
[Esc|menu]: Exit to home screen`
    ];
    update(state:State) {
        this.state['lootStolen'] = state.gameStats.lootStolen;
        this.state['maxLootStolen'] = state.gameStats.maxLootStolen;
        this.state['ghostBonuses'] = state.gameStats.ghostBonuses;
        this.state['maxGhostBonuses'] = state.gameStats.maxGhostBonuses;
        this.state['timeBonuses'] = state.gameStats.timeBonuses;
        this.state['maxTimeBonuses'] = state.gameStats.maxTimeBonuses;
        this.state['lootSpent'] = state.gameStats.lootSpent;
        this.state['loot'] = state.player.loot;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('zoomIn') || action=='zoomIn') {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut') || action=='zoomOut') {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('restart') || action=='restart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
            // state.helpActive = true;
        }
    };
}

class HelpScreen extends TextWindow {
    pages = [
`Lurk Leap Loot

Your mission from the thieves\' guild is to
map $numGameMaps$ mansions. You can keep any loot you
find ($totalGameLoot$ total).

Mansion bonuses:
- Up to 5 gold for a timely map delivery.
- 5 gold if you avoid alerting guards.

[X|home] Exit to menu (abort game)

1/4    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Close`,
`Keyboard controls

  Move: Arrows / WASD / HJKL
  Wait: Space / Z / Period / Numpad5
  Leap: Shift + move
  Leap (Toggle): F / Numpad+
  Zoom View: [ / ]
  Volume: (Mute/Down/Up) 0 / - / =
  Guard Mute (Toggle): 9

Disable NumLock if using numpad
Mouse, touch and gamepad also supported

2/4    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Close`,

`Key 

#114# Thief: You!
#081# Guard: Avoid them!
#053# Loot: Collect for score, or spend to heal
#050# Tree: Hiding place
#052# Table: Hiding place
#051# Stool: Not a hiding place
#049# Torch: Guards want them lit
#160# Window: One-way escape route
#091# Creaky floorboard: Alerts guards if stepped on


3/4    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Close`,

`Made for 2023 Seven-Day Roguelike Challenge

by James McNeill and Damien Moore

Additional voices by Evan Moore
Additional assistance by Mike Gaffney
Testing by Tom Elmer
Special thanks to Mendi Carroll





4/4    [#04#|menuPrev] Prev     [#05#|menuNext] Next     [Esc|menuClose] Close`,
    ];
    update(state:State) {
        this.state['numGameMaps'] = game.gameConfig.numGameMaps;
        this.state['totalGameLoot'] = game.gameConfig.totalGameLoot;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('home') || action=='home') {
            this.activePage = 0;
            state.helpActive = false;
            state.gameMode = GameMode.HomeScreen;
        }
        if (activated('menu') || action=='menu' || activated('menuClose') || action=='menuClose') {
            this.activePage = 0;
            state.helpActive = false;
        } else if (activated('zoomIn') || action=='zoomIn') {
            state.zoomLevel = Math.max(1, state.zoomLevel - 1);
            state.camera.snapped = false;
        } else if (activated('zoomOut') || action=='zoomOut') {
            state.zoomLevel = Math.min(10, state.zoomLevel + 1);
            state.camera.snapped = false;
        } else if (activated('fullscreen') || action=='fullscreen') {
            if(document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        } else if (activated('forceRestart')|| action=='forceRestart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('gamepadStyleTouch') || action=='gamepadStyleTouch') {
            state.touchAsGamepad = !state.touchAsGamepad;
            state.touchController.setTouchConfig(state.touchAsGamepad);
            state.topStatusMessage = state.touchAsGamepad ? 'Touch gamepad enabled' : 'Touch gamepad disabled (touch map to move)';
        } else if (activated('left') || action=='left' || activated('menuPrev') || action=='menuPrev') {
            this.prevPage();
        } else if (activated('right') || action=='right' || activated('menuNext') || action=='menuNext') {
            this.nextPage();
        }
    }
};