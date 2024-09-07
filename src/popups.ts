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
    currentSpeech: string;
    currentSpeechWorldPos: () => vec2;
    currentSpeechSlide: number;
    currentSpeechTimeRemaining: number;

    notification: string;
    notificationWorldPos: vec2;
    notificationTimeRemaining: number;

    constructor() {
        this.currentSpeech = '';
        this.currentSpeechWorldPos = () => vec2.create();
        this.currentSpeechSlide = 0;
        this.currentSpeechTimeRemaining = 0;
        this.notification = '';
        this.notificationWorldPos = vec2.create();
        this.notificationTimeRemaining = 0;
    }

    setSpeech(text: string, posWorld: () => vec2, popupSlide: number) {
        this.currentSpeech = text;
        this.currentSpeechWorldPos = posWorld;
        this.currentSpeechSlide = popupSlide;
        this.currentSpeechTimeRemaining = dTShow;
    }

    setNotification(text: string, pos: vec2) {
        this.notification = text;
        vec2.copy(this.notificationWorldPos, pos);
        this.notificationTimeRemaining = dTShow;
    }

    setNotificationHold(text: string, pos: vec2) {
        this.notification = text;
        vec2.copy(this.notificationWorldPos, pos);
        this.notificationTimeRemaining = Infinity;
    }

    hideNotification() {
        this.notificationTimeRemaining = 0;
    }

    isSpeechBubbleVisible(): boolean {
        return this.currentSpeechTimeRemaining > 0;
    }

    isNotificationVisible(): boolean {
        return this.notificationTimeRemaining > 0;
    }

    animate(dt: number) {
        this.currentSpeechTimeRemaining = Math.max(0, this.currentSpeechTimeRemaining - dt);
        this.notificationTimeRemaining = Math.max(0, this.notificationTimeRemaining - dt);
    }

    toggleShow(pos: vec2) {
        vec2.copy(this.notificationWorldPos, pos);
        this.currentSpeechTimeRemaining = (this.currentSpeechTimeRemaining > 0) ? 0 : dTShow;
        this.notificationTimeRemaining = (this.notificationTimeRemaining > 0) ? 0 : dTShow;
    }

    reset() {
        this.currentSpeech = '';
        this.currentSpeechWorldPos = () => vec2.create();
        this.currentSpeechSlide = 0;
        this.currentSpeechTimeRemaining = 0;

        this.notification = '';
        vec2.zero(this.notificationWorldPos);
        this.notificationTimeRemaining = 0;
    }
}
