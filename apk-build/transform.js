// 为 APK 内的 WebView 准备前端：剥离 PWA 专属内容（manifest 链接 / Service Worker 注册），
// 因为离线 WebView 直接加载 file:///android_asset/index.html，不需要 Service Worker。
const fs = require('fs');
const p = 'D:/mkeapp/tetris-game/apk-build/app/assets/';

let html = fs.readFileSync(p + 'index.html', 'utf8');
html = html.replace(/<link rel="manifest"[^>]*>\s*/, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '');
html = html.replace(/<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>\s*/, '');
fs.writeFileSync(p + 'index.html', html);

// game.js 的本地存储已内置「内存兜底」，file:// 下即使 localStorage 不可用也能正常运行，无需额外 patch。
console.log('patched index.html for WebView (stripped manifest + SW)');
