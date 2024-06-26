import { Renderer } from './render';
import { vec2, mat4 } from './my-matrix';
import { Rect, TouchTargets, lastController } from './controllers';
import { GameMode, GameStats, State } from './types';
import * as colorPreset from './color-preset';
import * as game from './game';
import { RNG } from './random';
import { getFontTileSet, getTileSet } from './tilesets';
import { ItemType, TerrainType } from './game-map';

export { TextWindow, HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, MansionCompleteScreen, HelpControls, HelpKey, DailyHubScreen, CreditsScreen };

const menuCharSizeX: number = 43;

function scoreToClipboard(stats:GameStats) {
    const numGhostedLevels = stats.numGhostedLevels;
    const totalScore = stats.totalScore;
    const loot = stats.loot;
    const turns = stats.turns;
    const numCompletedLevels = stats.numCompletedLevels;
    const numLevels = stats.numLevels;
    const win = stats.win;
    const daily = stats.daily;

    const runText = daily!==null? '\uD83D\uDCC5 Daily run for '+daily:
        '\uD83C\uDFB2 Random game';
    const endText = win? 'Completed mission in '+turns+' turns.':
        '\uD83D\uDC80 Died in mansion '+ (numCompletedLevels + 1) +' after '+turns+' turns.';
    const scoreText = win?  `Walked away with ${loot} \uD83E\uDE99.`:
        `Guards recovered ${loot} \uD83E\uDE99 that you stole.`

    navigator.clipboard.writeText(
        `\uD83C\uDFDB\uFE0F Lurk, Leap, Loot \uD83C\uDFDB\uFE0F\n${runText}\n${endText}\n`+
        `Completed:   ${numCompletedLevels} of ${numLevels}\n` +
        `Ghosted:     ${numGhostedLevels}\n`+
        `Total score: ${totalScore}\n`+
        scoreText
    )
}


class TextWindow {
    pages: Array<string> = [];

    activePage: number = 0;
    activePageData: Array<string> = [];
    highlightedAction:number = 0;
    actionSequence: Array<string> = [];
    cachedPageText:string = '';
    screenSize: vec2 = vec2.create();

    touchTargets: TouchTargets;

    state: Map<string, string> = new Map();
    glyphs: [spriteNum:number, r:Rect][] = [];
    mat: mat4;
    maxLineLength: number = 0;
    pixelsPerCharX: number = 0;
    pixelsPerCharY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    textW: number = 8; //width of character in pixels
    textH: number =16; //height of character in pixels

    constructor() {
        this.mat = mat4.create();
        this.touchTargets = {};
    }
    initAction(action:string) {
        this.touchTargets[action] = {
            id: -1,
            rect: new Rect(0, 0, 0, 0),
            tileInfo: {},
            touchXY: [-1, -1],        
        };
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
            tt.rect = new Rect(x0, rows-y1, x1-x0, y1-y0);
            this.actionSequence.push(action);
        }
        line = line.slice(0, pipe)+line.slice(end);
        base = pipe;
        return [line, base];
    }
    parseUI(screenSize: vec2) {
        //TODO: Parse Glyphs and convert to double spaces
        let pageText = this.pages[this.activePage];
        for (const [key, value] of this.state) {
            pageText = pageText.replace('$'+key+'$', value);
        }
        if (pageText === this.cachedPageText && this.screenSize.equals(screenSize))
            return;

        this.cachedPageText = pageText;
        vec2.copy(this.screenSize, screenSize);
        this.activePageData = pageText.split('\n');
        const lines = this.activePageData;
        this.glyphs.length = 0;
        this.actionSequence = [];
        this.touchTargets = {};

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
        this.highlightedAction = Math.max(0, Math.min(this.actionSequence.length - 1, this.highlightedAction));

        this.maxLineLength = 0;
        for (const line of this.activePageData) {
            this.maxLineLength = Math.max(this.maxLineLength, line.length);
        }

        this.updateScreenSize(screenSize);

        // Now that screen size has been determined, compute touch targets' screen extents

        for(let a in this.touchTargets) {
            const tt = this.touchTargets[a];
            tt.rect[0] -= this.offsetX;
            tt.rect[1] -= this.offsetY;

            tt.rect[0] *= this.pixelsPerCharX;
            tt.rect[1] *= this.pixelsPerCharY;
            tt.rect[2] *= this.pixelsPerCharX;
            tt.rect[3] *= this.pixelsPerCharY;
        }
    }
    updateScreenSize(screenSize: vec2) {
        const minCharsX = menuCharSizeX + 2;
        const minCharsY = 22;
        const scaleLargestX = Math.max(1, Math.floor(screenSize[0] / (this.textW * minCharsX)));
        const scaleLargestY = Math.max(1, Math.floor(screenSize[1] / (this.textH * minCharsY)));
        const scaleFactor = Math.min(scaleLargestX, scaleLargestY);
        this.pixelsPerCharX = this.textW * scaleFactor;
        this.pixelsPerCharY = this.textH * scaleFactor;
        const linesPixelSizeX = this.maxLineLength * this.pixelsPerCharX;
        const linesPixelSizeY = this.activePageData.length * this.pixelsPerCharY;
        const numCharsX = screenSize[0] / this.pixelsPerCharX;
        const numCharsY = screenSize[1] / this.pixelsPerCharY;
        this.offsetX = Math.floor((screenSize[0] - linesPixelSizeX) / -2) / this.pixelsPerCharX;
        this.offsetY = Math.floor((screenSize[1] - linesPixelSizeY) / -2) / this.pixelsPerCharY;

        mat4.ortho(
            this.mat,
            this.offsetX,
            this.offsetX + numCharsX,
            this.offsetY,
            this.offsetY + numCharsY,
            1,
            -1);
    }
    render(renderer: Renderer) {
        const lines = this.activePageData;
        const matScreenFromTextArea = this.mat;
        const maxLineLength = this.maxLineLength;

        const colorBorder = 0xffd020b0;
        const colorBackground = 0xff1a0416;
        const colorText = 0xffeef0ff;
        const buttonColor = 0xff802060;
        const uiSelectColor = 0xffd020b0;
    
        // Draw a stretched box to make a darkened background for the text.
        const solidChar = getFontTileSet().background.textureIndex;
        renderer.start(matScreenFromTextArea, 0);
        renderer.addGlyph(-1.5, -0.75, maxLineLength + 1.5, lines.length + 0.75, {textureIndex: solidChar, color: colorBorder});
        renderer.addGlyph(-1,   -0.5,  maxLineLength + 1,   lines.length + 0.5,  {textureIndex: solidChar, color: colorBackground});
        renderer.flush();

        // Draw background areas for touchTargets

        const matScreenFromPixel = mat4.create();
        mat4.ortho(
            matScreenFromPixel,
            0, this.screenSize[0],
            0, this.screenSize[1],
            1, -1);
        renderer.start(matScreenFromPixel, 0);
        for (let a in this.touchTargets) {
            if(lastController?.controlStates[a]) {
                this.highlightedAction = this.actionSequence.indexOf(a);
            }
            const r = this.touchTargets[a].rect;
            const isHighlightedAction =
                this.highlightedAction < this.actionSequence.length &&
                this.actionSequence[this.highlightedAction]===a;
            const color = isHighlightedAction? uiSelectColor : buttonColor;
            renderer.addGlyph(
                r[0], r[1], r[0]+r[2], r[1]+r[3],
                {textureIndex: solidChar, color:color}
            );    
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
        if (activated('up')) {
            this.highlightedAction--;
            if (this.highlightedAction<0) {
                this.highlightedAction = this.actionSequence.length-1;
            }
        } else if (activated('down')) {
            this.highlightedAction++;
            if (this.highlightedAction>=this.actionSequence.length) {
                this.highlightedAction = 0;
            }
        } else if (this.highlightedAction < this.actionSequence.length && activated('menuAccept')) {
            action = this.actionSequence[this.highlightedAction];
        }
        return action;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
    }
}

class HomeScreen extends TextWindow {
    pages = [
`Lurk, Leap, Loot

$playRestartOrResume$
[D|homeDaily]: Daily challenge
[S|homeStats]: Statistics
[O|homeOptions]: Options
[H|helpControls]: Controls Help
[M|helpKey]: Map key
[C|credits]: Credits`
    ]; 
    constructor() {
        super();
    }
    update(state: State) {
        const commands =
            !state.hasStartedGame ? '[P|homePlay]: Play game\n' :
            (state.dailyRun !== null ? '[R|homePlay]: Resume daily game\n[N|homeRestart]: New game' :
                '[R|homePlay]: Resume game\n[N|homeRestart]: New game');
        this.state.set('playRestartOrResume', commands);
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const actionSelected = this.navigateUI(activated);
        if (activated('homePlay') || actionSelected=='homePlay' || activated('menu') || actionSelected=='menu') {
            state.gameMode = GameMode.Mansion;
            state.hasStartedGame = true;
        } else if (activated('homeRestart') || actionSelected=='homeRestart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if(activated('homeDaily') || actionSelected=='homeDaily') {
            state.gameMode = GameMode.DailyHub;
        } else if(activated('homeStats') || actionSelected=='homeStats') {
            state.gameMode = GameMode.StatsScreen;
        } else if(activated('homeOptions') || actionSelected=='homeOptions') {
            state.gameMode = GameMode.OptionsScreen;
        } else if (activated('helpControls') || actionSelected=='helpControls') {
            state.gameMode = GameMode.HelpControls;
        } else if (activated('helpKey') || actionSelected=='helpKey') {
            state.gameMode = GameMode.HelpKey;
        } else if (activated('credits') || actionSelected=='credits') {
            state.gameMode = GameMode.CreditsScreen;
        }
    }
}

class OptionsScreen extends TextWindow {
    pages = [
`Options

         Sound Volume: $volumeLevel$%
[L|volumeUp]      Volume Louder
[S|volumeDown]      Volume Softer
[M|volumeMute]      Volume Mute: $volumeMute$
[G|guardMute]      Guard Mute: $guardMute$
[K|keyRepeatRate]      Key repeat rate $keyRepeatRate$ms
[D|keyRepeatDelay]      Key repeat delay $keyRepeatDelay$ms
[Ctrl+R|forceRestart] Reset data

[Esc|menu]    Back to menu`,
    ];
    update(state: State): void {
        this.state.set('volumeLevel', (Howler.volume() * 100).toFixed(0));
        this.state.set('volumeMute', state.volumeMute ? 'ON' : 'OFF');
        this.state.set('guardMute', state.guardMute ? 'ON' : 'OFF');
        this.state.set('keyRepeatRate', state.keyRepeatRate.toString());
        this.state.set('keyRepeatDelay', state.keyRepeatDelay.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        } else if(activated('keyRepeatRate') || action=='keyRepeatRate') {
            state.keyRepeatRate -= 50;
            if(state.keyRepeatRate<100) state.keyRepeatRate = 400;
            window.localStorage.setItem('LLL/keyRepeatRate', ''+state.keyRepeatRate);
        } else if(activated('keyRepeatDelay') || action=='keyRepeatDelay') {
            state.keyRepeatDelay -= 50;
            if(state.keyRepeatDelay<100) state.keyRepeatDelay = 500;
            window.localStorage.setItem('LLL/keyRepeatDelay', ''+state.keyRepeatDelay);
        } else if(activated('forceRestart') || action=='forceRestart') {
            //TODO: Prompt??
            for(let k=0;k<window.localStorage.length;k++) {
                const key = window.localStorage.key(k);
                if(key?.startsWith('LLL/')) window.localStorage.removeItem(key);
            }
            state.persistedStats = game.loadStats();
            state.gameMode = GameMode.HomeScreen;
        } else if (activated('guardMute') || action=='guardMute') {
            state.guardMute = !state.guardMute;
            for(const s in state.subtitledSounds) {
                state.subtitledSounds[s].mute = state.guardMute;
            }
        } else if (activated('volumeMute') || action=='volumeMute') {
            state.volumeMute = !state.volumeMute;
            Howler.mute(state.volumeMute);
        } else if (activated('volumeDown') || action=='volumeDown') {
            const vol = Howler.volume();
            Howler.volume(Math.max(vol-0.1,0.1));
        } else if (activated('volumeUp') || action=='volumeUp') {
            const vol = Howler.volume();
            Howler.volume(Math.min(vol+0.1,1.0));
        }
    }
};

class HelpControls extends TextWindow {
    pages = [
        `Help: Controls

  Move: Arrows / WASD / HJKL
  Wait: Space / Z / Period / Numpad5
  Leap/Run: Shift + move (unlimited!)
  Leap/Run (Toggle): F / Numpad+
  Zoom View: [ / ]
  Volume: (Mute/Down/Up) 0 / - / =
  Guard Mute (Toggle): 9

Disable NumLock if using numpad
Mouse, touch and gamepad also supported

[Esc|menu] Back to menu`,
    ];
    update(state: State): void {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        }
    }
}

class HelpKey extends TextWindow {
    pages = [
        `Map Key

#${getTileSet().playerTiles.normal.textureIndex}# Thief: You!
#${getTileSet().npcTiles[3].textureIndex}# Guard: Avoid them!
#${getTileSet().itemTiles[ItemType.Coin].textureIndex}# Loot: Steal it!
#${getTileSet().itemTiles[ItemType.Bush].textureIndex}# Tree: Hiding place
#${getTileSet().itemTiles[ItemType.Table].textureIndex}# Table: Hiding place
#${getTileSet().itemTiles[ItemType.Chair].textureIndex}# Stool: Guards sit here
#${getTileSet().itemTiles[ItemType.TorchLit].textureIndex}# Torch: Guards light them
#${getTileSet().terrainTiles[TerrainType.OneWayWindowN].textureIndex}# Window: One-way escape route
#${getTileSet().terrainTiles[TerrainType.GroundWoodCreaky].textureIndex}# Creaky floor: Alerts guards

[Esc|menu] Back to menu`,
    ];
    update(state: State): void {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        }
    }
}

class CreditsScreen extends TextWindow {
    pages = [
        `Credits

Made for 2023 Seven-Day Roguelike Challenge
Expanded Post-Jam Edition

by James McNeill and Damien Moore

Additional voices by Evan Moore
Additional assistance by Mike Gaffney
Testing by Mendi Carroll and Tom Elmer
Special thanks to Mendi Carroll

[Esc|menu] Back to menu`,
    ];
    update(state: State): void {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        }
    }
}

class DailyHubScreen extends TextWindow {
    pages = [
//Daily runs
`Daily Challenge for $date$

$dailyStatus$
$playMode$

Last game played:   $lastPlayed$
Last score:         $lastScore$
[C|copyScore] Copy last game to clipboard
$copyState$
Best winning score: $bestScore$
Total daily runs:   $dailyPlays$
Total daily wins:   $dailyWins$
Win streak:         $dailyWinStreak$

[Esc|menu] Back to menu`,
    ];
    stateCopied: boolean = false;
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
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
        
        return hours.toString().padStart(2,'0') + ":" 
            + minutes.toString().padStart(2,'0') + ":" 
            + seconds.toString().padStart(2,'0');
      }    
    update(state:State) {
        const lastDaily = state.persistedStats.lastDaily;
        if(lastDaily !== undefined && lastDaily.date === game.getCurrentDateFormatted()) {        
            this.state.set('dailyStatus', "Today's game completed\nTime to next game: "+this.timeToMidnightUTC());
            this.state.set('playMode', '[P|homePlay] Play it again');
        } else {
            this.state.set('dailyStatus', '[P|homePlay] Play daily game now\nTime left to play: '+this.timeToMidnightUTC());
            this.state.set('playMode', '');
        }

        const lastDailyDate: string = lastDaily?.date ?? 'None';
        const lastDailyScore: number = lastDaily?.score ?? 0;

        this.state.set('date', game.getCurrentDateFormatted()+ ' UTC');
        this.state.set('lastPlayed', lastDailyDate);
        this.state.set('lastScore', lastDailyScore.toString());
        this.state.set('bestScore', state.persistedStats.bestDailyScore.toString());
        this.state.set('dailyPlays', state.persistedStats.dailyPlays.toString());
        this.state.set('dailyWins', state.persistedStats.dailyWins.toString());
        this.state.set('dailyWinStreak', state.persistedStats.dailyWinStreak.toString());
        this.state.set('copyState', this.stateCopied ? '    COPIED!' : '');
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            this.stateCopied = false;
            state.gameMode = GameMode.HomeScreen;
        } else if (activated('homePlay') || action=='homePlay') {
            this.stateCopied = false;
            let date = game.getCurrentDateFormatted();
            state.rng = new RNG('Daily '+date);
            state.dailyRun = date;
            game.restartGame(state);
            state.hasStartedGame = true;
        } else if(activated('copyScore') || action=='copyScore') {
            const stats:GameStats = game.getStat('lastDaily') ?? {
                daily: null,
                numLevels: 0,
                numGhostedLevels: 0,
                totalScore: 0,
                lootStolen: 0,
                turns: 0,
                win: false,
                numCompletedLevels: 0,
                loot: 0,
            };
            scoreToClipboard(stats);
            this.stateCopied = true;
        }
    };        
}

class StatsScreen extends TextWindow {
    pages = [
`Play Statistics

Total plays:             $totalPlays$
Total wins:              $totalWins$
Total loot:              $totalGold$
Total mansions ghosted:  $totalGhosts$
Total mansions looted:   $totalLootSweeps$
Best winning score:      $bestScore$

[Esc|menu] Back to menu`];
    update(state:State) {
        this.state.set('totalPlays', state.persistedStats.totalPlays.toString());
        this.state.set('totalWins', state.persistedStats.totalWins.toString());
        this.state.set('totalGold', state.persistedStats.totalGold.toString());
        this.state.set('totalGhosts', state.persistedStats.totalGhosts.toString());
        this.state.set('totalLootSweeps', state.persistedStats.totalLootSweeps.toString());
        this.state.set('bestScore', state.persistedStats.bestScore.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        };
    }
}

class MansionCompleteScreen extends TextWindow {
    pages = [
`Mansion $level$ Complete!

$levelStats$Loot:        $lootScore$
Time:        $timeBonus$
$ghosted$Score:       $levelScore$

Total Score: $totalScore$

[N|startLevel]: Next`
    ];
    update(state:State) {
        const numTurnsPar = game.numTurnsParForCurrentMap(state);
        const timeBonus = Math.max(0, numTurnsPar - state.turns);
        const ghosted = (state.levelStats.numKnockouts === 0 && state.levelStats.numSpottings === 0);
        const ghostBonus = ghosted ? 20 : 0;
        const score = state.lootStolen * 10 + timeBonus + ghostBonus;

        let levelStats = 'Turns:       ' + state.turns + '\n';
        if (state.levelStats.numSpottings > 0) {
            levelStats += 'Spottings:   ' + state.levelStats.numSpottings + '\n';
        }
        if (state.levelStats.damageTaken > 0) {
            levelStats += 'Injuries:    ' + state.levelStats.damageTaken + '\n';
        }
        if (state.levelStats.numKnockouts > 0) {
            levelStats += 'Knockouts:   ' + state.levelStats.numKnockouts + '\n';
        }
        if (levelStats.length > 0) {
            levelStats += '\n';
        }

        this.state.set('level', (state.level+1).toString());
        this.state.set('levelStats', levelStats);
        this.state.set('lootScore', (state.lootStolen * 10).toString());
        this.state.set('timeBonus', timeBonus.toString());
        this.state.set('ghosted', ghosted ? ('Ghosted:     ' + ghostBonus.toString() + '\n') : '');
        this.state.set('levelScore', score.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('restart') || action=='restart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('startLevel') || action=='startLevel') {
            if (state.level >= game.gameConfig.numGameMaps - 1) {
                game.advanceToWin(state);
            } else {
                game.setupLevel(state, state.level + 1);
            }
        }
    };
}

class DeadScreen extends TextWindow{
    pages = [
`         You are dead!

Statistics
Completed:     $level$ of $numLevels$
Ghosted:       $numGhostedLevels$
Total Score:   $totalScore$

[R|restart]:   Start new game
[C|copyScore]:   Copy score to clipboard
$copyState$
[Esc|menu]: Exit to home screen`
    ];
    stateCopied: boolean = false;
    update(state:State) {
        this.state.set('level', state.level.toString());
        this.state.set('numLevels', state.gameMapRoughPlans.length.toString());
        this.state.set('numGhostedLevels', state.gameStats.numGhostedLevels.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
        this.state.set('copyState', this.stateCopied ? '       COPIED!' : '');
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('restart') || action=='restart') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('menu') || action=='menu') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
            state.gameMode = GameMode.HomeScreen;
            state.hasStartedGame = false;
        } else if(activated('copyScore') || action=='copyScore') {
            scoreToClipboard(state.gameStats);
            this.stateCopied = true;
        }
    }   
};

class WinScreen extends TextWindow {
    pages = [
`Mission Complete!

Statistics
Ghosted:       $numGhostedLevels$ of $numLevels$
Total Score:   $totalScore$

[R|restart]:   Start new game
[C|copyScore]:   Copy score to clipboard
$copyState$
[Esc|menu]: Exit to home screen`
    ];
    stateCopied: boolean = false;
    update(state:State) {
        this.state.set('numLevels', state.gameMapRoughPlans.length.toString());
        this.state.set('numGhostedLevels', state.gameStats.numGhostedLevels.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
        this.state.set('copyState', this.stateCopied ? '       COPIED!' : '');
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('restart') || action=='restart') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('menu') || action=='menu') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
            state.gameMode = GameMode.HomeScreen;
            state.hasStartedGame = false;
        } else if(activated('copyScore') || action=='copyScore') {
            scoreToClipboard(state.gameStats);
            this.stateCopied = true;
        }
    };
}
