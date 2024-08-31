export { Popups, PopupType };

import { vec2 } from './my-matrix';

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
    GuardSeeUnlitTorch,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
    GuardFinishLightingTorch,
    GuardStirring,
    GuardSeeTorchDoused,
}

class Popups {
    currentPopup: string;
    currentPopupWorldPos: () => vec2;
    currentPopupBelow: boolean;
    currentPopupTimeRemaining: number;

    constructor() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupBelow = false;
        this.currentPopupTimeRemaining = 0;
    }

    setCur(text: string, posWorld: () => vec2, below: boolean) {
        this.currentPopup = text;
        this.currentPopupWorldPos = posWorld;
        this.currentPopupBelow = below;
        this.currentPopupTimeRemaining = 2.0;
    }

    reset() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupBelow = false;
        this.currentPopupTimeRemaining = 0;
    }
}
