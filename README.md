# FileZalo Bot v1.0

Bot Zalo Framework - Hệ thống bot modular và mở rộng

## Cấu trúc dự án

```
filezalov1.0/
├── api/              → API Server
├── core/             → Core System
│   ├── controller/   → Quản lý data (Users, Threads)
│   ├── handle/       → Xử lý logic (Commands, Events)
│   └── loader/       → Load plugins
├── plugins/          → Plugins mở rộng
│   ├── commands/     → 50+ lệnh bot
│   └── events/       → Events tự động
├── utils/            → Utilities (logger, db, helpers)
├── models/           → Database models (Sequelize)
└── data/             → Data files (JSON, SQLite)
```

## Cài đặt

```bash
npm install
```

## Cấu hình

Tạo file `.env`:
```
BOT_TOKEN=your_zalo_bot_token
```

Hoặc chỉnh sửa `config.json`:
```json
{
  "admins": ["user_id_1", "user_id_2"],
  "phatnguoi": {
    "cooldown": 15,
    "chunk_size": 5
  }
}
```

## Chạy bot

```bash
npm start
```

Hoặc chạy ở chế độ development:
```bash
npm run dev
```

## Các lệnh

- `/start` - Khởi động bot
- `/menu` - Xem danh sách lệnh
- `/info` - Xem thông tin user
- `/phatnguoi` - Tra cứu phạt nguội
- `/checklive` - Check live/die Facebook
- `/broadcast` - Gửi thông báo (Admin only)

## Thêm lệnh mới

Tạo file trong `plugins/commands/`:

```javascript
module.exports = {
  name: 'mycommand',
  pattern: /\/mycommand(.*)/,
  async execute(bot, msg, match) {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Hello!');
  }
};
```

## Thêm event mới

Tạo file trong `plugins/events/`:

```javascript
module.exports = {
  name: 'myevent',
  eventName: 'message',
  async execute(bot, msg) {
    // Handle event
  }
};
```

## License

ISC

