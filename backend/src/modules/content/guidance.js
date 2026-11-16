const PREVIOUS_SHADOW_GUIDANCE = 'Bản ghi được giữ tạm trong trình duyệt để nghe lại. Chỉ khi bạn bấm nút chấm phát âm, bản ghi mới được gửi lên máy chủ và chuyển đến dịch vụ chấm đã cấu hình. Với Gemini, điểm chỉ ước lượng độ khớp của lời chép lại với câu mẫu, không phải đánh giá đầy đủ chất lượng phát âm.';
export const SHADOW_GUIDANCE = 'Bản ghi được giữ tạm trong trình duyệt để nghe lại. Chỉ khi bạn bấm đối chiếu, bản ghi mới được gửi đến dịch vụ đã cấu hình. Với Gemini, tỷ lệ % chỉ đếm âm tiết trùng giữa bản chép và câu mẫu, không đánh giá phát âm, thanh điệu hay ngữ điệu. AI có thể nhận dạng sai tiếng Mường; hãy tự nghe lại bản ghi.';

/** Render business guidance against the active rules, including previously seeded content. */
export function formatGuidance(text, threshold) {
    if (typeof text !== 'string') return text;
    if (text === PREVIOUS_SHADOW_GUIDANCE) return SHADOW_GUIDANCE;
    if (text === 'Bản ghi âm chỉ được lưu tạm trên trình duyệt của bạn để nghe lại, không được tải lên máy chủ. Hiện MUONGLAB chưa có công nghệ chấm điểm phát âm tự động cho tiếng Mường.') return SHADOW_GUIDANCE;
    return text
        .replace(/^(Đạt từ )\d+(% để hoàn thành chặng)$/, (_match, before, after) => `${before}${threshold}${after}`)
        .replace(/^(Mỗi bài cần đạt từ )\d+(% số câu nghe và ghép câu đúng ngay lần đầu để mở khoá bài tiếp theo\.)$/, (_match, before, after) => `${before}${threshold}${after}`);
}
