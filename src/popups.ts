export { Popups, PopupType };

import { vec2 } from './my-matrix';
import { Guard } from './guard';

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
    GuardSeeStolenTreasure,
}

const dTShow: number = 2.0;

class Popups {
    currentSpeech: string;
    currentSpeaker: Guard | undefined;
    currentSpeechAbove: boolean;
    currentSpeechTimeRemaining: number;

    notification: string;
    notificationWorldPos: vec2;
    notificationTimeRemaining: number;

    constructor() {
        this.currentSpeech = '';
        this.currentSpeaker = undefined;
        this.currentSpeechAbove = false;
        this.currentSpeechTimeRemaining = 0;
        this.notification = '';
        this.notificationWorldPos = vec2.create();
        this.notificationTimeRemaining = 0;
    }

    setSpeech(text: string, speaker: Guard, aboveSpeaker: boolean) {
        this.currentSpeech = text;
        this.currentSpeaker = speaker;
        this.currentSpeechAbove = aboveSpeaker;
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

    clearNotification() {
        this.notification = '';
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

    toggleShow(posPlayer: vec2) {
        this.notificationTimeRemaining = (this.notificationTimeRemaining > 0) ? 0 : dTShow;

        if (this.currentSpeechTimeRemaining > 0) {
            this.currentSpeechTimeRemaining = 0;
        } else if (this.currentSpeaker !== undefined && this.currentSpeech !== '') {
            this.currentSpeechTimeRemaining = dTShow;
            this.currentSpeechAbove = this.currentSpeaker.pos[1] >= posPlayer[1];
        }
    }

    reset() {
        this.currentSpeech = '';
        this.currentSpeaker = undefined;
        this.currentSpeechAbove = false;
        this.currentSpeechTimeRemaining = 0;

        this.notification = '';
        vec2.zero(this.notificationWorldPos);
        this.notificationTimeRemaining = 0;
    }
}
