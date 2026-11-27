# IELTS Reading Lab

Ứng dụng luyện thi IELTS Reading chạy hoàn toàn trên trình duyệt. Tải file `.docx` / `.doc` lên, hệ thống tự nhận diện passage, câu hỏi, dạng câu và đáp án, rồi dựng thành một bài thi mô phỏng giao diện IELTS computer-based.

Không server, không tài khoản, không quảng cáo. File và bài làm chỉ nằm trên máy của bạn.

## Tính năng

- **Tự động phân tích file Word**
  - Nhận diện nhiều passage (`READING PASSAGE 1/2/3...` hoặc heading tương đương).
  - Nhận diện nhóm câu hỏi, số thứ tự, dạng câu và danh sách lựa chọn.
  - Đọc bảng đáp án ở cuối file (`ANSWER KEY`, `1. TRUE`, `2. B`, ...), kể cả đáp án viết gọn trên một dòng.
  - File `.docx` đọc bằng Mammoth; file `.doc` cũ được trích xuất văn bản best-effort.
- **Thời gian tự động**
  - 1 passage = 20 phút, 2 = 40 phút, 3 = 60 phút.
  - File có hơn 3 passage sẽ hiện thông báo và cho chọn passage; thời gian tính lại theo lựa chọn.
- **Phòng thi**
  - Passage bên trái, câu hỏi bên phải; tablet/mobile có nút chuyển view.
  - Đồng hồ đếm ngược, cảnh báo còn 5 phút / 1 phút, tự nộp khi hết giờ.
  - Đánh dấu câu đã trả lời, thanh điều hướng câu hỏi, xác nhận trước khi nộp.
  - Tô sáng 3 màu, ghi chú trên passage, danh sách ghi chú, xóa toàn bộ highlight.
- **Chấm điểm & Review**
  - Có đủ đáp án: chấm tự động, hiện đúng/sai từng câu.
  - Thiếu/không có đáp án: chuyển sang Review tự chấm Đúng/Sai từng câu; điểm cập nhật ngay.
  - Luôn hiện câu trả lời của bạn, đáp án (nếu có) và ô ghi chú/giải thích.
  - Lọc câu hỏi theo trạng thái.
- **Lịch sử**
  - Lưu cục bộ bằng IndexedDB: tên file, thời điểm nộp, passage đã chọn, điểm, thời gian làm, câu trả lời, highlight, ghi chú.
  - Xem chi tiết, xóa từng bài hoặc xóa toàn bộ.

## Dạng câu hỏi hỗ trợ

Multiple choice (một/nhiều đáp án), True/False/Not Given, Yes/No/Not Given, Matching headings, Matching information, Matching features, Matching sentence endings, Sentence completion, Summary completion, Notes completion, Table completion, Diagram labelling, Short answer.

## Công nghệ

- Next.js 16 (App Router) + React 19 + TypeScript
- Zustand (session state, lưu bằng `sessionStorage`)
- IndexedDB qua `idb` (lịch sử bài làm)
- Mammoth (`.docx`), CFB + đọc bảng piece table (`.doc`)
- Lucide icons, CSS Modules

## Chạy local

Yêu cầu Node.js 20+.

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`.

Các lệnh khác:

```bash
npm run lint     # ESLint
npm test         # Unit test parser/scoring
npm run build    # Production build
npm start        # Chạy bản build
npm run sample   # Tạo lại file mẫu public/samples/ielts-reading-demo.docx
```

Bài mẫu có sẵn tại `public/samples/ielts-reading-demo.docx` (3 passage, 23 câu, đủ đáp án).

## Cấu trúc chính

```
src/
  app/                      # Route: /, /exam, /review, /history
  components/               # UI dùng chung (Button, Modal, Logo, SiteHeader)
  features/reading/
    components/upload/      # Landing, dropzone, preview chọn passage
    components/exam/        # Exam screen, passage panel, question panel/nav
    components/review/      # Review screen + card tự chấm
    components/history/     # Danh sách & chi tiết lịch sử
    hooks/                  # Timer
    store/                  # Zustand exam store
    history/                # IndexedDB + build attempt record
  lib/
    parser/                 # document, docx, legacy-doc, passage/question detector, answer key
    scoring.ts              # Chuẩn hóa đáp án, chấm điểm
    types.ts                # Data model dùng chung
```

Để mở rộng sang Writing, có thể thêm `features/writing/*` và tái sử dụng `lib/types.ts`, store pattern, IndexedDB và các component UI chung.

## Giới hạn đã biết

- Parser dùng heuristic; file có bố cục quá khác chuẩn IELTS có thể cần chỉnh tiêu đề `READING PASSAGE`, số câu hoặc mục `ANSWER KEY`.
- `.doc` cũ chỉ trích xuất văn bản, không giữ định dạng/ảnh.
- Đáp án một phần sẽ chuyển cả bài sang tự chấm để tránh điểm không nhất quán; đáp án đã biết vẫn được hiển thị.
- Dữ liệu gắn với trình duyệt/thiết bị hiện tại; xóa dữ liệu trình duyệt sẽ xóa lịch sử.

## Triển khai Vercel

Đã triển khai production: https://ielts-reading-lab-red.vercel.app (project `duck-b678/ielts-reading-lab`).

Cách 1 — CLI:

```bash
npx vercel login
npx vercel --prod
```

Cách 2 — Dashboard:

1. Push repo lên GitHub/GitLab.
2. Vercel → **Add New Project** → import repo.
3. Framework preset: **Next.js** (mặc định). Không cần biến môi trường.
4. Deploy.

Ứng dụng là static/client-side; không cần cấu hình server hay database.
