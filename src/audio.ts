import {Howl} from 'howler';
import {shuffleArray} from './random';

const footstepWood = require('url:./audio/footstep-wood.ogg');
const footstepTile = require('url:./audio/footstep-tile.ogg');
const footstepWater = require('url:./audio/footstep-water.ogg');
const footstepGravel = require('url:./audio/footstep-gravel.ogg');
const footstepGrass = require('url:./audio/footstep-grass.ogg');
const footstepCreak1 = require('url:./audio/creak.ogg');
const footstepCreak2 = require('url:./audio/creak-2.ogg');
const footstepCreak3 = require('url:./audio/creak-3.ogg');
const footstepCreak4 = require('url:./audio/creak-4.ogg');
const footstepCreak5 = require('url:./audio/creak-5.ogg');
const footstepCreak6 = require('url:./audio/creak-6.ogg');
const footstepCreak7 = require('url:./audio/squeak1.wav');
const footstepCreak8 = require('url:./audio/squeak2.wav');
const footstepCreak9 = require('url:./audio/squeak3.wav');
const footstepCreak10 = require('url:./audio/squeak4.wav');
const footstepCreakSet =[footstepCreak1, footstepCreak2,footstepCreak3,footstepCreak4, footstepCreak5, footstepCreak6, footstepCreak7, footstepCreak8, footstepCreak9, footstepCreak10];

type SubtitledSoundDesc = [string, string];

const guardRelaxed1: SubtitledSoundDesc = [require('url:./audio/guards/whistle.ogg'), '(whistle)'];
const guardRelaxed2: SubtitledSoundDesc = [require('url:./audio/guards/whistle-2.ogg'), '(whistle)'];
const guardRelaxed3: SubtitledSoundDesc = [require('url:./audio/guards/quiet out.ogg'), 'Quiet out!'];
const guardRelaxed4: SubtitledSoundDesc = [require('url:./audio/guards/ahh.ogg'), 'Ahh...'];
const guardRelaxed5: SubtitledSoundDesc = [require('url:./audio/guards/ahh-2.ogg'), 'Ahh...'];
const guardRelaxed6: SubtitledSoundDesc = [require('url:./audio/guards/rest me bones.ogg'), 'Rest me bones...'];
const guardRelaxedSet = [guardRelaxed1, guardRelaxed2, guardRelaxed3, guardRelaxed4, guardRelaxed5, guardRelaxed6];

const guardAlert1: SubtitledSoundDesc = [require('url:./audio/guards/Hmm.ogg'), 'Hmm...'];
const guardAlert2: SubtitledSoundDesc = [require('url:./audio/guards/hey.ogg'), 'Hey!'];
const guardAlert3: SubtitledSoundDesc = [require('url:./audio/guards/hey-2.ogg'), 'Hey!'];
const guardAlert4: SubtitledSoundDesc = [require('url:./audio/guards/hey-3.ogg'), 'Hey!'];
const guardAlert5: SubtitledSoundDesc = [require('url:./audio/guards/What.ogg'), 'What?'];
const guardAlertSet = [guardAlert1, guardAlert2, guardAlert3, guardAlert4, guardAlert5];

const guardStopAlert1: SubtitledSoundDesc = [require('url:./audio/guards/jumpin shadows.ogg'), 'Jumpin\' at shadows!'];
const guardStopAlert2: SubtitledSoundDesc = [require('url:./audio/guards/jumpy.ogg'), 'Jumpy!'];
const guardStopAlert3: SubtitledSoundDesc = [require('url:./audio/guards/oh well.ogg'), 'Oh, well.'];
const guardStopAlertSet = [guardStopAlert1, guardStopAlert2, guardStopAlert3 ];

const guardChasing1: SubtitledSoundDesc = [require('url:./audio/guards/get em.ogg'), 'Get \'em!'];
const guardChasing2: SubtitledSoundDesc = [require('url:./audio/guards/intruder.ogg'), 'Intruder!'];
const guardChasing3: SubtitledSoundDesc = [require('url:./audio/guards/whistle-2.ogg'), '(whistle)'];
const guardChasingSet = [guardChasing1, guardChasing2, guardChasing3];

const guardStopChasing1: SubtitledSoundDesc = [require('url:./audio/guards/lost em.ogg'), 'Lost \'em!'];
const guardStopChasing2: SubtitledSoundDesc = [require('url:./audio/guards/must have run.ogg'), 'Must have run off.'];
const guardStopChasing3: SubtitledSoundDesc = [require('url:./audio/guards/oh well.ogg'), 'Oh, well.'];
const guardStopChasingSet = [guardStopChasing1, guardStopChasing2, guardStopChasing3];

export class HowlGroup {
    howls:Array<Howl>;
    howlNum:number;
    constructor(files:Array<string>) {
        this.howls = files.map((file)=>new Howl({src: [file]}))
        this.howlNum = 0;
        shuffleArray(this.howls);
    }
    play(volume:number):number {
        const howl = this.nextHowl();
        howl.volume(volume);
        return howl.play();
    }
    nextHowl(): Howl {
        this.howlNum++;
        if(this.howlNum==this.howls.length) {
            this.howlNum=0;
            shuffleArray(this.howls);
        }
        return this.howls[this.howlNum];
    }
}

export type Howls = { [id:string]: HowlGroup };
export type SubtitledHowls = { [id:string]: SubtitledHowlGroup };

export type SubtitledSound = {
    sound: Howl;
    subtitle: string;
}

export class SubtitledHowlGroup {
    sounds: Array<SubtitledSound>;
    soundNum: number;

    constructor(filesAndSubtitles: Array<[string, string]>) {
        this.sounds = filesAndSubtitles.map(makeSubtitledSound);
        this.soundNum = 0;
        shuffleArray(this.sounds);
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

function makeSubtitledSound(fileAndSub: [string, string]): SubtitledSound {
    return { sound: new Howl({src: [fileAndSub[0]]}), subtitle: fileAndSub[1] };
}

export function setupSounds(sounds:Howls, subtitledSounds:SubtitledHowls) {
    sounds.footstepWood = new HowlGroup([footstepWood]);
    sounds.footstepTile = new HowlGroup([footstepTile]);
    sounds.footstepWater = new HowlGroup([footstepWater]);
    sounds.footstepGravel = new HowlGroup([footstepGravel]);
    sounds.footstepGrass = new HowlGroup([footstepGrass]);
    sounds.footstepCreaky = new HowlGroup(footstepCreakSet);

    subtitledSounds.guardRelaxed = new SubtitledHowlGroup(guardRelaxedSet);
    subtitledSounds.guardAlert = new SubtitledHowlGroup(guardAlertSet);
    subtitledSounds.guardStopAlert = new SubtitledHowlGroup(guardStopAlertSet);
    subtitledSounds.guardChasing = new SubtitledHowlGroup(guardChasingSet);
    subtitledSounds.guardStopChasing = new SubtitledHowlGroup(guardStopChasingSet);
}
