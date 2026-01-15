const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Đường dẫn file lưu UIDs
const checkliveDataPath = path.join(__dirname, '..', '..', 'data', 'checklive.json');

// API endpoint để lấy UID từ Facebook link
const FACEBOOK_UID_API = 'https://id.traodoisub.com/api.php';

/**
 * Normalize Facebook URL
 */
function normalizeFacebookURL(url) {
    if (!url) return url;
    try {
        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        url = url.replace(/^(https?:\/\/)(www\.)+/gi, '$1www.');
        url = url.replace(/www\.www\./gi, 'www.');
        url = url.replace(/(www\.){3,}/gi, 'www.');
        return url;
    } catch (error) {
        return url;
    }
}

/**
 * Lấy UID từ Facebook link
 */
async function getUIDFromLink(link, maxRetries = 3) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const encodedLink = encodeURIComponent(link);
            
            if (attempt > 1) {
                const delay = 2000 * attempt;
                await new Promise(r => setTimeout(r, delay));
            }
            
            const response = await axios.post(FACEBOOK_UID_API, `link=${encodedLink}`, {
                headers: {
                    "accept": "application/json, text/javascript, */*; q=0.01",
                    "accept-language": "vi,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6,zh-TW;q=0.5,zh;q=0.4",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest",
                    "Referer": "https://id.traodoisub.com/"
                },
                timeout: 20000,
                httpsAgent: new https.Agent({ keepAlive: true })
            });

            const data = response.data;

            // Kiểm tra rate limit
            if (data.error && (
                data.error.toLowerCase().includes('thao tác chậm') || 
                data.error.toLowerCase().includes('chậm lại') ||
                (data.error.toLowerCase().includes('vui lòng') && data.error.toLowerCase().includes('chậm'))
            )) {
                if (attempt < maxRetries) {
                    lastError = {
                        success: false,
                        error: 'API đang bận, vui lòng thử lại sau vài giây...',
                        code: 429,
                        isRateLimit: true
                    };
                    continue;
                }
                return {
                    success: false,
                    error: 'API đang bận, vui lòng thử lại sau 1-2 phút.',
                    code: 429,
                    isRateLimit: true
                };
            }

            // Kiểm tra lỗi khác
            if (data.code === 400 || data.error) {
                return {
                    success: false,
                    error: data.error || 'Link không tồn tại hoặc chưa để chế độ công khai!!',
                    code: data.code || 400,
                    isRateLimit: false
                };
            }

            // Thành công
            if (data.code === 200 && data.id) {
                const normalizedLink = normalizeFacebookURL(data.link || link);
                return {
                    success: true,
                    id: data.id,
                    link: normalizedLink,
                    name: data.name || '',
                    shareType: data.share_type || 1,
                    code: data.code
                };
            }

            return {
                success: false,
                error: 'Không thể lấy thông tin UID từ API',
                code: data.code || 500,
                isRateLimit: false
            };
            
        } catch (error) {
            lastError = {
                success: false,
                error: error.response?.data?.error || 'Lỗi khi kết nối đến API',
                code: error.response?.status || 500,
                isRateLimit: false
            };
            
            if (attempt < maxRetries && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
                continue;
            }
        }
    }
    
    return lastError || {
        success: false,
        error: 'Không thể lấy UID sau nhiều lần thử. Vui lòng thử lại sau.',
        code: 500,
        isRateLimit: false
    };
}

/**
 * Kiểm tra trạng thái UID (live hoặc die) bằng Graph API
 */
async function checkUIDStatus(uid) {
    try {
        const graphApiUrl = `https://graph.fb.me/${uid}/picture?redirect=false`;
        
        const response = await axios.get(graphApiUrl, {
            timeout: 15000,
            headers: {
                "accept": "application/json",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        const data = response.data;

        // Kiểm tra nếu có error → Die
        if (data.error) {
            return {
                status: 'die',
                error: data.error.message || 'UID không tồn tại hoặc không có quyền truy cập',
                code: data.error.code || 100
            };
        }

        // Kiểm tra nếu có data
        if (data && data.data) {
            // Nếu có height và width (dù is_silhouette: true) → LIVE
            if (data.data.height && data.data.width) {
                return {
                    status: 'live',
                    uid: uid,
                    isSilhouette: data.data.is_silhouette || false
                };
            }

            // Nếu chỉ có is_silhouette: true và URL là static.xx.fbcdn.net → DIE
            if (data.data.is_silhouette === true && data.data.url && data.data.url.includes('static.xx.fbcdn.net')) {
                return {
                    status: 'die',
                    error: 'UID không tồn tại hoặc không có quyền truy cập',
                    code: 100
                };
            }

            // Nếu không có height/width và không phải static.xx.fbcdn.net → Die
            return {
                status: 'die',
                error: 'UID không tồn tại hoặc không có quyền truy cập',
                code: 100
            };
        }

        // Nếu không có data → Die
        return {
            status: 'die',
            error: 'Không thể lấy thông tin từ Graph API',
            code: 500
        };

    } catch (error) {
        // Kiểm tra nếu là lỗi từ Graph API
        if (error.response && error.response.data && error.response.data.error) {
            const errorData = error.response.data.error;
            if (errorData.code === 100 || errorData.type === 'GraphMethodException') {
                return {
                    status: 'die',
                    error: errorData.message || 'UID không tồn tại hoặc không có quyền truy cập',
                    code: errorData.code || 100
                };
            }
        }

        // Lỗi network hoặc timeout → Coi là live (không đánh dấu die)
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return {
                status: 'live',
                error: 'Timeout khi kiểm tra, giữ nguyên trạng thái',
                code: 408,
                timeout: true
            };
        }

        // Lỗi khác
        return {
            status: 'die',
            error: error.message || 'Lỗi khi kết nối đến Graph API',
            code: error.response?.status || 500
        };
    }
}

/**
 * Đọc dữ liệu từ file JSON
 */
function loadCheckliveData() {
    try {
        if (!fs.existsSync(checkliveDataPath)) {
            return { users: {} };
        }
        const data = fs.readFileSync(checkliveDataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Lỗi khi đọc checklive data:', error);
        return { users: {} };
    }
}

/**
 * Lưu dữ liệu vào file JSON
 */
function saveCheckliveData(data) {
    try {
        fs.mkdirSync(path.dirname(checkliveDataPath), { recursive: true });
        fs.writeFileSync(checkliveDataPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('Lỗi khi lưu checklive data:', error);
        return false;
    }
}

/**
 * Thêm UID vào danh sách check
 */
function addUIDToCheck(userId, uid, link, name, initialStatus, note = null) {
    const data = loadCheckliveData();
    
    if (!data.users[userId]) {
        data.users[userId] = [];
    }

    // Kiểm tra UID đã tồn tại chưa
    const existingIndex = data.users[userId].findIndex(u => u.uid === uid);
    
    if (existingIndex !== -1) {
        return { success: false, error: 'UID_ALREADY_EXISTS' };
    }

    // Xác định checkType dựa trên status ban đầu
    const checkType = initialStatus === 'live' ? 'die' : 'live';

    const uidData = {
        uid: uid,
        link: link,
        name: name || null,
        note: note || null,
        initialStatus: initialStatus,
        currentStatus: initialStatus,
        checkType: checkType,
        notified: false,
        createdAt: new Date().toISOString(),
        lastChecked: new Date().toISOString()
    };

    data.users[userId].push(uidData);
    saveCheckliveData(data);

    return { success: true, data: uidData };
}

/**
 * Cập nhật trạng thái UID
 */
function updateUIDStatus(userId, uid, newStatus, notified = false) {
    const data = loadCheckliveData();
    
    if (!data.users[userId]) {
        return false;
    }

    const uidIndex = data.users[userId].findIndex(u => u.uid === uid);
    if (uidIndex === -1) {
        return false;
    }

    data.users[userId][uidIndex].currentStatus = newStatus;
    data.users[userId][uidIndex].lastChecked = new Date().toISOString();
    if (notified) {
        data.users[userId][uidIndex].notified = true;
    }

    saveCheckliveData(data);
    return true;
}

/**
 * Lấy danh sách UID của user
 */
function getUserUIDs(userId) {
    const data = loadCheckliveData();
    return data.users[userId] || [];
}

/**
 * Xóa UID khỏi danh sách check
 */
function removeUID(userId, uidOrIndex) {
    const data = loadCheckliveData();
    
    if (!data.users[userId]) {
        return { success: false, error: 'User không tồn tại' };
    }

    const uids = data.users[userId];
    let uidIndex = -1;

    // Kiểm tra nếu là số (index) hoặc UID
    if (typeof uidOrIndex === 'number' || /^\d+$/.test(String(uidOrIndex))) {
        uidIndex = parseInt(uidOrIndex) - 1;
        if (uidIndex < 0 || uidIndex >= uids.length) {
            return { success: false, error: 'Số thứ tự không hợp lệ' };
        }
    } else {
        uidIndex = uids.findIndex(u => {
            return u.uid === uidOrIndex || u.link === uidOrIndex || u.link.includes(uidOrIndex);
        });
        
        if (uidIndex === -1) {
            return { success: false, error: 'Không tìm thấy UID' };
        }
    }

    const removedUID = uids[uidIndex];
    
    data.users[userId].splice(uidIndex, 1);
    
    if (data.users[userId].length === 0) {
        delete data.users[userId];
    }
    
    saveCheckliveData(data);

    return { success: true, data: removedUID };
}

/**
 * Lấy tất cả UIDs cần check
 */
function getAllUIDsToCheck() {
    const data = loadCheckliveData();
    const result = [];

    for (const [userId, uids] of Object.entries(data.users)) {
        for (const uidData of uids) {
            if (!uidData.notified) {
                result.push({
                    userId: userId,
                    ...uidData
                });
            }
        }
    }

    return result;
}

/**
 * Hàm chính xử lý lệnh checklive
 */
async function handleChecklive(bot, msg, args) {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    
    // Xử lý lệnh add
    if (args.length > 0 && args[0].toLowerCase() === 'add') {
        const remainingArgs = args.slice(1);
        if (remainingArgs.length === 0) {
            return bot.sendMessage(chatId, 
                "❌ Vui lòng nhập link Facebook hoặc UID để thêm vào hệ thống check!\n\n💡 Cú pháp: /checklive add <link_facebook|uid> [note]"
            );
        }

        const firstArg = remainingArgs[0];
        const isUID = /^\d+$/.test(firstArg);
        
        let link = '';
        let uid = null;
        let note = '';
        
        if (isUID) {
            uid = firstArg;
            note = remainingArgs.slice(1).join(' ').trim();
            link = `https://www.facebook.com/profile.php?id=${uid}`;
        } else {
            let linkFound = false;
            for (let i = 0; i < remainingArgs.length; i++) {
                const arg = remainingArgs[i];
                if (arg.includes('facebook.com') || arg.includes('fb.com')) {
                    let linkParts = [arg];
                    for (let j = i + 1; j < remainingArgs.length; j++) {
                        const nextArg = remainingArgs[j];
                        if (nextArg.includes('=') || nextArg.includes('&') || nextArg.includes('?') || 
                            nextArg.includes('/') || /^\d+$/.test(nextArg) || nextArg.startsWith('http')) {
                            linkParts.push(nextArg);
                        } else {
                            note = remainingArgs.slice(j).join(' ').trim();
                            break;
                        }
                    }
                    link = linkParts.join(' ').trim();
                    linkFound = true;
                    break;
                }
            }

            if (!linkFound || !link) {
                return bot.sendMessage(chatId, 
                    "❌ Không tìm thấy link Facebook hoặc UID trong lệnh!\n\n💡 Cú pháp: /checklive add <link_facebook|uid> [note]"
                );
            }

            if (!link.includes('facebook.com') && !link.includes('fb.com')) {
                return bot.sendMessage(chatId, 
                    "❌ Link không hợp lệ! Vui lòng nhập link Facebook (facebook.com hoặc fb.com) hoặc UID (số)"
                );
            }
        }

        try {
            await bot.sendMessage(chatId, "⏳ Đang lấy thông tin UID và thêm vào hệ thống...");

            let normalizedLink, name, initialStatus;
            
            if (uid) {
                normalizedLink = link;
                name = null;
                const statusResult = await checkUIDStatus(uid);
                initialStatus = statusResult.status;
            } else {
                const uidResult = await getUIDFromLink(link);
                
                if (!uidResult.success) {
                    if (uidResult.isRateLimit) {
                        return bot.sendMessage(chatId, 
                            `❌ *API đang bận*\n\n🔗 Link: ${link}\n⚠️ API đang bận, vui lòng thử lại sau 1-2 phút.`
                        );
                    }
                    
                    let extractedUID = null;
                    const idMatch = link.match(/[?&]id=(\d+)/);
                    if (idMatch) {
                        extractedUID = idMatch[1];
                    }
                    
                    if (!extractedUID) {
                        normalizedLink = normalizeFacebookURL(link);
                        uid = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        name = null;
                        initialStatus = 'die';
                        
                        await bot.sendMessage(chatId, 
                            `⚠️ *Không thể lấy UID từ link*\n\n🔗 Link: ${link}\n❌ Lỗi: ${uidResult.error}\n\n💡 Bot sẽ thêm link vào hệ thống với trạng thái DIE để check DIE → LIVE.`
                        );
                    } else {
                        uid = extractedUID;
                        normalizedLink = normalizeFacebookURL(link);
                        name = null;
                        const statusResult = await checkUIDStatus(uid);
                        initialStatus = statusResult.status;
                    }
                } else {
                    ({ id: uid, link: normalizedLink, name } = uidResult);
                    const statusResult = await checkUIDStatus(uid);
                    initialStatus = statusResult.status;
                }
            }

            const existingUIDs = getUserUIDs(userId);
            const existing = existingUIDs.find(u => u.uid === uid);

            if (existing) {
                const statusIcon = existing.currentStatus === 'live' ? '🟢' : '🔴';
                const checkTypeText = existing.checkType === 'die' ? 'Đang check DIE (chờ die)' : 'Đang check LIVE (chờ live)';
                
                return bot.sendMessage(chatId, 
                    `⚠️ UID này đã được thêm vào hệ thống rồi!\n\n🔗 Link: ${normalizedLink}\n🆔 UID: ${uid}\n📊 Trạng thái hiện tại: ${statusIcon} ${existing.currentStatus.toUpperCase()}\n🔍 ${checkTypeText}\n📅 Thêm lúc: ${new Date(existing.createdAt).toLocaleString('vi-VN')}\n\n💡 Sử dụng "/checklive list" để xem danh sách UID.`
                );
            }

            const addResult = addUIDToCheck(userId, uid, normalizedLink, name, initialStatus, note || null);

            if (!addResult.success) {
                if (addResult.error === 'UID_ALREADY_EXISTS') {
                    return bot.sendMessage(chatId, "⚠️ UID này đã được thêm vào hệ thống rồi!");
                }
                return bot.sendMessage(chatId, "❌ Đã xảy ra lỗi khi thêm UID: " + addResult.error);
            }

            const statusIcon = initialStatus === 'live' ? '🟢' : '🔴';
            const statusText = initialStatus === 'live' ? 'LIVE' : 'DIE';
            const checkTypeText = initialStatus === 'live' 
                ? 'Đang check DIE (chờ die)' 
                : 'Đang check LIVE (chờ live)';

            let successMsg = `✅ *Đã thêm UID vào hệ thống check tự động*\n\n`;
            successMsg += `🔗 Link: ${normalizedLink}\n`;
            successMsg += `🆔 UID: ${uid}\n`;
            if (name) {
                successMsg += `👤 Tên: ${name}\n`;
            }
            if (note) {
                successMsg += `📝 Note: ${note}\n`;
            }
            successMsg += `📊 Trạng thái hiện tại: ${statusIcon} ${statusText}\n`;
            successMsg += `🔍 ${checkTypeText}\n`;
            successMsg += `\n🤖 Bot sẽ tự động check UID này định kỳ.\n`;
            successMsg += `📢 Bạn sẽ nhận được thông báo khi trạng thái thay đổi.\n`;
            successMsg += `\n💡 Sử dụng "/checklive list" để xem danh sách UID.`;

            return bot.sendMessage(chatId, successMsg);

        } catch (error) {
            console.error('Lỗi khi thêm UID vào hệ thống:', error);
            return bot.sendMessage(chatId, "❌ Đã xảy ra lỗi khi thêm UID: " + error.message);
        }
    }

    // Xử lý lệnh del/remove
    if (args.length > 0 && (args[0].toLowerCase() === 'del' || args[0].toLowerCase() === 'remove' || args[0].toLowerCase() === 'delete')) {
        if (args.length < 2) {
            return bot.sendMessage(chatId, 
                "❌ Vui lòng nhập số thứ tự hoặc UID để xóa!\n\n💡 Cú pháp:\n   /checklive del <số_thứ_tự>\n   /checklive del <uid>\n\n💡 Sử dụng '/checklive list' để xem số thứ tự."
            );
        }

        try {
            const identifier = args[1];
            const removeResult = removeUID(userId, identifier);

            if (!removeResult.success) {
                return bot.sendMessage(chatId, 
                    `❌ ${removeResult.error}\n\n💡 Sử dụng '/checklive list' để xem danh sách UID.`
                );
            }

            const removedUID = removeResult.data;
            const statusIcon = removedUID.currentStatus === 'live' ? '🟢' : '🔴';
            const statusText = removedUID.currentStatus === 'live' ? 'LIVE' : 'DIE';

            let successMsg = `✅ *Đã xóa UID khỏi hệ thống*\n\n`;
            successMsg += `🔗 Link: ${removedUID.link}\n`;
            successMsg += `🆔 UID: ${removedUID.uid}\n`;
            if (removedUID.name) {
                successMsg += `👤 Tên: ${removedUID.name}\n`;
            }
            if (removedUID.note) {
                successMsg += `📝 Note: ${removedUID.note}\n`;
            }
            successMsg += `📊 Trạng thái: ${statusIcon} ${statusText}\n`;
            successMsg += `📅 Đã thêm: ${new Date(removedUID.createdAt).toLocaleString('vi-VN')}\n\n`;
            successMsg += `💡 Bot sẽ không check UID này nữa.`;

            return bot.sendMessage(chatId, successMsg);

        } catch (error) {
            console.error('Lỗi khi xóa UID:', error);
            return bot.sendMessage(chatId, "❌ Đã xảy ra lỗi khi xóa UID: " + error.message);
        }
    }

    // Xử lý lệnh list
    if (args.length > 0 && args[0].toLowerCase() === 'list') {
        try {
            const uids = getUserUIDs(userId);

            if (uids.length === 0) {
                return bot.sendMessage(chatId, 
                    "📋 Bạn chưa có UID nào được lưu trong hệ thống.\n\n💡 Sử dụng lệnh: /checklive add <link_facebook> để thêm UID."
                );
            }

            const liveCount = uids.filter(u => u.currentStatus === 'live').length;
            const dieCount = uids.filter(u => u.currentStatus === 'die').length;
            const checkingCount = uids.filter(u => !u.notified).length;
            const completedCount = uids.filter(u => u.notified).length;

            let msg = `📋 *Danh sách UID của bạn*\n\n`;
            msg += `📊 Thống kê:\n`;
            msg += `🟢 Live: ${liveCount}\n`;
            msg += `🔴 Die: ${dieCount}\n`;
            msg += `🔄 Đang check: ${checkingCount}\n`;
            msg += `✅ Hoàn thành: ${completedCount}\n`;
            msg += `📝 Tổng: ${uids.length}\n\n`;
            msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

            uids.forEach((uid, index) => {
                const statusIcon = uid.currentStatus === 'live' ? '🟢' : '🔴';
                const statusText = uid.currentStatus === 'live' ? 'LIVE' : 'DIE';
                const checkTypeText = uid.checkType === 'die' 
                    ? 'Đang check DIE (chờ die)' 
                    : 'Đang check LIVE (chờ live)';
                const statusCheck = uid.notified ? '✅ Đã hoàn thành' : '🔄 Đang check';
                
                msg += `${index + 1}. ${statusIcon} [${statusText}] ${statusCheck}\n`;
                msg += `   🔗 ${uid.link}\n`;
                msg += `   🆔 UID: ${uid.uid}\n`;
                if (uid.name) {
                    msg += `   👤 Tên: ${uid.name}\n`;
                }
                if (uid.note) {
                    msg += `   📝 Note: ${uid.note}\n`;
                }
                msg += `   🔍 ${checkTypeText}\n`;
                const lastChecked = uid.lastChecked ? new Date(uid.lastChecked).toLocaleString('vi-VN') : 'Chưa check';
                msg += `   🕐 Check lần cuối: ${lastChecked}\n\n`;
            });

            if (uids.length >= 50) {
                msg += `\n⚠️ Chỉ hiển thị 50 UID đầu tiên.`;
            }

            return bot.sendMessage(chatId, msg);
        } catch (error) {
            console.error('Lỗi khi lấy danh sách UID:', error);
            return bot.sendMessage(chatId, "❌ Đã xảy ra lỗi khi lấy danh sách UID: " + error.message);
        }
    }

    // Xử lý check live/die (không lưu)
    if (args.length === 0) {
        return bot.sendMessage(chatId, 
            "📖 *Hướng dẫn sử dụng lệnh checklive*\n\n" +
            "🔍 Check live/die (không lưu):\n" +
            "   /checklive <link_facebook>\n\n" +
            "➕ Thêm UID vào hệ thống check tự động:\n" +
            "   /checklive add <link_facebook|uid> [note]\n\n" +
            "📋 Xem danh sách UID đã lưu:\n" +
            "   /checklive list\n\n" +
            "🗑️ Xóa UID khỏi hệ thống:\n" +
            "   /checklive del <số_thứ_tự|uid>\n\n" +
            "💡 Ví dụ:\n" +
            "   /checklive https://www.facebook.com/username\n" +
            "   /checklive add https://www.facebook.com/username die500k\n" +
            "   /checklive add 100009947281976 die500k\n" +
            "   /checklive list\n" +
            "   /checklive del 1\n\n" +
            "🤖 Khi thêm UID vào hệ thống:\n" +
            "   - Nếu UID đang LIVE → Bot sẽ check DIE (chờ die)\n" +
            "   - Nếu UID đang DIE → Bot sẽ check LIVE (chờ live)\n" +
            "   - Bot sẽ tự động check định kỳ và thông báo khi trạng thái thay đổi"
        );
    }

    const link = args.join(' ').trim();
    
    if (!link) {
        return bot.sendMessage(chatId, "❌ Vui lòng nhập link Facebook để kiểm tra!");
    }

    if (!link.includes('facebook.com') && !link.includes('fb.com')) {
        return bot.sendMessage(chatId, 
            "❌ Link không hợp lệ! Vui lòng nhập link Facebook (facebook.com hoặc fb.com)"
        );
    }

    try {
        await bot.sendMessage(chatId, "⏳ Đang kiểm tra link Facebook...");

        const uidResult = await getUIDFromLink(link);
        
        if (!uidResult.success) {
            let errorMsg = `❌ *Không thể lấy UID từ link*\n\n`;
            errorMsg += `🔗 Link: ${link}\n`;
            errorMsg += `❌ Lỗi: ${uidResult.error}\n`;
            
            if (uidResult.isRateLimit) {
                errorMsg += `\n⚠️ API đang bận, vui lòng thử lại sau 1-2 phút.`;
            } else {
                errorMsg += `\n💡 Kiểm tra:\n   - Link có đúng không?\n   - Profile có để chế độ công khai không?`;
            }
            
            return bot.sendMessage(chatId, errorMsg);
        }

        const { id: uid, link: normalizedLink, name } = uidResult;
        const statusResult = await checkUIDStatus(uid);

        const statusIcon = statusResult.status === 'live' ? '🟢' : '🔴';
        const statusText = statusResult.status === 'live' ? 'LIVE' : 'DIE';
        
        let resultMsg = `${statusIcon} *Kết quả kiểm tra Facebook*\n\n`;
        resultMsg += `🔗 Link: ${normalizedLink}\n`;
        resultMsg += `🆔 UID: ${uid}\n`;
        if (name) {
            resultMsg += `👤 Tên: ${name}\n`;
        }
        resultMsg += `📊 Trạng thái: ${statusIcon} ${statusText}\n`;
        
        if (statusResult.status === 'die') {
            resultMsg += `❌ Lỗi: ${statusResult.error || 'UID không tồn tại hoặc không có quyền truy cập'}\n`;
        } else if (statusResult.timeout) {
            resultMsg += `⏳ Lưu ý: ${statusResult.error}\n`;
        }
        
        resultMsg += `\n⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n`;
        resultMsg += `💡 Sử dụng "/checklive add <link>" để thêm vào hệ thống check tự động.`;

        return bot.sendMessage(chatId, resultMsg);

    } catch (error) {
        console.error('Lỗi khi check Facebook:', error);
        return bot.sendMessage(chatId, "❌ Đã xảy ra lỗi khi kiểm tra: " + error.message);
    }
}

// Export as command plugin
module.exports = {
  name: 'checklive',
  pattern: /^\.checklive(.*)/,
  async execute(bot, msg, match) {
    const args = match[1] ? match[1].trim().split(/\s+/) : [];
    await handleChecklive(bot, msg, args);
  },
  // Export functions for other modules
  handleChecklive,
  checkUIDStatus,
  getUIDFromLink,
  getAllUIDsToCheck,
  updateUIDStatus
};

