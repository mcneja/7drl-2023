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


const guardRelaxed1 = require('url:./audio/guards/whistle.ogg');
const guardRelaxed2 = require('url:./audio/guards/whistle-2.ogg');
const guardRelaxed3 = require('url:./audio/guards/quiet out.ogg');
const guardRelaxed4 = require('url:./audio/guards/ahh.ogg');
const guardRelaxed5 = require('url:./audio/guards/ahh-2.ogg');
const guardRelaxed6 = require('url:./audio/guards/rest me bones.ogg');
const guardRelaxedSet = [guardRelaxed1, guardRelaxed2, guardRelaxed3, guardRelaxed4, guardRelaxed5, guardRelaxed6];

const guardAlert1 = require('url:./audio/guards/Hmm.ogg');
const guardAlert2 = require('url:./audio/guards/hey.ogg');
const guardAlert3 = require('url:./audio/guards/hey-2.ogg');
const guardAlert4 = require('url:./audio/guards/hey-3.ogg');
const guardAlert5 = require('url:./audio/guards/What.ogg');
const guardAlertSet = [guardAlert1, guardAlert2, guardAlert3, guardAlert4, guardAlert5];

const guardStopAlert1 = require('url:./audio/guards/jumpin shadows.ogg');
const guardStopAlert2 = require('url:./audio/guards/jumpy.ogg');
const guardStopAlert3 = require('url:./audio/guards/oh well.ogg');
const guardStopAlertSet = [guardStopAlert1, guardStopAlert2, guardStopAlert3 ];

const guardChasing1 = require('url:./audio/guards/get em.ogg');
const guardChasing2 = require('url:./audio/guards/intruder.ogg');
const guardChasing3 = require('url:./audio/guards/whistle-2.ogg');
const guardChasingSet = [guardChasing1, guardChasing2, guardChasing3];

const guardStopChasing1 = require('url:./audio/guards/lost em.ogg');
const guardStopChasing2 = require('url:./audio/guards/must have run.ogg');
const guardStopChasing3 = require('url:./audio/guards/oh well.ogg');
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

export function setupSounds(sounds:Howls) {
    sounds.footstepWood = new HowlGroup([footstepWood]);
    sounds.footstepTile = new HowlGroup([footstepTile]);
    sounds.footstepWater = new HowlGroup([footstepWater]);
    sounds.footstepGravel = new HowlGroup([footstepGravel]);
    sounds.footstepGrass = new HowlGroup([footstepGrass]);

    sounds.footstepCreaky = new HowlGroup(footstepCreakSet);
    sounds.guardRelaxed = new HowlGroup(guardRelaxedSet);
    sounds.guardAlert = new HowlGroup(guardAlertSet);
    sounds.guardStopAlert = new HowlGroup(guardStopAlertSet);
    sounds.guardChasing = new HowlGroup(guardChasingSet);
    sounds.guardStopChasing = new HowlGroup(guardStopChasingSet);

}
