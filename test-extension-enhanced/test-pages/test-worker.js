// Web Worker 测试脚本
console.log('[Worker] Worker 已启动');

self.onmessage = e => {
  console.log('[Worker] 收到消息:', e.data);

  const {type, data} = e.data;

  switch (type) {
    case 'start':
      console.log('[Worker] 开始处理:', data);
      self.postMessage('Worker 处理完成: ' + data);
      break;

    case 'testComplexObjects':
      console.log('[Worker] 测试复杂对象');

      // 测试 Map
      const testMap = new Map([
        ['worker-key1', 'worker-value1'],
        ['worker-key2', 'worker-value2'],
        ['worker-key3', 'worker-value3'],
      ]);
      console.log('[Worker] Map 对象:', testMap);

      // 测试 Set
      const testSet = new Set([10, 20, 30, 40, 50]);
      console.log('[Worker] Set 对象:', testSet);

      // 测试 Date
      const testDate = new Date();
      console.log('[Worker] Date 对象:', testDate);

      // 测试函数
      function workerFunction(a, b) {
        return a + b;
      }
      console.log('[Worker] 函数:', workerFunction);

      // 测试嵌套对象
      const nested = {
        name: 'Worker Object',
        data: {
          value: 123,
          func: function () {
            return 'nested';
          },
        },
      };
      console.log('[Worker] 嵌套对象:', nested);

      self.postMessage('复杂对象测试完成');
      break;

    case 'testErrors':
      console.log('[Worker] 测试错误');

      // 测试 console.error
      console.error('[Worker] 这是一个错误消息');

      // 测试 Error 对象
      const error = new Error('Worker 测试错误');
      console.error('[Worker] Error 对象:', error);

      // 测试 console.warn
      console.warn('[Worker] 这是一个警告消息');

      self.postMessage('错误测试完成');
      break;

    default:
      console.log('[Worker] 未知消息类型:', type);
  }
};

self.onerror = error => {
  console.error('[Worker] 未捕获错误:', error);
};

// 定期发送心跳
setInterval(() => {
  console.log('[Worker] 心跳 - Worker 运行中');
}, 10000);
