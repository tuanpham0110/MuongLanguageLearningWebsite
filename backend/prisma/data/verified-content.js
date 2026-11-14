/**
 * Text checked against the seven-page original PDF, printed pp. 109–115.
 * Lexical pairs are factual data. The two short sentence examples are reproduced
 * with attribution; exercises, grouping and explanations are written for MUONGLAB.
 * No pronunciation, recording, regional attribution or new Mường sentence is inferred.
 */
export const PACK_ID = 'sources-vtd2014-v1';
export const REFERENCE = {
    title: 'Vũ Tiến Dũng (2014), Tìm hiểu một số cách thức xưng hô trong giao tiếp tiếng Mường',
    url: 'https://timtailieu.vn/tai-lieu/tim-hieu-mot-so-cach-thuc-xung-ho-trong-giao-tiep-tieng-muong-70301/',
    locator: 'JOURNAL OF SCIENCE OF HNUE, 59(3), mục 2.2.2, tr. 111–113',
    dialect: 'Tiếng Mường; bài nghiên cứu không tách riêng thổ ngữ cho từng ví dụ',
    note: 'Giữ cách viết của tác giả, không coi đây là cách viết chung cho mọi vùng. Bản PDF đối chiếu ngày 15/11/2026.',
};
const sourceAt = (page) => `Vũ Tiến Dũng (2014), HNUE 59(3), tr. ${page}. ${REFERENCE.url}`;
const word = (id, text, meaning, page, note = '') => ({
    id: `vtd14-${id}`, word: text, meaning, page, note,
    dialect: REFERENCE.dialect,
    source: sourceAt(page),
});

export const WORD_GROUPS = [
    {
        key: 'xung-ho', title: 'Xưng hô: người nói và người nghe', topic: 'Xưng hô',
        goals: ['Phân biệt vai người nói và người nghe trong cặp ho – gia', 'Nhận biết cách gọi ông, bà', 'Dùng đại từ phù hợp quan hệ và hoàn cảnh giao tiếp'],
        words: [
            word('ho', 'ho', 'tôi (người nói)', 111, 'Nghĩa xưng hô phụ thuộc quan hệ và ngữ cảnh. Không mặc định dùng với người lớn tuổi hoặc trong tiếp dân.'),
            word('gia', 'gia', 'bạn (người nghe)', 111, 'Đi cùng ho trong tư liệu; có thể dịch khác theo quan hệ giao tiếp. Không đồng nhất với một cách gọi lịch sự cho mọi người.'),
            word('ong', 'ông', 'ông', 112),
            word('me', 'mệ', 'bà', 112),
        ],
    },
    {
        key: 'ong-ba', title: 'Gia đình: ông bà và bố mẹ', topic: 'Ông bà và bố mẹ',
        goals: ['Phân biệt ông bà nội và ngoại trong tư liệu', 'Nhận biết eeng và mạng', 'Đối chiếu cách viết với trang 112–113 của nguồn'],
        words: [
            word('ong-ta', 'ông tá', 'ông nội', 112),
            word('ong-moong', 'ông mộông', 'ông ngoại', 112),
            word('me-da', 'mệ dạ', 'bà nội', 112),
            word('me-moong', 'mệ mộông', 'bà ngoại', 112),
            word('eeng', 'eeng', 'bố', 112),
            word('mang', 'mạng', 'mẹ', 113),
        ],
    },
    {
        key: 'anh-em', title: 'Gia đình: anh chị em và quan hệ hôn nhân', topic: 'Anh chị em',
        goals: ['Nhận biết cách gọi anh, chị, em', 'Phân biệt anh rể và chị dâu', 'Không tự thay cách viết của nguồn bằng cách viết vùng khác'],
        words: [
            word('tua', 'tứa', 'anh', 113),
            word('cai', 'cái', 'chị', 113),
            word('un', 'ún', 'em', 113),
            word('eeng-tua', 'eeng tứa', 'anh trai', 112),
            word('eeng-chau', 'eeng cháu', 'anh rể', 113),
            word('mang-cai', 'mạng cái', 'chị gái', 113),
            word('mang-du', 'mạng du', 'chị dâu', 112),
        ],
    },
    {
        key: 'ho-hang', title: 'Họ hàng: bác, chú, cậu, cô và dì', topic: 'Họ hàng',
        goals: ['Phân biệt bác trai và bác gái', 'Nhận biết cách gọi cô và dì trong nguồn', 'Chọn từ theo đúng quan hệ thân tộc'],
        words: [
            word('bak', 'bák', 'bác trai', 113),
            word('pa', 'pá', 'bác gái', 113),
            word('chu', 'chú', 'chú', 113),
            word('cau', 'cậu', 'cậu', 113),
            word('y', 'ý', 'dì', 113),
            word('woa', 'woạ', 'cô', 113),
        ],
    },
    {
        key: 'con-chau', title: 'Gia đình: các thế hệ con và cháu', topic: 'Con và cháu',
        goals: ['Phân biệt con và cháu', 'Nhận biết con trai, con gái, cháu trai và cháu gái', 'Phân biệt quan hệ dâu và rể trong từng thế hệ'],
        words: [
            word('con', 'con', 'con', 113),
            word('con-tua', 'con tứa', 'con trai', 113),
            word('con-cai', 'con cái', 'con gái', 113, 'Trong ví dụ này, tổ hợp chỉ con gái; không đọc theo nghĩa gộp con cái của tiếng Việt.'),
            word('con-du', 'con du', 'con dâu', 113),
            word('con-chau', 'con cháu', 'con rể', 113, 'Trong ví dụ này, tổ hợp chỉ con rể; không đọc theo nghĩa gộp con cháu của tiếng Việt.'),
            word('thon', 'thôn', 'cháu', 113),
            word('thon-tua', 'thôn tứa', 'cháu trai', 113),
            word('thon-cai', 'thôn cái', 'cháu gái', 113),
            word('thon-du', 'thôn du', 'cháu dâu', 113),
            word('thon-chau', 'thôn cháu', 'cháu rể', 113),
        ],
    },
];

export const VERIFIED_SENTENCES = [
    { id: 'vtd14-me-nau-com', text: 'Mạng tang nố cơm.', meaning: 'Mẹ đang nấu cơm.', tokens: ['Mạng', 'tang', 'nố', 'cơm.'], blank: 0, page: 113 },
    { id: 'vtd14-chau-di-hoc', text: 'Thôn tứa ti học hảy.', meaning: 'Cháu trai đi học nhé.', tokens: ['Thôn', 'tứa', 'ti', 'học', 'hảy.'], blank: 1, page: 113 },
].map((s) => ({ ...s, topic: 'Câu mẫu gia đình', dialect: REFERENCE.dialect, source: sourceAt(s.page), note: 'Câu ví dụ nguyên văn; dùng để đọc hiểu cách viết trong nguồn, chưa có bản thu giọng bản ngữ.' }));

const referenceAt = (page) => ({ ...REFERENCE, locator: `HNUE 59(3), mục 2.2.2, tr. ${page}` });
const allWords = WORD_GROUPS.flatMap((group) => group.words);
function optionsFor(entry, field) {
    const choices = allWords.filter((other) => other.meaning !== entry.meaning).map((other) => other[field]);
    return [entry[field], ...new Set(choices)].slice(0, 4);
}

export function verifiedLessons() {
    const groups = WORD_GROUPS.map((group) => ({
        ...group,
        minutes: Math.max(4, Math.ceil(group.words.length * 0.8)),
        items: group.words.flatMap((entry) => [
            {
                id: `${entry.id}-meaning`, part: 'build', kind: 'fill',
                prompt: 'Đọc từ trong nguồn và chọn nghĩa tiếng Việt', before: `“${entry.word}” =`,
                options: optionsFor(entry, 'meaning'), answer: entry.meaning,
                explain: `Trong tư liệu, “${entry.word}” được dùng với nghĩa “${entry.meaning}”.${entry.note ? ` ${entry.note}` : ''}`,
                save: { type: 'word', ref: entry.id }, reference: referenceAt(entry.page),
            },
            {
                id: `${entry.id}-word`, part: 'build', kind: 'fill',
                prompt: 'Chọn cách viết tiếng Mường được ghi trong nguồn', before: `Cách gọi “${entry.meaning}” trong nguồn:`,
                options: optionsFor(entry, 'word'), answer: entry.word,
                explain: `Tư liệu ghi “${entry.word}” cho nghĩa “${entry.meaning}”.${entry.note ? ` ${entry.note}` : ''}`,
                save: { type: 'word', ref: entry.id }, reference: referenceAt(entry.page),
            },
        ]),
    }));
    const sentences = {
        key: 'doc-cau', title: 'Đọc câu mẫu: sinh hoạt và việc học', minutes: 6, words: [],
        goals: ['Hiểu hai câu mẫu đã đối chiếu với bản PDF', 'Sắp xếp đúng các từ theo câu nguồn', 'Phân biệt lời trần thuật và lời nhắn nhủ trong hai ví dụ'],
        items: VERIFIED_SENTENCES.flatMap((entry, i) => [
            {
                id: `${entry.id}-meaning`, part: 'build', kind: 'fill',
                prompt: 'Đọc câu mẫu và chọn nghĩa tiếng Việt', before: `“${entry.text}” =`,
                options: [entry.meaning, ...VERIFIED_SENTENCES.filter((s) => s.id !== entry.id).map((s) => s.meaning), 'Bố đang làm việc.', 'Bà đang nghỉ ngơi.'],
                answer: entry.meaning, explain: `Đây là câu ví dụ tại trang ${entry.page}; không tự thay từ để tạo thêm câu chưa được kiểm chứng.`,
                save: { type: 'sentence', ref: entry.id }, reference: referenceAt(entry.page),
            },
            {
                id: `${entry.id}-order`, part: 'build', kind: 'order',
                prompt: `Sắp xếp câu có nghĩa: ${entry.meaning}`,
                answer: entry.tokens, tokens: [...entry.tokens.slice(1), entry.tokens[0]],
                translation: entry.meaning, save: { type: 'sentence', ref: entry.id }, reference: referenceAt(entry.page),
            },
            {
                id: `${entry.id}-fill`, part: 'build', kind: 'fill',
                prompt: `Điền từ để khôi phục câu nguồn: ${entry.meaning}`,
                before: entry.tokens.slice(0, entry.blank).join(' '), after: entry.tokens.slice(entry.blank + 1).join(' '),
                options: i === 0 ? ['Mạng', 'Thôn', 'Tứa', 'Woạ'] : ['tứa', 'cái', 'du', 'cháu'],
                answer: entry.tokens[entry.blank], translation: entry.meaning,
                save: { type: 'sentence', ref: entry.id }, reference: referenceAt(entry.page),
            },
        ]),
    };
    const review = {
        key: 'on-tap', title: 'Ôn tập: xưng hô và gia đình theo tư liệu', minutes: 8, words: [],
        goals: ['Ôn cách gọi thành viên gia đình', 'Nhận ra các tổ hợp dễ nhầm với tiếng Việt', 'Đạt ngưỡng hoàn thành bằng câu trả lời đúng ngay lần đầu'],
        items: [...groups.flatMap((group) => group.items.filter((_item, i) => i % 4 === 0)), ...sentences.items.filter((item) => item.kind === 'order')],
    };
    return [...groups, sentences, review];
}

export function sourceArticle() {
    return {
        id: PACK_ID, category: 'Nguồn học liệu', title: 'Nguồn kiểm chứng: xưng hô và gia đình',
        excerpt: 'Xuất xứ, phạm vi sử dụng và cách đối chiếu nhóm bài bổ sung về xưng hô, gia đình.',
        minutes: 4, draft: false,
        body: [
            { p: 'Nhóm bài xưng hô và gia đình dùng các cặp từ và hai câu mẫu trong bài nghiên cứu của Vũ Tiến Dũng, JOURNAL OF SCIENCE OF HNUE, tập 59, số 3 (2014), trang 109–115. Nội dung được đối chiếu bản PDF 7 trang; mục dùng cho bài học nằm ở trang in 111–113.' },
            { h: 'Phạm vi ngôn ngữ' },
            { p: 'Bài nghiên cứu không xác định riêng thổ ngữ cho từng ví dụ. MUONGLAB giữ cách viết của tác giả và ghi rõ giới hạn này; không gán toàn bộ ví dụ cho Mường Bi, Mường Vang hay một vùng cụ thể.' },
            { p: 'Cách xưng hô phụ thuộc tuổi, vai giao tiếp, quan hệ và tình huống. Hiểu nghĩa một đại từ chưa đủ để coi đó là cách gọi phù hợp khi tiếp dân hoặc nói với người lớn tuổi.' },
            { p: 'Các bài bổ sung tập trung đọc hiểu vì tư liệu không kèm bản thu giọng bản ngữ. Bài tập và cách chia nhóm do MUONGLAB biên soạn; hai câu mẫu được giữ nguyên. Không có câu tiếng Mường mới do AI tự dịch trong nhóm bài này.' },
            { references: [REFERENCE] },
            { h: 'Tư liệu tra cứu thêm theo vùng' },
            { p: 'Bộ dữ liệu của Nguyễn Văn Tài trên Digitizing Việt Nam cho phép đối chiếu từ vựng của 30 thổ ngữ. Đây là nguồn đọc thêm; nhóm bài gia đình ở trên không chuyển ký hiệu phiên âm của bộ dữ liệu thành cách viết mới.' },
            { references: [{ title: 'Nguyễn Văn Tài — Từ vựng Tiếng Mường, Digitizing Việt Nam', url: 'https://www.digitizingvietnam.com/vi/our-collections/dan-toc-viet-nam-ngon-ngu-van-hoa/tu-vung-tieng-muong', locator: 'Bảng so sánh 30 thổ ngữ', note: 'Nguồn ghi điều kiện truy cập dành cho giáo dục và nghiên cứu, không cho phép sử dụng thương mại.' }] },
        ],
    };
}
