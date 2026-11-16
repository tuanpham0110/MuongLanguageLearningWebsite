import { useCallback, useEffect, useRef } from 'react';
import { playFeedbackSound, prepareFeedbackSound, stopFeedbackSound } from '../services/feedbackSound.js';

export default function useFeedbackSound() {
    const active = useRef(true);
    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
            stopFeedbackSound();
        };
    }, []);
    const play = useCallback((correct) => {
        if (active.current) void playFeedbackSound(correct);
    }, []);
    return { prepare: prepareFeedbackSound, play };
}
