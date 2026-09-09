# GộpPDF — File → PDF Merger

Ứng dụng tiếng Việt để chuyển đổi, sắp xếp và gộp PDF, ảnh và tài liệu Office thành một PDF duy nhất. PDF/ảnh được xử lý ngay trong trình duyệt; chỉ Word, Excel và PowerPoint mới được tải lên backend LibreOffice.

## Kiến trúc

```text
Trình duyệt / Next.js
├── PDF                  ─┐
├── JPG / PNG / WEBP     ─┼─ pdf-lib ─→ PDF cuối ─→ tải xuống
└── Office ─→ FastAPI ─→ LibreOffice ─→ PDF ──────┘
```

- `frontend/`: frontend Next.js + TypeScript + Tailwind CSS, sẵn sàng deploy Vercel.
- `backend/`: API FastAPI, LibreOffice headless, sẵn sàng deploy Render bằng Docker.
- `tests/`: smoke test bản build frontend.
- `backend/tests/`: test validation, health và conversion contract.
- `render.yaml`: Render Blueprint.

Không có database, tài khoản hay dịch vụ chuyển đổi trả phí. Backend dùng thư mục tạm riêng cho mỗi request và xóa ngay sau khi trả kết quả.

## Yêu cầu

- Node.js 22.13 trở lên
- Python 3.12 trở lên
- LibreOffice (chỉ cần cho backend local; Dockerfile đã tự cài)

macOS:

```bash
brew install --cask libreoffice
```

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu fonts-liberation
```

## Chạy local

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

Kiểm tra tại `http://localhost:8000/health`. `ready: true` nghĩa LibreOffice đã sẵn sàng.

### 2. Frontend

Mở terminal khác:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Mở `http://localhost:3000`. Biến `NEXT_PUBLIC_API_URL` phải trỏ tới backend, không có dấu `/` cuối.

## Biến môi trường

Frontend:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL backend LibreOffice |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | URL frontend cho metadata |

Backend:

| Biến | Mặc định | Ý nghĩa |
|---|---:|---|
| `PORT` | `8000` | Cổng chạy API |
| `MAX_FILE_SIZE_MB` | `100` | Dung lượng tối đa mỗi tệp |
| `MAX_TOTAL_SIZE_MB` | `500` | Cấu hình giới hạn tổng để mở rộng batch API |
| `MAX_FILES` | `50` | Cấu hình số tệp tối đa để mở rộng batch API |
| `MAX_CONCURRENCY` | `2` | Số lượt LibreOffice chạy đồng thời |
| `CONVERSION_TIMEOUT_SECONDS` | `120` | Timeout mỗi lần chuyển đổi |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Danh sách origin, phân cách bằng dấu phẩy |
| `LIBREOFFICE_PATH` | tự tìm | Đường dẫn `soffice` nếu không có trong PATH |

## Deploy backend lên Render

1. Đẩy source lên GitHub/GitLab.
2. Trong Render chọn **New → Blueprint** và chọn repository. Render đọc `render.yaml` và build `backend/Dockerfile`.
3. Điền `ALLOWED_ORIGINS` bằng URL Vercel chính thức, ví dụ `https://goppdf.vercel.app`. Có thể thêm nhiều origin, phân cách bằng dấu phẩy.
4. Sau khi deploy, mở `https://<render-service>/health` và kiểm tra `ready: true`.
5. Gói miễn phí có thể cold start. Frontend tự ping, hiển thị trạng thái khởi động và retry hữu hạn trước khi báo lỗi.

## Deploy frontend lên Vercel

1. Import cùng repository vào Vercel.
2. Framework preset: **Next.js**; root directory chọn `frontend`.
3. Thêm:
   - `NEXT_PUBLIC_API_URL=https://<render-service>`
   - `NEXT_PUBLIC_SITE_URL=https://<vercel-domain>`
4. Deploy, sau đó cập nhật `ALLOWED_ORIGINS` trên Render đúng URL Vercel và redeploy backend.
5. Kiểm tra CORS bằng một file Office thật, sau đó kiểm tra PDF + ảnh để xác nhận luồng browser-side.

## Kiểm thử

Frontend:

```bash
npm test
npm run lint
```

Backend:

```bash
cd backend
pytest -q
```

Test tích hợp LibreOffice sẽ tự skip nếu máy không cài LibreOffice. Để kiểm tra end-to-end production, dùng ít nhất một tệp thật cho mỗi nhóm: XLSX, DOCX, PPTX, PDF, JPG, PNG và WEBP; xác minh số trang và thứ tự trong PDF tải về.

## API

### `GET /health`

```json
{
  "status": "online",
  "converter": "libreoffice",
  "ready": true,
  "timestamp": 1770000000
}
```

### `POST /convert`

Body `multipart/form-data`, trường `file`. Response thành công là binary `application/pdf`; số trang nằm trong header `X-PDF-Pages`. Lỗi dùng JSON `{ "detail": "Thông báo tiếng Việt" }` và status 413/415/422/504 phù hợp.

## Bảo mật và vận hành

- Chỉ nhận whitelist Office; kiểm tra extension, MIME và file signature.
- Tên file được sanitize và thêm ID ngẫu nhiên.
- Command LibreOffice là mảng tham số cố định, không chạy shell và không nhận command từ người dùng.
- Mỗi conversion có profile LibreOffice riêng, timeout và giới hạn concurrency.
- Không log nội dung hoặc tên file đầy đủ; log request ID, extension, byte, trạng thái và số trang.
- Temporary directory tự cleanup cả khi lỗi/timeout.
- Frontend kiểm tra signature lại trước khi xử lý, giới hạn 100 MB/tệp, 500 MB/tổng và 50 tệp/lượt.

## Xử lý sự cố

- **`ready: false`**: LibreOffice chưa cài hoặc không nằm trong PATH; đặt `LIBREOFFICE_PATH`.
- **Frontend báo bộ xử lý chưa sẵn sàng**: mở `/health`, kiểm tra Render đã thức và `ALLOWED_ORIGINS` đúng domain frontend.
- **CORS trong Console**: URL phải khớp hoàn toàn protocol + domain, không kèm path.
- **Conversion timeout**: tăng `CONVERSION_TIMEOUT_SECONDS`; kiểm tra RAM và file có quá phức tạp/hỏng không.
- **Font/layout Office lệch**: bổ sung font tương ứng vào Dockerfile. LibreOffice chỉ giữ được font đã cài trên server.
- **PDF mã hóa**: pdf-lib có thể từ chối một số PDF được bảo vệ; hãy mở khóa bằng phần mềm sở hữu file trước.
- **Thiếu bộ nhớ trên mobile**: giảm số lượng/dung lượng file; PDF lớn được giữ vector nhưng vẫn cần buffer trong RAM khi merge.

## Giới hạn có chủ đích

- Backend v1 xử lý từng file Office qua `/convert`; frontend giữ đúng thứ tự và merge sau khi từng conversion hoàn tất.
- Preview được tải theo yêu cầu: ảnh hiển thị trực tiếp; PDF dùng trình xem tích hợp của trình duyệt; Office được chuyển thành PDF qua backend và cache trong phiên để tái sử dụng khi gộp.
- Với Excel, phần **Cài đặt → Bố cục Excel** hỗ trợ giữ thiết lập in gốc, vừa chiều rộng, thu nhỏ vừa một trang hoặc tỉ lệ tùy chỉnh 25–150%; có thể chọn A4/A3/Letter và hướng tự động/ngang/dọc. Mặc định “Vừa chiều rộng” đặt lại vùng in theo toàn bộ vùng dữ liệu để tránh mất cột.
- Chất lượng chuyển đổi Office phụ thuộc LibreOffice và font có trong container.
