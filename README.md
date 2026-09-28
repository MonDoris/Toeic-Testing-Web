# Bubble Sheet — Luyện thi TOEIC Listening, Reading & Writing

Ứng dụng web luyện thi TOEIC với backend **ASP.NET Core 9** theo **Clean Architecture** và frontend **React + Vite + Tailwind CSS v4 + Motion**.

## Kiến trúc

```text
src/
├── ToeicPractice.Domain          Entity, enum, quy tắc TOEIC (Part, số lựa chọn, thang điểm)
├── ToeicPractice.Application     Use case: Auth, Tests, Import đề, Attempts, Chấm điểm, Vocabulary, Grammar, Admin
│                                 + interface (IApplicationDbContext, IFileStorage, IDictionaryLookupService…)
├── ToeicPractice.Infrastructure  EF Core (SQL Server / SQLite), JWT, BCrypt, lưu file, client từ điển, seed dữ liệu
│   └── Seed/                     vocabulary.json · grammar/*.md · samples/*.zip (đề mẫu)
└── ToeicPractice.Api             Controllers, xử lý lỗi, JWT auth, phục vụ file upload + SPA
client/                           React SPA (build ra src/ToeicPractice.Api/wwwroot)
samples/                          Nguồn các đề mẫu (test.json + media)
tools/build-samples.ps1           Sinh ảnh/audio cho 3 đề mẫu đầu tiên (Windows Speech) và đóng gói .zip
tools/SampleBuilder/              Sinh audio MP3 + ảnh cho các gói đề trong samples/, kiểm tra và đóng gói .zip
```

Hướng phụ thuộc: `Api → Infrastructure → Application → Domain`.

## Chạy dự án

Yêu cầu: **Windows 10/11** (OCR và đọc PDF scan dùng Windows.Media.Ocr), .NET SDK 9+, Node.js 20+, SQL Server. Mặc định kết nối `KHUONGNE\SQLEXPRESS` (database `ToeicPractice`, Windows Authentication) — đổi trong `ConnectionStrings:Default` của `src/ToeicPractice.Api/appsettings.json`.

**Cách nhanh nhất:** nhấp đúp `run.bat` ở thư mục gốc → tự build giao diện (lần đầu), khởi động server và mở http://localhost:5076.

**Visual Studio:** mở `ToeicPractice.sln`, chọn `ToeicPractice.Api` làm Startup Project, nhấn F5 (cần chạy `npm install && npm run build` trong `client` một lần trước để có giao diện).

```bash
# 1. Backend – tự tạo CSDL và nạp dữ liệu mẫu ở lần chạy đầu
cd src/ToeicPractice.Api
dotnet run            # http://localhost:5076  (Swagger: /swagger)

# 2. Frontend (chế độ dev, proxy /api về backend)
cd client
npm install
npm run dev           # http://localhost:5173
```

Triển khai một cổng: `cd client && npm run build` → file build nằm trong `wwwroot` của Api, chạy `dotnet run` và mở http://localhost:5076.

Không có SQL Server? Đổi trong `appsettings.json`:
```json
"ConnectionStrings": { "Default": "Data Source=toeic.db" },
"Database": { "Provider": "Sqlite" }
```

### Tài khoản mặc định
| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@toeic.local | Admin@123 |
| Học viên demo | hocvien@toeic.local | Hocvien@123 |

> Đổi `Jwt:Secret` và mật khẩu seed trước khi triển khai thật.

## Tính năng

**Học viên**
- Đăng ký / đăng nhập (JWT), hồ sơ, điểm mục tiêu.
- **Đề thi** (menu *Đề thi*): đề TOEIC Listening & Reading đầy đủ 200 câu, Part 1–7, thời gian chuẩn 120 phút như phòng thi IIG:
  - Listening (Part 1–4) phát liên tục từ đầu đến cuối (~45 phút, có lời hướng dẫn đầu mỗi Part), không tạm dừng/tua/nghe lại, màn hình tự chuyển theo đoạn đang phát. Tải lại trang hay rời đi rồi quay lại thì audio tiếp tục đúng đoạn đang diễn ra theo thời gian thực.
  - Hết audio tự chuyển sang Reading (Part 5–7) 75 phút, phần Listening bị khoá; hết giờ tự nộp.
  - Kiểm tra âm thanh trước khi thi, vào lại bài thi đang làm dở, điểm quy đổi Listening + Reading = tổng 10–990.
- **Thi thử**: đếm giờ, tự nộp khi hết giờ, audio chỉ nghe 1 lần, phiếu trả lời dạng bubble sheet, lưu nháp khi tải lại trang.
- **Luyện tập theo Part**: xem ngay đáp án, giải thích, transcript; Writing có "Chấm thử" + bài mẫu.
- **Reading** (Part 5–7): đoạn văn Part 6/7 đặt cạnh câu hỏi, cố định khi cuộn; chỗ trống được đánh dấu.
- Kết quả: điểm quy đổi (Listening 5–495, Reading 5–495, Writing 0–200, đề thi L&R 10–990 kèm điểm từng phần), thống kê theo Part, chữa bài chi tiết, lọc câu sai.
- Từ vựng: tìm theo từ/nghĩa, lọc chủ đề & level, phát âm, sổ tay, flashcard; **tra trực tuyến** khi kho chưa có.
- Ngữ pháp: 18 chủ điểm trọng tâm kèm công thức và mẹo cho Listening/Writing.
- Dashboard: điểm cao nhất, độ chính xác theo Part, chuỗi ngày học, lịch sử.

**Admin**
- **Soạn đề từ PDF** (Listening / Reading / Writing), theo 4 bước:
  1. Upload **PDF đề thi** → hệ thống tự nhận diện Part, số câu, câu hỏi, lựa chọn (A)–(D), nhóm câu
     ("Questions X-Y refer to…"), đoạn văn Reading, từ khoá Writing, ảnh Part 1 / Writing Q1–5 → tạo đề **nháp**.
     PDF scan được đọc bằng OCR.
  2. Upload **đáp án** dạng ảnh chụp hoặc PDF → OCR/đọc tự động, điền sẵn lên *phiếu đáp án* dạng bubble để giáo viên soát lại và lưu.
     Writing: tách bài mẫu theo từng câu.
  3. **Listening:** upload audio – 1 file cả đề, theo Part, hoặc theo nhóm câu; tự ghép theo tên file
     (`full.mp3`, `part3.mp3`, `32-34.mp3`, `q07.mp3`) hoặc chọn vị trí thủ công.
  4. **Công khai** – chỉ cho phép khi đã đủ đáp án (và audio với Listening).
- Cách khác: nhập gói `.zip` (test.json + media) đã soạn sẵn; tải gói mẫu làm khuôn.
- Sửa thông tin đề, công khai/ẩn, sửa câu hỏi/đáp án/giải thích, thay audio/ảnh, sửa transcript; xoá đề.
- **Chấm Writing**: hàng đợi bài chờ chấm, chấm theo thang ETS (0–3 / 0–4 / 0–5, bước 0.5) kèm nhận xét, điểm quy đổi cập nhật ngay.
- Từ vựng: thêm/sửa/xoá, **tự điền từ từ điển trực tuyến**, nhập CSV/JSON, **bổ sung hàng loạt** phiên âm/audio/định nghĩa còn thiếu.
- Ngữ pháp: soạn Markdown có xem trước.
- Quản lý học viên (khoá/mở khoá), thống kê hệ thống.

## Định dạng gói đề (test.json)

`"skill"`: `"Listening"`, `"Reading"`, `"Writing"` hoặc `"ListeningReading"` (đề thi đầy đủ Part 1–7 trong một đề; Reading được 75 phút với đề chuẩn 120 phút, Listening chạy theo audio).

| part | Dạng bài | Bắt buộc | Câu / nhóm |
|---|---|---|---|
| 1 | Photographs | audio, image, answer A–D | 1 |
| 2 | Question–Response | audio, answer A–C | 1 |
| 3 | Conversations | audio, content + 4 options mỗi câu | 3 |
| 4 | Talks | audio, content + 4 options mỗi câu | 3 |
| 5 | Incomplete Sentences | content + 4 options | 1 |
| 6 | Text Completion | `passage` (hoặc ảnh), 4 options mỗi câu | 4 |
| 7 | Reading Comprehension | `passage` (hoặc ảnh), content + 4 options | 2–5 |
| 11 | Writing Q1–5 | image, đúng 2 `keywords` | 1 |
| 12 | Writing Q6–7 | `passage` (email), content | 1 |
| 13 | Writing Q8 | content (đề luận) | 1 |

Xem ví dụ đầy đủ trong `samples/listening-sample/`, `samples/reading-sample/` và `samples/writing-sample/`.

## Đề thi có sẵn

| Bộ đề | Cấu trúc |
|---|---|
| `samples/full-test-01` – TOEIC Listening & Reading Full Test 01 | 200 câu đúng số thứ tự đề thật: Part 1 (1–6) · Part 2 (7–31) · Part 3 (32–70, có 2 hội thoại 3 người, 3 câu hàm ý, 3 câu biểu đồ) · Part 4 (71–100) · Part 5 (101–130) · Part 6 (131–146) · Part 7 (147–200: 10 đoạn đơn, 2 đoạn kép, 3 bộ ba đoạn). Audio ~48 phút theo nhịp đề thật (5 giây sau Part 1–2, 8 giây sau mỗi câu Part 3–4), giải thích tiếng Việt cho mọi câu. |
| `samples/full-test-02` … `samples/full-test-21` – TOEIC Listening & Reading Full Test 02–21 | 20 đề cùng cấu trúc 200 câu như Full Test 01 (đủ 3 hội thoại 3 người, câu hàm ý, biểu đồ Part 3–4, câu chèn Part 6–7, 2 đoạn kép, 3 bộ ba đoạn). Mỗi đề một bộ chủ đề riêng, không lặp câu Part 2 / Part 5 / đoạn văn giữa các đề; đáp án phân bố đều A/B/C/D. Audio ~42–46 phút/đề, giải thích tiếng Việt cho mọi câu. Nội dung là đề tự biên soạn theo định dạng và độ khó đề IIG, không phải đề gốc của ETS. |

Với gói `"skill": "ListeningReading"`, SampleBuilder tự thêm lời hướng dẫn đầu mỗi Part, câu kết thúc phần Listening, dùng khoảng lặng chuẩn đề thật và kiểm tra đủ 200 câu đúng dải số của từng Part.

## Bộ đề luyện tập có sẵn

40 đề soạn theo cấu trúc đề TOEIC Listening & Reading của IIG Việt Nam (rút gọn, giữ đúng số thứ tự câu như đề thật), mỗi câu đều có giải thích tiếng Việt:

| Bộ đề | Cấu trúc | Dạng câu hỏi |
|---|---|---|
| `samples/listening-01` … `listening-20` (26 câu, ~10 phút audio) | Part 1: câu 1–2 · Part 2: 7–12 · Part 3: 32–40 · Part 4: 71–79 | Tranh mô tả, hỏi–đáp có bẫy âm/lặp từ, hội thoại 3 người, câu hỏi hàm ý ("What does the man mean…"), câu hỏi biểu đồ ("Look at the graphic") |
| `samples/reading-01` … `reading-20` (28 câu, 22 phút) | Part 5: 101–110 · Part 6: 131–134 · Part 7: 147–155 + đoạn kép 176–180 (đề lẻ) hoặc ba đoạn 186–190 (đề chẵn) | Từ loại, thì, giới từ/liên từ, mệnh đề quan hệ, câu điền cả câu, chuỗi tin nhắn, câu hỏi NOT, từ đồng nghĩa, chèn câu [1]–[4], câu hỏi liên kết nhiều đoạn |

Khi khởi động, `DataSeeder` tự nạp các gói `.zip` mới trong `Seed/samples` và các từ mới trong `vocabulary.json` vào cả CSDL đã có dữ liệu. Những gì đã nạp được ghi lại trong `App_Data/seed-state.json`, nên đề mà admin đã xoá sẽ không bị nạp lại (xoá file này để seed lại từ đầu; đề trùng tiêu đề luôn được bỏ qua).

### Sửa hoặc thêm đề
Soạn `samples/<tên-gói>/test.json` (xem các gói có sẵn làm mẫu), rồi chạy:
```bash
dotnet run --project tools/SampleBuilder                  # mọi gói trong samples/
dotnet run --project tools/SampleBuilder -- listening-05  # chỉ các gói có tên bắt đầu bằng "listening-05"
dotnet run --project tools/SampleBuilder -- --force       # tạo lại toàn bộ audio/ảnh
```
Công cụ chỉ sinh media còn thiếu, kiểm tra gói bằng đúng bộ validate của tính năng "Nhập gói đề", in phân bố đáp án, rồi ghi `.zip` vào `src/ToeicPractice.Infrastructure/Seed/samples`. Các trường thêm trong `test.json` (ứng dụng bỏ qua khi nhập):
- `scene` (Part 1): nền (`office`, `meeting`, `kitchen`, `store`, `warehouse`, `street`, `park`, `harbor`, `dock`, `station`, `lobby`, `beach`, `patio`, `library`, `site`) + danh sách emoji/hình khối → ảnh PNG.
- `graphic` (Part 3/4): `table`, `bars`, `map`, `card` → ảnh biểu đồ cho câu "Look at the graphic".
- `intro` ("conversation with three speakers", "telephone message"…), `voice` (giọng Part 1/4: `W`, `M`, `M2`), `voices` (Part 2, ví dụ `"W,M"`). Nhãn người nói trong transcript Part 3: `W:`, `M:`, `M1:`, `M2:`, `W1:`, `W2:`.

Yêu cầu: Windows 10/11 có giọng đọc Microsoft David, Zira, Mark (en-US) và Microsoft Edge (hoặc Chrome) để vẽ ảnh. Audio được xuất MP3 40 kbps mono.

## Nguồn dữ liệu từ vựng & ngữ pháp
- **Từ vựng seed** (742 từ, 21 chủ đề – gồm cả Giao thông, Chăm sóc khách hàng, Môi trường, Nghệ thuật & Truyền thông, Cụm động từ, Cụm từ cố định): tổng hợp từ và cụm từ thường gặp trong đề TOEIC, kèm phiên âm, nghĩa tiếng Việt, ví dụ song ngữ, từ đồng nghĩa và mốc điểm 450/650/850.
- **Làm giàu trực tuyến**: phiên âm, audio phát âm, định nghĩa tiếng Anh, từ đồng nghĩa lấy từ [Free Dictionary API](https://dictionaryapi.dev) (dữ liệu Wiktionary, CC BY-SA) — dùng nút *Tự điền* / *Bổ sung từ nguồn online* trong trang Admin.
- **Ngữ pháp**: 18 bài biên soạn riêng theo trọng tâm TOEIC Listening & Writing.

## Ghi chú về chấm điểm
- Listening và Reading quy đổi theo bảng ước tính riêng cho từng kỹ năng; đề rút gọn được chuẩn hoá theo tỉ lệ.
- Writing Q1–5 chấm tự động theo tiêu chí đo được (đủ 2 từ bắt buộc, một câu, hình thức). Q6–8 có điểm sơ bộ theo độ dài/bố cục và được đánh dấu **chờ giáo viên chấm**.
