import { Renderer } from './render';
import { vec2, mat4 } from './my-matrix';
import { Rect, TouchTargets, lastController } from './controllers';
import { GameMode, GameStats, State } from './types';
import * as colorPreset from './color-preset';
import * as game from './game';
import { RNG } from './random';
import { getFontTileSet, getTileSet } from './tilesets';
import { ItemType, TerrainType } from './game-map';

export { TextWindow, HomeScreen, OptionsScreen, WinScreen, DeadScreen, StatsScreen, AchievementsScreen, MansionCompleteScreen, HelpControls, HelpKey, DailyHubScreen, CreditsScreen };

function scoreToClipboard(stats:GameStats) {
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

    navigator.clipboard.writeText(
        `\uD83C\uDFDB\uFE0F Lurk, Leap, Loot \uD83C\uDFDB\uFE0F\n${runText}\n${endText}\n`+
        `Completed:   ${numCompletedLevels} of ${numLevels}\n` +
        `Ghosted:     ${numGhostedLevels}\n`+
        `Total score: ${totalScore}\n`
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
`Lurk, Leap, Loot

$playRestartOrResume$
[H|helpControls]: Controls help
[M|helpKey]: Map key
[D|homeDaily]: Daily challenge
[O|homeOptions]: Options
[S|homeStats]: Statistics
[A|homeAchievements]: Achievements
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

[Esc|menu]    Back to menu`,
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
        if(activated('menu') || action=='menu') {
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
        } else if(activated('keyRepeatDelay') || action=='keyRepeatDelay') {
            state.keyRepeatDelay -= 50;
            if(state.keyRepeatDelay<100) state.keyRepeatDelay = 500;
            window.localStorage.setItem('LLL/keyRepeatDelay', state.keyRepeatDelay.toString());
        } else if(activated('forceRestart') || action=='forceRestart') {
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
        `Help: Controls

  Move: Arrows / WASD / HJKL
  Wait: Space / Z / Period / Numpad5
  Leap/Run: Shift + move (unlimited!)
  Leap/Run (Toggle): F / Numpad+
  Zoom View: [ / ]
  Volume: (Mute/Down/Up) 0 / - / =
  Guard Mute (Toggle): 9
  Show last speech: Tab

Disable NumLock if using numpad
Touch devices and gamepad also supported

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

[Esc|menu] Back to menu`

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
                const tile = getTileSet().itemTiles[ItemType.TorchLit].textureIndex;
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
            scoreToClipboard(stats);
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

[Esc|menu] Back to menu`];
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
        if(activated('menu') || action=='menu') {
            state.gameMode = GameMode.HomeScreen;
        };
    }
}

class AchievementsScreen extends TextWindow {
    pages = [
`Achievements

Earn achievements by meeting certain requirements
when you complete a game.

 $victoryAchieved$ Victory: winning is enough...
 $ghostyAchieved$ Ghosty: ghost every level
 $zippyAchieved$ Zippy: under par time on every level
 $hungryAchieved$ Hungry: got all the food
 $thumpyAchieved$ Thumpy: KO'd all guards
 $softyAchieved$ Softy: did not KO anyone
 $noisyAchieved$ Noisy: alerted guards with noise on levels 2-10
 $leapyAchieved$ Leapy: leapt more than 80% of your turns
 $steppyAchieved$ Steppy: leap no more than 20 turns
 $hurtyAchieved$ Hurty: took a wound on levels 2-10

[Esc|menu] Back to menu`];
    update(state:State) {
        const ts = getTileSet().achievementIcons
        const inc = getTileSet().achievementIncompleteIcon.textureIndex;
        this.state.set('victoryAchieved', state.persistedStats.achievementVictory>0?`#${ts.achievementVictory.textureIndex}#`:`#${inc}#`);
        this.state.set('ghostyAchieved', state.persistedStats.achievementGhosty>0?`#${ts.achievementGhosty.textureIndex}#`:`#${inc}#`);
        this.state.set('zippyAchieved', state.persistedStats.achievementZippy>0?    `#${ts.achievementZippy.textureIndex}#`:`#${inc}#`);
        this.state.set('hungryAchieved', state.persistedStats.achievementHungry>0?  `#${ts.achievementHungry.textureIndex}#`:`#${inc}#`);
        this.state.set('thumpyAchieved', state.persistedStats.achievementThumpy>0?  `#${ts.achievementThumpy.textureIndex}#`:`#${inc}#`);
        this.state.set('softyAchieved', state.persistedStats.achievementSofty>0?    `#${ts.achievementSofty.textureIndex}#`:`#${inc}#`);
        this.state.set('noisyAchieved', state.persistedStats.achievementNoisy>0?    `#${ts.achievementNoisy.textureIndex}#`:`#${inc}#`);
        this.state.set('leapyAchieved', state.persistedStats.achievementLeapy>0?    `#${ts.achievementLeapy.textureIndex}#`:`#${inc}#`);
        this.state.set('steppyAchieved', state.persistedStats.achievementSteppy>0?  `#${ts.achievementSteppy.textureIndex}#`:`#${inc}#`);
        this.state.set('hurtyAchieved', state.persistedStats.achievementHurty>0?    `#${ts.achievementHurty.textureIndex}#`:`#${inc}#`);
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

$levelStats$Loot:        $lootScore$$foodScore$
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
        const foodScore = state.levelStats.extraFoodCollected * 5;
        const ghosted = state.levelStats.numSpottings === 0;
        const ghostBonus = ghosted ? lootScore : 0;
        const score = lootScore + foodScore + timeBonus + ghostBonus;

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
        this.state.set('foodScore', (foodScore > 0) ? ('\nFood:        ' + foodScore) : '');
        this.state.set('timeBonus', timeBonus.toString());
        this.state.set('ghostBonus', ghostBonus.toString());
        this.state.set('levelScore', score.toString());
        this.state.set('totalScore', state.gameStats.totalScore.toString());
    }
    onControls(state:State, activated:(action:string)=>boolean) {
        const action = this.navigateUI(activated);
        if (activated('startLevel') || action=='startLevel') {
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

[N|homeRestart]:   New game
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
        if (activated('homeRestart') || action=='homeRestart') {
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

[N|homeRestart]:   New game
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
        if (activated('homeRestart') || action=='homeRestart') {
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
