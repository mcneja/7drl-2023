import { Renderer } from './render';
import { vec2, mat4 } from './my-matrix';
import { Rect, TouchTargets, lastController } from './controllers';
import { GameMode, GameStats, State } from './types';
import * as colorPreset from './color-preset';
import * as game from './game';
import { RNG } from './random';
import { getFontTileSet, getEntityTileSet, TextureType, TileInfo } from './tilesets';
import { ItemType } from './game-map';
import { Achievement, Achievements } from './achievements';

export { TextWindow, HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, AchievementsScreen, MansionCompleteScreen, HelpControls, HelpKey, DailyHubScreen, CreditsScreen, DevScreen };

function scoreToClipboard(stats:GameStats, achievements:Achievements) {
    const numGhostedLevels = stats.numGhostedLevels;
    const totalScore = stats.totalScore;
    const turns = stats.turns;
    const numCompletedLevels = stats.numCompletedLevels;
    const numLevels = stats.numLevels;
    const win = numCompletedLevels >= numLevels;
    const daily = stats.daily;

    const runText = daily!==null? '\uD83D\uDCC5 Daily run for '+daily:
        '\uD83C\uDFB2 Random game';
    const endText = win? 'Completed mission in '+turns+' turns.':
        '\uD83D\uDC80 Died in mansion '+ (numCompletedLevels + 1) +' after '+turns+' turns.';
    let badges = '';
    if (win) {
        let a:keyof Achievements;
        for(a in achievements) {
            if (!achievements[a].failed) {
                badges += achievements[a].unicodeBadge;
            }
        }    
        if (badges.length>0) {
            badges = 'Achievements: '+badges+'\n';
        }
    }

    navigator.clipboard.writeText(
        `\uD83C\uDFDB\uFE0F LLLOOOT! \uD83C\uDFDB\uFE0F\n${runText}\n${endText}\n`+
        `Completed:   ${numCompletedLevels} of ${numLevels}\n` +
        `Ghosted:     ${numGhostedLevels}\n`+
        `Total score: ${totalScore}\n`+
        `${badges}`
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
        let pipe: number, end: number;
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
        const scaleFactor = game.statusBarZoom(screenSize);
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
        renderer.start(matScreenFromTextArea, TextureType.Font);
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
        renderer.start(matScreenFromPixel, TextureType.Font);
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
        renderer.start(matScreenFromTextArea, TextureType.Entity);
        for(const g of this.glyphs) {
            const r = g[1];
            renderer.addGlyph(r[0], r[1], r[2]+r[0], r[3]+r[1], {textureIndex: g[0], color: colorPreset.white});
        }
        renderer.flush();

        // Draw text
        renderer.start(matScreenFromTextArea, TextureType.Font);
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
        let action = '';
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
`LLLOOOT!

$playRestartOrResume$
[H|helpControls]: Controls help
[M|helpKey]: Map key
[D|homeDaily]: Daily challenge
[O|homeOptions]: Options
[S|homeStats]: Statistics
[A|homeAchievements]: Achievements
[C|credits]: Credits$devMode$`
    ];
    devSequence: string = 'LRLRUD';
    devSequenceCursor: number = 0;
    constructor() {
        super();
    }
    update(state: State) {
        const commands =
            !state.hasStartedGame ? '[P|homePlay]: Play game\n' :
            (state.dailyRun !== null ? '[R|homePlay]: Resume daily game\n[N|homeRestart]: New game' :
                '[R|homePlay]: Resume game\n[N|homeRestart]: New game');
        this.state.set('playRestartOrResume', commands);
        this.state.set('devMode', state.devMode? '\n[X|devMenu]: Developer menu':'')
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const actionSelected = this.navigateUI(activated);
        if (activated('homePlay') || actionSelected=='homePlay' || activated('menu') || actionSelected=='menu') {
            game.startResumeConfiguredGame(state);
            this.devSequenceCursor = 0;
        } else if(activated('devMenu') || actionSelected=='devMenu') {
            state.gameMode = GameMode.DevScreen;
        } else if (activated('homeRestart') || actionSelected=='homeRestart') {
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if(activated('homeDaily') || actionSelected=='homeDaily') {
            state.gameMode = GameMode.DailyHub;
        } else if(activated('homeStats') || actionSelected=='homeStats') {
            state.gameMode = GameMode.StatsScreen;
        } else if(activated('homeAchievements') || actionSelected=='homeAchievements') {
            state.gameMode = GameMode.AchievementsScreen;
        } else if(activated('homeOptions') || actionSelected=='homeOptions') {
            state.gameMode = GameMode.OptionsScreen;
        } else if (activated('helpControls') || actionSelected=='helpControls') {
            state.gameMode = GameMode.HelpControls;
        } else if (activated('helpKey') || actionSelected=='helpKey') {
            state.gameMode = GameMode.HelpKey;
        } else if (activated('credits') || actionSelected=='credits') {
            state.gameMode = GameMode.CreditsScreen;
        }

        if (activated('left')) {
            this.updateCheatCode('L', state);
        }
        if (activated('right')) {
            this.updateCheatCode('R', state);
        }
        if (activated('up')) {
            this.updateCheatCode('U', state);
        }
        if (activated('down')) {
            this.updateCheatCode('D', state);
        }
    }
    updateCheatCode(ch: string, state: State) {
        if (this.devSequence[this.devSequenceCursor] !== ch) {
            this.devSequenceCursor = 0;
        }
        if (this.devSequence[this.devSequenceCursor] === ch) {
            ++this.devSequenceCursor;
        }
        if (this.devSequenceCursor >= this.devSequence.length) {
            state.devMode = !state.devMode;
            this.devSequenceCursor = 0;
        }
    }
}

class DevScreen extends TextWindow {
    pages = [
`Developer Menu

[Alt+<|prevLevel]  Previous level
[Alt+>|nextLevel]  Next level
[Alt+C|collectLoot]  Collect loot 
[Alt+S|markSeen]  Mark mansion seen
[Alt+A|seeAll]  See entire map: $seeAll$
[Alt+P|guardPatrols]  See guard patrols: $guardPatrols$
[Alt+V|guardSight]  See guard sight: $guardSight$
[Alt+F|showFPS]  Show FPS: $showFPS$

$message$

[Esc|menuBack]    Back to menu`,
    ];
    constructor() {
        super();
        this.state.set('message','');
    }
    update(state: State): void {
        this.state.set('showFPS', state.fpsInfo.enabled? 'Yes':'No');
        this.state.set('seeAll', state.seeAll ? 'Yes' : 'No');
        this.state.set('guardPatrols', state.seeGuardPatrols ? 'Yes' : 'No');
        this.state.set('guardSight', state.seeGuardSight ? 'Yes' : 'No');
        this.state.set('showFPS', state.fpsInfo.enabled ? 'Yes' : 'No');
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
            this.state.set('message', '')
        } else if (activated('prevLevel') || action=='prevLevel') {
            if (state.hasStartedGame) {
                if (state.level > 0) {
                    game.scoreCompletedLevel(state);
                    game.setupLevel(state, state.level-1);
                }    
            } else {
                this.state.set('message', 'START GAME FIRST');
            }
        } else if (activated('nextLevel') || action=='nextLevel') {
            if (state.hasStartedGame) {
                if (state.level < state.gameMapRoughPlans.length - 1) {
                    game.scoreCompletedLevel(state);
                    game.setupLevel(state, state.level+1);
                }
            } else {
                this.state.set('message', 'START GAME FIRST');
            }
        } else if (activated('collectLoot') || action=='collectLoot') {
            if (state.hasStartedGame) {
                const loot = state.gameMap.collectAllLoot();
                state.player.loot += loot;
                state.lootStolen += loot;
                game.postTurn(state);    
            } else {
                this.state.set('message', 'START GAME FIRST');
            }
        } else if (activated('markSeen') || action=='markSeen') {
            if (state.hasStartedGame) {
                state.gameMap.markAllSeen();
                game.postTurn(state);    
            } else {
                this.state.set('message', 'START GAME FIRST');
            }
        } else if (activated('seeAll') || action=='seeAll') {
            state.seeAll = !state.seeAll;
            this.state.set('message', '')
        } else if (activated('guardSight') || action=='guardSight') {
            state.seeGuardSight = !state.seeGuardSight;
            this.state.set('message', '')
        } else if (activated('guardPatrols') || action=='guardPatrols') {
            state.seeGuardPatrols = !state.seeGuardPatrols;
            this.state.set('message', '')
        } else if (activated('showFPS') || action=='showFPS') {
            state.fpsInfo.enabled = !state.fpsInfo.enabled;
            this.state.set('message', '')
        }
    }
}


class OptionsScreen extends TextWindow {
    pages = [
`Options

         Sound volume: $volumeLevel$%
[=|volumeUp]      Volume up
[-|volumeDown]      Volume down
[0|volumeMute]      Volume mute: $volumeMute$
[9|guardMute]      Guard mute: $guardMute$
[J|screenShakeEnabled]      Jolt screen: $screenShakeEnabled$
[K|keyRepeatRate]      Key repeat rate $keyRepeatRate$ms
[D|keyRepeatDelay]      Key repeat delay $keyRepeatDelay$ms
[Ctrl+R|forceRestart] Reset data

[Esc|menuBack]    Back to menu`,
    ];
    update(state: State): void {
        this.state.set('volumeLevel', (state.soundVolume * 100).toFixed(0));
        this.state.set('volumeMute', state.volumeMute ? 'Yes' : 'No');
        this.state.set('guardMute', state.guardMute ? 'Yes' : 'No');
        this.state.set('screenShakeEnabled', state.screenShakeEnabled ? 'Yes' : 'No');
        this.state.set('keyRepeatRate', state.keyRepeatRate.toString());
        this.state.set('keyRepeatDelay', state.keyRepeatDelay.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
        } else if (activated('volumeUp') || action=='volumeUp') {
            const soundVolume = Math.min(1.0, state.soundVolume + 0.1);
            game.setSoundVolume(state, soundVolume);
        } else if (activated('volumeDown') || action=='volumeDown') {
            const soundVolume = Math.max(0.1, state.soundVolume - 0.1);
            game.setSoundVolume(state, soundVolume);
        } else if (activated('volumeMute') || action=='volumeMute') {
            game.setVolumeMute(state, !state.volumeMute);
        } else if (activated('guardMute') || action=='guardMute') {
            game.setGuardMute(state, !state.guardMute);
        } else if (activated('screenShakeEnabled') || action==='screenShakeEnabled') {
            game.setScreenShakeEnabled(state, !state.screenShakeEnabled);
        } else if(activated('keyRepeatRate') || action=='keyRepeatRate') {
            state.keyRepeatRate -= 50;
            if(state.keyRepeatRate<100) state.keyRepeatRate = 400;
            window.localStorage.setItem('LLL/keyRepeatRate', state.keyRepeatRate.toString());
        } else if (activated('keyRepeatDelay') || action=='keyRepeatDelay') {
            state.keyRepeatDelay -= 50;
            if(state.keyRepeatDelay<100) state.keyRepeatDelay = 500;
            window.localStorage.setItem('LLL/keyRepeatDelay', state.keyRepeatDelay.toString());
        } else if (activated('forceRestart') || action=='forceRestart') {
            //TODO: Prompt??
            window.localStorage.clear();
            state.persistedStats = game.loadStats();
            state.gameMode = GameMode.HomeScreen;
            game.setSoundVolume(state, 1.0);
            game.setVolumeMute(state, false);
            game.setGuardMute(state, false);
        }
    }
};

class HelpControls extends TextWindow {
    pages = [
        `Help: Keyboard Controls

  Move: Arrows / WASD / HJKL
  Wait: Space / Z / Period / Numpad5
  Leap/Run: Shift + move (unlimited!)
  Leap/Run (Toggle): F / Numpad+
  Make Noise: X
  Zoom View: [ / ]
  Scroll View: Control + move
  Recenter View: Control + wait
  Volume: (Mute/Down/Up) 0 / - / =
  Guard Mute (Toggle): 9
  Show last speech: Tab

Disable NumLock if using numpad
Touch and gamepad also supported

[Esc|menuBack] Back to menu`,
        `Help: Touch Controls

  Move: #016# / #017# / #018# / #019#
  Wait: #020#
  Leap/Run: #21# + move (unlimited!)
  Make Noise: #29#
  Zoom View: #22# / #23#
  Scroll View: Touch and drag
  Menu: #27#
  Navigate menu: #018# / #019# / #20#

Keyboard and gamepad also supported

[Esc|menuBack] Back to menu`,
        `Help: Gamepad Controls

  Move: Left Stick/Pad
  Wait: Button2
  Leap/Run: Button1 + move
  Make Noise: Button3
  Zoom View: Left / Right trigger
  Scroll View: Right stick
  Recenter View: Right bumper
  Show last speech: Left bumper

Keyboard and touch also supported

[Esc|menuBack] Back to menu`,
];
    update(state: State): void {
        this.activePage = lastController === state.keyboardController? 0:
                          lastController === state.touchController? 1 : 2;
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
        }
    }
}

class HelpKey extends TextWindow {
    pages = [
        `Map Key

#${getEntityTileSet().playerTiles.normal.textureIndex}# Thief: You!
#${getEntityTileSet().npcTiles[3].textureIndex}# Guard: Avoid them!
#${getEntityTileSet().itemTiles[ItemType.Coin].textureIndex}# Loot: Steal it!
#${getEntityTileSet().itemTiles[ItemType.Treasure].textureIndex}# Bonus loot: Steal it?
#${getEntityTileSet().itemTiles[ItemType.Bush].textureIndex}# Tree: Hiding place
#${getEntityTileSet().itemTiles[ItemType.Table].textureIndex}# Table: Hiding place
#${getEntityTileSet().itemTiles[ItemType.Chair].textureIndex}# Stool: Guards sit here
#${getEntityTileSet().itemTiles[ItemType.TorchLit].textureIndex}# Torch: Douse it
#${getEntityTileSet().namedTiles["uiWindowTile"].textureIndex}# Window: One-way escape
#${getEntityTileSet().namedTiles["uiCreakyTile"].textureIndex}# Creaky floor: Alerts guards

[Esc|menuBack] Back to menu`,
    ];
    update(state: State): void {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
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

[Esc|menuBack] Back to menu`,
    ];
    update(state: State): void {
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
        }
    }
}

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

[Esc|menuBack] Back to menu`

class DailyHubScreen extends TextWindow {
    pages = [
//Daily runs
`The Daily Challenge

Play a new seeded game each day and 
compare results with your rivals.

$dailyStatus$
Plays:             $plays$
Wins:              $wins$
Best score:        $bestScore$

$playMode$
$timeLeft$

Last game played:  $lastPlayed$
Last score:        $lastScore$
[C|copyScore] Copy last game to clipboard
$copyState$

[Esc|menuBack] Back to menu`,
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
        const lastDailyGameStats = state.persistedStats.lastPlayedDailyGame;
        if(state.persistedStats.currentDailyGameId !== game.getCurrentDateFormatted()) {
            state.persistedStats.currentDailyGameId  = game.getCurrentDateFormatted();
            state.persistedStats.currentDailyPlays = 0;
            state.persistedStats.currentDailyWins = 0;
            state.persistedStats.currentDailyWinFirstTry = 0;
            state.persistedStats.currentDailyBestScore = 0;
            game.saveStats(state.persistedStats);
        }
        if(lastDailyGameStats !== null && state.persistedStats.currentDailyPlays>0) {
            if(state.persistedStats.currentDailyWins===0) {
                this.state.set('dailyStatus', state.persistedStats.currentDailyGameId+' game played');
            } else if(state.persistedStats.currentDailyWinFirstTry===0) {
                this.state.set('dailyStatus', state.persistedStats.currentDailyGameId+' game won');
            } else {
                const tile = getEntityTileSet().itemTiles[ItemType.TorchLit].textureIndex;
                this.state.set('dailyStatus', state.persistedStats.currentDailyGameId+` game won first try #${tile}#`);
            }
            this.state.set('timeLeft', "Time to next game: "+this.timeToMidnightUTC());
            this.state.set('playMode', '[P|homePlay] Play it again');
        } else {
            this.state.set('dailyStatus', state.persistedStats.currentDailyGameId+` game ready`);
            this.state.set('timeLeft', "Time left to play: "+this.timeToMidnightUTC());
            this.state.set('playMode', '[P|homePlay] Play now');
        }

        const lastDailyDate: string = lastDailyGameStats?.daily ?? 'None';
        const lastDailyScore: number = lastDailyGameStats?.totalScore ?? 0;

        this.state.set('plays', state.persistedStats.currentDailyPlays.toString());
        this.state.set('wins', state.persistedStats.currentDailyWins.toString());
        this.state.set('lastPlayed', lastDailyDate);
        this.state.set('lastScore', lastDailyScore.toString());
        this.state.set('bestScore', state.persistedStats.currentDailyBestScore.toString());
        this.state.set('copyState', this.stateCopied ? '    COPIED!' : '');
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            this.stateCopied = false;
            state.gameMode = GameMode.HomeScreen;
        } else if (activated('homePlay') || action=='homePlay') {
            this.stateCopied = false;
            let date = game.getCurrentDateFormatted();
            state.rng = new RNG('Daily '+date);
            state.dailyRun = date;
            game.restartGame(state);
            state.hasStartedGame = true;
        } else if (activated('copyScore') || action=='copyScore') {
            const stats:GameStats = state.persistedStats.lastPlayedDailyGame ?? {
                totalScore: 0,
                turns: 0,
                numLevels: 0,
                numCompletedLevels: 0,
                numGhostedLevels: 0,
                daily: null,
                timeStarted: Date.now(),
                timeEnded: 0,
            };
            scoreToClipboard(stats, state.achievements);
            this.stateCopied = true;
        }
    };        
}

class StatsScreen extends TextWindow {
    pages = [
`Play Statistics

All games
Total plays:             $totalPlays$
Total wins:              $totalWins$
Total mansions ghosted:  $totalGhosts$
Best score:              $bestScore$

Daily games
Total plays:             $allDailyPlays$
Total wins:              $allDailyWins$
Total wins first try:    $allDailyWinsFirstTry$

[Esc|menuBack] Back to menu`];
    update(state:State) {
        this.state.set('totalPlays', state.persistedStats.totalPlays.toString());
        this.state.set('totalWins', state.persistedStats.totalWins.toString());
        this.state.set('totalGhosts', state.persistedStats.totalGhosts.toString());
        this.state.set('bestScore', state.persistedStats.bestScore.toString());
        this.state.set('allDailyPlays', state.persistedStats.allDailyPlays.toString());
        this.state.set('allDailyWins', state.persistedStats.allDailyWins.toString());
        this.state.set('allDailyWinsFirstTry', state.persistedStats.allDailyWinsFirstTry.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
        };
    }
}

class AchievementsScreen extends TextWindow {
    pages = [
`Achievements

Earn achievements by meeting certain
requirements when you complete a game.

 $victoryAchieved$ Victory: winning is enough...
 $hungryAchieved$ Hungry: collect all food
 $treasureAchieved$ Looty: steal all bonus loot
 $healthyAchieved$ Healthy: take no damage
 $steppyAchieved$ Steppy: no leap where a step works
 $thumpyAchieved$ Thumpy: knock out all guards
 $softyAchieved$ Softy: no knockouts
 $mappingAchieved$ Looky: map 100% before looting anything
 $facelessAchieved$ Ghosty: ghost every level
 $zippyAchieved$ Zippy: under par time on every level
 $ghostyAchieved$ Mosty Ghosty: ghost with no knockouts

[Esc|menuBack] Back to menu`,
];
    update(state:State) {
        const ts = getEntityTileSet().achievementIcons;
        const incomplete = `#${getEntityTileSet().achievementIncompleteIcon.textureIndex}#`;
        const failed = `#${getEntityTileSet().achievementFailedIcon.textureIndex}#`;
        function setIcon(window: TextWindow, key: string, completionCount: number, achievement: Achievement, tileInfo: TileInfo) {
            const str: string = completionCount>0 ? `#${tileInfo.textureIndex}#` : achievement.failed ? failed : incomplete;
            window.state.set(key, str);
        }
        setIcon(this, 'victoryAchieved',  state.persistedStats.achievementVictory,  state.achievements.achievementVictory,  ts.achievementVictory);
        setIcon(this, 'ghostyAchieved',   state.persistedStats.achievementGhosty,   state.achievements.achievementGhosty,   ts.achievementGhosty);
        setIcon(this, 'zippyAchieved',    state.persistedStats.achievementZippy,    state.achievements.achievementZippy,    ts.achievementZippy);
        setIcon(this, 'hungryAchieved',   state.persistedStats.achievementHungry,   state.achievements.achievementHungry,   ts.achievementHungry);
        setIcon(this, 'thumpyAchieved',   state.persistedStats.achievementThumpy,   state.achievements.achievementThumpy,   ts.achievementThumpy);
        setIcon(this, 'softyAchieved',    state.persistedStats.achievementSofty,    state.achievements.achievementSofty,    ts.achievementSofty);
        setIcon(this, 'steppyAchieved',   state.persistedStats.achievementSteppy,   state.achievements.achievementSteppy,   ts.achievementSteppy);
        setIcon(this, 'healthyAchieved',  state.persistedStats.achievementHealthy,  state.achievements.achievementHealthy,  ts.achievementHealthy);
        setIcon(this, 'treasureAchieved', state.persistedStats.achievementTreasure, state.achievements.achievementTreasure, ts.achievementTreasure);
        setIcon(this, 'mappingAchieved',  state.persistedStats.achievementMapping,  state.achievements.achievementMapping,  ts.achievementMapping);
        setIcon(this, 'facelessAchieved', state.persistedStats.achievementFaceless, state.achievements.achievementFaceless, ts.achievementFaceless);
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('menu') || action=='menu') {
            game.startResumeConfiguredGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            state.gameMode = GameMode.HomeScreen;
        };
    }
}



class MansionCompleteScreen extends TextWindow {
    pages = [
`Mansion $level$ Complete!

$levelStats$Loot:        $lootScore$$treasureScore$$foodScore$
Ghost:       $ghostBonus$
Speed:       $timeBonus$
Total:       $levelScore$

Cumulative:  $totalScore$

[N|startLevel]: Next`
    ];
    update(state:State) {
        const numTurnsPar = game.numTurnsParForCurrentMap(state);
        const timeBonus = Math.max(0, numTurnsPar - state.turns);
        const lootScore = state.lootStolen * 10;
        const treasureScore = game.bonusTreasureScoreForCurrentMap(state);
        const foodScore = state.levelStats.extraFoodCollected * 5;
        const ghosted = state.levelStats.numSpottings === 0;
        const ghostBonus = ghosted ? lootScore : 0;
        const score = lootScore + treasureScore + foodScore + timeBonus + ghostBonus;

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
        this.state.set('treasureScore', (state.gameMap.treasures.length > 0) ? ('\nBonus Loot:  ' + treasureScore) : '');
        this.state.set('foodScore', (foodScore > 0) ? ('\nFood:        ' + foodScore) : '');
        this.state.set('timeBonus', timeBonus.toString());
        this.state.set('ghostBonus', ghostBonus.toString());
        this.state.set('levelScore', score.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('startLevel') || action=='startLevel') {
            if (state.level >= state.gameMapRoughPlans.length - 1) {
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

[N|homeRestart]:   New game
[C|copyScore]:   Copy score to clipboard
$copyState$
[Esc|menuBack]: Exit to home screen`
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
        if (activated('homeRestart') || action=='homeRestart') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
            state.gameMode = GameMode.HomeScreen;
            state.hasStartedGame = false;
        } else if (activated('copyScore') || action=='copyScore') {
            scoreToClipboard(state.gameStats, state.achievements);
            this.stateCopied = true;
        }
    }   
};

class WinScreen extends TextWindow {
    pages = [
`Mission Complete!

Statistics
Ghosted:       $numGhostedLevels$ of $numLevels$
Total Score:   $totalScore$$achievements$

[N|homeRestart]:   New game
[C|copyScore]:   Copy score to clipboard
$copyState$
[Esc|menuBack]: Exit to home screen`
    ];
    stateCopied: boolean = false;
    achievementsLine: string|undefined = undefined;
    update(state:State) {
        this.state.set('numLevels', state.gameMapRoughPlans.length.toString());
        this.state.set('numGhostedLevels', state.gameStats.numGhostedLevels.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
        this.state.set('copyState', this.stateCopied ? '       COPIED!' : '');
        if (this.achievementsLine===undefined) {
            this.achievementsLine = '';
            let a:keyof Achievements;
            for (a in state.achievements) {
                if (!state.achievements[a].failed) {
                    this.achievementsLine += `#${getEntityTileSet().achievementIcons[a].textureIndex}#`
                }
            }
            if (this.achievementsLine.length>0) {
                this.achievementsLine = '\nAchievements:  '+this.achievementsLine;
            }
            this.state.set('achievements', this.achievementsLine);
        }
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('homeRestart') || action=='homeRestart') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            this.achievementsLine = undefined;
            game.restartGame(state);
        } else if (activated('menuBack') || action=='menuBack') {
            this.stateCopied = false;
            state.rng = new RNG();
            state.dailyRun = null;
            game.restartGame(state);
            state.gameMode = GameMode.HomeScreen;
            this.achievementsLine = undefined;
            state.hasStartedGame = false;
        } else if (activated('copyScore') || action=='copyScore') {
            scoreToClipboard(state.gameStats, state.achievements);
            this.stateCopied = true;
        }
    };
}
