import {Howl} from 'howler';
import {shuffleArray} from './random';
import {Guard} from './guard';

const titleSong = require('url:./audio/Minstrel_Dance.mp3');
const levelRequirementJingle = require('url:./audio/level-requirement-1.ogg');
const levelCompleteJingle = require('url:./audio/level-requirement-2.ogg');
const gameOverJingle = require('url:./audio/lose-game-over.ogg');
const easterEgg = require('url:./audio/Minstrel Dance Easter Egg.ogg');
const footstepWood = require('url:./audio/footstep-wood.ogg');
const footstepTile = require('url:./audio/footstep-tile.ogg');
const footstepWater = require('url:./audio/footstep-water.ogg');
const footstepGravel = require('url:./audio/footstep-gravel.ogg');
const footstepGrass = require('url:./audio/footstep-grass.ogg');

const footstepCreakSet =[
    require('url:./audio/creak.ogg'),
    require('url:./audio/creak-2.ogg'),
    require('url:./audio/creak-3.ogg'),
    require('url:./audio/creak-4.ogg'),
    require('url:./audio/creak-5.ogg'),
    require('url:./audio/creak-6.ogg'),
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
]

const coinSet = [
    require('url:./audio/coin.ogg'),
    require('url:./audio/coin-2.ogg'),
    require('url:./audio/coin-3.ogg'),
    require('url:./audio/coin-4.ogg'),    
    require('url:./audio/coin-5.ogg'),    
]

type SubtitledSoundDesc = [string, string];

const guardSeeThiefSet:Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/What.ogg'), 'What?'],    
    [require('url:./audio/guards/hey.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-2.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-3.ogg'), 'Hey!'],
    [require('url:./audio/guards/what was that.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-2.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-3.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-4.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-5.ogg'), 'What was that?'],
    [require('url:./audio/guards/who goes there.ogg'), 'Who goes there?'],
    [require('url:./audio/guards/huh.ogg'), 'Huh?'],
    [require('url:./audio/guards/What.ogg'), 'What?'],
    [require('url:./audio/guards/wha.ogg'), 'Wha...'],
    [require('url:./audio/guards/wait.ogg'), 'Wait!'],
    [require('url:./audio/guards/who there.ogg'), 'Who\'s out there?'],
    [require('url:./audio/guards/what moved.ogg'), 'What moved?'],
    [require('url:./audio/guards/what in the shadows.ogg'), 'What\' in the shadows?'],
    [require('url:./audio/guards/shadow move.ogg'), 'Did the shadows move?'],
    [require('url:./audio/guards/see something.ogg'), 'Did I see something?'],
    [require('url:./audio/guards/hello.ogg'), 'Hello?'],
    [require('url:./audio/guards/ugh.ogg'), 'Ugh...'],
];

const guardFinishLookingSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/What.ogg'), 'What?'],
    [require('url:./audio/guards/what was that.ogg'), 'What was that?'],
    [require('url:./audio/guards/quiet out.ogg'), 'Quiet out...'],
    [require('url:./audio/guards/jumpy.ogg'), 'Jumpy tonight...'],
    [require('url:./audio/guards/jumpin shadows.ogg'), 'I\'m jumpin\' at shadows...'],
    [require('url:./audio/guards/ahh.ogg'), 'Ahh...'],
    [require('url:./audio/guards/ahh.ogg'), 'Ahh...'],
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/aww.ogg'), 'Aww...'],
    [require('url:./audio/guards/rest me bones.ogg'), 'Rest me bones...'],
    [require('url:./audio/guards/oh well.ogg'), 'Oh well...'],
    [require('url:./audio/guards/case of the jitters.ogg'), 'Case of the jitters...'],
    [require('url:./audio/guards/must be seeing.ogg'), 'Must be seeing...'],
    [require('url:./audio/guards/what in my coffee.ogg'), 'What\'s in my coffee today?'],
    [require('url:./audio/guards/coffee too strong.ogg'), 'Coffee must be too strong!'],
    [require('url:./audio/guards/hmm nothing.ogg'), 'Hmm nothing...'],
    [require('url:./audio/guards/well I though I saw.ogg'), 'Well I though I saw something.'],
    [require('url:./audio/guards/nothing.ogg'), 'Nothing...'],
    [require('url:./audio/guards/hopefully nothing.ogg'), 'Hopefully nothing.'],
    [require('url:./audio/guards/seeing things.ogg'), 'Must be seeing things...'],
    [require('url:./audio/guards/seeing things.ogg'), 'I must be seeing things.'],
];

const guardHearThiefSet:Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/What.ogg'), 'What?'] ,   
    [require('url:./audio/guards/what-2.ogg'), 'What?'] ,   
    [require('url:./audio/guards/hey.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-2.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-3.ogg'), 'Hey!'],
    [require('url:./audio/guards/what was that.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-2.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-3.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-4.ogg'), 'What was that?'],
    [require('url:./audio/guards/what was that-5.ogg'), 'What was that?'],
    [require('url:./audio/guards/huh.ogg'), 'Huh?'],
    [require('url:./audio/guards/What.ogg'), 'What?'],
    [require('url:./audio/guards/wha.ogg'), 'Wha...'],
    [require('url:./audio/guards/wait.ogg'), 'Wait!'],
    [require('url:./audio/guards/who there.ogg'), 'Who\'s out there?'],
    [require('url:./audio/guards/hello.ogg'), 'Hello?'],
    [require('url:./audio/guards/ugh.ogg'), 'Ugh...'],
    [require('url:./audio/guards/hark.ogg'), 'Hark?'],
    [require('url:./audio/guards/noise.ogg'), 'What was that noise?'],
    [require('url:./audio/guards/heard something.ogg'), 'I heard something...'],
];

const guardFinishListeningSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/what was that.ogg'), 'What was that?'],
    [require('url:./audio/guards/quiet out.ogg'), 'Quiet out...'],
    [require('url:./audio/guards/jumpy.ogg'), 'Jumpy tonight...'],
    [require('url:./audio/guards/ahh.ogg'), 'Ahh...'],
    [require('url:./audio/guards/ahh.ogg'), 'Ahh...'],
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/aww.ogg'), 'Aww...'],
    [require('url:./audio/guards/rest me bones.ogg'), 'Rest me bones...'],
    [require('url:./audio/guards/oh well.ogg'), 'Oh well...'],
    [require('url:./audio/guards/case of the jitters.ogg'), 'Case of the jitters...'],
    [require('url:./audio/guards/what in my coffee.ogg'), 'What\'s in my coffee today?'],
    [require('url:./audio/guards/coffee too strong.ogg'), 'Coffee must be too strong!'],
    [require('url:./audio/guards/hmm nothing.ogg'), 'Hmm nothing...'],
    [require('url:./audio/guards/cant hear now.ogg'), 'Can\'t hear it now.'],
    [require('url:./audio/guards/nothing.ogg'), 'Nothing...'],
    [require('url:./audio/guards/hopefully nothing.ogg'), 'Hopefully nothing.'],
    [require('url:./audio/guards/hearing things.ogg'), 'I must be hearing things.'],
];

const guardInvestigateSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/hey.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-2.ogg'), 'Hey!'],
    [require('url:./audio/guards/hey-3.ogg'), 'Hey!'],
    [require('url:./audio/guards/What.ogg'), 'What?'],
    [require('url:./audio/guards/noise again.ogg'), 'That noise again?'],
    [require('url:./audio/guards/someone there.ogg'), 'Someone there?'],
    [require('url:./audio/guards/who could that be.ogg'), 'Who could that be?'],
    [require('url:./audio/guards/there it is again.ogg'), 'There it is again.'],
    [require('url:./audio/guards/better check it out.ogg'), 'Better check it out.'],
    [require('url:./audio/guards/what keeps making those noises.ogg'), 'What keeps making those noises?'],
    [require('url:./audio/guards/better be rats.ogg'), 'Better be rats!'],
    [require('url:./audio/guards/again.ogg'), 'Again!?'],
    [require('url:./audio/guards/who that.ogg'), 'Who is that?'],
    [require('url:./audio/guards/come out come out.ogg'), 'Come out, Come out!'],
];

const guardFinishInvestigatingSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'],
    [require('url:./audio/guards/jumpin shadows.ogg'), 'Jumpin\' at shadows!'],
    [require('url:./audio/guards/jumpy.ogg'), 'Jumpy!'],
    [require('url:./audio/guards/oh well.ogg'), 'Oh, well.'],
    [require('url:./audio/guards/guess nothing.ogg'), 'Guess it was nothing.'],
    [require('url:./audio/guards/wonder it was.ogg'), 'Wonder what it was.'],
    [require('url:./audio/guards/back to post.ogg'), 'Back to my post.'],
    [require('url:./audio/guards/quiet now.ogg'), 'All quiet now.'],
    [require('url:./audio/guards/sure I heard something.ogg'), 'I\'m sure I heard something.'],
    [require('url:./audio/guards/not there anymore.ogg'), 'Not there anymore.'],
    [require('url:./audio/guards/probably nothing.ogg'), 'Probably nothing.'],
    [require('url:./audio/guards/hmm nothing.ogg'), 'Hmm, nothing.'],
    [require('url:./audio/guards/i dont know why i work here.ogg'), 'I dont know why i work here.'],
    [require('url:./audio/guards/waste of my time.ogg'), 'Waste of my time.'],
    [require('url:./audio/guards/why do I even try.ogg'), 'Why do I even try.'],
    [require('url:./audio/guards/at least Im not on cleaning duty.ogg'), 'At least Im not on cleaning duty.'],
    [require('url:./audio/guards/at least my shift ends soon.ogg'), 'At least my shift ends soon.'],
    [require('url:./audio/guards/what do you want me to do about it.ogg'), 'What do you want me to do about it?'],
];

const guardHearGuardSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/whistle.ogg'), '(Whistles to other guard)'],
    [require('url:./audio/guards/whistle-2.ogg'), '(Whistles to other guard)'],
    [require('url:./audio/guards/whistle-3.ogg'), '(Whistles to other guard)'],
    [require('url:./audio/guards/hey-3.ogg'), '(To other guard) Hey!'],
    [require('url:./audio/guards/What.ogg'), '(To other guard) What?'],
    [require('url:./audio/guards/where.ogg'), '(To other guard) Where!?'],
    [require('url:./audio/guards/coming.ogg'), '(To other guard) Coming!'],
    [require('url:./audio/guards/here I come.ogg'), '(To other guard) Here I come!'],
    [require('url:./audio/guards/to arms.ogg'), '(To other guard) To arms!'],
    [require('url:./audio/guards/what is it.ogg'), '(To other guard) What is it!?'],
    [require('url:./audio/guards/i dont know how to whistle.ogg'), '(To other guard) I dont know how to whistle.'],
];

const guardChaseSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/get em.ogg'), 'Get \'em!'],
    [require('url:./audio/guards/intruder.ogg'), 'Intruder!'],
    [require('url:./audio/guards/oh no its a thief.ogg'), 'Oh no... it\'s a thief.'],
    [require('url:./audio/guards/we coming for you.ogg'), 'We\'re coming for you!'],
    [require('url:./audio/guards/coming for you.ogg'), 'Coming for you!'],
    [require('url:./audio/guards/halt.ogg'), 'Halt!'],
    [require('url:./audio/guards/see you.ogg'), 'We see you!'],
    [require('url:./audio/guards/ill get you.ogg'), 'I\'ll get you!'],
    [require('url:./audio/guards/a goner.ogg'), 'You\'re a goner!'],
    [require('url:./audio/guards/just you wait.ogg'), 'Just you wait!'],
    [require('url:./audio/guards/you wont get away.ogg'), 'You won\'t get away!'],
    [require('url:./audio/guards/no you dont.ogg'), 'No you dont!'],
    [require('url:./audio/guards/thief.ogg'), 'Thief!'],
    [require('url:./audio/guards/thief-2.ogg'), 'Thief!'],
    [require('url:./audio/guards/thief-3.ogg'), 'Thief!'],
    [require('url:./audio/guards/after them.ogg'), 'After them!'],
    [require('url:./audio/guards/what is thy business.ogg'), 'What is thy business with this gold?'],
    [require('url:./audio/guards/no mercy for the wicked.ogg'), 'No mercy for the wicked!'],
];

const guardEndChaseSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/lost em.ogg'), 'Lost \'em!'],
    [require('url:./audio/guards/must have run.ogg'), 'Must have run off...'],
    [require('url:./audio/guards/oh well.ogg'), 'Oh, well...'],
    [require('url:./audio/guards/where they go.ogg'), 'Where did they go?'],
    [require('url:./audio/guards/his holiness.ogg'), 'His Holiness would not be pleased!'],
    [require('url:./audio/guards/the boss.ogg'), 'The boss will not be pleased!'],
    [require('url:./audio/guards/huff puff give up.ogg'), '(huffing) I give up!'],
    [require('url:./audio/guards/where did he go.ogg'), 'Where did he go!?'],
    [require('url:./audio/guards/drats lost him.ogg'), 'Drats lost him!'],
    [require('url:./audio/guards/gone.ogg'), 'Gone!'],
    [require('url:./audio/guards/come back here.ogg'), 'Come back here!'],
    [require('url:./audio/guards/rotten scoundrel.ogg'), 'Rotten scoundrel!'],
    [require('url:./audio/guards/aargh.ogg'), 'Aargh!!'],
    [require('url:./audio/guards/not coming back.ogg'), 'He\'s not coming back!'],
    [require('url:./audio/guards/blast.ogg'), 'Blast!'],
    [require('url:./audio/guards/dont come back.ogg'), 'Don\'t come back!'],
    [require('url:./audio/guards/wont get away next time.ogg'), 'You won\'t get away next time!'],
    [require('url:./audio/guards/for his holiness.ogg'), 'His Holiness is a lord of mercy!'],
    [require('url:./audio/guards/lousy day at work.ogg'), 'What a lousy day at work!'],
    [require('url:./audio/guards/i give up.ogg'), 'I give up...'],
    [require('url:./audio/guards/what do i do help me.ogg'), 'What do i do help me, help me...'],
    [require('url:./audio/guards/oh no he got away.ogg'), 'Oh no, he got away!'],
    [require('url:./audio/guards/guard rant.ogg'), '(guard rant)'],
];

const guardDamageSet: Array<SubtitledSoundDesc> = [
    [require('url:./audio/guards/take that.ogg'), 'Take that!!'],
    [require('url:./audio/guards/oof.ogg'), 'Oof!!'],
    [require('url:./audio/guards/uh.ogg'), 'Ugg!!'],
    [require('url:./audio/guards/ah.ogg'), 'Ahh!!'],
    [require('url:./audio/guards/ah-2.ogg'), 'Ahh!!'],
    [require('url:./audio/guards/ha ya.ogg'), 'Aiyah!'],
    [require('url:./audio/guards/ha ya-2.ogg'), 'Aiyah!'],
    [require('url:./audio/guards/ha ya-3.ogg'), 'Aiyah!'],
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
        this.activeHowls.unshift([howl, id]);
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
        const id = howl.play()
        if(this.soundPool!==null) this.soundPool.queue(howl, id);
        return id;
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

    constructor(filesAndSubtitles: Array<[string, string]>, soundPool:ActiveHowlPool|null=null) {
        this.sounds = filesAndSubtitles.map(makeSubtitledSound);
        this.soundNum = 0;
        this.soundPool = null;
        shuffleArray(this.sounds);
    }
    play(volume:number):SubtitledSound {
        const subSound = this.next();
        subSound.sound.volume(volume);
        const id = subSound.sound.play()
        if(this.soundPool!==null) this.soundPool.queue(subSound.sound, id);
        return subSound;
    }
    next(): SubtitledSound {
        const subtitledSound = this.sounds[this.soundNum];
        ++this.soundNum;
        if (this.soundNum==this.sounds.length) {
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

    sounds.titleSong = new HowlGroup([titleSong]);
    sounds.levelRequirementJingle = new HowlGroup([levelRequirementJingle], howlPool);
    sounds.levelCompleteJingle = new HowlGroup([levelCompleteJingle], howlPool);
    sounds.gameOverJingle = new HowlGroup([gameOverJingle], howlPool);
    sounds.easterEgg = new HowlGroup([easterEgg], howlPool);
    sounds.hitPlayer = new HowlGroup(hitPlayerSet);
    sounds.coin = new HowlGroup(coinSet);
    
    subtitledSounds.guardInvestigate = new SubtitledHowlGroup(guardInvestigateSet, howlPool);
    subtitledSounds.guardFinishInvestigating = new SubtitledHowlGroup(guardFinishInvestigatingSet, howlPool);
    subtitledSounds.guardSeeThief = new SubtitledHowlGroup(guardSeeThiefSet), howlPool;
    subtitledSounds.guardFinishLookingSet = new SubtitledHowlGroup(guardFinishLookingSet, howlPool);
    subtitledSounds.guardChase = new SubtitledHowlGroup(guardChaseSet, howlPool);
    subtitledSounds.guardEndChase = new SubtitledHowlGroup(guardEndChaseSet, howlPool);
    subtitledSounds.guardHearGuard = new SubtitledHowlGroup(guardHearGuardSet, howlPool);
    subtitledSounds.guardHearThief = new SubtitledHowlGroup(guardHearThiefSet, howlPool);
    subtitledSounds.guardFinishListening = new SubtitledHowlGroup(guardFinishListeningSet, howlPool);
    subtitledSounds.guardDamage = new SubtitledHowlGroup(guardDamageSet, howlPool);

}
