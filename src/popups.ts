export { Popup, PopupMessage, Popups, PopupType };

import { vec2 } from './my-matrix';
import { SubtitledHowls } from './audio';

enum PopupType {
    Damage,
    GuardChase,
    GuardSeeThief,
    GuardHearThief,
    GuardHearGuard,
    GuardInvestigate,
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

    endOfUpdate(subtitledSounds: SubtitledHowls): string {
        if (this.popups.length === 0) {
            return '';
        }

        this.popups.sort((a, b) => a.popupType - b.popupType);

        const popup = this.popups[0];
        const soundName = soundNameForPopupType(popup.popupType);
        if(subtitledSounds[soundName]!==undefined) {
            const subtitledSound = subtitledSounds[soundName].play(0.6);
            return subtitledSound!==null? subtitledSound.subtitle: '';
        } else {
            console.log('Unknown sound', soundName);
            return '';
        }
    }
}

function soundNameForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return 'guardDamage';
        case PopupType.GuardChase: return 'guardChase';
        case PopupType.GuardSeeThief: return 'guardSeeThief';
        case PopupType.GuardHearThief: return 'guardHearThief';
        case PopupType.GuardHearGuard: return 'guardHearGuard';
        case PopupType.GuardInvestigate: return 'guardInvestigate';
        case PopupType.GuardEndChase: return 'guardEndChase';
        case PopupType.GuardFinishInvestigating: return 'guardFinishInvestigating';
        case PopupType.GuardFinishLooking: return 'guardFinishLooking';
        case PopupType.GuardFinishListening: return 'guardFinishListening';
    }
}
