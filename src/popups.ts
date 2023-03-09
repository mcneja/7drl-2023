export { Popup, Popups, PopupType };

import { vec2 } from './my-matrix';

enum PopupType {
    Damage,
    GuardChase,
    GuardSeeThief,
    GuardHearThief,
    GuardHearGuard,
    Noise,
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

    currentMessage(): PopupMessage | null {
        this.popups.sort((a, b) => a.popupType - b.popupType);
        if (this.popups.length === 0) {
            return null;
        }

        const popup = this.popups[0];

        return { msg: messageForPopupType(popup.popupType), posWorld: popup.posWorld };
    }
}

function messageForPopupType(popupType: PopupType): string {
    switch (popupType) {
    case PopupType.Damage: return 'Thwack!';
    case PopupType.GuardChase: return 'I\'ll get you!';
    case PopupType.GuardSeeThief: return 'What do I see?';
    case PopupType.GuardHearThief: return 'I heard something!';
    case PopupType.GuardHearGuard: return 'I\'m coming!';
    case PopupType.Noise: return 'Creak!';
    case PopupType.GuardInvestigate: return 'Better check that out.';
    case PopupType.GuardEndChase: return 'Got away!';
    case PopupType.GuardFinishInvestigating: return 'Guess it was nothing';
    case PopupType.GuardFinishLooking: return 'Must have been rats.';
    case PopupType.GuardFinishListening: return 'I don\t hear it any more.';
    }
}
