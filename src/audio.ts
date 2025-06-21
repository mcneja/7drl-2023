import { Howl, Howler } from 'howler';
import { shuffleArray } from './random';

export { Howler };

function audioURL(fileName: string): string {
    return new URL(`./audio/${fileName}`, import.meta.url).href;
}

function hitAudioURL(fileName: string): string {
    return new URL(`./audio/hitting/${fileName}`, import.meta.url).href;
}

const victorySong = audioURL('Minstrel_Dance.mp3');
const levelRequirementJingle = audioURL('level-requirement-1.mp3');
const levelCompleteJingle = audioURL('level-requirement-2.mp3');
const gameOverJingle = audioURL('lose-game-over.mp3');
const easterEgg = audioURL('Minstrel Dance Easter Egg.mp3');

const footstepWood = audioURL('footstep-wood.mp3');
const footstepTile = audioURL('footstep-tile.mp3');
const footstepWater = audioURL('footstep-water.mp3');
const footstepGravel = audioURL('footstep-gravel.mp3');
const footstepGrass = audioURL('footstep-grass.mp3');

const footstepCreakSet = [
    audioURL('creak-7.mp3'),
    audioURL('creak-8.mp3'),
    audioURL('creak-9.mp3'),
    audioURL('creak-10.mp3'),
    audioURL('creak-11.mp3'),
    audioURL('creak-12.mp3'),
];

const hitPlayerSet = [
    hitAudioURL('hit16.mp3.flac'),
    hitAudioURL('hit17.mp3.flac'),
    hitAudioURL('hit18.mp3.flac'),
    hitAudioURL('hit19.mp3.flac'),
    hitAudioURL('hit20.mp3.flac'),
    hitAudioURL('hit26.mp3.flac'),
    hitAudioURL('hit27.mp3.flac'),
];

const hitGuardSet = [
    hitAudioURL('hit26.mp3.flac'),
];

const coinRattleSet = [
    audioURL('coin-rattle.mp3'),
];

const coinSet = [
    audioURL('coin.mp3'),
    audioURL('coin-2.mp3'),
    audioURL('coin-3.mp3'),
    audioURL('coin-4.mp3'),
    audioURL('coin-5.mp3'),
];

const gruntSet = [
    audioURL('grunt.mp3'),
    audioURL('grunt-2.mp3'),
    audioURL('grunt-3.mp3'),
    audioURL('grunt-4.mp3'),
    audioURL('grunt-5.mp3'),
    audioURL('grunt-6.mp3'),
    audioURL('grunt-7.mp3'),
    audioURL('grunt-8.mp3'),
];

const douseSet = [
    audioURL('douse.mp3'),
    audioURL('douse-2.mp3'),
    audioURL('douse-3.mp3'),
    audioURL('douse-4.mp3'),
];

const clockChimeSet = [
    audioURL('chiming-clock-short.mp3'),
];

const clockTickSet = [
    audioURL('ticking-clock.mp3'),
];

const foodSet = [
    audioURL('eating.mp3'),
]

const grabKeySet = [
    audioURL('grab-key.mp3'),
    audioURL('grab-key-2.mp3'),
]

const igniteSet = [
    audioURL('ignite.mp3'),
    audioURL('ignite-2.mp3'),
];

const hideSet = [
    audioURL('hide.mp3'),
    audioURL('hide-2.mp3'),
    audioURL('hide-3.mp3'),
    audioURL('hide-4.mp3'),
    audioURL('hide-5.mp3'),
    audioURL('hide-6.mp3'),
];

const gateSet = [
    audioURL('gate.mp3'),
    audioURL('gate-2.mp3'),
    audioURL('gate-3.mp3'),
    audioURL('gate-4.mp3'),
    audioURL('gate-5.mp3'),
];

const thumpSet = [
    audioURL('thump.mp3'),
]

const splashSet = [
    audioURL('splash1.mp3'),
    audioURL('splash2.mp3'),
]

const waterAmbientSet = [
    audioURL('water-ambient.mp3'),
    audioURL('water-ambient-2.mp3'),
]

const kitchenAmbientSet = [
    audioURL('fire.mp3'),
    audioURL('fire-and-boil.mp3'),
]

const outdoorAmbientSet = [
    audioURL('outdoor-ambient.mp3'),
    audioURL('outdoor-ambient-2.mp3'),
    audioURL('outdoor-ambient-3.mp3'),
    audioURL('outdoor-ambient-4.mp3'),
]

const doorOpenSet = [
    audioURL('guard-door.mp3'),
]

const doorCloseSet = [
    audioURL('door-close.mp3'),
]

const doorOpenLockedSet = [
    audioURL('door-unlock-and-open.mp3'),
]

const doorCloseLockedSet = [
    audioURL('door-close-and-lock.mp3'),
]

const playerDoorOpenSet = [
    audioURL('player-door-open.mp3'),
]

const playerDoorCloseSet = [
    audioURL('player-door-close.mp3'),
]

const playerDoorOpenLockedSet = [
    audioURL('player-door-unlock-and-open.mp3'),
]

const playerDoorCloseLockedSet = [
    audioURL('player-door-close-and-lock.mp3'),
]

const waterEnterSet = [
    audioURL('water-submerge.mp3'),
]

const waterExitSet = [
    audioURL('water-exit.mp3'),
]

const jumpSet = [
    audioURL('jump.mp3'),
    audioURL('jump-2.mp3'),
];

const treasureAlarmSet = [
    audioURL('alarm.mp3'),
]

const switchProgressSet = [
    audioURL('switch-progress.mp3'),
];

const switchResetSet = [
    audioURL('switch-reset.mp3'),
];

const switchSuccessSet = [
    audioURL('switch-success.mp3'),
];

const tooHighSet = [
    audioURL('too high.mp3'),
    audioURL('too high-2.mp3'),
];

type SubtitledSoundDesc = [string, string];

function subtitledLine(fileName: string, subtitle: string): SubtitledSoundDesc {
    return [new URL(`./audio/guards/${fileName}`, import.meta.url).href, subtitle];
}

const guardSeeThiefSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('What.mp3', 'What?'),    
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
    subtitledLine('what was that.mp3', 'What was that?'),
    subtitledLine('what was that-2.mp3', 'What was that?'),
    subtitledLine('what was that-3.mp3', 'What was that?'),
    subtitledLine('what was that-4.mp3', 'What was that?'),
    subtitledLine('what was that-5.mp3', 'What was that?'),
    subtitledLine('who goes there.mp3', 'Who goes there?'),
    subtitledLine('huh.mp3', 'Huh?'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('wha.mp3', 'Wha...'),
    subtitledLine('wait.mp3', 'Wait!'),
    subtitledLine('who there.mp3', 'Who\'s there?'),
    subtitledLine('what moved.mp3', 'What moved?'),
    subtitledLine('what in the shadows.mp3', 'What\'s that\nin the shadows?'),
    subtitledLine('shadow move.mp3', 'Did that\nshadow move?'),
    subtitledLine('see something.mp3', 'I see\nsomething!'),
    subtitledLine('hello.mp3', 'Hello?'),
    subtitledLine('ugh.mp3', 'Uhh...'),
];

// TODO: We don't have a guard rest state to attach these to.
const guardRestSet: Array<SubtitledSoundDesc> = [
    subtitledLine('ahh.mp3', 'Ahh...'),
    subtitledLine('aww.mp3', 'Aww...'),
    subtitledLine('quiet out.mp3', 'Quiet out...'),
    subtitledLine('rest me bones.mp3', 'Rest me old\nbones...'),
];

const guardFinishLookingSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('what was that.mp3', 'What was that?'),
    subtitledLine('quiet out.mp3', 'Quiet out\nthere...'),
    subtitledLine('jumpy.mp3', 'Jumpy tonight...'),
    subtitledLine('jumpin shadows.mp3', 'Jumpin\' at\nshadows!'),
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('oh well.mp3', 'Oh well...'),
    subtitledLine('case of the jitters.mp3', 'I\'ve got myself\na case of the\njitters...'),
    subtitledLine('must be seeing.mp3', 'I must be\nseein\' things...'),
    subtitledLine('what in my coffee.mp3', 'What\'d they put\nin my coffee?'),
    subtitledLine('coffee too strong.mp3', 'Coffee must be\ntoo strong!'),
    subtitledLine('hmm nothing.mp3', 'Hmm!\nNothing...'),
    subtitledLine('well I though I saw.mp3', 'Well, I thought\nI saw something.'),
    subtitledLine('nothing.mp3', 'Nothing...'),
    subtitledLine('hopefully nothing.mp3', 'Hopefully\nnothing.'),
    subtitledLine('seeing things.mp3', 'Seein\' things,\nI guess.'),
    subtitledLine('seeing things.mp3', 'Seein\' things,\nI guess.'),
];

const guardFinishLookingAtLitTorchSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('what was that.mp3', 'What was that?'),
    subtitledLine('jumpy.mp3', 'Jumpy tonight...'),
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('oh well.mp3', 'Oh well...'),
    subtitledLine('case of the jitters.mp3', 'I\'ve got myself\na case of the\njitters...'),
    subtitledLine('must be seeing.mp3', 'I must be\nseein\' things...'),
    subtitledLine('what in my coffee.mp3', 'What\'d they put\nin my coffee?'),
    subtitledLine('coffee too strong.mp3', 'Coffee must be\ntoo strong!'),
    subtitledLine('hmm nothing.mp3', 'Hmm!\nNothing...'),
    subtitledLine('nothing.mp3', 'Nothing...'),
    subtitledLine('hopefully nothing.mp3', 'Hopefully\nnothing.'),
    subtitledLine('seeing things.mp3', 'Seein\' things,\nI guess.'),
    subtitledLine('seeing things.mp3', 'Seein\' things,\nI guess.'),
];

const guardHearThiefSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('what-2.mp3', 'What?'),
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
    subtitledLine('what was that.mp3', 'What was that?'),
    subtitledLine('what was that-2.mp3', 'What was that?'),
    subtitledLine('what was that-3.mp3', 'What was that?'),
    subtitledLine('what was that-4.mp3', 'What was that?'),
    subtitledLine('what was that-5.mp3', 'What was that?'),
    subtitledLine('huh.mp3', 'Huh?'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('wha.mp3', 'Wha...'),
    subtitledLine('wait.mp3', 'Wait!'),
    subtitledLine('who there.mp3', 'Who\'s there?'),
    subtitledLine('hello.mp3', 'Hello?'),
    subtitledLine('ugh.mp3', 'Uhh...'),
    subtitledLine('hark.mp3', 'Hark?'),
    subtitledLine('noise.mp3', 'What was that noise?'),
    subtitledLine('noise.mp3', 'What was that noise?'),
    subtitledLine('heard something.mp3', 'I heard something...'),
    subtitledLine('heard something.mp3', 'I heard something...'),
];

const guardFinishListeningSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('jumpy.mp3', 'Jumpy tonight...'),
    subtitledLine('oh well.mp3', 'Oh well...'),
    subtitledLine('case of the jitters.mp3', 'I\'ve got myself\na case of the\njitters...'),
    subtitledLine('what in my coffee.mp3', 'What\'s in my\ncoffee today?'),
    subtitledLine('coffee too strong.mp3', 'Coffee must be\ntoo strong!'),
    subtitledLine('hmm nothing.mp3', 'Hmm!\nNothing...'),
    subtitledLine('cant hear now.mp3', 'Well, I can\'t\nhear it now.'),
    subtitledLine('nothing.mp3', 'Nothing...'),
    subtitledLine('hopefully nothing.mp3', 'Hopefully\nnothing.'),
    subtitledLine('hearing things.mp3', 'I must be\nhearing things.'),
];

const guardInvestigateSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('noise again.mp3', 'That noise\nagain?'),
    subtitledLine('someone there.mp3', 'Someone\'s there!'),
    subtitledLine('who could that be.mp3', 'Who could\nthat be?'),
    subtitledLine('better check it out.mp3', 'Better check\nit out.'),
    subtitledLine('better be rats.mp3', 'That better\nbe rats!'),
    subtitledLine('who that.mp3', 'Who is that?'),
    subtitledLine('come out come out.mp3', 'Come out, come out\nwherever you are!'),
    // TODO: These ones would ideally only play after a player has been heard once before
    // subtitledLine('again.mp3', 'Again!?'),
    // subtitledLine('there it is again.mp3', 'There it\nis again.'),
    // subtitledLine('what keeps making those noises.mp3', 'What keeps making\nthose noises?'),
];

// TODO: When the thief has been chased, many of these lines will no longer seem appropriate
// Perhaps need to disambiguate the state in some way 
// (guardFinishedInvestigateButUnseen gaurdFinishedInvestigateAndSeen or something)

const guardFinishInvestigatingSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('jumpin shadows.mp3', 'Jumpin\' at\nshadows!'),
    subtitledLine('jumpy.mp3', 'Jumpy!'),
    subtitledLine('oh well.mp3', 'Oh, well.'),
    subtitledLine('guess nothing.mp3', 'Guess it was\nnothing.'),
    subtitledLine('wonder it was.mp3', 'Wonder what it was.'),
    subtitledLine('back to post.mp3', 'Back to my post.'),
    subtitledLine('quiet now.mp3', 'All quiet now.'),
    subtitledLine('sure I heard something.mp3', 'I\'m sure I\nheard something.'),
    subtitledLine('not there anymore.mp3', 'Not there anymore.'),
    subtitledLine('probably nothing.mp3', 'Probably nothing.'),
    subtitledLine('hmm nothing.mp3', 'Hmm!\nNothing.'),
    subtitledLine('i dont know why i work here.mp3', 'I don\'t know why\nI work here.'),
    subtitledLine('waste of my time.mp3', 'Waste of my time.'),
    subtitledLine('why do I even try.mp3', 'Why do I\neven try?'),
    subtitledLine('at least Im not on cleaning duty.mp3', 'At least I\'m not\non cleaning duty.'),
    subtitledLine('at least my shift ends soon.mp3', 'At least my\nshift ends soon.'),
    subtitledLine('what do you want me to do about it.mp3', 'What do you\nwant me to\ndo about it?'),
];

// TODO: If we split this group up for guards that are in the same room vs another room
// we could use more of these
const guardHearGuardSet: Array<SubtitledSoundDesc> = [ //Repond to guards that enter the chase set
    subtitledLine('hey-3.mp3', 'Hey!'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('coming.mp3', 'Coming!'),
    subtitledLine('to arms.mp3', 'To arms!'),
];

const guardSeeUnlitTorchSet: Array<SubtitledSoundDesc> = [
    subtitledLine('torch-out.mp3', 'That torch is out!'),
    subtitledLine('torch-out-2.mp3', 'That light\nburned out!'),
    subtitledLine('too-dark.mp3', 'It\'s too dark\nin here.'),
    subtitledLine('more-light.mp3', 'Let\'s have\nmore light.'),
]

const guardFinishLightingTorchSet: Array<SubtitledSoundDesc> = [
    subtitledLine('that-better.mp3', 'That\'s better.'),
    subtitledLine('there-we-go.mp3', 'There we go.'),
    subtitledLine('where-was-i.mp3', 'Now where was I?'),
]

const guardChaseSet: Array<SubtitledSoundDesc> = [ //Yells a warning that will be heard by other guards
    subtitledLine('whistle.mp3', '(Whistle)'),
    subtitledLine('whistle-2.mp3', '(Whistle)'),
    subtitledLine('whistle-3.mp3', '(Whistle)'),
    subtitledLine('get em.mp3', 'Get \'em!'),
    subtitledLine('intruder.mp3', 'Intruder!'),
    subtitledLine('oh no its a thief.mp3', 'Oh no...\nIt\'s a thief!'),
    subtitledLine('we coming for you.mp3', 'We\'re coming\nfor you!'),
    subtitledLine('coming for you.mp3', 'Coming for you!'),
    subtitledLine('halt.mp3', 'Halt!'),
    subtitledLine('see you.mp3', 'We see you!'),
    subtitledLine('ill get you.mp3', 'I\'ll get you!'),
    subtitledLine('a goner.mp3', 'You\'re a goner!'),
    subtitledLine('just you wait.mp3', 'Just you wait!'),
    subtitledLine('you wont get away.mp3', 'You won\'t get away!'),
    subtitledLine('no you dont.mp3', 'No you don\'t!'),
    subtitledLine('thief.mp3', 'Thief!'),
    subtitledLine('thief-2.mp3', 'Thief!'),
    subtitledLine('thief-3.mp3', 'Thief!'),
    subtitledLine('after them.mp3', 'After them!'),
    subtitledLine('what is thy business.mp3', 'What is thy business\nwith this gold?'),
    subtitledLine('no mercy for the wicked.mp3', 'No mercy for\nthe wicked!'),
];

const guardEndChaseSet: Array<SubtitledSoundDesc> = [
    subtitledLine('must have run.mp3', 'Must have\nrun off...'),
    subtitledLine('oh well.mp3', 'Oh, well...'),
    subtitledLine('where they go.mp3', 'Where did they go?'),
    subtitledLine('his holiness.mp3', 'His Holiness would\nnot be pleased!'),
    subtitledLine('the boss.mp3', 'The boss will\nnot be pleased!'),
    subtitledLine('huff puff give up.mp3', 'I give up!'),
    subtitledLine('gone.mp3', 'Gone!'),
    subtitledLine('come back here.mp3', 'Come back here!'),
    subtitledLine('rotten scoundrel.mp3', 'Rotten scoundrel!'),
    subtitledLine('aargh.mp3', 'Aargh!!'),
    subtitledLine('blast.mp3', 'Blast!'),
    subtitledLine('dont come back.mp3', 'Don\'t come back!'),
    subtitledLine('wont get away next time.mp3', 'You won\'t\nget away\nnext time!'),
    subtitledLine('for his holiness.mp3', 'For His Holiness!'),
    subtitledLine('lousy day at work.mp3', 'What a lousy day\nat work!'),
    subtitledLine('i give up.mp3', 'I give up...'),
    subtitledLine('what do i do help me.mp3', 'What do I do?\nHelp me, help me...'),
    subtitledLine('guard rant.mp3', '(Guard rant)'),
    // Lines that peg the thief as male:
    /*
    subtitledLine('lost em.mp3', 'Lost \'im!'),
    subtitledLine('where did he go.mp3', 'Where did he go!?'),
    subtitledLine('drats lost him.mp3', 'Drats!\nLost him!'),
    subtitledLine('not coming back.mp3', 'He\'s not coming back!'),
    subtitledLine('oh no he got away.mp3', 'Oh no,\nhe got away!'),
    */
];

const guardAwakesWarningSet: Array<SubtitledSoundDesc> = [
    subtitledLine('someone-smacked-me.mp3', 'Someone smacked me!'),
    subtitledLine('someone-hit-me.mp3', 'Someone hit me!'),
    subtitledLine('who-hit-me.mp3', 'Who hit me!?'),
    subtitledLine('devils-hit-me.mp3', 'Which of you\ndevils hit me!?'),
]

const guardDownWarningSet: Array<SubtitledSoundDesc> = [
    subtitledLine('have-guard-down.mp3', 'We have a guard down!'),
    subtitledLine('man-down.mp3', 'Man down!'),
    subtitledLine('guard-down.mp3', 'Guard down!'),
]

const guardStirringSet: Array<SubtitledSoundDesc> = [
    subtitledLine('ahh.mp3', 'Ahh...'),
]

const guardWarningResponseSet: Array<SubtitledSoundDesc> = [
    subtitledLine('must-have-intruder.mp3', 'We must have\nan intruder!'),
    subtitledLine('eye-out.mp3', 'I will keep\nan eye out!'),
    subtitledLine('intruder.mp3', 'Intruder!'),
]

const guardDamageSet: Array<SubtitledSoundDesc> = [
    subtitledLine('take that.mp3', 'Take that!!'),
    subtitledLine('oof.mp3', 'Oof!!'),
    subtitledLine('uh.mp3', 'Ugg!!'),
    subtitledLine('ah.mp3', 'Ahh!!'),
    subtitledLine('ah-2.mp3', 'Ahh!!'),
    subtitledLine('ha ya.mp3', 'Hi-yah!'),
    subtitledLine('ha ya-2.mp3', 'Hi-yah!'),
    subtitledLine('ha ya-3.mp3', 'Hi-yah!'),
];

const guardSeeTorchLitSet: Array<SubtitledSoundDesc> = [
    subtitledLine('Hmm.mp3', 'Hmm...'),
    subtitledLine('What.mp3', 'What?'),    
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
    subtitledLine('what was that.mp3', 'What was that?'),
    subtitledLine('what was that-2.mp3', 'What was that?'),
    subtitledLine('what was that-3.mp3', 'What was that?'),
    subtitledLine('what was that-4.mp3', 'What was that?'),
    subtitledLine('what was that-5.mp3', 'What was that?'),
    subtitledLine('who goes there.mp3', 'Who goes there?'),
    subtitledLine('huh.mp3', 'Huh?'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('wha.mp3', 'Wha...'),
    subtitledLine('wait.mp3', 'Wait!'),
    subtitledLine('who there.mp3', 'Who\'s there?'),
    subtitledLine('hello.mp3', 'Hello?'),
    subtitledLine('ugh.mp3', 'Uhh...'),
];

const guardSeeTorchDousedSet: Array<SubtitledSoundDesc> = [
    subtitledLine('dont-stay-lit.mp3', 'They don\'t\nstay lit!'),
    subtitledLine('paranoid.mp3', 'That\'s enough to make\na guy paranoid!'),
    subtitledLine('should-relight.mp3', 'Somebody should\nrelight that.'),
    subtitledLine('torch-burned.mp3', 'That torch\nburned out.'),
    subtitledLine('light-burned.mp3', 'That light\nburned out.'),
    subtitledLine('got-dark.mp3', 'It got dark!'),
    subtitledLine('wish-torch.mp3', 'Wish I had\na torch...'),
    subtitledLine('why-happen.mp3', 'Why did that\nhappen?'),
];

const guardSpotStolenTreasureSet: Array<SubtitledSoundDesc> = [
    subtitledLine('huh.mp3', 'Huh?'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
];

const guardExamineStolenTreasureSet: Array<SubtitledSoundDesc> = [
    subtitledLine('someone-stole.mp3', 'Someone stole\nthe Treasure!'),
    subtitledLine('its-missing.mp3', 'It\'s missing!'),
    subtitledLine('who-took-it.mp3', 'Who took it?'),
    subtitledLine('boss-wont-like.mp3', 'The boss won\'t\nlike this!'),
];

const guardSpotDownedGuardSet: Array<SubtitledSoundDesc> = [
    subtitledLine('huh.mp3', 'Huh?'),
    subtitledLine('What.mp3', 'What?'),
    subtitledLine('hey.mp3', 'Hey!'),
    subtitledLine('hey-2.mp3', 'Hey!'),
    subtitledLine('hey-3.mp3', 'Hey!'),
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
            howl.fade(1,0, this.fadeTime, id);
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
    play(volume:number, pan:number=0, loop:boolean=false):number {
        const howl = this.next();
        howl.loop(loop);
        howl.volume(volume);
        howl.stereo(pan);
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
    play(volume:number, pan:number=0): SubtitledSound {
        const subSound = this.next();
        if (!this.mute) {
            subSound.sound.volume(volume);
            subSound.sound.stereo(pan);
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

export function setupSounds(sounds:Howls, subtitledSounds:SubtitledHowls, howlPool: ActiveHowlPool, ambientHowlPool: ActiveHowlPool) {
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
    sounds.coinRattle = new HowlGroup(coinRattleSet);
    sounds.food = new HowlGroup(foodSet);
    sounds.grabKey = new HowlGroup(grabKeySet);
    sounds.clockChime = new HowlGroup(clockChimeSet);
    sounds.clockTick = new HowlGroup(clockTickSet);

    sounds.doorOpen = new HowlGroup(doorOpenSet);
    sounds.doorClose = new HowlGroup(doorCloseSet);
    sounds.doorOpenLocked = new HowlGroup(doorOpenLockedSet);
    sounds.doorCloseLocked = new HowlGroup(doorCloseLockedSet);

    sounds.playerDoorOpen = new HowlGroup(playerDoorOpenSet);
    sounds.playerDoorClose = new HowlGroup(playerDoorCloseSet);
    sounds.playerDoorOpenLocked = new HowlGroup(playerDoorOpenLockedSet);
    sounds.playerDoorCloseLocked = new HowlGroup(playerDoorCloseLockedSet);

    sounds.grunt = new HowlGroup(gruntSet);
    sounds.douse = new HowlGroup(douseSet);
    sounds.ignite = new HowlGroup(igniteSet);
    sounds.hide = new HowlGroup(hideSet);
    sounds.gate = new HowlGroup(gateSet);
    sounds.thump = new HowlGroup(thumpSet);
    sounds.splash = new HowlGroup(splashSet);
    sounds.waterEnter = new HowlGroup(waterEnterSet);
    sounds.waterExit = new HowlGroup(waterExitSet);
    sounds.jump = new HowlGroup(jumpSet);
    sounds.tooHigh = new HowlGroup(tooHighSet);
    sounds.treasureAlarm = new HowlGroup(treasureAlarmSet);
    sounds.switchProgress = new HowlGroup(switchProgressSet);
    sounds.switchReset = new HowlGroup(switchResetSet);
    sounds.switchSuccess = new HowlGroup(switchSuccessSet);

    sounds.ambienceWater = new HowlGroup(waterAmbientSet, ambientHowlPool);
    sounds.ambienceKitchen = new HowlGroup(kitchenAmbientSet, ambientHowlPool);
    sounds.ambienceOutdoor = new HowlGroup(outdoorAmbientSet, ambientHowlPool);

    subtitledSounds.guardInvestigate = new SubtitledHowlGroup(guardInvestigateSet, howlPool);
    subtitledSounds.guardFinishInvestigating = new SubtitledHowlGroup(guardFinishInvestigatingSet, howlPool);
    subtitledSounds.guardSeeThief = new SubtitledHowlGroup(guardSeeThiefSet), howlPool;
    subtitledSounds.guardFinishLooking = new SubtitledHowlGroup(guardFinishLookingSet, howlPool);
    subtitledSounds.guardFinishLookingAtLitTorch = new SubtitledHowlGroup(guardFinishLookingAtLitTorchSet, howlPool);
    subtitledSounds.guardChase = new SubtitledHowlGroup(guardChaseSet, howlPool);
    subtitledSounds.guardEndChase = new SubtitledHowlGroup(guardEndChaseSet, howlPool);
    subtitledSounds.guardHearGuard = new SubtitledHowlGroup(guardHearGuardSet, howlPool);
    subtitledSounds.guardSpotDownedGuard = new SubtitledHowlGroup(guardSpotDownedGuardSet, howlPool);
    subtitledSounds.guardSeeUnlitTorch = new SubtitledHowlGroup(guardSeeUnlitTorchSet, howlPool);
    subtitledSounds.guardHearThief = new SubtitledHowlGroup(guardHearThiefSet, howlPool);
    subtitledSounds.guardAwakesWarning = new SubtitledHowlGroup(guardAwakesWarningSet, howlPool);
    subtitledSounds.guardDownWarning = new SubtitledHowlGroup(guardDownWarningSet, howlPool);
    subtitledSounds.guardWarningResponse = new SubtitledHowlGroup(guardWarningResponseSet, howlPool);
    subtitledSounds.guardFinishListening = new SubtitledHowlGroup(guardFinishListeningSet, howlPool);
    subtitledSounds.guardFinishLightingTorch = new SubtitledHowlGroup(guardFinishLightingTorchSet, howlPool);
    subtitledSounds.guardDamage = new SubtitledHowlGroup(guardDamageSet, howlPool);
    subtitledSounds.guardStirring = new SubtitledHowlGroup(guardStirringSet, howlPool);
    subtitledSounds.guardRest =  new SubtitledHowlGroup(guardRestSet, howlPool);
    subtitledSounds.guardSeeTorchLit = new SubtitledHowlGroup(guardSeeTorchLitSet, howlPool);
    subtitledSounds.guardSeeTorchDoused = new SubtitledHowlGroup(guardSeeTorchDousedSet, howlPool);
    subtitledSounds.guardSpotStolenTreasure = new SubtitledHowlGroup(guardSpotStolenTreasureSet, howlPool);
    subtitledSounds.guardExamineStolenTreasure = new SubtitledHowlGroup(guardExamineStolenTreasureSet, howlPool);
}
