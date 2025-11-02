/**
 * Offscreen Document Script
 * 用于测试 get_offscreen_logs 工具
 *
 * Offscreen Document 特性:
 * - 有 DOM API 访问权限 (Canvas, Audio, Clipboard)
 * - 独立的 console (不在页面或 SW 中显示)
 * - 需要通过 chrome.offscreen API 创建
 * - 适合后台 DOM 操作场景
 */

console.log('[Offscreen] 🚀 Offscreen Document 启动');
console.log('[Offscreen] 📋 测试场景: Canvas操作、Audio处理、日志捕获');

// ===============================================
// 初始化
// ===============================================

const state = {
  createdAt: Date.now(),
  logCount: 0,
  logs: [],
};

// 更新 UI
function updateUI() {
  document.getElementById('status').textContent = '✅ 运行中';
  document.getElementById('created-time').textContent = new Date(
    state.createdAt,
  ).toLocaleTimeString();
  document.getElementById('log-count').textContent = state.logCount;
}

// 添加日志到 UI
function addLogToUI(level, message) {
  const logsDiv = document.getElementById('logs');
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';

  const timestamp = new Date().toLocaleTimeString();
  const emoji =
    {
      log: '📝',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      debug: '🐛',
    }[level] || '📋';

  logEntry.innerHTML = `<span class="timestamp">${timestamp}</span>${emoji} [${level.toUpperCase()}] ${message}`;
  logsDiv.insertBefore(logEntry, logsDiv.firstChild);

  state.logCount++;
  state.logs.push({level, message, timestamp});
  updateUI();
}

// ===============================================
// 日志测试功能
// ===============================================

// 测试各种日志级别
function testLogs() {
  console.log('[Offscreen] 📝 这是一条普通日志');
  console.info('[Offscreen] ℹ️ 这是一条信息日志');
  console.warn('[Offscreen] ⚠️ 这是一条警告日志');
  console.debug('[Offscreen] 🐛 这是一条调试日志');

  addLogToUI('log', '测试日志已生成');
}

// 测试错误
function testError() {
  console.error('[Offscreen] ❌ 这是一条错误日志');
  console.error('[Offscreen] ❌ 错误对象:', new Error('测试错误'));

  try {
    throw new Error('Offscreen 测试异常');
  } catch (error) {
    console.error('[Offscreen] ❌ 捕获的异常:', error);
  }

  addLogToUI('error', '错误日志已生成');
}

// 测试 Canvas 操作 (Offscreen Document 的典型用途)
function testCanvas() {
  console.log('[Offscreen] 🎨 开始 Canvas 测试');

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法获取 Canvas 上下文');
    }

    // 绘制渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 200, 200);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 200, 200);

    // 绘制文字
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MCP Test', 100, 100);

    // 转换为 DataURL
    const dataUrl = canvas.toDataURL('image/png');
    console.log('[Offscreen] ✅ Canvas 渲染成功, DataURL长度:', dataUrl.length);

    addLogToUI('log', `Canvas 测试成功 (${dataUrl.length} bytes)`);
  } catch (error) {
    console.error('[Offscreen] ❌ Canvas 测试失败:', error);
    addLogToUI('error', `Canvas 测试失败: ${error.message}`);
  }
}

// 测试 Audio 操作 (Offscreen Document 的另一个典型用途)
function testAudio() {
  console.log('[Offscreen] 🔊 开始 Audio 测试');

  try {
    // 创建 AudioContext
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    console.log('[Offscreen] ✅ AudioContext 创建成功');
    console.log('[Offscreen] 📊 采样率:', audioContext.sampleRate);
    console.log('[Offscreen] 📊 状态:', audioContext.state);

    // 创建振荡器 (不播放,只测试API)
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440; // A4 音符

    console.log('[Offscreen] ✅ Oscillator 创建成功');
    console.log('[Offscreen] 📊 频率:', oscillator.frequency.value, 'Hz');

    addLogToUI('log', `Audio 测试成功 (采样率: ${audioContext.sampleRate}Hz)`);

    // 关闭 AudioContext
    audioContext.close();
  } catch (error) {
    console.error('[Offscreen] ❌ Audio 测试失败:', error);
    addLogToUI('error', `Audio 测试失败: ${error.message}`);
  }
}

// 清空日志
function clearLogs() {
  console.clear();
  console.log('[Offscreen] 🧹 日志已清空');

  document.getElementById('logs').innerHTML = '';
  state.logCount = 0;
  state.logs = [];
  updateUI();

  addLogToUI('info', '日志已清空');
}

// ===============================================
// 消息处理
// ===============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] 📨 收到消息:', message);

  switch (message.type) {
    case 'ping':
      console.log('[Offscreen] 🏓 响应 ping');
      sendResponse({success: true, pong: true, timestamp: Date.now()});
      break;

    case 'get_status':
      console.log('[Offscreen] 📊 返回状态');
      sendResponse({
        success: true,
        status: 'running',
        createdAt: state.createdAt,
        logCount: state.logCount,
        uptime: Date.now() - state.createdAt,
      });
      break;

    case 'test_logs':
      testLogs();
      sendResponse({success: true});
      break;

    case 'test_error':
      testError();
      sendResponse({success: true});
      break;

    case 'test_canvas':
      testCanvas();
      sendResponse({success: true});
      break;

    case 'test_audio':
      testAudio();
      sendResponse({success: true});
      break;

    default:
      console.warn('[Offscreen] ⚠️ 未知消息类型:', message.type);
      sendResponse({success: false, error: 'Unknown message type'});
  }

  return true; // 保持消息通道开放
});

// ===============================================
// 事件监听
// ===============================================

document.getElementById('btn-test-log').addEventListener('click', testLogs);
document.getElementById('btn-test-error').addEventListener('click', testError);
document
  .getElementById('btn-test-canvas')
  .addEventListener('click', testCanvas);
document.getElementById('btn-test-audio').addEventListener('click', testAudio);
document.getElementById('btn-clear').addEventListener('click', clearLogs);

// ===============================================
// 启动日志
// ===============================================

console.log('[Offscreen] ✅ 初始化完成');
console.log('[Offscreen] 🎯 可用功能: 日志测试、Canvas、Audio');
console.log('[Offscreen] 📡 消息监听已就绪');

updateUI();
addLogToUI('info', 'Offscreen Document 已启动');

// 定期输出心跳日志 (用于测试日志捕获)
let heartbeatCount = 0;
setInterval(() => {
  heartbeatCount++;
  console.log(
    `[Offscreen] 💓 心跳 #${heartbeatCount} - ${new Date().toLocaleTimeString()}`,
  );

  // 每10次心跳输出一次详细信息
  if (heartbeatCount % 10 === 0) {
    console.info(
      `[Offscreen] 📊 运行时长: ${Math.floor((Date.now() - state.createdAt) / 1000)}秒, 日志数: ${state.logCount}`,
    );
  }
}, 5000); // 每5秒一次

console.log('[Offscreen] ⏰ 心跳定时器已启动 (5秒间隔)');
