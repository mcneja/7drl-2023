import { Howl, Howler } from 'howler';
import { shuffleArray } from './random';

export { Howler };

const victorySong = require('url:./audio/Minstrel_Dance.mp3');
const levelRequirementJingle = require('url:./audio/level-requirement-1.mp3');
const levelCompleteJingle = require('url:./audio/level-requirement-2.mp3');
const gameOverJingle = require('url:./audio/lose-game-over.mp3');
const easterEgg = require('url:./audio/Minstrel Dance Easter Egg.mp3');
const footstepWood = require('url:./audio/footstep-wood.mp3');
const footstepTile = require('url:./audio/footstep-tile.mp3');
const footstepWater = require('url:./audio/footstep-water.mp3');
const footstepGravel = require('url:./audio/footstep-gravel.mp3');
const footstepGrass = require('url:./audio/footstep-grass.mp3');

const footstepCreakSet =[
    require('url:./audio/creak.mp3'),
    require('url:./audio/creak-2.mp3'),
    require('url:./audio/creak-3.mp3'),
    require('url:./audio/creak-4.mp3'),
    require('url:./audio/creak-5.mp3'),
    require('url:./audio/creak-6.mp3'),
    require('url:./audio/squeak1.wav'),
    require('url:./audio/squeak2.wav'),
    require('url:./audio/squeak3.wav'),
    require('url:./audio/squeak4.wav'),
];

const hitPlayerSet:Array<string> = [
    require('url:./audio/hitting/hit16.mp3.flac'),
    require('url:./audio/hitting/hit17.mp3.flac'),
    require('url:./audio/hitting/hit18.mp3.flac'),
    require('url:./audio/hitting/hit19.mp3.flac'),
    require('url:./audio/hitting/hit20.mp3.flac'),
    require('url:./audio/hitting/hit26.mp3.flac'),
    require('url:./audio/hitting/hit27.mp3.flac'),
];

const hitGuardSet:Array<string> = [
    require('url:./audio/hitting/hit26.mp3.flac'),
];


const coinSet = [
    require('url:./audio/coin.mp3'),
    require('url:./audio/coin-2.mp3'),
    require('url:./audio/coin-3.mp3'),
    require('url:./audio/coin-4.mp3'),    
    require('url:./audio/coin-5.mp3'),    
];

const gruntSet = [
    require('url:./audio/grunt.mp3'),
    require('url:./audio/grunt-2.mp3'),
    require('url:./audio/grunt-3.mp3'),
    require('url:./audio/grunt-4.mp3'),    
    require('url:./audio/grunt-5.mp3'),    
    require('url:./audio/grunt-6.mp3'),    
    require('url:./audio/grunt-7.mp3'),    
    require('url:./audio/grunt-8.mp3'),    
];

const douseSet = [
    require('url:./audio/douse.mp3'),
    require('url:./audio/douse-2.mp3'),
    require('url:./audio/douse-3.mp3'),
    require('url:./audio/douse-4.mp3'),    
];

const igniteSet = [
    require('url:./audio/ignite.mp3'),
    require('url:./audio/ignite-2.mp3'),
];

const hideSet = [
    require('url:./audio/hide.mp3'),
    require('url:./audio/hide-2.mp3'),
    require('url:./audio/hide-3.mp3'),
    require('url:./audio/hide-4.mp3'),    
    require('url:./audio/hide-5.mp3'),    
    require('url:./audio/hide-6.mp3'),    
];

const gateSet = [
    require('url:./audio/gate.mp3'),
    require('url:./audio/gate-2.mp3'),
    require('url:./audio/gate-3.mp3'),
    require('url:./audio/gate-4.mp3'),    
    require('url:./audio/gate-5.mp3'),    
];

const splashSet = [
    require('url:./audio/splash1.mp3'),
    require('url:./audio/splash2.mp3'),
]

const waterEnterSet = [
    require('url:./audio/water-submerge.mp3'),
]

const waterExitSet = [
    require('url:./audio/water-exit.mp3'),
]

const jumpSet = [
    require('url:./audio/jump.mp3'),
    require('url:./audio/jump-2.mp3'),
    // require('url:./audio/gotta jump.mp3'),
    // require('url:./audio/gotta jump-2.mp3'),    
];


const tooHighSet = [
    require('url:./audio/too high.mp3'),
    require('url:./audio/too high-2.mp3'),
];

type SubtitledSoundDesc = [string, string];


const guardSeeThiefSet:Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/What.mp3'), 'What?'],    
    [require('url:./audio/guards/hey.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-2.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-3.mp3'), 'Hey!'],
    [require('url:./audio/guards/what was that.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-2.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-3.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-4.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-5.mp3'), 'What was that?'],
    [require('url:./audio/guards/who goes there.mp3'), 'Who goes there?'],
    [require('url:./audio/guards/huh.mp3'), 'Huh?'],
    [require('url:./audio/guards/What.mp3'), 'What?'],
    [require('url:./audio/guards/wha.mp3'), 'Wha...'],
    [require('url:./audio/guards/wait.mp3'), 'Wait!'],
    [require('url:./audio/guards/who there.mp3'), 'Who\'s there?'],
    [require('url:./audio/guards/what moved.mp3'), 'What moved?'],
    [require('url:./audio/guards/what in the shadows.mp3'), 'What\'s that\nin the shadows?'],
    [require('url:./audio/guards/shadow move.mp3'), 'Did that\nshadow move?'],
    [require('url:./audio/guards/see something.mp3'), 'I see\nsomething!'],
    [require('url:./audio/guards/hello.mp3'), 'Hello?'],
    [require('url:./audio/guards/ugh.mp3'), 'Uhh...'],
];

const guardFinishLookingSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/What.mp3'), 'What?'],
    [require('url:./audio/guards/what was that.mp3'), 'What was that?'],
    [require('url:./audio/guards/quiet out.mp3'), 'Quiet out\nthere...'],
    [require('url:./audio/guards/jumpy.mp3'), 'Jumpy tonight...'],
    [require('url:./audio/guards/jumpin shadows.mp3'), 'Jumpin\' at\nshadows!'],
    [require('url:./audio/guards/ahh.mp3'), 'Ahh...'],
    [require('url:./audio/guards/ahh.mp3'), 'Ahh...'],
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/aww.mp3'), 'Aww...'],
    [require('url:./audio/guards/rest me bones.mp3'), 'Rest me old\nbones...'],
    [require('url:./audio/guards/oh well.mp3'), 'Oh well...'],
    [require('url:./audio/guards/case of the jitters.mp3'), 'I\'ve got myself\na case of the\njitters...'],
    [require('url:./audio/guards/must be seeing.mp3'), 'I must be\nseein\' things...'],
    [require('url:./audio/guards/what in my coffee.mp3'), 'What\'d they put\nin my coffee?'],
    [require('url:./audio/guards/coffee too strong.mp3'), 'Coffee must be\ntoo strong!'],
    [require('url:./audio/guards/hmm nothing.mp3'), 'Hmm!\nNothing...'],
    [require('url:./audio/guards/well I though I saw.mp3'), 'Well, I thought\nI saw something.'],
    [require('url:./audio/guards/nothing.mp3'), 'Nothing...'],
    [require('url:./audio/guards/hopefully nothing.mp3'), 'Hopefully\nnothing.'],
    [require('url:./audio/guards/seeing things.mp3'), 'Seein\' things,\nI guess.'],
    [require('url:./audio/guards/seeing things.mp3'), 'Seein\' things,\nI guess.'],
];

const guardHearThiefSet:Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/What.mp3'), 'What?'] ,   
    [require('url:./audio/guards/what-2.mp3'), 'What?'] ,   
    [require('url:./audio/guards/hey.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-2.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-3.mp3'), 'Hey!'],
    [require('url:./audio/guards/what was that.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-2.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-3.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-4.mp3'), 'What was that?'],
    [require('url:./audio/guards/what was that-5.mp3'), 'What was that?'],
    [require('url:./audio/guards/huh.mp3'), 'Huh?'],
    [require('url:./audio/guards/What.mp3'), 'What?'],
    [require('url:./audio/guards/wha.mp3'), 'Wha...'],
    [require('url:./audio/guards/wait.mp3'), 'Wait!'],
    [require('url:./audio/guards/who there.mp3'), 'Who\'s there?'],
    [require('url:./audio/guards/hello.mp3'), 'Hello?'],
    [require('url:./audio/guards/ugh.mp3'), 'Uhh...'],
    [require('url:./audio/guards/hark.mp3'), 'Hark?'],
    [require('url:./audio/guards/noise.mp3'), 'What was that noise?'],
    [require('url:./audio/guards/heard something.mp3'), 'I heard something...'],
];

const guardFinishListeningSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/what was that.mp3'), 'What was that?'],
    [require('url:./audio/guards/quiet out.mp3'), 'Quiet out...'],
    [require('url:./audio/guards/jumpy.mp3'), 'Jumpy tonight...'],
    [require('url:./audio/guards/ahh.mp3'), 'Ahh...'],
    [require('url:./audio/guards/ahh.mp3'), 'Ahh...'],
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/aww.mp3'), 'Aww...'],
    [require('url:./audio/guards/rest me bones.mp3'), 'Rest me old\nbones...'],
    [require('url:./audio/guards/oh well.mp3'), 'Oh well...'],
    [require('url:./audio/guards/case of the jitters.mp3'), 'I\'ve got myself\na case of the\njitters...'],
    [require('url:./audio/guards/what in my coffee.mp3'), 'What\'s in my\ncoffee today?'],
    [require('url:./audio/guards/coffee too strong.mp3'), 'Coffee must be\ntoo strong!'],
    [require('url:./audio/guards/hmm nothing.mp3'), 'Hmm!\nNothing...'],
    [require('url:./audio/guards/cant hear now.mp3'), 'Well, I can\'t\nhear it now.'],
    [require('url:./audio/guards/nothing.mp3'), 'Nothing...'],
    [require('url:./audio/guards/hopefully nothing.mp3'), 'Hopefully\nnothing.'],
    [require('url:./audio/guards/hearing things.mp3'), 'I must be\nhearing things.'],
];

const guardInvestigateSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/hey.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-2.mp3'), 'Hey!'],
    [require('url:./audio/guards/hey-3.mp3'), 'Hey!'],
    [require('url:./audio/guards/What.mp3'), 'What?'],
    [require('url:./audio/guards/noise again.mp3'), 'That noise\nagain?'],
    [require('url:./audio/guards/someone there.mp3'), 'Someone\'s there!'],
    [require('url:./audio/guards/who could that be.mp3'), 'Who could\nthat be?'],
    [require('url:./audio/guards/there it is again.mp3'), 'There it\nis again.'],
    [require('url:./audio/guards/better check it out.mp3'), 'Better check\nit out.'],
    [require('url:./audio/guards/what keeps making those noises.mp3'), 'What keeps making\nthose noises?'],
    [require('url:./audio/guards/better be rats.mp3'), 'That better\nbe rats!'],
    [require('url:./audio/guards/again.mp3'), 'Again!?'],
    [require('url:./audio/guards/who that.mp3'), 'Who is that?'],
    [require('url:./audio/guards/come out come out.mp3'), 'Come out, come out\nwherever you are!'],
];

const guardFinishInvestigatingSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.mp3'), 'Hmm...'],
    [require('url:./audio/guards/jumpin shadows.mp3'), 'Jumpin\' at\nshadows!'],
    [require('url:./audio/guards/jumpy.mp3'), 'Jumpy!'],
    [require('url:./audio/guards/oh well.mp3'), 'Oh, well.'],
    [require('url:./audio/guards/guess nothing.mp3'), 'Guess it was\nnothing.'],
    [require('url:./audio/guards/wonder it was.mp3'), 'Wonder what it was.'],
    [require('url:./audio/guards/back to post.mp3'), 'Back to my post.'],
    [require('url:./audio/guards/quiet now.mp3'), 'All quiet now.'],
    [require('url:./audio/guards/sure I heard something.mp3'), 'I\'m sure I\nheard something.'],
    [require('url:./audio/guards/not there anymore.mp3'), 'Not there anymore.'],
    [require('url:./audio/guards/probably nothing.mp3'), 'Probably nothing.'],
    [require('url:./audio/guards/hmm nothing.mp3'), 'Hmm!\nNothing.'],
    [require('url:./audio/guards/i dont know why i work here.mp3'), 'I don\'t know why\nI work here.'],
    [require('url:./audio/guards/waste of my time.mp3'), 'Waste of my time.'],
    [require('url:./audio/guards/why do I even try.mp3'), 'Why do I\neven try?'],
    [require('url:./audio/guards/at least Im not on cleaning duty.mp3'), 'At least I\'m not\non cleaning duty.'],
    [require('url:./audio/guards/at least my shift ends soon.mp3'), 'At least my\nshift ends soon.'],
    [require('url:./audio/guards/what do you want me to do about it.mp3'), 'What do you\nwant me to\ndo about it?'],
];

const guardHearGuardSet: Array<SubtitledSoundDesc> = [ //Repond to guards that enter the chase set
    [require('url:./audio/guards/hey-3.mp3'), 'Hey!'],
    [require('url:./audio/guards/What.mp3'), 'What?'],
    [require('url:./audio/guards/where.mp3'), 'Where!?'],
    [require('url:./audio/guards/coming.mp3'), 'Coming!'],
    [require('url:./audio/guards/here I come.mp3'), 'Here I come!'],
    [require('url:./audio/guards/to arms.mp3'), 'To arms!'],
    [require('url:./audio/guards/what is it.mp3'), 'What is it!?'],
    [require('url:./audio/guards/i dont know how to whistle.mp3'), 'I don\'t know\nhow to whistle.'],
];

const guardChaseSet: Array<SubtitledSoundDesc> = [ //Yells a warning that will be heard by other guards
    [require('url:./audio/guards/whistle.mp3'), '(Whistle)'],
    [require('url:./audio/guards/whistle-2.mp3'), '(Whistle)'],
    [require('url:./audio/guards/whistle-3.mp3'), '(Whistle)'],
    [require('url:./audio/guards/get em.mp3'), 'Get \'em!'],
    [require('url:./audio/guards/intruder.mp3'), 'Intruder!'],
    [require('url:./audio/guards/oh no its a thief.mp3'), 'Oh no...\nIt\'s a thief!'],
    [require('url:./audio/guards/we coming for you.mp3'), 'We\'re coming\nfor you!'],
    [require('url:./audio/guards/coming for you.mp3'), 'Coming for you!'],
    [require('url:./audio/guards/halt.mp3'), 'Halt!'],
    [require('url:./audio/guards/see you.mp3'), 'We see you!'],
    [require('url:./audio/guards/ill get you.mp3'), 'I\'ll get you!'],
    [require('url:./audio/guards/a goner.mp3'), 'You\'re a goner!'],
    [require('url:./audio/guards/just you wait.mp3'), 'Just you wait!'],
    [require('url:./audio/guards/you wont get away.mp3'), 'You won\'t get away!'],
    [require('url:./audio/guards/no you dont.mp3'), 'No you don\'t!'],
    [require('url:./audio/guards/thief.mp3'), 'Thief!'],
    [require('url:./audio/guards/thief-2.mp3'), 'Thief!'],
    [require('url:./audio/guards/thief-3.mp3'), 'Thief!'],
    [require('url:./audio/guards/after them.mp3'), 'After them!'],
    [require('url:./audio/guards/what is thy business.mp3'), 'What is thy business\nwith this gold?'],
    [require('url:./audio/guards/no mercy for the wicked.mp3'), 'No mercy for\nthe wicked!'],
];

const guardEndChaseSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/lost em.mp3'), 'Lost \'im!'],
    [require('url:./audio/guards/must have run.mp3'), 'Must have\nrun off...'],
    [require('url:./audio/guards/oh well.mp3'), 'Oh, well...'],
    [require('url:./audio/guards/where they go.mp3'), 'Where did they go?'],
    [require('url:./audio/guards/his holiness.mp3'), 'His Holiness would\nnot be pleased!'],
    [require('url:./audio/guards/the boss.mp3'), 'The boss will\nnot be pleased!'],
    [require('url:./audio/guards/huff puff give up.mp3'), 'I give up!'],
    [require('url:./audio/guards/where did he go.mp3'), 'Where did he go!?'],
    [require('url:./audio/guards/drats lost him.mp3'), 'Drats!\nLost him!'],
    [require('url:./audio/guards/gone.mp3'), 'Gone!'],
    [require('url:./audio/guards/come back here.mp3'), 'Come back here!'],
    [require('url:./audio/guards/rotten scoundrel.mp3'), 'Rotten scoundrel!'],
    [require('url:./audio/guards/aargh.mp3'), 'Aargh!!'],
    [require('url:./audio/guards/not coming back.mp3'), 'He\'s not coming back!'],
    [require('url:./audio/guards/blast.mp3'), 'Blast!'],
    [require('url:./audio/guards/dont come back.mp3'), 'Don\'t come back!'],
    [require('url:./audio/guards/wont get away next time.mp3'), 'You won\'t\nget away\nnext time!'],
    [require('url:./audio/guards/for his holiness.mp3'), 'His Holiness is a\nlord of mercy!'],
    [require('url:./audio/guards/lousy day at work.mp3'), 'What a lousy day\nat work!'],
    [require('url:./audio/guards/i give up.mp3'), 'I give up...'],
    [require('url:./audio/guards/what do i do help me.mp3'), 'What do I do?\nHelp me, help me...'],
    [require('url:./audio/guards/oh no he got away.mp3'), 'Oh no,\nhe got away!'],
    [require('url:./audio/guards/guard rant.mp3'), '(Guard rant)'],
];

const guardAwakesWarningSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/ahh.mp3'), 'Someone smacked me!'],
    [require('url:./audio/guards/ahh.mp3'), 'Someone hit me!'],
    [require('url:./audio/guards/ahh.mp3'), 'Who hit me!?'],
]

const guardDownWarningSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/ahh.mp3'), 'We have a guard down!'],
    [require('url:./audio/guards/ahh.mp3'), 'Man down!'],
    [require('url:./audio/guards/ahh.mp3'), 'Guard down!'],
]

const guardStirringSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/ahh.mp3'), 'Ahh...'],
]

const guardWarningResponseSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/intruder.mp3'), 'We must have\nan intruder!'],
    [require('url:./audio/guards/intruder.mp3'), 'I will keep\nan eye out!'],
]

const guardDamageSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/take that.mp3'), 'Take that!!'],
    [require('url:./audio/guards/oof.mp3'), 'Oof!!'],
    [require('url:./audio/guards/uh.mp3'), 'Ugg!!'],
    [require('url:./audio/guards/ah.mp3'), 'Ahh!!'],
    [require('url:./audio/guards/ah-2.mp3'), 'Ahh!!'],
    [require('url:./audio/guards/ha ya.mp3'), 'Hi-yah!'],
    [require('url:./audio/guards/ha ya-2.mp3'), 'Hi-yah!'],
    [require('url:./audio/guards/ha ya-3.mp3'), 'Hi-yah!'],
];


export class ActiveHowlPool {
    activeHowls: Array<[Howl, number]>;
    activeLimit: number;
    fadeTime: number;
    constructor() {
        this.activeHowls = [];
        this.activeLimit = 2;
        this.fadeTime = 1000;
    }
    setFadetime(time=1000) {
        this.fadeTime = time;
        return this;
    }
    fade(howl:Howl, id:number) {
        if(this.fadeTime>0) {
            howl.fade(1,0,this.fadeTime, id);
            setTimeout(()=>howl.stop(id), this.fadeTime);
        } else {
            howl.stop(id);
        }
        return this;
    }
    empty() {
        for(let hDat of this.activeHowls) {
            this.fade(...hDat);
        }
        this.activeHowls = [];
        return this;
    }
    queue(howl:Howl, id:number) {
        this.activeHowls.unshift([howl, id]);
        if(this.activeHowls.length>this.activeLimit) {
            const hDat = this.activeHowls.pop() as [Howl, number];
            this.fade(...hDat)

        }
        this.activeHowls = this.activeHowls.slice(0, this.activeLimit);
        return this;
    }
}

export class HowlGroup {
    howls:Array<Howl>;
    howlNum:number;
    soundPool: ActiveHowlPool|null;
    
    constructor(files:Array<string>, soundPool:ActiveHowlPool|null=null) {
        this.howls = files.map((file)=>new Howl({src: [file]}))
        this.howlNum = 0;
        this.soundPool = soundPool;
        shuffleArray(this.howls);
    }
    play(volume:number):number {
        const howl = this.next();
        howl.volume(volume);
        try {
            const id = howl.play();
            if(this.soundPool!==null) this.soundPool.queue(howl, id);
            return id;
        }
        catch (error) {
            console.log(`Audio playback error ${howl}`,error)
        }
        return -1;
    }
    next(): Howl {
        this.howlNum++;
        if(this.howlNum==this.howls.length) {
            this.howlNum=0;
            shuffleArray(this.howls);
        }
        return this.howls[this.howlNum];
    }
}


export type SubtitledSound = {
    sound: Howl;
    subtitle: string;
}

export class SubtitledHowlGroup {
    sounds: Array<SubtitledSound>;
    soundNum: number;
    soundPool: ActiveHowlPool|null;
    mute: boolean;

    constructor(filesAndSubtitles: Array<[string, string]>, soundPool:ActiveHowlPool|null=null) {
        this.sounds = filesAndSubtitles.map(makeSubtitledSound);
        this.soundNum = 0;
        this.soundPool = soundPool;
        this.mute = false;
        shuffleArray(this.sounds);
    }
    play(volume:number): SubtitledSound {
        const subSound = this.next();
        if (!this.mute) {
            subSound.sound.volume(volume);
            const id = subSound.sound.play();
            if (this.soundPool !== null) {
                this.soundPool.queue(subSound.sound, id);
            }
        }
        return subSound;
    }
    next(): SubtitledSound {
        const subtitledSound = this.sounds[this.soundNum];
        ++this.soundNum;
        if (this.soundNum === this.sounds.length) {
            this.soundNum = 0;
            shuffleArray(this.sounds);
        }
        return subtitledSound;
    }
}

export type Howls = { [id:string]: HowlGroup};
export type SubtitledHowls = { [id:string]: SubtitledHowlGroup };

function makeSubtitledSound(fileAndSub: [string, string]): SubtitledSound {
    return { sound: new Howl({src: [fileAndSub[0]]}), subtitle: fileAndSub[1] };
}

export function setupSounds(sounds:Howls, subtitledSounds:SubtitledHowls, howlPool: ActiveHowlPool) {
    sounds.footstepWood = new HowlGroup([footstepWood]);
    sounds.footstepTile = new HowlGroup([footstepTile]);
    sounds.footstepWater = new HowlGroup([footstepWater]);
    sounds.footstepGravel = new HowlGroup([footstepGravel]);
    sounds.footstepGrass = new HowlGroup([footstepGrass]);
    sounds.footstepCreaky = new HowlGroup(footstepCreakSet);

    sounds.victorySong = new HowlGroup([victorySong]);
    sounds.levelRequirementJingle = new HowlGroup([levelRequirementJingle], howlPool);
    sounds.levelCompleteJingle = new HowlGroup([levelCompleteJingle], howlPool);
    sounds.gameOverJingle = new HowlGroup([gameOverJingle], howlPool);
    sounds.easterEgg = new HowlGroup([easterEgg], howlPool);
    sounds.hitPlayer = new HowlGroup(hitPlayerSet);
    sounds.hitGuard = new HowlGroup(hitGuardSet);
    sounds.coin = new HowlGroup(coinSet);

    sounds.grunt = new HowlGroup(gruntSet),
    sounds.douse = new HowlGroup(douseSet),
    sounds.ignite = new HowlGroup(igniteSet),
    sounds.hide = new HowlGroup(hideSet),
    sounds.gate = new HowlGroup(gateSet),
    sounds.splash = new HowlGroup(splashSet),
    sounds.waterEnter = new HowlGroup(waterEnterSet),
    sounds.waterExit = new HowlGroup(waterExitSet),
    sounds.jump = new HowlGroup(jumpSet),
    sounds.tooHigh = new HowlGroup(tooHighSet),

    subtitledSounds.guardInvestigate = new SubtitledHowlGroup(guardInvestigateSet, howlPool);
    subtitledSounds.guardFinishInvestigating = new SubtitledHowlGroup(guardFinishInvestigatingSet, howlPool);
    subtitledSounds.guardSeeThief = new SubtitledHowlGroup(guardSeeThiefSet), howlPool;
    subtitledSounds.guardFinishLooking = new SubtitledHowlGroup(guardFinishLookingSet, howlPool);
    subtitledSounds.guardChase = new SubtitledHowlGroup(guardChaseSet, howlPool);
    subtitledSounds.guardEndChase = new SubtitledHowlGroup(guardEndChaseSet, howlPool);
    subtitledSounds.guardHearGuard = new SubtitledHowlGroup(guardHearGuardSet, howlPool);
    subtitledSounds.guardHearThief = new SubtitledHowlGroup(guardHearThiefSet, howlPool);
    subtitledSounds.guardAwakesWarning = new SubtitledHowlGroup(guardAwakesWarningSet, howlPool);
    subtitledSounds.guardDownWarning = new SubtitledHowlGroup(guardDownWarningSet, howlPool);
    subtitledSounds.guardWarningResponse = new SubtitledHowlGroup(guardWarningResponseSet, howlPool);
    subtitledSounds.guardFinishListening = new SubtitledHowlGroup(guardFinishListeningSet, howlPool);
    subtitledSounds.guardDamage = new SubtitledHowlGroup(guardDamageSet, howlPool);
    subtitledSounds.guardStirring = new SubtitledHowlGroup(guardStirringSet, howlPool);
}
