---
title: "Tài khoản, xác thực email và phân quyền theo vai trò; dev test mà không chạm dữ liệu thật"
description: "Bỏ tự đăng ký; Tổng quản trị mời nhân viên qua email, gán vai trò mẫu + quyền xem/sửa theo từng sổ; quên mật khẩu, đổi email có xác thực; nhật ký bảo mật; tài khoản quản trị không còn lấy mật khẩu từ .env."
status: code-complete (chưa commit, chưa deploy — chờ khách cấp Gmail gửi thư)
priority: P1
effort: 3d
branch: main
tags: [backend, frontend, auth, security]
created: 2026-11-05
---

# Tài khoản và phân quyền

## Mục tiêu (theo yêu cầu khách 05/11/2026)

- Dự án chỉ quản lý 3 sổ đang có (Thanh Hải, Vũ Gia, Anamtile). Không còn đường nào tạo thêm sổ hay tài khoản lạ.
- Phân quyền rõ ràng để sau này thêm nhân viên các khâu khác: **Tổng quản trị** cấp quyền, chọn quyền cho từng nhân viên ở từng sổ.
- Đủ các chức năng tài khoản: đăng nhập, đăng xuất mọi thiết bị, đổi mật khẩu, quên mật khẩu qua email, sửa thông tin, đổi email có xác thực, nhận lời mời qua email.
- Mật khẩu dev và quản trị khác nhau; dev test được toàn bộ hệ thống nhưng không biết mật khẩu quản trị và không đọc được dữ liệu doanh nghiệp qua ứng dụng.

## Quyết định đã chốt (05/11/2026)

| Câu hỏi | Chọn |
|---|---|
| Gửi email | Gmail SMTP (mật khẩu ứng dụng), thư viện `nodemailer` |
| Mô hình quyền | Vai trò mẫu + quyền chi tiết, quyền xem tách khỏi quyền sửa |
| Dev trên bản thật | Không có tài khoản; dev test trên máy mình bằng dữ liệu mẫu |
| Staging | Chưa dựng; dev test local (`npm run dev`, `seed:sample`) |

## Thiết kế

**Cấp quyền**
- `users.is_admin` = Tổng quản trị: quản lý người dùng, vai trò, nhật ký bảo mật; luôn là "Quản lý sổ" ở cả 3 sổ.
- Mỗi người ở mỗi sổ: không truy cập / Quản lý sổ (`owner`, toàn quyền nghiệp vụ trong sổ) / Nhân viên (`staff`) theo một vai trò mẫu, cộng phần chỉnh riêng từng ô.
- Quyền hiệu lực = quyền của vai trò ⊕ phần chỉnh riêng; quyền sửa kéo theo quyền xem cùng nhóm.
- Quyền xem mới: `xem_ban_hang`, `xem_nhap_hang`, `xem_thu_chi`, `xem_chi_phi`. Thành viên cũ được giữ nguyên những gì đang thấy.
- Chỉ Tổng quản trị thêm/sửa/gỡ người dùng (trước đây mọi chủ sổ đều làm được).

**Tài khoản**
- Không còn tự đăng ký. Tổng quản trị nhập email + vai trò → hệ thống gửi thư mời (hạn 7 ngày) → nhân viên đặt mật khẩu; bấm link là đã xác thực email.
- Quên mật khẩu: gửi link (hạn 60 phút, dùng 1 lần); trả lời giống nhau dù email có hay không.
- Đổi email: nhập mật khẩu, link gửi tới email mới (hạn 24 giờ); email cũ nhận thư báo.
- Mật khẩu mới: ít nhất 8 ký tự, có chữ và số. Đổi/đặt lại mật khẩu → mọi phiên cũ hết hiệu lực, chủ tài khoản nhận thư báo.
- Khóa tài khoản, đăng xuất mọi thiết bị, giới hạn số lần thử theo IP và theo email.
- Token trong link chỉ lưu dạng băm SHA-256; thư đã gửi thì xóa nội dung khỏi CSDL.

**Dev và dữ liệu thật**
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` chỉ tạo Tổng quản trị đầu tiên, bắt đổi mật khẩu ở lần đăng nhập đầu; về sau .env không đặt lại được mật khẩu (trừ chế độ dữ liệu mẫu trên máy dev).
- Lệnh `reset-password` trên máy chủ vẫn dùng khi khẩn cấp nhưng bắt đổi mật khẩu, ghi nhật ký bảo mật và gửi thư báo cho chủ tài khoản → không làm lén được.
- Bản chạy thật thiếu SMTP thì báo lỗi, không bao giờ in link đặt lại mật khẩu ra log. Máy dev thiếu SMTP thì in link ra console để test.
- Dữ liệu mẫu tạo sẵn tài khoản cho từng vai trò để dev test mọi màn hình.

## Giai đoạn

1. Máy chủ: bảng mới (`auth_tokens`, `roles`, `mail_outbox`, `security_log`, cột mới của `users`, `book_members.role_id`), nâng CSDL lên v8 kèm sao lưu.
2. Máy chủ: luồng tài khoản (`/api/auth/*`), gửi thư, quyền hiệu lực, RPC quản trị.
3. Giao diện: đăng nhập / quên mật khẩu / trang xử lý link, bắt đổi mật khẩu, Tài khoản của tôi, Quản trị người dùng · vai trò · nhật ký bảo mật, ẩn menu theo quyền xem.
4. Kiểm thử, cập nhật dữ liệu mẫu, tài liệu (`HUONG-DAN.md`, `docs/deploy-server.md`, `.env.example`).

## Tiêu chí hoàn thành

- Toàn bộ test máy chủ qua, có test mới cho mời / xác thực / quên mật khẩu / đổi email / khóa / quyền xem-sửa / chặn người không phải Tổng quản trị.
- Build giao diện qua; chạy thử local đi hết luồng mời → đặt mật khẩu → đăng nhập → bị chặn đúng quyền.
- Nâng cấp CSDL cũ: thành viên cũ giữ nguyên quyền đang có, chủ sổ cũ thành Tổng quản trị.

## Ngoài phạm vi

- Dựng staging trên máy chủ, mã hóa CSDL, đăng nhập 2 lớp (2FA).
- Deploy lên máy chủ (làm riêng sau khi khách cấp Gmail gửi thư).
