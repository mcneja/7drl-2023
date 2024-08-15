export { Popup, Popups, PopupType };

import { vec2 } from './my-matrix';
import { SubtitledHowls } from './audio';

enum PopupType {
    Damage,
    GuardChase,
    GuardInvestigate,
    GuardSeeThief,
    GuardHearThief,
    GuardDownWarning,
    GuardAwakesWarning,
    GuardWarningResponse,
    GuardHearGuard,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
    GuardStirring,
}

type Popup = {
    popupType: PopupType;
    posWorld: () => vec2;
    below: boolean;
}

class Popups {
    popups: Array<Popup>;

    currentPopup: string;
    currentPopupWorldPos: () => vec2;
    currentPopupBelow: boolean;
    currentPopupTimeRemaining: number;

    constructor() {
        this.popups = [];
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupBelow = false;
        this.currentPopupTimeRemaining = 0;
    }

    add(popupType: PopupType, posWorld: () => vec2, playerPos: vec2) {
        const below = posWorld()[1] < playerPos[1];
        this.popups.push({ popupType: popupType, posWorld: posWorld, below: below });
    }

    clear() {
        this.popups.length = 0;
    }

    reset() {
        this.popups.length = 0;
        this.currentPopup = '';
        this.currentPopupBelow = false;
        this.currentPopupTimeRemaining = 0;
    }

    endOfUpdate(posPlayer: vec2, subtitledSounds: SubtitledHowls): string {
        if (this.popups.length === 0) {
            return '';
        }

        this.popups.sort((a, b) => {
            if (a.popupType < b.popupType)
                return -1;
            if (a.popupType > b.popupType)
                return 1;
            const posA = a.posWorld();
            const posB = b.posWorld();
            const aDist = vec2.squaredDistance(posA, posPlayer);
            const bDist = vec2.squaredDistance(posB, posPlayer);
            if (aDist < bDist)
                return -1;
            if (aDist > bDist)
                return 1;
            return 0;
        });

        const popup = this.popups[0];

        const soundName = soundNameForPopupType(popup.popupType);
        const subtitledSound = subtitledSounds[soundName].play(0.6);

        this.currentPopup = subtitledSound.subtitle;
        this.currentPopupWorldPos = popup.posWorld;
        this.currentPopupBelow = popup.below;
        this.currentPopupTimeRemaining = 2.0;

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
    }
}
