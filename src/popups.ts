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
    GuardSeeTorchLit,
    GuardSeeUnlitTorch,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
    GuardFinishLightingTorch,
    GuardFinishLookingAtLitTorch,
    GuardStirring,
    GuardSeeTorchDoused,
}

class Popups {
    currentPopup: string;
    currentPopupWorldPos: () => vec2;
    currentPopupSlide: number;
    currentPopupTimeRemaining: number;

    constructor() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupSlide = 0;
        this.currentPopupTimeRemaining = 0;
    }

    setCur(text: string, posWorld: () => vec2, popupSlide: number) {
        this.currentPopup = text;
        this.currentPopupWorldPos = posWorld;
        this.currentPopupSlide = popupSlide;
        this.currentPopupTimeRemaining = 2.0;
    }

    reset() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupSlide = 0;
        this.currentPopupTimeRemaining = 0;
    }
}
