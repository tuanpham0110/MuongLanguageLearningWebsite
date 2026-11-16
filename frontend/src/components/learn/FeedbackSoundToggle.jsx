import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { feedbackSoundEnabled, prepareFeedbackSound, setFeedbackSoundEnabled, subscribeFeedbackSound } from '../../services/feedbackSound.js';

export default function FeedbackSoundToggle() {
    const [enabled, setEnabled] = useState(feedbackSoundEnabled);
    useEffect(() => subscribeFeedbackSound(setEnabled), []);
    return (
        <button
            type="button"
            className="feedback-sound"
            aria-label="Âm thanh đúng/sai"
            aria-pressed={enabled}
            title={enabled ? 'Tắt âm thanh khi trả lời đúng/sai' : 'Bật âm thanh khi trả lời đúng/sai'}
            onClick={() => {
                setFeedbackSoundEnabled(!enabled);
                if (!enabled) void prepareFeedbackSound();
            }}
        >
            <Icon name={enabled ? 'volume' : 'volume-off'} size={18} />
            <span>Âm thanh: {enabled ? 'Bật' : 'Tắt'}</span>
        </button>
    );
}
