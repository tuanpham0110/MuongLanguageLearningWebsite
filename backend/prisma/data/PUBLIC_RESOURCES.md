# Học liệu công khai trong Cẩm nang

Danh mục nằm tại `src/modules/content/public-resources.js`, trả về qua `GET /api/content/handbook` cùng ba bài đọc ngắn. Các bài trong database được giữ nguyên; nếu trùng ID, bài trong database được ưu tiên. Không cần seed lại hay migration. Mã frontend dùng `resources` để hiển thị mục **Cẩm nang → Học liệu công khai** (`/cam-nang?muc=hoc-lieu`).

Đối chiếu nguồn ngày **16/11/2026**:

| Nguồn | Phạm vi sử dụng và kiểm chứng |
| --- | --- |
| [Nguyễn Văn Tài, Digitizing Việt Nam](https://www.digitizingvietnam.com/vi/our-collections/du-lieu-ngu-am-tieng-muong/tu-vung-tieng-muong) | Đã mở bảng tương tác và mô tả. Dùng thông tin về phạm vi thổ ngữ và cách tra cứu; không nhập bảng từ vựng. Trang giới hạn sử dụng giáo dục/nghiên cứu, cấm thương mại. |
| [Kho tư liệu ICPhS 2019 của Minh-Châu Nguyễn](https://github.com/MinhChauNGUYEN/ICPhS-2019) | Đã đọc README, danh sách thư mục và thông tin giấy phép MIT. Dẫn nguồn bản ghi Kim Thượng, giải thích phân biệt AUD và EGG; không lưu bản ghi trên máy chủ ứng dụng. |
| [LACITO–CNRS, danh sách luận án](https://lacito.cnrs.fr/enseignement/theses-soutenues/) | Đã đọc mục Minh-Châu Nguyên ngày 14/12/2021. Các số liệu về thanh và người nói chỉ áp dụng cho thí nghiệm Kim Thượng. Dẫn trang tóm tắt tiếng Pháp; không quảng bá là toàn văn PDF. |
| [Giới thiệu bản thân và giao tiếp cơ bản](https://www.youtube.com/watch?v=n3YKEsajKSU) | Siêu dữ liệu gốc YouTube trong chỉ mục xác nhận kênh Hội người Mường, mô tả Trai Xứ Mường, tên bài, ngày 16/11/2024. |
| [Xưng hô trong gia đình: Ho - Da](https://www.youtube.com/watch?v=Fbxdv2okdFo) | Siêu dữ liệu gốc YouTube xác nhận kênh và tên bài; không suy ra ngày đăng cụ thể. |
| [Phương hướng – Vị trí](https://www.youtube.com/watch?v=bFTI42HhVUo) | Siêu dữ liệu gốc YouTube xác nhận kênh, tên bài, ngày 01/06/2025. |

Công cụ tra cứu không mở được trang xem trực tiếp của ba video, chưa nghe và chưa chép lời. Chỉ dẫn liên kết đến tác giả, không trích từ/câu mới, không suy ra thổ ngữ, không tạo đáp án chấm tự động từ video. Mô tả tác giả yêu cầu không đăng lại. Khả năng phát thực tế cần kiểm tra trong trình duyệt tại địa phương sử dụng.

Ba bài đọc là nội dung biên soạn ngắn của MUONGLAB, có dẫn nguồn trong từng bài. Phần lịch luyện và hướng dẫn ghi chú là gợi ý học tập của ứng dụng. Không dùng liên kết cũ của Báo Hòa Bình đang chuyển hướng sang trang không liên quan.
