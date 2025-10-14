#!/usr/bin/env node
/**
 * 直接测试 MCP 工具（使用二进制文件）
 * 重点测试 reload_extension 等可能卡住的工具
 */

import { spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

const CHROME_URL = 'http://localhost:9222';
const TIMEOUT = 20000; // 20秒超时

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║            MCP 工具直接测试（二进制模式）                          ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

const results = {
  tests: [],
  summary: { passed: 0, failed: 0, timeout: 0, error: 0 },
};

/**
 * 执行单个工具测试
 */
async function testTool(toolName, args = {}, description = '') {
  console.log(`\n🔧 测试: ${toolName}`);
  if (description) console.log(`   描述: ${description}`);
  console.log(`   参数: ${JSON.stringify(args)}`);
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' }}},
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args }},
    ];
    
    const input = requests.map(r => JSON.stringify(r)).join('\n') + '\n';
    
    const proc = spawn('node', ['build/src/index.js', '--chrome-url', CHROME_URL], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let output = '';
    let stderr = '';
    let completed = false;
    let timeoutId;
    
    // 设置超时
    timeoutId = globalThis.setTimeout(() => {
      if (!completed) {
        completed = true;
        proc.kill('SIGKILL');
        const duration = Date.now() - startTime;
        console.log(`   ⏱️  超时: ${duration}ms (>= ${TIMEOUT}ms)`);
        console.log(`   ⚠️  工具可能卡住！`);
        
        results.tests.push({
          tool: toolName,
          args,
          status: 'timeout',
          duration,
          output: output.substring(0, 500),
          stderr: stderr.substring(0, 500),
        });
        results.summary.timeout++;
        resolve({ status: 'timeout', duration });
      }
    }, TIMEOUT);
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
      
      // 检查是否收到响应
      if (output.includes('"id":2') && output.includes('"result"')) {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          proc.kill('SIGTERM');
          
          const duration = Date.now() - startTime;
          
          try {
            // 提取响应
            const lines = output.split('\n');
            let response;
            for (const line of lines) {
              if (line.includes('"id":2')) {
                response = JSON.parse(line);
                break;
              }
            }
            
            if (response?.error) {
              console.log(`   ❌ 失败: ${response.error.message} (${duration}ms)`);
              results.tests.push({
                tool: toolName,
                args,
                status: 'failed',
                error: response.error.message,
                duration,
              });
              results.summary.failed++;
              resolve({ status: 'failed', error: response.error.message, duration });
            } else if (response?.result?.isError) {
              console.log(`   ⚠️  工具错误: ${response.result.content?.[0]?.text || 'Unknown'} (${duration}ms)`);
              results.tests.push({
                tool: toolName,
                args,
                status: 'tool_error',
                error: response.result.content?.[0]?.text,
                duration,
              });
              results.summary.failed++;
              resolve({ status: 'tool_error', duration });
            } else {
              console.log(`   ✅ 成功 (${duration}ms)`);
              const contentLength = JSON.stringify(response.result.content || []).length;
              console.log(`   📊 响应大小: ${contentLength} 字节`);
              
              results.tests.push({
                tool: toolName,
                args,
                status: 'passed',
                duration,
                responseSize: contentLength,
              });
              results.summary.passed++;
              resolve({ status: 'passed', duration });
            }
          } catch (e) {
            console.log(`   💥 解析错误: ${e.message} (${duration}ms)`);
            results.tests.push({
              tool: toolName,
              args,
              status: 'error',
              error: e.message,
              duration,
            });
            results.summary.error++;
            resolve({ status: 'error', duration });
          }
        }
      }
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (error) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.log(`   💥 进程错误: ${error.message} (${duration}ms)`);
        results.tests.push({
          tool: toolName,
          args,
          status: 'error',
          error: error.message,
          duration,
        });
        results.summary.error++;
        resolve({ status: 'error', duration });
      }
    });
    
    proc.on('exit', (code, signal) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        
        if (signal === 'SIGKILL') {
          // 已在超时处理中处理
        } else if (code !== 0) {
          console.log(`   💥 进程异常退出: code=${code}, signal=${signal} (${duration}ms)`);
          results.tests.push({
            tool: toolName,
            args,
            status: 'error',
            error: `Exit code: ${code}`,
            duration,
          });
          results.summary.error++;
          resolve({ status: 'error', duration });
        }
      }
    });
    
    // 发送输入
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

/**
 * 主测试流程
 */
async function main() {
  console.log(`⚙️  配置:`);
  console.log(`   Chrome URL: ${CHROME_URL}`);
  console.log(`   超时: ${TIMEOUT}ms\n`);
  
  // 测试基础工具
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('基础工具测试');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  await testTool('get_browser_info', {}, '获取浏览器信息');
  await delay(500);
  
  await testTool('list_tabs', {}, '列出所有标签页');
  await delay(500);
  
  await testTool('list_extensions', {}, '列出所有扩展');
  await delay(500);
  
  // 获取第一个扩展ID
  console.log('\n🔍 检测可用扩展...');
  const listExtResult = await testTool('list_extensions', {}, '再次列出扩展以获取ID');
  await delay(500);
  
  // 尝试从历史结果中找扩展
  const hasExtensions = results.tests.some(t => 
    t.tool === 'list_extensions' && 
    t.status === 'passed' && 
    t.responseSize > 100
  );
  
  if (hasExtensions) {
    console.log('   ✅ 检测到扩展');
    
    // 测试扩展工具（使用假ID测试接口）
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('扩展工具测试（使用测试ID）');
    console.log('═══════════════════════════════════════════════════════════════════');
    
    const testExtId = 'abcdefghijklmnopqrstuvwxyzabcdef'; // 32字符测试ID
    
    await testTool('list_extension_contexts', { extensionId: testExtId }, '列出扩展上下文');
    await delay(500);
    
    await testTool('get_extension_storage', { 
      extensionId: testExtId, 
      storageType: 'local' 
    }, '获取扩展存储');
    await delay(500);
    
    await testTool('get_extension_logs', { 
      extensionId: testExtId,
      capture: false
    }, '获取扩展日志');
    await delay(500);
    
    // ⚠️ 危险：测试 reload_extension
    console.log('\n⚠️  ⚠️  ⚠️  测试高风险工具 ⚠️  ⚠️  ⚠️');
    console.log('═══════════════════════════════════════════════════════════════════');
    
    await testTool('reload_extension', {
      extensionId: testExtId,
      preserveStorage: false,
      waitForReady: false,
      captureErrors: false,
    }, '重载扩展（最小配置）');
    await delay(1000);
    
    await testTool('reload_extension', {
      extensionId: testExtId,
      preserveStorage: true,
      waitForReady: true,
      captureErrors: true,
    }, '重载扩展（完整配置） - 最可能卡住');
    await delay(1000);
    
    await testTool('evaluate_in_extension', {
      extensionId: testExtId,
      code: 'chrome.runtime.id'
    }, '在扩展中执行代码');
    await delay(500);
    
  } else {
    console.log('   ⚠️  未检测到扩展，跳过扩展工具测试');
  }
  
  // 测试其他工具
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('其他工具测试');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  await testTool('execute_cdp_command', {
    method: 'Browser.getVersion',
    params: {}
  }, '执行 CDP 命令');
  await delay(500);
  
  // 打印测试报告
  console.log('\n\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                        测试报告                                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  
  const total = results.summary.passed + results.summary.failed + results.summary.timeout + results.summary.error;
  
  console.log(`📊 总测试数: ${total}`);
  console.log(`✅ 通过: ${results.summary.passed} (${(results.summary.passed/total*100).toFixed(1)}%)`);
  console.log(`❌ 失败: ${results.summary.failed} (${(results.summary.failed/total*100).toFixed(1)}%)`);
  console.log(`⏱️  超时: ${results.summary.timeout} (${(results.summary.timeout/total*100).toFixed(1)}%)`);
  console.log(`💥 错误: ${results.summary.error} (${(results.summary.error/total*100).toFixed(1)}%)`);
  console.log('');
  
  // 详细分析
  if (results.summary.timeout > 0) {
    console.log('⚠️  ⚠️  ⚠️  超时工具分析（可能卡住） ⚠️  ⚠️  ⚠️');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    results.tests.filter(t => t.status === 'timeout').forEach(t => {
      console.log(`🔴 ${t.tool}`);
      console.log(`   参数: ${JSON.stringify(t.args)}`);
      console.log(`   超时时间: ${t.duration}ms`);
      if (t.output) {
        console.log(`   输出片段: ${t.output.substring(0, 200)}...`);
      }
      if (t.stderr) {
        console.log(`   错误片段: ${t.stderr.substring(0, 200)}...`);
      }
      console.log('');
    });
  }
  
  if (results.summary.failed > 0 || results.summary.error > 0) {
    console.log('失败和错误工具分析');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    results.tests.filter(t => t.status === 'failed' || t.status === 'error' || t.status === 'tool_error').forEach(t => {
      console.log(`❌ ${t.tool}`);
      console.log(`   状态: ${t.status}`);
      console.log(`   错误: ${t.error || 'Unknown'}`);
      console.log(`   耗时: ${t.duration}ms`);
      console.log('');
    });
  }
  
  // 性能统计
  const passedTests = results.tests.filter(t => t.status === 'passed');
  if (passedTests.length > 0) {
    console.log('性能统计（通过的工具）');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    const avgDuration = passedTests.reduce((sum, t) => sum + t.duration, 0) / passedTests.length;
    const maxDuration = Math.max(...passedTests.map(t => t.duration));
    const minDuration = Math.min(...passedTests.map(t => t.duration));
    
    console.log(`   平均响应时间: ${avgDuration.toFixed(0)}ms`);
    console.log(`   最快: ${minDuration}ms`);
    console.log(`   最慢: ${maxDuration}ms`);
    console.log('');
    
    // 按时间排序
    const sorted = [...passedTests].sort((a, b) => b.duration - a.duration);
    console.log('   最慢的5个工具:');
    sorted.slice(0, 5).forEach((t, i) => {
      console.log(`   ${i+1}. ${t.tool}: ${t.duration}ms`);
    });
    console.log('');
  }
  
  // 结论
  console.log('结论');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  if (results.summary.timeout > 0) {
    console.log('🔴 发现卡住的工具！');
    console.log('   以下工具超过 20 秒未响应:');
    results.tests.filter(t => t.status === 'timeout').forEach(t => {
      console.log(`   - ${t.tool}`);
    });
    console.log('\n   建议: 需要修复这些工具的超时问题\n');
  } else if (results.summary.failed > 0 || results.summary.error > 0) {
    console.log('🟡 测试完成，但有工具失败');
    console.log('   可能是配置问题或工具本身的错误\n');
  } else {
    console.log('✅ 所有工具测试通过！');
    console.log('   没有发现卡住或超时的工具\n');
  }
  
  // 保存详细报告
  const fs = await import('fs');
  const reportPath = 'TOOLS_TEST_REPORT.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 详细报告已保存到: ${reportPath}\n`);
  
  // 退出码
  process.exit(results.summary.timeout > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('💥 测试失败:', error);
  process.exit(1);
});
