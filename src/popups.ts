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

const dTShow: number = 2.0;

class Popups {
    currentPopup: string;
    currentPopupWorldPos: () => vec2;
    currentPopupSlide: number;
    currentPopupTimeRemaining: number;

    notification: string;
    notificationWorldPos: vec2;
    notificationTimeRemaining: number;

    constructor() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupSlide = 0;
        this.currentPopupTimeRemaining = 0;
        this.notification = '';
        this.notificationWorldPos = vec2.create();
        this.notificationTimeRemaining = 0;
    }

    setCur(text: string, posWorld: () => vec2, popupSlide: number) {
        this.currentPopup = text;
        this.currentPopupWorldPos = posWorld;
        this.currentPopupSlide = popupSlide;
        this.currentPopupTimeRemaining = dTShow;
    }

    setNotification(text: string, pos: vec2) {
        this.notification = text;
        vec2.copy(this.notificationWorldPos, pos);
        this.notificationTimeRemaining = dTShow;
    }

    hideNotification() {
        this.notificationTimeRemaining = 0;
    }

    isSpeechBubbleVisible(): boolean {
        return this.currentPopupTimeRemaining > 0;
    }

    isNotificationVisible(): boolean {
        return this.notificationTimeRemaining > 0;
    }

    animate(dt: number) {
        this.currentPopupTimeRemaining = Math.max(0, this.currentPopupTimeRemaining - dt);
        this.notificationTimeRemaining = Math.max(0, this.notificationTimeRemaining - dt);
    }

    toggleShow(pos: vec2) {
        vec2.copy(this.notificationWorldPos, pos);
        this.currentPopupTimeRemaining = (this.currentPopupTimeRemaining > 0) ? 0 : dTShow;
        this.notificationTimeRemaining = (this.notificationTimeRemaining > 0) ? 0 : dTShow;
    }

    reset() {
        this.currentPopup = '';
        this.currentPopupWorldPos = () => vec2.create();
        this.currentPopupSlide = 0;
        this.currentPopupTimeRemaining = 0;

        this.notification = '';
        vec2.zero(this.notificationWorldPos);
        this.notificationTimeRemaining = 0;
    }
}
