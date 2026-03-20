
# Guide Highlight Tool V6.3.1 Fixed

Đây là bản fix full cho hai lỗi chính:
1. Sau khi vừa chọn vùng xong không còn tự sinh badge số 1.
2. Trong editor, nếu chưa có badge thì ảnh không bị tối và không áp dụng hiệu ứng.

## Điểm đã sửa
- `selection.js`
  - chặn click đầu tiên ngay sau mouseup của bước crop
- `editor.js`
  - chỉ apply blur/highlight khi có ít nhất 1 badge
  - vẫn giữ khung crop và handles để chỉnh vùng xuất
- export all
  - mỗi file chỉ có đúng 1 badge
- file naming
  - vẫn theo `guide/[prefix]-buoc-01.webp`
