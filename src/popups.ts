export { Popups, PopupType };

import { vec2 } from './my-matrix';
import { Guard } from './guard';
import { Player } from './game-map';

enum PopupType {
    Damage,
    GuardChase,
    GuardInvestigate,
    GuardSeeThief,
    GuardHearThief,
    GuardDownWarning,
    GuardAwakesWarning,
    GuardExamineStolenTreasure,
    GuardWarningResponse,
    GuardHearGuard,
    GuardSpotDownedGuard,
    GuardSeeTorchLit,
    GuardSeeUnlitTorch,
    GuardEndChase,
    GuardFinishInvestigating,
    GuardFinishLooking,
    GuardFinishListening,
    GuardFinishLightingTorch,
    GuardFinishLookingAtLitTorch,
    GuardStirring,
    GuardSpotStolenTreasure,
    GuardSeeTorchDoused,
}

const dtTurns: number = 1;
const dTShow: number = 2.0;

class Popups {
    currentSpeech: string;
    currentSpeaker: Guard | undefined;
    currentSpeechAbove: boolean;
    currentSpeechTimeRemaining: number;

    notification: string;
    notificationWorldPos: vec2|Player;
    notificationTimeRemaining: number;
    notificationMaxTurns: number;

    constructor() {
        this.currentSpeech = '';
        this.currentSpeaker = undefined;
        this.currentSpeechAbove = false;
        this.currentSpeechTimeRemaining = 0;
        this.notification = '';
        this.notificationMaxTurns = 0;
        this.notificationWorldPos = vec2.create();
        this.notificationTimeRemaining = 0;
    }

    setSpeech(text: string, speaker: Guard, aboveSpeaker: boolean) {
        this.currentSpeech = text;
        this.currentSpeaker = speaker;
        this.currentSpeechAbove = aboveSpeaker;
        this.currentSpeechTimeRemaining = dTShow;
    }

    setNotification(text: string, pos: vec2|Player, maxTurns:number = dtTurns, time:number = dTShow) {
        this.notification = text;
        this.notificationWorldPos = pos instanceof Player? pos : vec2.clone(pos);
        this.notificationTimeRemaining = time;
        this.notificationMaxTurns = maxTurns;
    }

    setNotificationHold(text: string, pos: vec2|Player) {
        this.notification = text;
        this.notificationWorldPos = pos instanceof Player? pos : vec2.clone(pos);
        this.notificationTimeRemaining = Infinity;
        this.notificationMaxTurns = dtTurns;
    }

    updateNotification() {
        --this.notificationMaxTurns;
        if (this.notificationMaxTurns <= 0) {
            this.notificationTimeRemaining = 0;
            this.notificationMaxTurns = 0;
        }
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
        this.notificationWorldPos = new vec2(0, 0);
        this.notificationTimeRemaining = 0;
        this.notificationMaxTurns = 0;
    }
}
