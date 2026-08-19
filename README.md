# Invite Link Builder V4

Bản V4 đã điền sẵn Firebase config cho project:

`wedding-invite-admin-b6c97`

## File cần upload lên GitHub Pages

```text
index.html
app.js
firebase-config.js
.nojekyll
```

Các file còn lại:

- `worker.js`: dán vào Cloudflare Worker nếu muốn dùng Worker V4.
- `firestore.rules`: dán vào Firebase Console → Firestore → Rules.
- `README.md`: hướng dẫn này.

## 1. Bật Firebase Authentication

Trong Firebase Console:

1. Mở project `wedding-invite-admin-b6c97`.
2. Vào **Security → Authentication**.
3. Chọn **Sign-in method**.
4. Bật **Email/Password**.
5. Bấm **Save**.
6. Sang tab **Users**.
7. Bấm **Add user** và tạo tài khoản quản trị.

Web không có chức năng tự đăng ký tài khoản.

## 2. Tạo Cloud Firestore

1. Firebase Console → **Databases & Storage → Firestore**.
2. Tạo database nếu chưa có.
3. Mở tab **Rules**.
4. Xóa Rules cũ.
5. Copy toàn bộ nội dung `firestore.rules`.
6. Bấm **Publish**.

Rules V4 dùng `ownerUid`, nên tài khoản tạo chiến dịch là chủ chiến dịch đó.

## 3. Upload GitHub Pages

Tạo repository, ví dụ `invite-link-builder`.

Upload vào thư mục ROOT:

```text
index.html
app.js
firebase-config.js
.nojekyll
```

Sau đó:

1. Repository → **Settings**.
2. **Pages**.
3. Build and deployment → **Deploy from a branch**.
4. Branch: `main`.
5. Folder: `/ (root)`.
6. Save.

GitHub Pages sẽ có URL dạng:

```text
https://USERNAME.github.io/invite-link-builder/
```

## 4. Nếu Firebase báo lỗi domain

Firebase Console:

**Security → Authentication → Settings → Authorized domains**

Thêm hostname, ví dụ:

```text
USERNAME.github.io
```

Không thêm `https://` và không thêm `/invite-link-builder/`.

## 5. Cấu hình Cloudflare Worker

Nếu Worker cũ đang chạy đúng thì có thể giữ nguyên.

Nếu dùng `worker.js` trong bộ V4:

1. Cloudflare → Workers & Pages.
2. Mở Worker.
3. Edit code.
4. Dán toàn bộ `worker.js`.
5. Deploy.
6. Copy địa chỉ `https://TEN-WORKER.workers.dev`.

## 6. Thiết lập chiến dịch lần đầu

Ví dụ:

```text
Mã chiến dịch:
tung-ngoc-wedding

Tên chiến dịch:
Tùng & Ngọc Wedding

Địa chỉ Worker:
https://TEN-WORKER.workers.dev

Link thiệp gốc:
https://tungngocwedding.love
```

Bấm **Lưu cấu hình**.

Sau đó nhập khách, mỗi tên một dòng, rồi bấm **+ THÊM KHÁCH MỜI**.

## 7. Cơ chế tránh copy trùng

Khách mới có trạng thái:

`CHƯA COPY`

Khi bấm **Copy link**, web sẽ:

1. Copy link vào clipboard.
2. Ghi `copiedAt` lên Firestore.
3. Chuyển trạng thái thành `ĐÃ COPY`.
4. Khóa nút copy của khách đó.

Mở lại trên máy khác bằng cùng tài khoản và cùng chiến dịch thì trạng thái vẫn được đồng bộ.

## 8. Các trạng thái

- CHƯA COPY
- ĐÃ COPY
- ĐÃ GỬI
- ĐÃ XÁC NHẬN
- KHÔNG THAM DỰ

## 9. V4 chống nhập trùng khách

V4 kiểm tra khách đã tồn tại trên Firestore trước khi thêm.

Nếu cùng tên đã tồn tại:

- không ghi đè;
- không reset trạng thái;
- không tạo bản trùng;
- báo số khách bị bỏ qua.

## 10. Kiểm tra sau khi deploy

1. Mở GitHub Pages.
2. Đăng nhập.
3. Lưu chiến dịch.
4. Thêm một khách.
5. Bấm Copy link.
6. Kiểm tra trạng thái chuyển sang `ĐÃ COPY`.
7. F5 trang.
8. Trạng thái vẫn phải là `ĐÃ COPY`.
9. Mở trên điện thoại.
10. Đăng nhập cùng tài khoản.
11. Nhập cùng Mã chiến dịch và bấm **Mở chiến dịch**.
12. Kiểm tra khách vẫn là `ĐÃ COPY`.

Nếu đủ các bước trên, Firebase V4 đang chạy đúng.
