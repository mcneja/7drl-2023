import { Howl, Howler } from 'howler';
import { shuffleArray } from './random';

export { Howler };

const victorySong = new URL('./audio/Minstrel_Dance.mp3', import.meta.url).href;
const levelRequirementJingle = new URL('./audio/level-requirement-1.mp3', import.meta.url).href;
const levelCompleteJingle = new URL('./audio/level-requirement-2.mp3', import.meta.url).href;
const gameOverJingle = new URL('./audio/lose-game-over.mp3', import.meta.url).href;
const easterEgg = new URL('./audio/Minstrel Dance Easter Egg.mp3', import.meta.url).href;
const footstepWood = new URL('./audio/footstep-wood.mp3', import.meta.url).href;
const footstepTile = new URL('./audio/footstep-tile.mp3', import.meta.url).href;
const footstepWater = new URL('./audio/footstep-water.mp3', import.meta.url).href;
const footstepGravel = new URL('./audio/footstep-gravel.mp3', import.meta.url).href;
const footstepGrass = new URL('./audio/footstep-grass.mp3', import.meta.url).href;

const footstepCreakSet =[
    new URL('./audio/creak-7.mp3', import.meta.url).href,
    new URL('./audio/creak-8.mp3', import.meta.url).href,
    new URL('./audio/creak-9.mp3', import.meta.url).href,
    new URL('./audio/creak-10.mp3', import.meta.url).href,
    new URL('./audio/creak-11.mp3', import.meta.url).href,
    new URL('./audio/creak-12.mp3', import.meta.url).href,
];

const hitPlayerSet:Array<string> = [
    new URL('./audio/hitting/hit16.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit17.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit18.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit19.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit20.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit26.mp3.flac', import.meta.url).href,
    new URL('./audio/hitting/hit27.mp3.flac', import.meta.url).href,
];

const hitGuardSet:Array<string> = [
    new URL('./audio/hitting/hit26.mp3.flac', import.meta.url).href,
];


const coinRattleSet = [
    new URL('./audio/coin-rattle.mp3', import.meta.url).href,
]

const coinSet = [
    new URL('./audio/coin.mp3', import.meta.url).href,
    new URL('./audio/coin-2.mp3', import.meta.url).href,
    new URL('./audio/coin-3.mp3', import.meta.url).href,
    new URL('./audio/coin-4.mp3', import.meta.url).href,    
    new URL('./audio/coin-5.mp3', import.meta.url).href,    
];

const gruntSet = [
    new URL('./audio/grunt.mp3', import.meta.url).href,
    new URL('./audio/grunt-2.mp3', import.meta.url).href,
    new URL('./audio/grunt-3.mp3', import.meta.url).href,
    new URL('./audio/grunt-4.mp3', import.meta.url).href,    
    new URL('./audio/grunt-5.mp3', import.meta.url).href,    
    new URL('./audio/grunt-6.mp3', import.meta.url).href,    
    new URL('./audio/grunt-7.mp3', import.meta.url).href,    
    new URL('./audio/grunt-8.mp3', import.meta.url).href,    
];

const douseSet = [
    new URL('./audio/douse.mp3', import.meta.url).href,
    new URL('./audio/douse-2.mp3', import.meta.url).href,
    new URL('./audio/douse-3.mp3', import.meta.url).href,
    new URL('./audio/douse-4.mp3', import.meta.url).href,    
];

const clockChimeSet = [
    new URL('./audio/chiming-clock-short.mp3', import.meta.url).href,
];

const clockTickSet = [
    new URL('./audio/ticking-clock.mp3', import.meta.url).href,
];

const foodSet = [
    new URL('./audio/eating.mp3', import.meta.url).href,
]

const grabKeySet = [
    new URL('./audio/grab-key.mp3', import.meta.url).href,
    new URL('./audio/grab-key-2.mp3', import.meta.url).href,
]

const igniteSet = [
    new URL('./audio/ignite.mp3', import.meta.url).href,
    new URL('./audio/ignite-2.mp3', import.meta.url).href,
];

const hideSet = [
    new URL('./audio/hide.mp3', import.meta.url).href,
    new URL('./audio/hide-2.mp3', import.meta.url).href,
    new URL('./audio/hide-3.mp3', import.meta.url).href,
    new URL('./audio/hide-4.mp3', import.meta.url).href,    
    new URL('./audio/hide-5.mp3', import.meta.url).href,    
    new URL('./audio/hide-6.mp3', import.meta.url).href,    
];

const gateSet = [
    new URL('./audio/gate.mp3', import.meta.url).href,
    new URL('./audio/gate-2.mp3', import.meta.url).href,
    new URL('./audio/gate-3.mp3', import.meta.url).href,
    new URL('./audio/gate-4.mp3', import.meta.url).href,    
    new URL('./audio/gate-5.mp3', import.meta.url).href,    
];

const thumpSet = [
    new URL('./audio/thump.mp3', import.meta.url).href,
]

const splashSet = [
    new URL('./audio/splash1.mp3', import.meta.url).href,
    new URL('./audio/splash2.mp3', import.meta.url).href,
]

const waterAmbientSet = [
    new URL('./audio/water-ambient.mp3', import.meta.url).href,
    new URL('./audio/water-ambient-2.mp3', import.meta.url).href,
]

const kitchenAmbientSet = [
    new URL('./audio/fire.mp3', import.meta.url).href,
    new URL('./audio/fire-and-boil.mp3', import.meta.url).href,
]

const outdoorAmbientSet = [
    new URL('./audio/outdoor-ambient.mp3', import.meta.url).href,
    new URL('./audio/outdoor-ambient-2.mp3', import.meta.url).href,
    new URL('./audio/outdoor-ambient-3.mp3', import.meta.url).href,
    new URL('./audio/outdoor-ambient-4.mp3', import.meta.url).href,
]

const doorOpenSet = [
    new URL('./audio/guard-door.mp3', import.meta.url).href,
]

const doorCloseSet = [
    new URL('./audio/door-close.mp3', import.meta.url).href,
]

const doorOpenLockedSet = [
    new URL('./audio/door-unlock-and-open.mp3', import.meta.url).href,
]

const doorCloseLockedSet = [
    new URL('./audio/door-close-and-lock.mp3', import.meta.url).href,
]

const playerDoorOpenSet = [
    new URL('./audio/player-door-open.mp3', import.meta.url).href,
]

const playerDoorCloseSet = [
    new URL('./audio/player-door-close.mp3', import.meta.url).href,
]

const playerDoorOpenLockedSet = [
    new URL('./audio/player-door-unlock-and-open.mp3', import.meta.url).href,
]

const playerDoorCloseLockedSet = [
    new URL('./audio/player-door-close-and-lock.mp3', import.meta.url).href,
]

const waterEnterSet = [
    new URL('./audio/water-submerge.mp3', import.meta.url).href,
]

const waterExitSet = [
    new URL('./audio/water-exit.mp3', import.meta.url).href,
]

const jumpSet = [
    new URL('./audio/jump.mp3', import.meta.url).href,
    new URL('./audio/jump-2.mp3', import.meta.url).href,
];

const treasureAlarmSet = [
    new URL('./audio/alarm.mp3', import.meta.url).href,
]

const switchProgressSet = [
    new URL('./audio/switch-progress.mp3', import.meta.url).href,
];

const switchResetSet = [
    new URL('./audio/switch-reset.mp3', import.meta.url).href,
];

const switchSuccessSet = [
    new URL('./audio/switch-success.mp3', import.meta.url).href,
];

const tooHighSet = [
    new URL('./audio/too high.mp3', import.meta.url).href,
    new URL('./audio/too high-2.mp3', import.meta.url).href,
];

type SubtitledSoundDesc = [string, string];


const guardSeeThiefSet:Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],    
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/what was that.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-2.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-3.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-4.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-5.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/who goes there.mp3', import.meta.url).href, 'Who goes there?'],
    [new URL('./audio/guards/huh.mp3', import.meta.url).href, 'Huh?'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/wha.mp3', import.meta.url).href, 'Wha...'],
    [new URL('./audio/guards/wait.mp3', import.meta.url).href, 'Wait!'],
    [new URL('./audio/guards/who there.mp3', import.meta.url).href, 'Who\'s there?'],
    [new URL('./audio/guards/what moved.mp3', import.meta.url).href, 'What moved?'],
    [new URL('./audio/guards/what in the shadows.mp3', import.meta.url).href, 'What\'s that\nin the shadows?'],
    [new URL('./audio/guards/shadow move.mp3', import.meta.url).href, 'Did that\nshadow move?'],
    [new URL('./audio/guards/see something.mp3', import.meta.url).href, 'I see\nsomething!'],
    [new URL('./audio/guards/hello.mp3', import.meta.url).href, 'Hello?'],
    [new URL('./audio/guards/ugh.mp3', import.meta.url).href, 'Uhh...'],
];

// TODO: We don't have a guard rest state to attach these too.
const guardRestSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/ahh.mp3', import.meta.url).href, 'Ahh...'],
    [new URL('./audio/guards/aww.mp3', import.meta.url).href, 'Aww...'],
    [new URL('./audio/guards/quiet out.mp3', import.meta.url).href, 'Quiet out...'],
    [new URL('./audio/guards/rest me bones.mp3', import.meta.url).href, 'Rest me old\nbones...'],
];

const guardFinishLookingSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/what was that.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/quiet out.mp3', import.meta.url).href, 'Quiet out\nthere...'],
    [new URL('./audio/guards/jumpy.mp3', import.meta.url).href, 'Jumpy tonight...'],
    [new URL('./audio/guards/jumpin shadows.mp3', import.meta.url).href, 'Jumpin\' at\nshadows!'],
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/oh well.mp3', import.meta.url).href, 'Oh well...'],
    [new URL('./audio/guards/case of the jitters.mp3', import.meta.url).href, 'I\'ve got myself\na case of the\njitters...'],
    [new URL('./audio/guards/must be seeing.mp3', import.meta.url).href, 'I must be\nseein\' things...'],
    [new URL('./audio/guards/what in my coffee.mp3', import.meta.url).href, 'What\'d they put\nin my coffee?'],
    [new URL('./audio/guards/coffee too strong.mp3', import.meta.url).href, 'Coffee must be\ntoo strong!'],
    [new URL('./audio/guards/hmm nothing.mp3', import.meta.url).href, 'Hmm!\nNothing...'],
    [new URL('./audio/guards/well I though I saw.mp3', import.meta.url).href, 'Well, I thought\nI saw something.'],
    [new URL('./audio/guards/nothing.mp3', import.meta.url).href, 'Nothing...'],
    [new URL('./audio/guards/hopefully nothing.mp3', import.meta.url).href, 'Hopefully\nnothing.'],
    [new URL('./audio/guards/seeing things.mp3', import.meta.url).href, 'Seein\' things,\nI guess.'],
    [new URL('./audio/guards/seeing things.mp3', import.meta.url).href, 'Seein\' things,\nI guess.'],
];

const guardFinishLookingAtLitTorchSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/what was that.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/jumpy.mp3', import.meta.url).href, 'Jumpy tonight...'],
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/oh well.mp3', import.meta.url).href, 'Oh well...'],
    [new URL('./audio/guards/case of the jitters.mp3', import.meta.url).href, 'I\'ve got myself\na case of the\njitters...'],
    [new URL('./audio/guards/must be seeing.mp3', import.meta.url).href, 'I must be\nseein\' things...'],
    [new URL('./audio/guards/what in my coffee.mp3', import.meta.url).href, 'What\'d they put\nin my coffee?'],
    [new URL('./audio/guards/coffee too strong.mp3', import.meta.url).href, 'Coffee must be\ntoo strong!'],
    [new URL('./audio/guards/hmm nothing.mp3', import.meta.url).href, 'Hmm!\nNothing...'],
    [new URL('./audio/guards/nothing.mp3', import.meta.url).href, 'Nothing...'],
    [new URL('./audio/guards/hopefully nothing.mp3', import.meta.url).href, 'Hopefully\nnothing.'],
    [new URL('./audio/guards/seeing things.mp3', import.meta.url).href, 'Seein\' things,\nI guess.'],
    [new URL('./audio/guards/seeing things.mp3', import.meta.url).href, 'Seein\' things,\nI guess.'],
];

const guardHearThiefSet:Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'] ,   
    [new URL('./audio/guards/what-2.mp3', import.meta.url).href, 'What?'] ,   
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/what was that.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-2.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-3.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-4.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-5.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/huh.mp3', import.meta.url).href, 'Huh?'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/wha.mp3', import.meta.url).href, 'Wha...'],
    [new URL('./audio/guards/wait.mp3', import.meta.url).href, 'Wait!'],
    [new URL('./audio/guards/who there.mp3', import.meta.url).href, 'Who\'s there?'],
    [new URL('./audio/guards/hello.mp3', import.meta.url).href, 'Hello?'],
    [new URL('./audio/guards/ugh.mp3', import.meta.url).href, 'Uhh...'],
    [new URL('./audio/guards/hark.mp3', import.meta.url).href, 'Hark?'],
    [new URL('./audio/guards/noise.mp3', import.meta.url).href, 'What was that noise?'],
    [new URL('./audio/guards/noise.mp3', import.meta.url).href, 'What was that noise?'],
    [new URL('./audio/guards/heard something.mp3', import.meta.url).href, 'I heard something...'],
    [new URL('./audio/guards/heard something.mp3', import.meta.url).href, 'I heard something...'],
];

const guardFinishListeningSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/jumpy.mp3', import.meta.url).href, 'Jumpy tonight...'],
    [new URL('./audio/guards/oh well.mp3', import.meta.url).href, 'Oh well...'],
    [new URL('./audio/guards/case of the jitters.mp3', import.meta.url).href, 'I\'ve got myself\na case of the\njitters...'],
    [new URL('./audio/guards/what in my coffee.mp3', import.meta.url).href, 'What\'s in my\ncoffee today?'],
    [new URL('./audio/guards/coffee too strong.mp3', import.meta.url).href, 'Coffee must be\ntoo strong!'],
    [new URL('./audio/guards/hmm nothing.mp3', import.meta.url).href, 'Hmm!\nNothing...'],
    [new URL('./audio/guards/cant hear now.mp3', import.meta.url).href, 'Well, I can\'t\nhear it now.'],
    [new URL('./audio/guards/nothing.mp3', import.meta.url).href, 'Nothing...'],
    [new URL('./audio/guards/hopefully nothing.mp3', import.meta.url).href, 'Hopefully\nnothing.'],
    [new URL('./audio/guards/hearing things.mp3', import.meta.url).href, 'I must be\nhearing things.'],
];

const guardInvestigateSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/noise again.mp3', import.meta.url).href, 'That noise\nagain?'],
    [new URL('./audio/guards/someone there.mp3', import.meta.url).href, 'Someone\'s there!'],
    [new URL('./audio/guards/who could that be.mp3', import.meta.url).href, 'Who could\nthat be?'],
    [new URL('./audio/guards/better check it out.mp3', import.meta.url).href, 'Better check\nit out.'],
    [new URL('./audio/guards/better be rats.mp3', import.meta.url).href, 'That better\nbe rats!'],
    [new URL('./audio/guards/who that.mp3', import.meta.url).href, 'Who is that?'],
    [new URL('./audio/guards/come out come out.mp3', import.meta.url).href, 'Come out, come out\nwherever you are!'],
    // TODO: These ones would ideally only play after a player has been heard once before
    // [new URL('./audio/guards/again.mp3', import.meta.url).href, 'Again!?'],
    // [new URL('./audio/guards/there it is again.mp3', import.meta.url).href, 'There it\nis again.'],
    // [new URL('./audio/guards/what keeps making those noises.mp3', import.meta.url).href, 'What keeps making\nthose noises?'],
];

// TODO: When the thief has been chased, many of these lines will no longer seem appropriate
// Perhaps need to disambiguate the state in some way 
// (guardFinishedInvestgiateButUnseen gaurdFinishedInvestigateAndSeen or something)
const guardFinishInvestigatingSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/jumpin shadows.mp3', import.meta.url).href, 'Jumpin\' at\nshadows!'],
    [new URL('./audio/guards/jumpy.mp3', import.meta.url).href, 'Jumpy!'],
    [new URL('./audio/guards/oh well.mp3', import.meta.url).href, 'Oh, well.'],
    [new URL('./audio/guards/guess nothing.mp3', import.meta.url).href, 'Guess it was\nnothing.'],
    [new URL('./audio/guards/wonder it was.mp3', import.meta.url).href, 'Wonder what it was.'],
    [new URL('./audio/guards/back to post.mp3', import.meta.url).href, 'Back to my post.'],
    [new URL('./audio/guards/quiet now.mp3', import.meta.url).href, 'All quiet now.'],
    [new URL('./audio/guards/sure I heard something.mp3', import.meta.url).href, 'I\'m sure I\nheard something.'],
    [new URL('./audio/guards/not there anymore.mp3', import.meta.url).href, 'Not there anymore.'],
    [new URL('./audio/guards/probably nothing.mp3', import.meta.url).href, 'Probably nothing.'],
    [new URL('./audio/guards/hmm nothing.mp3', import.meta.url).href, 'Hmm!\nNothing.'],
    [new URL('./audio/guards/i dont know why i work here.mp3', import.meta.url).href, 'I don\'t know why\nI work here.'],
    [new URL('./audio/guards/waste of my time.mp3', import.meta.url).href, 'Waste of my time.'],
    [new URL('./audio/guards/why do I even try.mp3', import.meta.url).href, 'Why do I\neven try?'],
    [new URL('./audio/guards/at least Im not on cleaning duty.mp3', import.meta.url).href, 'At least I\'m not\non cleaning duty.'],
    [new URL('./audio/guards/at least my shift ends soon.mp3', import.meta.url).href, 'At least my\nshift ends soon.'],
    [new URL('./audio/guards/what do you want me to do about it.mp3', import.meta.url).href, 'What do you\nwant me to\ndo about it?'],
];

// TODO: If we split this group up for guards that are in the same room vs another room
// we could use more of these
const guardHearGuardSet: Array<SubtitledSoundDesc> = [ //Repond to guards that enter the chase set
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/coming.mp3', import.meta.url).href, 'Coming!'],
    [new URL('./audio/guards/to arms.mp3', import.meta.url).href, 'To arms!'],
];

const guardSeeUnlitTorchSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/torch-out.mp3', import.meta.url).href, 'That torch is out!'],
    [new URL('./audio/guards/torch-out-2.mp3', import.meta.url).href, 'That light\nburned out!'],
    [new URL('./audio/guards/too-dark.mp3', import.meta.url).href, 'It\'s too dark\nin here.'],
    [new URL('./audio/guards/more-light.mp3', import.meta.url).href, 'Let\'s have\nmore light.'],
]

const guardFinishLightingTorchSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/that-better.mp3', import.meta.url).href, 'That\'s better.'],
    [new URL('./audio/guards/there-we-go.mp3', import.meta.url).href, 'There we go.'],
    [new URL('./audio/guards/where-was-i.mp3', import.meta.url).href, 'Now where was I?'],
]

const guardChaseSet: Array<SubtitledSoundDesc> = [ //Yells a warning that will be heard by other guards
    [new URL('./audio/guards/whistle.mp3', import.meta.url).href, '(Whistle)'],
    [new URL('./audio/guards/whistle-2.mp3', import.meta.url).href, '(Whistle)'],
    [new URL('./audio/guards/whistle-3.mp3', import.meta.url).href, '(Whistle)'],
    [new URL('./audio/guards/get em.mp3', import.meta.url).href, 'Get \'em!'],
    [new URL('./audio/guards/intruder.mp3', import.meta.url).href, 'Intruder!'],
    [new URL('./audio/guards/oh no its a thief.mp3', import.meta.url).href, 'Oh no...\nIt\'s a thief!'],
    [new URL('./audio/guards/we coming for you.mp3', import.meta.url).href, 'We\'re coming\nfor you!'],
    [new URL('./audio/guards/coming for you.mp3', import.meta.url).href, 'Coming for you!'],
    [new URL('./audio/guards/halt.mp3', import.meta.url).href, 'Halt!'],
    [new URL('./audio/guards/see you.mp3', import.meta.url).href, 'We see you!'],
    [new URL('./audio/guards/ill get you.mp3', import.meta.url).href, 'I\'ll get you!'],
    [new URL('./audio/guards/a goner.mp3', import.meta.url).href, 'You\'re a goner!'],
    [new URL('./audio/guards/just you wait.mp3', import.meta.url).href, 'Just you wait!'],
    [new URL('./audio/guards/you wont get away.mp3', import.meta.url).href, 'You won\'t get away!'],
    [new URL('./audio/guards/no you dont.mp3', import.meta.url).href, 'No you don\'t!'],
    [new URL('./audio/guards/thief.mp3', import.meta.url).href, 'Thief!'],
    [new URL('./audio/guards/thief-2.mp3', import.meta.url).href, 'Thief!'],
    [new URL('./audio/guards/thief-3.mp3', import.meta.url).href, 'Thief!'],
    [new URL('./audio/guards/after them.mp3', import.meta.url).href, 'After them!'],
    [new URL('./audio/guards/what is thy business.mp3', import.meta.url).href, 'What is thy business\nwith this gold?'],
    [new URL('./audio/guards/no mercy for the wicked.mp3', import.meta.url).href, 'No mercy for\nthe wicked!'],
];

const guardEndChaseSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/must have run.mp3', import.meta.url).href, 'Must have\nrun off...'],
    [new URL('./audio/guards/oh well.mp3', import.meta.url).href, 'Oh, well...'],
    [new URL('./audio/guards/where they go.mp3', import.meta.url).href, 'Where did they go?'],
    [new URL('./audio/guards/his holiness.mp3', import.meta.url).href, 'His Holiness would\nnot be pleased!'],
    [new URL('./audio/guards/the boss.mp3', import.meta.url).href, 'The boss will\nnot be pleased!'],
    [new URL('./audio/guards/huff puff give up.mp3', import.meta.url).href, 'I give up!'],
    [new URL('./audio/guards/gone.mp3', import.meta.url).href, 'Gone!'],
    [new URL('./audio/guards/come back here.mp3', import.meta.url).href, 'Come back here!'],
    [new URL('./audio/guards/rotten scoundrel.mp3', import.meta.url).href, 'Rotten scoundrel!'],
    [new URL('./audio/guards/aargh.mp3', import.meta.url).href, 'Aargh!!'],
    [new URL('./audio/guards/blast.mp3', import.meta.url).href, 'Blast!'],
    [new URL('./audio/guards/dont come back.mp3', import.meta.url).href, 'Don\'t come back!'],
    [new URL('./audio/guards/wont get away next time.mp3', import.meta.url).href, 'You won\'t\nget away\nnext time!'],
    [new URL('./audio/guards/for his holiness.mp3', import.meta.url).href, 'For His Holiness!'],
    [new URL('./audio/guards/lousy day at work.mp3', import.meta.url).href, 'What a lousy day\nat work!'],
    [new URL('./audio/guards/i give up.mp3', import.meta.url).href, 'I give up...'],
    [new URL('./audio/guards/what do i do help me.mp3', import.meta.url).href, 'What do I do?\nHelp me, help me...'],
    [new URL('./audio/guards/guard rant.mp3', import.meta.url).href, '(Guard rant)'],
    // Lines that peg the thief as male:
    /*
    [new URL('./audio/guards/lost em.mp3', import.meta.url).href, 'Lost \'im!'],
    [new URL('./audio/guards/where did he go.mp3', import.meta.url).href, 'Where did he go!?'],
    [new URL('./audio/guards/drats lost him.mp3', import.meta.url).href, 'Drats!\nLost him!'],
    [new URL('./audio/guards/not coming back.mp3', import.meta.url).href, 'He\'s not coming back!'],
    [new URL('./audio/guards/oh no he got away.mp3', import.meta.url).href, 'Oh no,\nhe got away!'],
    */
];

const guardAwakesWarningSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/someone-smacked-me.mp3', import.meta.url).href, 'Someone smacked me!'],
    [new URL('./audio/guards/someone-hit-me.mp3', import.meta.url).href, 'Someone hit me!'],
    [new URL('./audio/guards/who-hit-me.mp3', import.meta.url).href, 'Who hit me!?'],
    [new URL('./audio/guards/devils-hit-me.mp3', import.meta.url).href, 'Which of you\ndevils hit me!?'],
]

const guardDownWarningSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/have-guard-down.mp3', import.meta.url).href, 'We have a guard down!'],
    [new URL('./audio/guards/man-down.mp3', import.meta.url).href, 'Man down!'],
    [new URL('./audio/guards/guard-down.mp3', import.meta.url).href, 'Guard down!'],
]

const guardStirringSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/ahh.mp3', import.meta.url).href, 'Ahh...'],
]

const guardWarningResponseSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/must-have-intruder.mp3', import.meta.url).href, 'We must have\nan intruder!'],
    [new URL('./audio/guards/eye-out.mp3', import.meta.url).href, 'I will keep\nan eye out!'],
    [new URL('./audio/guards/intruder.mp3', import.meta.url).href, 'Intruder!'],
]

const guardDamageSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/take that.mp3', import.meta.url).href, 'Take that!!'],
    [new URL('./audio/guards/oof.mp3', import.meta.url).href, 'Oof!!'],
    [new URL('./audio/guards/uh.mp3', import.meta.url).href, 'Ugg!!'],
    [new URL('./audio/guards/ah.mp3', import.meta.url).href, 'Ahh!!'],
    [new URL('./audio/guards/ah-2.mp3', import.meta.url).href, 'Ahh!!'],
    [new URL('./audio/guards/ha ya.mp3', import.meta.url).href, 'Hi-yah!'],
    [new URL('./audio/guards/ha ya-2.mp3', import.meta.url).href, 'Hi-yah!'],
    [new URL('./audio/guards/ha ya-3.mp3', import.meta.url).href, 'Hi-yah!'],
];

const guardSeeTorchLitSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/Hmm.mp3', import.meta.url).href, 'Hmm...'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],    
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/what was that.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-2.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-3.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-4.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/what was that-5.mp3', import.meta.url).href, 'What was that?'],
    [new URL('./audio/guards/who goes there.mp3', import.meta.url).href, 'Who goes there?'],
    [new URL('./audio/guards/huh.mp3', import.meta.url).href, 'Huh?'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/wha.mp3', import.meta.url).href, 'Wha...'],
    [new URL('./audio/guards/wait.mp3', import.meta.url).href, 'Wait!'],
    [new URL('./audio/guards/who there.mp3', import.meta.url).href, 'Who\'s there?'],
    [new URL('./audio/guards/hello.mp3', import.meta.url).href, 'Hello?'],
    [new URL('./audio/guards/ugh.mp3', import.meta.url).href, 'Uhh...'],
];

const guardSeeTorchDousedSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/dont-stay-lit.mp3', import.meta.url).href, 'They don\'t\nstay lit!'],
    [new URL('./audio/guards/paranoid.mp3', import.meta.url).href, 'That\'s enough to make\na guy paranoid!'],
    [new URL('./audio/guards/should-relight.mp3', import.meta.url).href, 'Somebody should\nrelight that.'],
    [new URL('./audio/guards/torch-burned.mp3', import.meta.url).href, 'That torch\nburned out.'],
    [new URL('./audio/guards/light-burned.mp3', import.meta.url).href, 'That light\nburned out.'],
    [new URL('./audio/guards/got-dark.mp3', import.meta.url).href, 'It got dark!'],
    [new URL('./audio/guards/wish-torch.mp3', import.meta.url).href, 'Wish I had\na torch...'],
    [new URL('./audio/guards/why-happen.mp3', import.meta.url).href, 'Why did that\nhappen?'],
];

const guardSpotStolenTreasureSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/huh.mp3', import.meta.url).href, 'Huh?'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
];

const guardExamineStolenTreasureSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/someone-stole.mp3', import.meta.url).href, 'Someone stole\nthe Treasure!'],
    [new URL('./audio/guards/its-missing.mp3', import.meta.url).href, 'It\'s missing!'],
    [new URL('./audio/guards/who-took-it.mp3', import.meta.url).href, 'Who took it?'],
    [new URL('./audio/guards/boss-wont-like.mp3', import.meta.url).href, 'The boss won\'t\nlike this!'],
];

const guardSpotDownedGuardSet: Array<SubtitledSoundDesc> = [
    [new URL('./audio/guards/huh.mp3', import.meta.url).href, 'Huh?'],
    [new URL('./audio/guards/What.mp3', import.meta.url).href, 'What?'],
    [new URL('./audio/guards/hey.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-2.mp3', import.meta.url).href, 'Hey!'],
    [new URL('./audio/guards/hey-3.mp3', import.meta.url).href, 'Hey!'],
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
