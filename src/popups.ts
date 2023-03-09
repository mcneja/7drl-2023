export { Popup, PopupMessage, Popups, PopupType };

import { vec2 } from './my-matrix';
import { Howls } from './audio';

enum PopupType {
    Damage,
    GuardChase,
    GuardSeeThief,
    GuardHearThief,
    GuardHearGuard,
    GuardInvestigate,
    Noise,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
}

type Popup = {
    popupType: PopupType;
    posWorld: vec2;
}

type PopupMessage = {
    msg: string;
    posWorld: vec2;
}

class Popups {
    popups: Array<Popup>;

    constructor() {
        this.popups = [];
    }

    add(popupType: PopupType, posWorld: vec2) {
        this.popups.push({ popupType: popupType, posWorld: posWorld });
    }

    clear() {
        this.popups.length = 0;
    }

    endOfUpdate(sounds: Howls) {
        if (this.popups.length === 0) {
            return;
        }

        this.popups.sort((a, b) => a.popupType - b.popupType);

        const soundName = soundNameForPopupType(this.popups[0].popupType);
        if (soundName !== '') {
            sounds[soundName].play(0.6);
        }
    }

    currentMessage(): PopupMessage | null {
        if (this.popups.length === 0) {
            return null;
        }

        const popup = this.popups[0];

        return { msg: messageForPopupType(popup.popupType), posWorld: popup.posWorld };
    }
}

function soundNameForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return '';
        case PopupType.GuardChase: return 'guardChasing';
        case PopupType.GuardSeeThief: return 'guardAlert';
        case PopupType.GuardHearThief: return 'guardAlert';
        case PopupType.GuardHearGuard: return '';
        case PopupType.GuardInvestigate: return 'guardAlert';
        case PopupType.Noise: return '';
        case PopupType.GuardEndChase: return 'guardStopChasing';
        case PopupType.GuardFinishInvestigating: return 'guardStopAlert';
        case PopupType.GuardFinishLooking: return 'guardStopAlert';
        case PopupType.GuardFinishListening: return 'guardStopAlert';
    }
}

function messageForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return linesDamage.nextLine();
        case PopupType.GuardChase: return linesChase.nextLine();
        case PopupType.GuardSeeThief: return linesSee.nextLine();
        case PopupType.GuardHearThief: return linesHear.nextLine();
        case PopupType.GuardHearGuard: return linesHearGuard.nextLine();
        case PopupType.GuardInvestigate: return linesInvestigate.nextLine();
        case PopupType.Noise: return 'Creak!';
        case PopupType.GuardEndChase: return linesEndChase.nextLine();
        case PopupType.GuardFinishInvestigating: return linesEndInvestigation.nextLine();
        case PopupType.GuardFinishLooking: return linesDoneLooking.nextLine();
        case PopupType.GuardFinishListening: return linesDoneListening.nextLine();
    }
}

class LineSet {
    lines: Array<string>;
    currentLineIndex: number;

    constructor(lines: Array<string>) {
        this.lines = lines;
        this.currentLineIndex = 0;
    }

    nextLine(): string {
        const line = this.lines[this.currentLineIndex];
        this.currentLineIndex = (this.currentLineIndex + 1) % this.lines.length;
        return line;
    }
}

const linesSee = new LineSet([
    "Who goes there?",
    "Huh?",
    "What?",
    "Wait...",
    "Who's that?",
    "Hey...",
    "Hmm...",
    "What moved?",
    "Did that shadow move?",
    "I see something...",
    "Hello?",
]);

const linesHear = new LineSet([
    "Huh?",
    "What?",
    "Hark!",
    "A noise...",
    "I heard something.",
    "Hmm...",
    "Who goes there?",
    "What's that noise?",
    "I hear something...",
    "Hello?",
]);

const linesHearGuard = new LineSet([
    "Where?",
    "I'm coming!",
    "Here I come!",
    "To arms!",
    "Where is he?",
]);

const linesChase = new LineSet([
    "Halt!",
    "Hey!",
    "Aha!",
    "I see you!",
    "I'm coming!",
    "I'll get you!",
    "Just you wait...",
    "You won't get away!",
    "Oh no you don't...",
    "Get him!",
    "After him!",
    "Thief!",
]);

const linesInvestigate = new LineSet([
    "That noise again...",
    "I heard it again!",
    "Someone's there!",
    "Who could that be?",
    "There it is again!",
    "What was that?",
    "Better check it out...",
    "What keeps making those noises?",
    "That better be rats!",
    "Again?",
]);

const linesEndChase = new LineSet([
    "(huff, huff)",
    "Where did he go?",
    "Lost him!",
    "Gone!",
    "Come back!",
    "Argh!",
    "He's not coming back.",
    "Blast!",
    "Next time!",
]);

const linesEndInvestigation = new LineSet([
    "Guess it was nothing.",
    "Wonder what it was?",
    "Better get back.",
    "It's quiet now.",
    "This is where I heard it...",
    "Nothing, now.",
]);

const linesDoneLooking = new LineSet([
    "Must have been rats.",
    "Too much coffee!",
    "I've got the jitters.",
    "Probably nothing.",
    "I thought I saw something.",
    "Oh well.",
    "Nothing.",
    "Can't see it now.",
    "I've been up too long.",
    "Seeing things, I guess.",
    "Hope it wasn't anything.",
    "Did I imagine that?",
]);

const linesDoneListening = new LineSet([
    "Must have been rats.",
    "Too much coffee!",
    "I've got the jitters.",
    "Probably nothing.",
    "I thought I heard something.",
    "Oh well.",
    "Nothing.",
    "Can't hear it now.",
    "I've been up too long.",
    "Hearing things, I guess.",
    "Hope it wasn't anything.",
    "Did I imagine that?",
]);

const linesDamage = new LineSet([
    "Oof!",
    "Krak!",
    "Pow!",
    "Urk!",
    "Smack!",
    "Bif!",
]);
