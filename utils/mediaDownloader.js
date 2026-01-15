const axios = require('axios');
const Logger = require('./logger');

/**
 * Universal Media Downloader Service
 * Supports: YouTube, TikTok, Instagram, Facebook, Twitter, Spotify, Douyin, Threads
 * Uses J2Download API (j2download.com)
 */

/**
 * Parses cookies from Set-Cookie header
 */
function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return "";
  
  const cookies = [];
  const cookieStrings = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  
  for (const cookieStr of cookieStrings) {
    const cookieMatches = cookieStr.matchAll(/([^=,\s]+)=([^;,\s]+)/g);
    for (const match of cookieMatches) {
      if (match[1] && match[2]) {
        cookies.push(`${match[1]}=${match[2]}`);
      }
    }
    
    if (cookies.length === 0) {
      const match = cookieStr.match(/^([^=]+)=([^;]+)/);
      if (match) {
        cookies.push(`${match[1]}=${match[2]}`);
      }
    }
  }
  
  const uniqueCookies = [];
  const seen = new Set();
  for (const cookie of cookies) {
    const name = cookie.split("=")[0];
    if (!seen.has(name)) {
      seen.add(name);
      uniqueCookies.push(cookie);
    }
  }
  
  return uniqueCookies.join("; ");
}

/**
 * Extracts CSRF token and cookies from j2download.com website
 */
async function extractCsrfTokenAndCookies() {
  try {
    Logger.debug("[MEDIA DOWNLOADER] Extracting CSRF token from j2download.com...");
    
    const response = await axios.get("https://j2download.com/vi", {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
      }
    });
    
    const html = response.data;
    const setCookieHeaders = response.headers['set-cookie'] || [];
    const cookies = parseCookies(setCookieHeaders);
    
    if (cookies) {
      const cookieNames = cookies.split("; ").map(c => c.split("=")[0]).filter(Boolean);
      Logger.debug(`[MEDIA DOWNLOADER] Found cookies: ${cookieNames.join(", ")}`);
    }
    
    // Try to extract csrf_token from cookies
    const cookiePatterns = [
      /csrf_token=([^;,\s]+)/i,
      /XSRF-TOKEN=([^;,\s]+)/i,
      /csrf-token=([^;,\s]+)/i,
      /_token=([^;,\s]+)/i
    ];
    
    for (const pattern of cookiePatterns) {
      const match = cookies.match(pattern) || setCookieHeaders.toString().match(pattern);
      if (match && match[1]) {
        let token = match[1];
        try {
          token = decodeURIComponent(token);
        } catch (e) {}
        
        Logger.debug(`[MEDIA DOWNLOADER] Found CSRF token in cookies`);
        return { token, cookies };
      }
    }
    
    // Try to extract from HTML meta tags
    const metaPatterns = [
      /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
      /<meta\s+content=["']([^"']+)["']\s+name=["']csrf-token["']/i
    ];
    
    for (const pattern of metaPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        Logger.debug("[MEDIA DOWNLOADER] Found CSRF token in HTML meta tag");
        return { token: match[1], cookies };
      }
    }
    
    throw new Error("Could not find CSRF token");
  } catch (error) {
    Logger.error(`[MEDIA DOWNLOADER] Error extracting CSRF token: ${error.message}`);
    throw error;
  }
}

/**
 * Sleep/delay function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch download link from J2Download API
 */
async function fetchDownloadLink(url, csrfToken, cookies = "", retryCount = 0, maxRetries = 1) {
  try {
    const headers = {
      "accept": "application/json, text/plain, */*",
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      "Referer": "https://j2download.com/vi",
      "origin": "https://j2download.com",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
    };
    
    if (cookies) {
      headers["cookie"] = cookies;
    }
    
    const response = await axios.post("https://j2download.com/api/autolink", {
      data: {
        url: url,
        unlock: true
      }
    }, { headers });
    
    if (response.status === 401) {
      const errorData = response.data;
      if (errorData.error && errorData.error.toLowerCase().includes("waiting")) {
        if (retryCount < maxRetries) {
          Logger.warn(`[MEDIA DOWNLOADER] Server yêu cầu đợi: ${errorData.error}`);
          Logger.info("[MEDIA DOWNLOADER] Đang tự động thử lại sau 60 giây...");
          await sleep(60000);
          
          const { token: newToken, cookies: newCookies } = await extractCsrfTokenAndCookies();
          return fetchDownloadLink(url, newToken, newCookies, retryCount + 1, maxRetries);
        } else {
          throw new Error(`Đã thử lại ${maxRetries} lần nhưng vẫn bị lỗi: ${errorData.error}`);
        }
      }
    }
    
    return response.data;
  } catch (error) {
    if (error.response) {
      Logger.error(`[MEDIA DOWNLOADER] API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Format duration
 */
function formatDuration(duration) {
  if (!duration) return '0:00';
  let seconds = duration;
  if (duration > 100000) {
    seconds = Math.floor(duration / 1000);
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
  if (!url) return 'unknown';
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  }
  if (urlLower.includes('tiktok.com')) {
    return 'tiktok';
  }
  if (urlLower.includes('douyin.com')) {
    return 'douyin';
  }
  if (urlLower.includes('instagram.com') || urlLower.includes('instagr.am')) {
    return 'instagram';
  }
  if (urlLower.includes('threads.com') || urlLower.includes('threads.net')) {
    return 'threads';
  }
  if (urlLower.includes('facebook.com') || urlLower.includes('fb.watch') || urlLower.includes('fb.com')) {
    return 'facebook';
  }
  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'twitter';
  }
  if (urlLower.includes('spotify.com')) {
    return 'spotify';
  }
  if (urlLower.includes('zingmp3.vn') || urlLower.includes('mp3.zing.vn')) {
    return 'zing';
  }
  
  return 'unknown';
}

/**
 * Parse media data from J2Download API response
 */
function parseMediaData(data) {
  const responseData = data.response || data;
  
  const result = {
    url: responseData.url || data.url || '',
    source: responseData.source || detectPlatform(responseData.url || data.url || ''),
    title: responseData.title || responseData.description || 'Untitled',
    author: responseData.author || responseData.unique_id || responseData.username || responseData.owner?.username || 'Unknown',
    thumbnail: responseData.thumbnail || responseData.cover || responseData.picture || null,
    duration: formatDuration(responseData.duration),
    type: responseData.type || (responseData.medias && responseData.medias.length > 1 ? 'multiple' : 'single'),
    medias: []
  };

  // Parse medias array
  if (responseData.medias && Array.isArray(responseData.medias) && responseData.medias.length > 0) {
    result.medias = responseData.medias.map(media => {
      const parsed = {
        url: media.url,
        type: media.type || (media.extension === 'mp3' || media.extension === 'm4a' ? 'audio' : media.extension === 'jpg' || media.extension === 'png' ? 'image' : 'video'),
        quality: media.quality || media.label || 'Unknown',
        extension: media.extension || media.ext || 'mp4',
        size: media.data_size ? formatFileSize(media.data_size) : null,
        resolution: media.resolution || (media.width && media.height ? `${media.width}x${media.height}` : null)
      };

      // Format quality label
      if (parsed.type === 'audio') {
        parsed.qualityLabel = `🎵 ${parsed.quality}`;
      } else if (parsed.type === 'image') {
        parsed.qualityLabel = `📸 ${parsed.quality}`;
      } else {
        parsed.qualityLabel = `🎬 ${parsed.quality}`;
      }

      return parsed;
    });
  } else if (responseData.url && !responseData.medias) {
    result.medias = [{
      url: responseData.url,
      type: responseData.media_type || 'video',
      quality: responseData.quality || 'default',
      extension: responseData.extension || 'mp4',
      size: responseData.data_size ? formatFileSize(responseData.data_size) : null,
      qualityLabel: responseData.quality || 'Default'
    }];
  }

  return result;
}

/**
 * Download media from any social platform
 */
async function downloadMedia(url) {
  try {
    Logger.info(`[MEDIA DOWNLOADER] Downloading media from: ${url}`);
    
    const { token: csrfToken, cookies } = await extractCsrfTokenAndCookies();
    Logger.debug(`[MEDIA DOWNLOADER] Using CSRF token: ${csrfToken.substring(0, 20)}...`);
    
    const response = await fetchDownloadLink(url, csrfToken, cookies);
    
    if (response.error) {
      throw new Error(response.error || 'Download failed');
    }

    const parsedData = parseMediaData(response);
    Logger.info(`[MEDIA DOWNLOADER] Parsed ${parsedData.medias.length} media file(s)`);
    
    return parsedData;
  } catch (error) {
    Logger.error('[MEDIA DOWNLOADER] Download media error:', error.message);
    throw error;
  }
}

module.exports = {
  downloadMedia,
  detectPlatform,
  parseMediaData
};

