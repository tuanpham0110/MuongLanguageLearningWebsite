/**
 * Curated outbound learning resources and short, original reading guides.
 * Checked 2026-11-16; see prisma/data/PUBLIC_RESOURCES.md for source/access notes.
 * No third-party vocabulary dataset, video, recording or transcript is rehosted.
 */
const DIALECT_ARTICLE = 'muong-tho-ngu-va-nguon-hoc';
const TONE_ARTICLE = 'muong-nghe-thanh-dieu-kim-thuong';
const VIDEO_ARTICLE = 'muong-hoc-tu-video-cong-khai';

const DATASET = {
    title: 'Nguyễn Văn Tài — Từ vựng Tiếng Mường, Digitizing Việt Nam',
    url: 'https://www.digitizingvietnam.com/vi/our-collections/du-lieu-ngu-am-tieng-muong/tu-vung-tieng-muong',
    locator: 'Giới thiệu bộ dữ liệu và bảng đối chiếu 30 thổ ngữ',
    dialect: 'Nhiều thổ ngữ; chọn đúng hàng địa phương khi tra cứu',
    note: 'Nguồn dành cho giáo dục và nghiên cứu, cấm sử dụng thương mại. MUONGLAB chỉ dẫn liên kết tra cứu.',
};
const RECORDINGS = {
    title: 'Minh-Châu Nguyễn — Tư liệu kèm bài nghiên cứu ICPhS 2019',
    url: 'https://github.com/MinhChauNGUYEN/ICPhS-2019',
    locator: 'README; ExpToneSystem_MinimalSets; các tệp có đuôi _AUD.wav',
    dialect: 'Mường Kim Thượng, Phú Thọ, theo mô tả nghiên cứu',
    note: 'Tư liệu ngữ âm nghiên cứu, không phải giáo trình giao tiếp. Nghe tệp AUD; tệp EGG là tín hiệu đo hoạt động thanh quản.',
};
const THESIS = {
    title: 'LACITO–CNRS — Tóm tắt luận án của Minh-Châu Nguyên (2021)',
    url: 'https://lacito.cnrs.fr/enseignement/theses-soutenues/',
    locator: 'Mục ngày 14/12/2021; Glottalization, tonal contrasts and intonation: an experimental study of the Kim Thuong dialect of Muong',
    dialect: 'Mường Kim Thượng, Phú Thọ; không khái quát số thanh cho mọi vùng',
    note: 'Trang tóm tắt bằng tiếng Pháp; dùng chức năng tìm trên trang với từ “Kim Thuong”.',
};
const VIDEO_PROVIDER = 'Hội người Mường · Trai Xứ Mường';
const VIDEO_DIALECT = 'Kênh chưa nêu rõ thổ ngữ trong mô tả bài';
const VIDEO_NOTE = 'Học trực tiếp trên kênh tác giả; giữ cách viết của video khi ghi chép và hỏi thêm người nói tại địa phương bạn muốn học.';

export const PUBLIC_RESOURCES = [
    {
        id: 'video-giao-tiep', type: 'Bài học',
        title: 'Giới thiệu bản thân và giao tiếp cơ bản', provider: VIDEO_PROVIDER,
        url: 'https://www.youtube.com/watch?v=n3YKEsajKSU',
        description: 'Video bài 1 trong phần giao tiếp hằng ngày. Phù hợp để bắt đầu học theo tình huống.',
        dialect: VIDEO_DIALECT, access: 'Xem trên YouTube.', note: VIDEO_NOTE,
        steps: ['Chọn một đoạn giới thiệu ngắn để nghe trọn lượt.', 'Dừng từng câu, nhắc lại và ghi mốc thời gian để ôn.'],
        relatedArticleId: VIDEO_ARTICLE,
    },
    {
        id: 'video-gia-dinh', type: 'Bài học',
        title: 'Xưng hô trong gia đình — Nhân xưng Ho - Da', provider: VIDEO_PROVIDER,
        url: 'https://www.youtube.com/watch?v=Fbxdv2okdFo',
        description: 'Video bài 1, phần 1 về xưng hô trong gia đình. Tên bài giữ cách viết của tác giả.',
        dialect: VIDEO_DIALECT, access: 'Xem trên YouTube.', note: VIDEO_NOTE,
        steps: ['Ghi quan hệ gia đình đi cùng mỗi cách gọi.', 'Hỏi người bản địa cách xưng hô phù hợp với tuổi và hoàn cảnh.'],
        relatedArticleId: VIDEO_ARTICLE,
    },
    {
        id: 'video-phuong-huong', type: 'Bài học',
        title: 'Phương hướng – Vị trí', provider: VIDEO_PROVIDER,
        url: 'https://www.youtube.com/watch?v=bFTI42HhVUo',
        description: 'Video bài 4 của kênh, học theo chủ đề phương hướng và vị trí.',
        dialect: VIDEO_DIALECT, access: 'Xem trên YouTube.', note: VIDEO_NOTE,
        steps: ['Vừa nghe vừa chỉ vị trí trên một sơ đồ tự vẽ.', 'Chọn hai câu trong video để nghe lại vào ngày hôm sau.'],
        relatedArticleId: VIDEO_ARTICLE,
    },
    {
        id: 'tu-vung-30-tho-ngu', type: 'Tra cứu',
        title: 'Từ vựng tiếng Mường: đối chiếu theo thổ ngữ', provider: 'Nguyễn Văn Tài · Digitizing Việt Nam',
        url: DATASET.url,
        description: 'Bảng đối chiếu gần 1.000 mục từ ở 30 thổ ngữ, có tìm kiếm theo từ tiếng Việt.',
        dialect: DATASET.dialect, access: 'Truy cập công khai cho giáo dục và nghiên cứu; cấm sử dụng thương mại.',
        note: 'Bảng dùng ký hiệu phiên âm nghiên cứu; không tự đổi chúng thành chữ viết hoặc giọng đọc tiếng Việt.',
        steps: ['Tìm một từ tiếng Việt rồi chọn hàng thổ ngữ cần đối chiếu.', 'Ghi lại tên vùng và nguồn cùng mục từ.'],
        relatedArticleId: DIALECT_ARTICLE,
    },
    {
        id: 'ghi-am-kim-thuong', type: 'Nghe và xem',
        title: 'Nghe tư liệu ngữ âm Mường Kim Thượng', provider: 'Minh-Châu Nguyễn · ICPhS 2019',
        url: RECORDINGS.url,
        description: 'Kho ghi âm đi kèm nghiên cứu ngữ âm, có các bộ từ đối chiếu thanh điệu.',
        dialect: RECORDINGS.dialect, access: 'Kho công khai trên GitHub; giấy phép MIT được tác giả công bố.',
        note: 'Dành cho người muốn tìm hiểu sâu. Chọn tệp _AUD.wav để nghe; _EGG.wav là tín hiệu đo, không phải bản đọc.',
        steps: ['Đọc README để chọn nhóm bản ghi.', 'Mở thư mục âm thanh từ ExpToneSystem_MinimalSets và chọn tệp AUD.'],
        relatedArticleId: TONE_ARTICLE,
    },
    {
        id: 'nghien-cuu-thanh-dieu', type: 'Nghiên cứu',
        title: 'Thanh điệu và ngữ điệu: nghiên cứu ở Kim Thượng', provider: 'LACITO–CNRS · Minh-Châu Nguyên',
        url: THESIS.url,
        description: 'Tóm tắt luận án năm 2021 về thanh điệu, ngữ điệu và hiện tượng thanh hầu hóa.',
        dialect: THESIS.dialect, access: 'Đọc tóm tắt công khai bằng tiếng Pháp.',
        note: 'Tìm “Kim Thuong” hoặc ngày 14/12/2021 trên trang danh sách luận án. Đây là trang giới thiệu, không phải đường dẫn tải toàn văn.',
        steps: ['Đọc bài giải thích tiếng Việt trong Cẩm nang trước.', 'Đối chiếu phạm vi và kết quả nghiên cứu trong phần tóm tắt gốc.'],
        relatedArticleId: TONE_ARTICLE,
    },
];

export const PUBLIC_KNOWLEDGE_ARTICLES = [
    {
        id: DIALECT_ARTICLE, category: 'Kiến thức tiếng Mường',
        title: 'Thổ ngữ: vì sao nên ghi rõ vùng khi học tiếng Mường?',
        excerpt: 'Đọc bảng tra cứu theo địa phương và chọn nguồn học có phạm vi rõ ràng.',
        minutes: 3, draft: false,
        body: [
            { p: 'Tư liệu tiếng Mường cần được đọc cùng thông tin địa phương. Bảng do Nguyễn Văn Tài biên soạn trên Digitizing Việt Nam đặt 30 thổ ngữ cạnh nhau, trong đó có Mường Bi, Mường Thàng, Mường Động và Mường Vang.' },
            { h: 'Một hàng địa phương là một điểm đối chiếu' },
            { p: 'Khi tìm từ, hãy chọn hàng của vùng mình đang học rồi ghi tên vùng cùng nguồn. Nếu hai tài liệu ghi khác nhau, trước hết kiểm tra thổ ngữ và cách ghi âm của từng nguồn thay vì vội sửa một bên.' },
            { h: 'Phiên âm và chữ viết' },
            { p: 'Bảng tra cứu dùng ký hiệu phiên âm. Đây là cách biểu diễn âm cho nghiên cứu; người mới học nên nhờ người có chuyên môn hướng dẫn đọc ký hiệu, không đọc các con số và ký tự như chữ tiếng Việt.' },
            { list: ['Ưu tiên một nguồn có giọng nói và vùng rõ ràng để giữ nhịp học nhất quán.', 'Ghi tên tác giả, trang hoặc mốc video bên cạnh từ mới.', 'Khi một nguồn chưa nêu vùng, giữ ghi chú “chưa xác định thổ ngữ”.'] },
            { references: [DATASET] },
        ],
    },
    {
        id: TONE_ARTICLE, category: 'Kiến thức tiếng Mường',
        title: 'Tìm hiểu thanh điệu qua tư liệu Mường Kim Thượng',
        excerpt: 'Một ví dụ nghiên cứu có phạm vi cụ thể, kèm cách chọn bản ghi để nghe.',
        minutes: 4, draft: false,
        body: [
            { p: 'Thanh điệu cần được tìm hiểu trong từng thổ ngữ. Tóm tắt luận án năm 2021 của Minh-Châu Nguyên tại LACITO–CNRS nghiên cứu tiếng Mường ở Kim Thượng, Phú Thọ, với bản ghi của 20 người nói.' },
            { h: 'Kết quả này nói về vùng nào?' },
            { p: 'Trong phạm vi nghiên cứu Kim Thượng, tác giả khảo sát năm thanh ở âm tiết không kết thúc bằng phụ âm tắc và hai thanh ở âm tiết kết thúc bằng phụ âm tắc. Không dùng các con số này để kết luận mọi vùng Mường đều có cùng hệ thống thanh điệu.' },
            { p: 'Nghiên cứu còn xem xét thanh hầu hóa: đặc điểm liên quan đến hoạt động của thanh quản khi tạo tiếng nói. Vì vậy, khi tìm hiểu thanh điệu, ngoài đường cao độ, chất giọng cũng là điều được các nhà nghiên cứu quan sát.' },
            { references: [THESIS] },
            { h: 'Nghe bản ghi nào?' },
            { p: 'Kho tư liệu ICPhS 2019 của Minh-Châu Nguyễn có các bản ghi Kim Thượng và tách tín hiệu thành hai loại tệp. Tệp có đuôi _AUD.wav là âm thanh để nghe; _EGG.wav là tín hiệu đo hoạt động thanh quản, không phải một giọng đọc khác.' },
            { list: ['Mở README của kho tư liệu, tìm ExpToneSystem_MinimalSets rồi theo liên kết Audio files.', 'Chọn một tệp AUD, nghe ở âm lượng vừa phải và so sánh các mẫu trong cùng bộ.', 'Đọc phần mô tả để biết người nói và điều kiện ghi; đây là tư liệu nghiên cứu, không thay cho hướng dẫn phát âm trực tiếp.'] },
            { references: [RECORDINGS] },
        ],
    },
    {
        id: VIDEO_ARTICLE, category: 'Học từ nguồn công khai',
        title: 'Một buổi học tiếng Mường từ video công khai',
        excerpt: 'Học theo tình huống, nghe lại từng câu và giữ nguồn cho những điều vừa học.',
        minutes: 3, draft: false,
        body: [
            { p: 'Kênh Hội người Mường có các video của Trai Xứ Mường về giới thiệu bản thân, xưng hô trong gia đình và phương hướng – vị trí. Bạn có thể mở từng bài từ mục Học liệu công khai trong Cẩm nang.' },
            { h: 'Chọn một tình huống cho mỗi buổi' },
            { list: ['Giới thiệu bản thân: chọn một đoạn hội thoại ngắn để nghe từ đầu đến cuối.', 'Xưng hô gia đình: ghi lại quan hệ và ngữ cảnh đi cùng cách gọi.', 'Phương hướng – vị trí: vẽ sơ đồ đơn giản và chỉ vị trí theo phần đang nghe.'] },
            { h: 'Gợi ý luyện trong 10 phút' },
            { list: ['2 phút đầu: nghe đoạn ngắn, nắm tình huống và vai người nói.', '4 phút tiếp: dừng từng câu, nghe lại và nhắc theo mẫu.', '2 phút tiếp: ghi lại câu bạn nghe rõ cùng nghĩa do video giải thích và mốc thời gian.', '2 phút cuối: tự nghe lại bản ghi của mình; đánh dấu chỗ cần hỏi người bản địa.'] },
            { p: 'Lịch luyện trên do MUONGLAB gợi ý. Mô tả các video chưa nêu rõ thổ ngữ; khi áp dụng vào giao tiếp tại địa phương, hãy hỏi thêm người nói ở vùng bạn muốn học. Tên bài và cách viết trong video được giữ theo tác giả.' },
            { references: PUBLIC_RESOURCES.filter((r) => r.type === 'Bài học').map((r) => ({ title: `${r.provider} — ${r.title}`, url: r.url, dialect: r.dialect })) },
        ],
    },
];

/** Add reading guides without reseeding or replacing administrator-authored articles. */
export function publicHandbook(content) {
    const existing = content.HANDBOOK ?? [];
    const ids = new Set(existing.map((article) => article.id));
    return {
        articles: [...existing, ...PUBLIC_KNOWLEDGE_ARTICLES.filter((article) => !ids.has(article.id))],
        vocabulary: content.VOCABULARY,
        sentences: content.SENTENCES,
        resources: PUBLIC_RESOURCES,
    };
}
