const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

// Load config
let ADMIN_IDS = ['655e072f987b7125286a']; // Default admin
let USER_COOLDOWN = 15 * 60 * 1000; // 15 phút mặc định

const Helpers = require('../../utils/helpers');

// Load config
const config = Helpers.loadConfig();
if (config.admins && Array.isArray(config.admins)) {
  ADMIN_IDS = config.admins;
}
if (config.phatnguoi && config.phatnguoi.cooldown) {
  USER_COOLDOWN = config.phatnguoi.cooldown * 60 * 1000; // Chuyển từ phút sang ms
}

const userCooldowns = new Map(); // Lưu thời gian check cuối cùng của mỗi user

// Helper: Kiểm tra user có phải admin không
function isAdmin(userId) {
  return Helpers.isAdmin(userId, config);
}

// Helper: Parse biển số để lấy mã tỉnh và series
function parseBienSo(bienSo) {
  // Format: 15G123456 -> { code: "15", series: "G1" }
  const match = bienSo.match(/^(\d{2})([A-Z])(\d+)$/);
  if (!match) return null;
  return {
    code: match[1],
    series: match[2] + match[3].charAt(0) // G + số đầu tiên
  };
}

// Helper: Tra cứu thông tin biển số từ databienso.json
function lookupBienSoInfo(bienSo) {
  try {
    const bienSoData = parseBienSo(bienSo);
    if (!bienSoData) return null;
    
    // Thử nhiều đường dẫn có thể
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'database', 'databienso.json'),
      path.join(__dirname, '..', '..', '..', 'database', 'databienso.json'),
      path.join(process.cwd(), 'database', 'databienso.json')
    ];
    
    let dataPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dataPath = p;
        break;
      }
    }
    
    if (!dataPath) return null;
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // data là object với các key là tên miền (Miền Bắc, Miền Trung, v.v.)
    // Tìm trong tất cả các miền
    for (const regionName of Object.keys(data)) {
      const region = data[regionName];
      if (Array.isArray(region)) {
        for (const province of region) {
          if (province.code === bienSoData.code) {
            // Tìm district theo series
            const district = province.district_series?.find(
              d => d.series === bienSoData.series
            );
            return {
              province: province.province,
              district: district?.district || 'Không xác định',
              code: bienSoData.code,
              series: bienSoData.series
            };
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Lỗi tra cứu biển số:', error);
    return null;
  }
}

// Helper: Tra cứu địa chỉ mới từ datasatnhap.json
function lookupNewAddress(diaDiem) {
  try {
    if (!diaDiem) return null;
    
    // Thử nhiều đường dẫn có thể
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'database', 'datasatnhap.json'),
      path.join(__dirname, '..', '..', '..', 'database', 'datasatnhap.json'),
      path.join(process.cwd(), 'database', 'datasatnhap.json')
    ];
    
    let dataPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dataPath = p;
        break;
      }
    }
    
    if (!dataPath) return null;
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    // Normalize địa điểm để tìm kiếm
    const normalize = (str) => (str || '').toLowerCase().trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
    
    const diaDiemNormalized = normalize(diaDiem);
    
    // Tìm kiếm trong dữ liệu
    for (const item of data) {
      const oldWard = normalize(item['`old_ward_name`'] || '');
      const oldDistrict = normalize(item['`old_district_name`'] || '');
      const oldProvince = normalize(item['`old_province_name`'] || '');
      
      // Kiểm tra xem địa điểm có chứa thông tin cũ không
      if (diaDiemNormalized.includes(oldWard) || 
          diaDiemNormalized.includes(oldDistrict) ||
          diaDiemNormalized.includes(oldProvince)) {
        return {
          oldWard: item['`old_ward_name`'],
          oldDistrict: item['`old_district_name`'],
          oldProvince: item['`old_province_name`'],
          newWard: item['`new_ward_name`'],
          newDistrict: item['`new_district_name`'] || item['`old_district_name`'],
          newProvince: item['`new_province_name`'] || item['`old_province_name`']
        };
      }
    }
    return null;
  } catch (error) {
    console.error('Lỗi tra cứu địa chỉ mới:', error);
    return null;
  }
}

// Hàm chia nhỏ tin nhắn dài thành nhiều phần
function splitMessage(text, maxLength = 4000) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let currentChunk = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // Nếu một dòng quá dài, cắt nó
      if (line.length > maxLength) {
        let remaining = line;
        while (remaining.length > maxLength) {
          chunks.push(remaining.substring(0, maxLength));
          remaining = remaining.substring(maxLength);
        }
        currentChunk = remaining + '\n';
      } else {
        currentChunk = line + '\n';
      }
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Hàm chính tra cứu phạt nguội
async function checkPhatNguoi(bot, msg, args) {
  const CHUNK_SIZE = 5; // mỗi tin nhắn tối đa 5 lỗi
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  
  // Xử lý arguments
  let rawBienSoParts = [];
  let loaixe = '1'; // Mặc định là ô tô (1)

  if (args.length > 0) {
    const lastArg = args[args.length - 1];
    // Nếu tham số cuối là 1 hoặc 2 thì đó là loại xe
    if (['1', '2'].includes(lastArg)) {
      loaixe = lastArg;
      rawBienSoParts = args.slice(0, -1);
    } else {
      rawBienSoParts = args;
    }
  }

  // Nối các phần của biển số và xóa ký tự đặc biệt
  const bienso = rawBienSoParts.join('').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  
  // Kiểm tra cooldown cho user (admin không bị giới hạn, bot tự động check cũng không bị giới hạn)
  const isBotAdmin = isAdmin(userId);
  const isAutoCheck = !userId; // Nếu không có userId thì là bot tự động check
  
  if (userId && !isBotAdmin && !isAutoCheck) {
    const lastCheck = userCooldowns.get(userId) || 0;
    const timePassed = Date.now() - lastCheck;
    
    if (timePassed < USER_COOLDOWN) {
      const timeLeft = USER_COOLDOWN - timePassed;
      const minutes = Math.floor(timeLeft / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      return bot.sendMessage(chatId, 
        `⏳ Bạn đã check phạt nguội gần đây!\n` +
        `⏰ Vui lòng đợi thêm: ${minutes} phút ${seconds} giây\n` +
        `ℹ️ Mỗi user chỉ được check 1 lần trong 15 phút.\n` +
        `👑 Admin không bị giới hạn.`
      );
    }
  }
  
  // Hiển thị menu hướng dẫn nếu không có biển số
  if (!bienso) {
    const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
    let menuMsg = `📖 *Hướng dẫn sử dụng lệnh phạt nguội*\n`;
    menuMsg += `👋 Chào ${senderName}!\n`;
    menuMsg += `📅 *Đăng ký check hằng ngày:*\n`;
    menuMsg += `   /phatnguoi add <bienso> [note]\n`;
    menuMsg += `   /phatnguoi list\n`;
    menuMsg += `   /phatnguoi del <bienso>\n`;
    menuMsg += `💡 *Ví dụ:*\n`;
    menuMsg += `   /phatnguoi 15F02023\n`;
    menuMsg += `   /phatnguoi add 15F02023\n`;
    menuMsg += `   /phatnguoi add 15F02023 Xe của tôi\n`;
    menuMsg += `🤖 *Check hằng ngày:*\n`;
    menuMsg += `   • Bot sẽ tự động check vào 8:00 sáng mỗi ngày\n`;
    menuMsg += `   • Mỗi chat đăng ký được 3 biển số miễn phí\n`;
    menuMsg += `   • Đăng ký thêm: 50,000đ/tháng cho 10 biển số\n`;
    menuMsg += `💬 Liên hệ Zalo: 0338739954 để nâng cấp\n`;
    
    return bot.sendMessage(chatId, menuMsg);
  }
  
  // Validate độ dài biển số
  if (bienso.length < 6) {
    return bot.sendMessage(chatId, 
      `❌ Biển số '${bienso}' quá ngắn hoặc không hợp lệ!\nVui lòng nhập đầy đủ biển số (Ví dụ: 14A654505)`
    );
  }

  // Cập nhật thời gian check cuối cùng (chỉ khi không phải admin và không phải auto check)
  if (userId && !isBotAdmin && !isAutoCheck) {
    userCooldowns.set(userId, Date.now());
  }

  const normalize = (s) => (s || '').toLowerCase().trim();
  const stripSpaces = (s) => (s || '').replace(/\s+/g, ' ').trim();

  try {
    // Hiển thị đang xử lý
    bot.sendChatAction(chatId, 'typing');
    
    // Step 1: GET homepage để lấy cookie
    const getRes = await axios.get('https://phatnguoixe.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 20000,
      httpsAgent: new https.Agent({ keepAlive: true })
    });
    const setCookies = getRes.headers['set-cookie'] || [];
    const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: POST tra cứu (kèm cookie)
    const form = new URLSearchParams();
    form.append('BienSo', bienso);
    form.append('LoaiXe', loaixe);

    const postWithRetry = async (max = 3) => {
      let lastErr;
      for (let attempt = 1; attempt <= max; attempt++) {
        try {
          return await axios.post('https://phatnguoixe.com/102699', form.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Origin': 'https://phatnguoixe.com',
              'Referer': 'https://phatnguoixe.com/',
              ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
            },
            timeout: 25000,
            httpsAgent: new https.Agent({ keepAlive: true })
          });
        } catch (err) {
          lastErr = err;
          const msg = String(err && (err.code || err.message || err));
          if (msg.includes('ECONNRESET') || msg.includes('socket hang up') || msg.includes('ETIMEDOUT')) {
            await new Promise(r => setTimeout(r, 500 * attempt));
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    };

    const response = await postWithRetry(3);
    const html = response.data || '';
    const $ = cheerio.load(html);

    // Check không có vi phạm
    const hasNoViolation = 
      $('h3').filter((_, el) => normalize($(el).text()).includes('không tìm thấy vi phạm')).length > 0 ||
      $('div').filter((_, el) => normalize($(el).text()).includes('không tìm thấy vi phạm')).length > 0 ||
      normalize(html).includes('không tìm thấy vi phạm');
    
    if (hasNoViolation) {
      const bienSoShown = $('b.h1').first().text().trim() || bienso;
      const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
      
      return bot.sendMessage(chatId, 
        `📫 Xin chúc mừng ${senderName}!\n🚗 Xe ${bienSoShown} không vi phạm ✅\n🌐 Nguồn: csgt.vn`
      );
    }

    // Lấy tổng số phát hiện/đã xử phạt
    const headerText = stripSpaces($('h3.css-1oevxvn').text());
    let foundTotal = 0;
    const matchFound = headerText.match(/Phát hiện\s*(\d+)/i);
    if (matchFound) foundTotal = parseInt(matchFound[1], 10) || 0;

    let chuaXuPhatHeader = 0;
    let daXuPhatHeader = 0;
    $('button.css-tt').each((_, el) => {
      const t = $(el).text().trim();
      const m1 = t.match(/(\d+)\s*CHƯA XỬ PHẠT/i);
      const m2 = t.match(/(\d+)\s*ĐÃ XỬ PHẠT/i);
      if (m1) chuaXuPhatHeader = parseInt(m1[1], 10) || chuaXuPhatHeader;
      if (m2) daXuPhatHeader = parseInt(m2[1], 10) || daXuPhatHeader;
    });

    // Kiểm tra nếu có 0 CHƯA XỬ PHẠT thì hiển thị thông báo không vi phạm
    if (chuaXuPhatHeader === 0 && foundTotal > 0) {
      const bienSoShown = $('b.h1').first().text().trim() || bienso;
      const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
      
      return bot.sendMessage(chatId, 
        `📫 Xin chúc mừng ${senderName}!\n🚗 Xe ${bienSoShown} không còn vi phạm chưa xử phạt ✅\n` +
        `📊 Tất cả vi phạm đã được xử phạt (${daXuPhatHeader} vi phạm đã xử phạt).\n🌐 Nguồn: csgt.vn`
      );
    }

    // Parse nhiều lần vi phạm
    const violations = [];
    let current = null;
    let capturingNoiGQ = false;

    const pushCurrentIfAny = () => {
      if (current) {
        if (current._noiGQ && current._noiGQ.length) current.noiGQ = current._noiGQ;
        delete current._noiGQ;
        
        // Kiểm tra nếu đã xử phạt thì bỏ qua
        const trangThaiLower = (current.trangThai || '').toLowerCase();
        const isDaXuPhat = trangThaiLower.includes('đã xử phạt') || 
                          trangThaiLower.includes('đã xử lý') ||
                          trangThaiLower.includes('đã nộp phạt') ||
                          trangThaiLower.includes('đã thanh toán');
        
        if (isDaXuPhat) {
          // Bỏ qua vi phạm đã xử phạt
          return;
        }
        
        const allEmpty = [
          current.bienSo, current.mauBien, current.loaiPT,
          current.thoiGian, current.diaDiem, current.hanhVi,
          (current.trangThai || '').replace(/chưa xác định/i, '').trim()
        ].every(v => !v);
        if (!allEmpty) violations.push(current);
      }
    };

    $('tr.td_left').each((_, tr) => {
      const left = stripSpaces($(tr).find('td.row_left').text());
      const right = stripSpaces($(tr).find('td.row_right').text());
      const l = normalize(left);

      if (!left && !right) {
        capturingNoiGQ = false;
        return;
      }

      if (l.includes('biển số')) {
        pushCurrentIfAny();
        current = { bienSo: right || bienso, trangThai: 'Chưa xác định' };
        capturingNoiGQ = false;
        return;
      }

      if (!current) return;

      if (l.includes('màu biển')) current.mauBien = right;
      else if (l.includes('loại phương tiện')) current.loaiPT = right;
      else if (l.includes('thời gian vi phạm')) current.thoiGian = right;
      else if (l.includes('địa điểm vi phạm')) current.diaDiem = right;
      else if (l.includes('hành vi vi phạm')) current.hanhVi = right;
      else if (l.includes('trạng thái')) current.trangThai = right || current.trangThai;

      if (l.includes('nơi giải quyết vụ việc')) {
        capturingNoiGQ = true;
        if (!current._noiGQ) current._noiGQ = [];
        return;
      }
      if (capturingNoiGQ) {
        if (right) current._noiGQ.push(right);
        else capturingNoiGQ = false;
      }
    });

    pushCurrentIfAny();

    // Lọc lại violations để đảm bảo không có vi phạm đã xử phạt
    const filteredViolations = violations.filter(v => {
      const trangThaiLower = (v.trangThai || '').toLowerCase();
      const isDaXuPhat = trangThaiLower.includes('đã xử phạt') || 
                        trangThaiLower.includes('đã xử lý') ||
                        trangThaiLower.includes('đã nộp phạt') ||
                        trangThaiLower.includes('đã thanh toán') ||
                        trangThaiLower.includes('đã giải quyết');
      return !isDaXuPhat;
    });

    // Nếu tất cả vi phạm đều đã xử phạt, hiển thị thông báo không vi phạm
    if (filteredViolations.length === 0) {
      if (violations.length > 0) {
        // Có vi phạm nhưng tất cả đã xử phạt
        const bienSoShown = $('b.h1').first().text().trim() || bienso;
        const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
        
        return bot.sendMessage(chatId, 
          `🚦 @${senderName}\n📫 Xin chúc mừng!\n🚗 Xe ${bienSoShown} không còn vi phạm chưa xử phạt ✅\n` +
          `📊 Tất cả vi phạm đã được xử phạt.\n🌐 Nguồn: csgt.vn`
        );
      } else if (foundTotal === 0) {
        const bienSoShown = $('b.h1').first().text().trim() || bienso;
        const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
        
        return bot.sendMessage(chatId, 
          `🚦 @${senderName}\n📫 Xin chúc mừng!\n🚗 Xe ${bienSoShown} không vi phạm ✅\n🌐 Nguồn: csgt.vn`
        );
      } else {
        // Có phát hiện nhưng không parse được, tạo 1 record tối thiểu
        filteredViolations.push({
          bienSo: $('b.h1').first().text().trim() || bienso,
          trangThai: 'Chưa xác định'
        });
      }
    }

    // Sử dụng filteredViolations thay vì violations
    const violationsToShow = filteredViolations;

    // Gửi header message
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }) + ' ' + now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const totalChua = chuaXuPhatHeader || violationsToShow.length;
    const senderName = msg.from?.display_name || msg.from?.first_name || "Người dùng";
    
    let headerMsg = `🚦 Thông tin vi phạm\n` +
      `👤 Người check: ${senderName}\n` +
      `📅 Kiểm tra lúc: ${timeStr}\n`;
    
    if (foundTotal) {
      headerMsg += `📊 Hệ thống báo: ${foundTotal} phát hiện • ${chuaXuPhatHeader} CHƯA XỬ PHẠT • ${daXuPhatHeader} ĐÃ XỬ PHẠT\n`;
      if (daXuPhatHeader > 0) {
        headerMsg += `✅ Đã lọc bỏ ${daXuPhatHeader} vi phạm đã xử phạt\n`;
      }
    } else {
      headerMsg += `📊 Tổng: ${totalChua} vi phạm chưa xử phạt\n`;
    }

    await bot.sendMessage(chatId, headerMsg);

    // Chia nhỏ và gửi từng phần (chỉ hiển thị vi phạm chưa xử phạt)
    const chunks = [];
    for (let i = 0; i < violationsToShow.length; i += CHUNK_SIZE) {
      chunks.push(violationsToShow.slice(i, i + CHUNK_SIZE));
    }

    for (let ci = 0; ci < chunks.length; ci++) {
      const group = chunks[ci];
      let msg = '';
      group.forEach((v, idx) => {
        const stt = ci * CHUNK_SIZE + idx + 1;
        msg += `\n➜ Lần ${stt}:\n`;
        msg += `🚗 Biển kiểm soát: ${v.bienSo || bienso}\n`;
        
        // Tra cứu thông tin biển số
        const bienSoInfo = lookupBienSoInfo(v.bienSo || bienso);
        if (bienSoInfo) {
          msg += `🏛️ Thuộc: ${bienSoInfo.province} - ${bienSoInfo.district}\n`;
        }
        
        if (v.mauBien) msg += `🎨 Màu biển: ${v.mauBien}\n`;
        if (v.loaiPT) msg += `🚙 Loại phương tiện: ${v.loaiPT}\n`;
        if (v.thoiGian) msg += `⏰ Thời gian vi phạm: ${v.thoiGian}\n`;
        if (v.diaDiem) {
          msg += `📍 Địa điểm vi phạm: ${v.diaDiem}\n`;
          
          // Tra cứu địa chỉ mới (sát nhập)
          const newAddress = lookupNewAddress(v.diaDiem);
          if (newAddress && (newAddress.newWard !== newAddress.oldWard || 
              newAddress.newDistrict !== newAddress.oldDistrict)) {
            msg += `🔄 Địa chỉ mới (sát nhập): ${newAddress.newWard}, ${newAddress.newDistrict}, ${newAddress.newProvince}\n`;
          }
        }
        if (v.hanhVi) msg += `⚠️ Hành vi vi phạm: ${v.hanhVi}\n`;
        if (v.trangThai) msg += `📋 Trạng thái: ${v.trangThai}\n`;
        if (v.noiGQ && v.noiGQ.length) {
          msg += '🏢 Nơi giải quyết:\n';
          v.noiGQ.forEach(l => (msg += `- ${l}\n`));
        }
        msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      });

      const footer = `📨 Gói ${ci + 1}/${chunks.length} • Mỗi tin chứa tối đa ${CHUNK_SIZE} lỗi`;
      const fullMsg = `${msg}\n${footer}`;
      
      // Chia nhỏ nếu tin nhắn quá dài
      const messageChunks = splitMessage(fullMsg);
      for (const chunk of messageChunks) {
        await bot.sendMessage(chatId, chunk);
        // Đợi một chút giữa các tin nhắn để tránh spam
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return;
  } catch (error) {
    console.error('Lỗi phatnguoi:', error && (error.stack || error.message || error));
    return bot.sendMessage(chatId, 
      '❌ Hệ thống đang nâng cấp, vui lòng thử lại sau!\n' +
      'Lỗi: ' + (error.message || 'Unknown error')
    );
  }
}

// ========== DAILY CHECK REGISTRATION ==========

// Đường dẫn file lưu đăng ký check hằng ngày
const dailyCheckDataPath = path.join(__dirname, '..', '..', 'data', 'dailycheck.json');

/**
 * Đọc dữ liệu đăng ký check hằng ngày
 */
function loadDailyCheckData() {
  try {
    if (!fs.existsSync(dailyCheckDataPath)) {
      return { registrations: {} };
    }
    const data = fs.readFileSync(dailyCheckDataPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Lỗi khi đọc daily check data:', error);
    return { registrations: {} };
  }
}

/**
 * Lưu dữ liệu đăng ký check hằng ngày
 */
function saveDailyCheckData(data) {
  try {
    fs.mkdirSync(path.dirname(dailyCheckDataPath), { recursive: true });
    fs.writeFileSync(dailyCheckDataPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Lỗi khi lưu daily check data:', error);
    return false;
  }
}

/**
 * Đăng ký check hằng ngày
 */
function registerDailyCheck(chatId, bienso, loaixe = '1', note = null) {
  const data = loadDailyCheckData();
  const FREE_LIMIT = 3; // Giới hạn miễn phí: 3 biển số
  const PAID_PACKAGE_PRICE = 50000; // Phí: 50k/tháng cho 10 biển số
  const PAID_PACKAGE_LIMIT = 10; // Gói trả phí: 10 biển số/tháng
  
  if (!data.registrations) {
    data.registrations = {};
  }

  // Lấy danh sách đăng ký của chatId (chuyển từ object sang array nếu cần)
  let userRegistrations = [];
  if (data.registrations[chatId]) {
    // Nếu là object cũ (tương thích ngược), chuyển sang array
    if (!Array.isArray(data.registrations[chatId])) {
      userRegistrations = [data.registrations[chatId]];
      data.registrations[chatId] = userRegistrations;
    } else {
      userRegistrations = data.registrations[chatId];
    }
  }

  // Kiểm tra biển số đã đăng ký chưa
  const existing = userRegistrations.find(r => r.bienso === bienso);
  if (existing) {
    return { success: false, error: 'BIENSO_ALREADY_EXISTS', existing: existing };
  }

  // Đếm số biển số miễn phí và trả phí
  const freeCount = userRegistrations.filter(r => r.enabled && !r.isPaid).length;
  const paidCount = userRegistrations.filter(r => r.enabled && r.isPaid).length;
  
  // Kiểm tra subscription (gói trả phí)
  // Tìm subscription còn hiệu lực (nếu có)
  const activeSubscription = userRegistrations.find(r => 
    r.isPaid && r.subscriptionExpires && new Date(r.subscriptionExpires) > new Date()
  );
  
  let isPaid = false;
  let subscriptionExpires = null;
  
  if (freeCount >= FREE_LIMIT) {
    // Đã vượt quá giới hạn miễn phí
    if (activeSubscription) {
      // Có subscription còn hiệu lực
      if (paidCount >= PAID_PACKAGE_LIMIT) {
        // Đã đạt giới hạn gói trả phí (10 biển số)
        return { 
          success: false, 
          error: 'PAID_LIMIT_EXCEEDED',
          message: `Bạn đã đạt giới hạn ${PAID_PACKAGE_LIMIT} biển số trong gói trả phí.`
        };
      }
      isPaid = true;
      subscriptionExpires = activeSubscription.subscriptionExpires;
    } else {
      // Chưa có subscription, cần đăng ký
      return { 
        success: false, 
        error: 'NEED_PAYMENT',
        message: `Bạn đã đạt giới hạn ${FREE_LIMIT} biển số miễn phí. Đăng ký gói trả phí ${PAID_PACKAGE_PRICE.toLocaleString('vi-VN')}đ/tháng để thêm ${PAID_PACKAGE_LIMIT} biển số.`
      };
    }
  }

  const registration = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // ID duy nhất
    chatId: chatId,
    bienso: bienso,
    loaixe: loaixe,
    note: note || null,
    createdAt: new Date().toISOString(),
    lastChecked: null,
    enabled: true,
    isPaid: isPaid,
    subscriptionExpires: subscriptionExpires
  };

  userRegistrations.push(registration);
  data.registrations[chatId] = userRegistrations;
  saveDailyCheckData(data);

  return { 
    success: true, 
    data: registration,
    isPaid: isPaid,
    freeCount: freeCount,
    totalCount: userRegistrations.length,
    pricePerMonth: isPaid ? PRICE_PER_MONTH : 0
  };
}

/**
 * Hủy đăng ký check hằng ngày (xóa theo biển số hoặc ID)
 */
function unregisterDailyCheck(chatId, biensoOrId = null) {
  const data = loadDailyCheckData();
  
  if (!data.registrations || !data.registrations[chatId]) {
    return { success: false, error: 'Không tìm thấy đăng ký' };
  }

  let userRegistrations = data.registrations[chatId];
  
  // Tương thích ngược: nếu là object cũ, chuyển sang array
  if (!Array.isArray(userRegistrations)) {
    userRegistrations = [userRegistrations];
  }

  // Nếu không có biensoOrId, xóa tất cả (tương thích cũ)
  if (!biensoOrId) {
    const removed = userRegistrations;
    delete data.registrations[chatId];
    saveDailyCheckData(data);
    return { success: true, data: removed, removedAll: true };
  }

  // Tìm và xóa biển số hoặc ID cụ thể
  const index = userRegistrations.findIndex(r => 
    r.bienso === biensoOrId || r.id === biensoOrId
  );

  if (index === -1) {
    return { success: false, error: 'Không tìm thấy biển số hoặc ID' };
  }

  const removed = userRegistrations.splice(index, 1)[0];
  
  // Nếu không còn đăng ký nào, xóa chatId
  if (userRegistrations.length === 0) {
    delete data.registrations[chatId];
  } else {
    data.registrations[chatId] = userRegistrations;
  }
  
  saveDailyCheckData(data);

  return { success: true, data: removed };
}

/**
 * Lấy thông tin đăng ký của chatId (trả về array)
 */
function getDailyCheckRegistration(chatId) {
  const data = loadDailyCheckData();
  const registrations = data.registrations?.[chatId];
  
  if (!registrations) {
    return [];
  }

  // Tương thích ngược: nếu là object cũ, chuyển sang array
  if (!Array.isArray(registrations)) {
    return [registrations];
  }

  return registrations;
}

/**
 * Lấy tất cả đăng ký
 */
function getAllDailyCheckRegistrations() {
  const data = loadDailyCheckData();
  return data.registrations || {};
}

/**
 * Cập nhật thời gian check cuối cùng
 */
function updateLastChecked(chatId) {
  const data = loadDailyCheckData();
  
  if (!data.registrations || !data.registrations[chatId]) {
    return false;
  }

  data.registrations[chatId].lastChecked = new Date().toISOString();
  saveDailyCheckData(data);
  return true;
}

/**
 * Xử lý lệnh daily check
 */
async function handleDailyCheck(bot, msg, args) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  
  // Khai báo constants ở đầu hàm
  const FREE_LIMIT = 3;
  const PAID_PACKAGE_PRICE = 50000;
  const PAID_PACKAGE_LIMIT = 10;
  const ZALO_CONTACT = '0338739954';

  // Lệnh list - xem đăng ký hiện tại
  if (args.length > 0 && args[0].toLowerCase() === 'list') {
    const registrations = getDailyCheckRegistration(chatId);
    
    if (registrations.length === 0) {
      return bot.sendMessage(chatId, 
        "📋 Bạn chưa đăng ký check phạt nguội hằng ngày.\n" +
        "💡 Sử dụng: /phatnguoi add <bienso> [note]"
      );
    }
    const freeCount = registrations.filter(r => r.enabled && !r.isPaid).length;
    const paidCount = registrations.filter(r => r.enabled && r.isPaid).length;
    const totalCount = registrations.length;

    let msg = `📋 *Danh sách đăng ký check hằng ngày*\n`;
    msg += `📊 Thống kê:\n`;
    msg += `✅ Miễn phí: ${freeCount}/${FREE_LIMIT}\n`;
    if (paidCount > 0) {
      msg += `💰 Có phí: ${paidCount} biển số\n`;
    }
    msg += `📝 Tổng: ${totalCount} biển số\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    registrations.forEach((reg, index) => {
      const statusIcon = reg.enabled ? '✅' : '❌';
      const statusText = reg.enabled ? 'Đang bật' : 'Đã tắt';
      const lastChecked = reg.lastChecked 
        ? new Date(reg.lastChecked).toLocaleString('vi-VN')
        : 'Chưa check';
      const paidIcon = reg.isPaid ? '💰' : '🆓';
      const paidText = reg.isPaid ? 'Gói trả phí (50k/tháng/10 biển số)' : 'Miễn phí';

      msg += `${index + 1}. ${statusIcon} ${paidIcon} ${reg.bienso}\n`;
      msg += `   🚙 Loại xe: ${reg.loaixe === '1' ? 'Ô tô' : 'Xe máy'}\n`;
      if (reg.note) {
        msg += `   📝 Note: ${reg.note}\n`;
      }
      msg += `   ${paidText}\n`;
      msg += `   📅 Đăng ký: ${new Date(reg.createdAt).toLocaleString('vi-VN')}\n`;
      msg += `   🕐 Check lần cuối: ${lastChecked}\n`;
    });

    msg += `💡 Sử dụng "/phatnguoi del <bienso>" để xóa biển số cụ thể.\n`;
    if (freeCount >= FREE_LIMIT) {
      msg += `\n⚠️ Bạn đã đạt giới hạn miễn phí (${FREE_LIMIT} biển số).\n`;
      msg += `💰 Đăng ký thêm: 50,000đ/tháng cho 10 biển số.\n`;
      msg += `💬 Liên hệ Zalo: ${ZALO_CONTACT} để nâng cấp.`;
    }

    return bot.sendMessage(chatId, msg);
  }

  // Lệnh del/remove - hủy đăng ký
  if (args.length > 0 && (args[0].toLowerCase() === 'del' || args[0].toLowerCase() === 'remove' || args[0].toLowerCase() === 'delete')) {
    // Nếu có tham số thứ 2, đó là biển số hoặc ID cần xóa
    const biensoOrId = args.length > 1 ? args.slice(1).join(' ') : null;
    
    const result = unregisterDailyCheck(chatId, biensoOrId);
    
    if (!result.success) {
      return bot.sendMessage(chatId, 
        `❌ ${result.error}\n💡 Sử dụng "/phatnguoi list" để xem danh sách biển số.`
      );
    }

    // Nếu xóa tất cả (tương thích cũ)
    if (result.removedAll) {
      return bot.sendMessage(chatId, 
        `✅ *Đã hủy tất cả đăng ký check hằng ngày*\n` +
        `💡 Bot sẽ không check tự động nữa.`
      );
    }

    return bot.sendMessage(chatId, 
      `✅ *Đã hủy đăng ký check hằng ngày*\n` +
      `🚗 Biển số: ${result.data.bienso}\n` +
      `📅 Đã đăng ký: ${new Date(result.data.createdAt).toLocaleString('vi-VN')}\n` +
      `💡 Bot sẽ không check biển số này nữa.\n` +
      `💡 Sử dụng "/phatnguoi list" để xem danh sách còn lại.`
    );
  }

  // Lệnh add - đăng ký mới
  if (args.length > 0 && args[0].toLowerCase() === 'add') {
    const remainingArgs = args.slice(1);
    
    if (remainingArgs.length === 0) {
      return bot.sendMessage(chatId, 
        "❌ Vui lòng nhập biển số để đăng ký!\n" +
        "💡 Cú pháp: /phatnguoi add <bienso> [note]\n" +
        "💡 Ví dụ:\n" +
        "   /phatnguoi add 15F02023\n" +
        "   /phatnguoi add 15F02023 Xe của tôi"
      );
    }

    // Xử lý arguments đơn giản: bienso và note (tất cả phần còn lại sau bienso là note)
    // Biển số là phần đầu tiên (có thể có nhiều phần nếu có khoảng trắng)
    // Note là tất cả phần còn lại
    let bienso = '';
    let note = '';
    let loaixe = '1'; // Mặc định ô tô

    // Tìm biển số (phần đầu tiên, có thể là số hoặc chữ+số)
    // Biển số thường có format: 15F02023, 14A654505, v.v.
    // Nếu có nhiều phần, phần đầu là biển số, phần còn lại là note
    if (remainingArgs.length === 1) {
      // Chỉ có 1 phần -> đó là biển số
      bienso = remainingArgs[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    } else {
      // Có nhiều phần -> phần đầu là biển số, phần còn lại là note
      bienso = remainingArgs[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      note = remainingArgs.slice(1).join(' ').trim();
    }
    
    if (!bienso) {
      return bot.sendMessage(chatId, 
        "❌ Vui lòng nhập biển số xe!\n" +
        "💡 Ví dụ: /phatnguoi add 15F02023"
      );
    }

    // Validate độ dài biển số
    if (bienso.length < 6) {
      return bot.sendMessage(chatId, 
        `❌ Biển số '${bienso}' quá ngắn hoặc không hợp lệ!\n` +
        "Vui lòng nhập đầy đủ biển số (Ví dụ: 14A654505)"
      );
    }

    // Kiểm tra biển số đã đăng ký chưa
    const existingRegistrations = getDailyCheckRegistration(chatId);
    const existing = existingRegistrations.find(r => r.bienso === bienso);
    if (existing) {
      return bot.sendMessage(chatId, 
        `⚠️ Biển số ${bienso} đã được đăng ký check hằng ngày rồi!\n` +
        `🚗 Biển số: ${existing.bienso}\n` +
        `📅 Đăng ký lúc: ${new Date(existing.createdAt).toLocaleString('vi-VN')}\n` +
        `💡 Sử dụng "/phatnguoi del ${bienso}" để hủy đăng ký cũ trước.`
      );
    }

    // Đăng ký
    const result = registerDailyCheck(chatId, bienso, loaixe, note || null);

    if (!result.success) {
      if (result.error === 'BIENSO_ALREADY_EXISTS') {
        return bot.sendMessage(chatId, 
          `⚠️ Biển số ${bienso} đã được đăng ký rồi!\n` +
          `💡 Sử dụng "/phatnguoi list" để xem danh sách.`
        );
      }
      if (result.error === 'NEED_PAYMENT') {
        return bot.sendMessage(chatId, 
          `⚠️ *Bạn đã đạt giới hạn miễn phí!*\n` +
          `📊 Bạn đang có ${FREE_LIMIT} biển số miễn phí.\n` +
          `💰 *Gói trả phí:*\n` +
          `   • Giá: ${PAID_PACKAGE_PRICE.toLocaleString('vi-VN')}đ/tháng\n` +
          `   • Số lượng: ${PAID_PACKAGE_LIMIT} biển số/tháng\n` +
          `💬 Liên hệ Zalo: ${ZALO_CONTACT} để nâng cấp.`
        );
      }
      if (result.error === 'PAID_LIMIT_EXCEEDED') {
        return bot.sendMessage(chatId, 
          `⚠️ *Đã đạt giới hạn gói trả phí!*\n` +
          `📊 Bạn đã đăng ký ${PAID_PACKAGE_LIMIT} biển số trong gói trả phí.\n` +
          `💡 Gói trả phí cho phép tối đa ${PAID_PACKAGE_LIMIT} biển số/tháng.\n` +
          `💬 Liên hệ Zalo: ${ZALO_CONTACT} để gia hạn hoặc nâng cấp gói.`
        );
      }
      return bot.sendMessage(chatId, 
        "❌ Đã xảy ra lỗi khi đăng ký: " + (result.message || result.error)
      );
    }

    let successMsg = `✅ *Đã đăng ký check phạt nguội hằng ngày*\n`;
    successMsg += `🚗 Biển số: ${bienso}\n`;
    successMsg += `🚙 Loại xe: ${loaixe === '1' ? 'Ô tô' : 'Xe máy'}\n`;
    if (note) {
      successMsg += `📝 Note: ${note}\n`;
    }
    successMsg += `📅 Đăng ký lúc: ${new Date().toLocaleString('vi-VN')}\n`;
    
    if (result.isPaid) {
      successMsg += `💰 *Gói trả phí: 50,000đ/tháng cho 10 biển số*\n`;
      if (result.subscriptionExpires) {
        const expiresDate = new Date(result.subscriptionExpires);
        successMsg += `📅 Hết hạn: ${expiresDate.toLocaleDateString('vi-VN')}\n`;
      }
      successMsg += `💬 Liên hệ Zalo: ${ZALO_CONTACT} để thanh toán.\n`;
    } else {
      successMsg += `🆓 Miễn phí\n`;
    }
    
    successMsg += `📊 Bạn đang có: ${result.totalCount} biển số (${result.freeCount}/${FREE_LIMIT} miễn phí)\n`;
    successMsg += `🤖 Bot sẽ tự động check biển số này mỗi ngày.\n`;
    successMsg += `📢 Bạn sẽ nhận được thông báo kết quả check.\n`;
    successMsg += `💡 Sử dụng "/phatnguoi list" để xem danh sách.\n`;
    successMsg += `💡 Sử dụng "/phatnguoi del ${bienso}" để xóa.`;

    return bot.sendMessage(chatId, successMsg);
  }

  // Hiển thị hướng dẫn
  return bot.sendMessage(chatId, 
    "📖 *Hướng dẫn đăng ký check phạt nguội hằng ngày*\n" +
    "➕ Đăng ký:\n" +
    "   /phatnguoi add <bienso> [note]\n" +
    "📋 Xem thông tin đăng ký:\n" +
    "   /phatnguoi list\n" +
    "🗑️ Hủy đăng ký:\n" +
    "   /phatnguoi del <bienso>\n" +
    "💡 Ví dụ:\n" +
    "   /phatnguoi add 15F02023\n" +
    "   /phatnguoi add 15F02023 Xe của tôi\n" +
    "💰 *Giới hạn:*\n" +
    "   • Miễn phí: 3 biển số/chat\n" +
    "   • Đăng ký thêm: 50,000đ/tháng cho 10 biển số\n" +
    "💬 Liên hệ Zalo: " + ZALO_CONTACT + " để nâng cấp\n" +
    "🤖 Bot sẽ tự động check biển số đã đăng ký mỗi ngày và gửi kết quả cho bạn."
  );
}

/**
 * Chạy check hằng ngày cho tất cả đăng ký
 */
async function runDailyChecks(bot) {
  try {
    const registrations = getAllDailyCheckRegistrations();
    const chatIds = Object.keys(registrations);

    if (chatIds.length === 0) {
      console.log('📋 Không có đăng ký check hằng ngày nào.');
      return;
    }

    console.log(`🔄 Bắt đầu check hằng ngày cho ${chatIds.length} đăng ký...`);

    for (const chatId of chatIds) {
      let userRegistrations = registrations[chatId];
      
      // Tương thích ngược: nếu là object cũ, chuyển sang array
      if (!Array.isArray(userRegistrations)) {
        userRegistrations = [userRegistrations];
      }

      // Check từng biển số của chatId
      for (const registration of userRegistrations) {
        if (!registration.enabled) {
          continue;
        }

        try {
          console.log(`🔍 Đang check biển số ${registration.bienso} cho chatId ${chatId}...`);

          // Tạo message object giả để dùng với hàm checkPhatNguoi
          const fakeMsg = {
            from: { id: null, display_name: 'Bot', first_name: 'Bot' },
            chat: { id: chatId }
          };

          // Gọi hàm check với biển số đã đăng ký
          await checkPhatNguoi(bot, fakeMsg, [registration.bienso, registration.loaixe]);
          
          // Cập nhật thời gian check cuối cùng cho biển số này
          const data = loadDailyCheckData();
          if (data.registrations && data.registrations[chatId]) {
            let regs = data.registrations[chatId];
            if (!Array.isArray(regs)) {
              regs = [regs];
            }
            const regIndex = regs.findIndex(r => r.id === registration.id || r.bienso === registration.bienso);
            if (regIndex !== -1) {
              regs[regIndex].lastChecked = new Date().toISOString();
              data.registrations[chatId] = regs;
              saveDailyCheckData(data);
            }
          }

          // Đợi một chút giữa các check để tránh spam
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`❌ Lỗi khi check biển số ${registration.bienso} cho chatId ${chatId}:`, error);
          
          // Gửi thông báo lỗi cho user
          try {
            await bot.sendMessage(chatId, 
              `❌ *Lỗi khi check phạt nguội hằng ngày*\n` +
              `🚗 Biển số: ${registration.bienso}\n` +
              `❌ Lỗi: ${error.message || 'Unknown error'}\n` +
              `💡 Bot sẽ thử lại vào lần check tiếp theo.`
            );
          } catch (sendError) {
            console.error('Lỗi khi gửi thông báo lỗi:', sendError);
          }
        }
      }
    }

    console.log(`✅ Hoàn thành check hằng ngày cho ${chatIds.length} đăng ký.`);

  } catch (error) {
    console.error('❌ Lỗi trong runDailyChecks:', error);
  }
}

// Export as command plugin
module.exports = {
  name: 'phatnguoi',
  pattern: /^\.phatnguoi(.*)/,
  async execute(bot, msg, match) {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    
    // Check if it's daily command (backward compatibility)
    if (args.length > 0 && args[0].toLowerCase() === 'daily') {
      await handleDailyCheck(bot, msg, args.slice(1));
    } 
    // Check if it's add/list/del command
    else if (args.length > 0 && ['add', 'list', 'del', 'remove', 'delete'].includes(args[0].toLowerCase())) {
      await handleDailyCheck(bot, msg, args);
    } 
    // Other cases (check biển số or menu)
    else {
      await checkPhatNguoi(bot, msg, args);
    }
  },
  // Export functions for other modules
  checkPhatNguoi,
  handleDailyCheck,
  runDailyChecks,
  getAllDailyCheckRegistrations,
  getDailyCheckRegistration
};

