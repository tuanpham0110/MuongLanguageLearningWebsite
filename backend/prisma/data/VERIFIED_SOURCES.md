# Học liệu bổ sung đã đối chiếu

## Gói `sources-vtd2014-v1`

- **Tác giả:** Vũ Tiến Dũng, Khoa Tiểu học – Mầm non, Trường Đại học Tây Bắc.
- **Bài nghiên cứu:** *Tìm hiểu một số cách thức xưng hô trong giao tiếp tiếng Mường*.
- **Ấn phẩm:** JOURNAL OF SCIENCE OF HNUE, Social Sci., 2014, tập 59, số 3, trang 109–115.
- **Bản đối chiếu:** [trang lưu bản PDF](https://timtailieu.vn/tai-lieu/tim-hieu-mot-so-cach-thuc-xung-ho-trong-giao-tiep-tieng-muong-70301/).
- **PDF được đọc:** [7 trang, trình xem của trang nguồn liên kết](https://s2.timtailieu.vn/2cc751c17fa866ad498152b45b1493f7/demo/2021/08/12/tim_hieu_mot_so_cach_thuc_xung_ho_trong_giao_tiep_tieng_muon_hBnFeSkfGP.png). Tên tệp kết thúc bằng `.png` nhưng nội dung là PDF 1.4.
- **SHA-256 của bản PDF đối chiếu:** `96237da1e48fadd5f015621c059bd00ce005ef8d809e80b0543b4a9f2053f99a`.
- **Ngày đối chiếu:** 15/11/2026.
- **Vùng/thổ ngữ:** tác giả không gán riêng vùng cho từng ví dụ. Hiển thị giới hạn này, không tự gán cho một vùng hay cho bộ chữ Hòa Bình 2016.

### Nội dung dùng trong ứng dụng

| Phần | Trang in | Cách sử dụng |
| --- | --- | --- |
| Cặp đại từ và phạm vi giao tiếp | 111–112 | Nghĩa người nói/người nghe, có lưu ý ngữ cảnh |
| Ông bà, bố mẹ, quan hệ thân tộc | 112–113 | Các cặp từ và nghĩa được nêu rõ trong bài |
| Các thế hệ con và cháu | 113 | Giữ nghĩa theo ví dụ trong nguồn, kể cả tổ hợp dễ nhầm với tiếng Việt |
| Hai câu mẫu | 113 | Giữ nguyên câu và nghĩa; tạo bài đọc hiểu, điền và sắp xếp từ |

Tổng cộng: **33 mục từ, 2 câu mẫu, 72 câu bài tập riêng, 7 bài học**. Bài ôn tái sử dụng câu hỏi đã có nguồn. Các câu hỏi, cách chia bài và lời giải thích là phần biên soạn của MUONGLAB; không sao chép nguyên bài nghiên cứu hoặc phân phối lại bản PDF. Không suy ra thêm câu tiếng Mường, phiên âm, thổ ngữ hay bản ghi âm. Chỉ có hai ví dụ câu ngắn được trích với dẫn nguồn.

### Nguồn đọc thêm

[Nguyễn Văn Tài — Từ vựng Tiếng Mường, Digitizing Việt Nam](https://www.digitizingvietnam.com/vi/our-collections/dan-toc-viet-nam-ngon-ngu-van-hoa/tu-vung-tieng-muong) là bảng đối chiếu 30 thổ ngữ. Đây là liên kết tra cứu thêm trong Cẩm nang, **không phải dữ liệu nhập cho gói này**. Trang nguồn ghi quyền truy cập cho mục đích giáo dục/nghiên cứu và cấm sử dụng thương mại. Không tự chuyển ký hiệu phiên âm của bảng sang cách viết dùng cho người mới học.

## Nạp vào database

`prisma/seed.js` gọi `installVerifiedContent()` sau khi nạp/giữ nội dung ban đầu:

- Thêm bài ở cuối chặng 2 đang có, cấp ID lớn hơn ID bài học hiện tại.
- Chỉ tạo bản ghi mới; không cập nhật/xóa nội dung cũ hay lịch sử học.
- Khóa giao dịch theo gói, ghi toàn bộ dữ liệu cùng bài Cẩm nang nguồn trong một transaction.
- Bài Cẩm nang có ID gói là dấu đã nhập: những lần deploy sau bỏ qua, giữ chỉnh sửa của admin.
- Thiếu chặng 2, trùng ID từ/câu hoặc lỗi ghi dữ liệu: rollback cả gói, không ghi trạng thái hoàn tất.

Nguồn theo từng câu bài tập nằm ở `Item.data.reference`; từ và câu mẫu có `source`, `dialect`, `note`. Khi sửa nội dung trong CMS cần đối chiếu lại nguồn hoặc gỡ nguồn cũ. Không cần migration schema cho gói dữ liệu này.
