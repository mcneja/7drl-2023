export { Popup, PopupMessage, Popups, PopupType };

import { vec2 } from './my-matrix';
import { SubtitledHowls } from './audio';

enum PopupType {
    Damage,
    GuardChase,
    GuardSeeThief,
    GuardHearThief,
    GuardHearGuard,
    GuardDownWarning,
    GuardAwakesWarning,
    GuardWarningResponse,
    GuardInvestigate,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
    GuardStirring,
    SleeperAwakesWarning,
    SleeperBackToSleep,
    YellingForGuards,
    TrackerYellingForGuards,
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
        const subtitledSound = subtitledSounds[soundName].play(0.6);
        return subtitledSound.subtitle;
    }
}

function soundNameForPopupType(popupType: PopupType): string {
    switch (popupType) {
        case PopupType.Damage: return 'guardDamage';
        case PopupType.GuardChase: return 'guardChase';
        case PopupType.GuardSeeThief: return 'guardSeeThief';
        case PopupType.GuardHearThief: return 'guardHearThief';
        case PopupType.GuardHearGuard: return 'guardHearGuard';
        case PopupType.GuardDownWarning: return 'guardDownWarning';
        case PopupType.GuardAwakesWarning: return 'guardAwakesWarning';
        case PopupType.GuardWarningResponse: return 'guardWarningResponse';
        case PopupType.GuardInvestigate: return 'guardInvestigate';
        case PopupType.GuardEndChase: return 'guardEndChase';
        case PopupType.GuardFinishInvestigating: return 'guardFinishInvestigating';
        case PopupType.GuardFinishLooking: return 'guardFinishLooking';
        case PopupType.GuardFinishListening: return 'guardFinishListening';
        case PopupType.GuardStirring: return 'guardStirring';
        case PopupType.SleeperAwakesWarning: return 'sleeperAwakesWarning';
        case PopupType.SleeperBackToSleep: return 'sleeperBackToSleep';
        case PopupType.YellingForGuards: return 'yellingForGuards';
        case PopupType.TrackerYellingForGuards: return 'trackerYellingForGuards';
    }
}
